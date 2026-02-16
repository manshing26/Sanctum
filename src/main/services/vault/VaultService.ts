import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import { VaultPaths } from './VaultPaths';
import { getLogger } from '../../logging/logger';
import type {
  ItemThumbnail,
  ListItemsQueryInput,
  ListItemsQueryResult,
  VaultItemSummary,
} from '../../../shared/ipc';

const getMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
};

type EncryptedPayload = {
  iv: string;
  authTag: string;
  data: string;
};

type MediaMetadata = {
  width?: number;
  height?: number;
  durationSeconds?: number;
};

type ThumbnailInput = {
  mimeType: string;
  data: Buffer;
};

type FolderRow = {
  id: number;
  name: string;
  parent_id: number | null;
};

type ItemRow = {
  id: string;
  original_filename_enc: Buffer;
  created_at: string;
  file_size: number;
  mime_type: string;
  is_favorite: number | null;
  folder_id: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_seconds: number | null;
  thumbnail_enc: Buffer | null;
};

type MediaItemRow = {
  id: string;
  encrypted_filename: string;
  mime_type: string;
  file_size: number;
  content_hash: string | null;
  iv: Buffer;
  auth_tag: Buffer;
};

type ExportItemRow = {
  id: string;
  encrypted_filename: string;
  original_filename_enc: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
};

const SORT_TO_ORDER_BY: Record<ListItemsQueryInput['sort'], string> = {
  newest: 'datetime(created_at) DESC, id DESC',
  oldest: 'datetime(created_at) ASC, id ASC',
  name_asc: 'datetime(created_at) DESC, id DESC',
  name_desc: 'datetime(created_at) DESC, id DESC',
  size_desc: 'file_size DESC, id DESC',
  size_asc: 'file_size ASC, id ASC',
};

const logger = getLogger('vault');

export class VaultService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths: VaultPaths,
  ) {}

  private decryptOriginalName(originalFilenameEnc: Buffer): string {
    try {
      const key = this.sessionStore.getMasterKey();
      const payload = JSON.parse(originalFilenameEnc.toString('utf8')) as EncryptedPayload;
      const decrypted = this.cryptoService.decryptBuffer(
        {
          iv: Buffer.from(payload.iv, 'base64'),
          authTag: Buffer.from(payload.authTag, 'base64'),
          encrypted: Buffer.from(payload.data, 'base64'),
        },
        key,
      );
      return decrypted.toString('utf8');
    } catch {
      return 'unknown';
    }
  }

  private encryptOriginalName(name: string): Buffer {
    const key = this.sessionStore.getMasterKey();
    const payload = this.cryptoService.encryptBuffer(Buffer.from(name, 'utf8'), key);
    return Buffer.from(
      JSON.stringify({
        iv: payload.iv.toString('base64'),
        authTag: payload.authTag.toString('base64'),
        data: payload.encrypted.toString('base64'),
      }),
      'utf8',
    );
  }

  private async resolveUniqueExportPath(targetDir: string, filename: string): Promise<string> {
    const ext = path.extname(filename);
    const base = ext ? filename.slice(0, -ext.length) : filename;
    let counter = 0;
    while (true) {
      const suffix = counter === 0 ? '' : ` (${counter + 1})`;
      const candidate = path.join(targetDir, `${base}${suffix}${ext}`);
      try {
        await fs.access(candidate);
        counter += 1;
      } catch {
        return candidate;
      }
    }
  }

  private resolveFolderPath(folderId: number | null, folderById: Map<number, FolderRow>): string | undefined {
    if (folderId === null) {
      return undefined;
    }

    const parts: string[] = [];
    let cursor: number | null = folderId;
    while (cursor !== null) {
      const folder = folderById.get(cursor);
      if (!folder) {
        break;
      }

      parts.unshift(folder.name);
      cursor = folder.parent_id;
    }

    return parts.length > 0 ? parts.join('/') : undefined;
  }

  private mapRowsToItems(rows: ItemRow[]): VaultItemSummary[] {
    const folderRows = this.db
      .prepare('SELECT id, name, parent_id FROM folders')
      .all() as FolderRow[];
    const folderById = new Map(folderRows.map((row) => [row.id, row]));

    const itemIds = rows.map((row) => row.id);
    const tagsByItemId = new Map<string, Array<{ id: number; name: string }>>();
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(', ');
      const tagRows = this.db
        .prepare(
          `SELECT it.item_id, t.id AS tag_id, t.name AS tag_name
           FROM item_tags it
           INNER JOIN tags t ON t.id = it.tag_id
           WHERE it.item_id IN (${placeholders})
           ORDER BY t.name COLLATE NOCASE`
        )
        .all(...itemIds) as Array<{
        item_id: string;
        tag_id: number;
        tag_name: string;
      }>;

      for (const tagRow of tagRows) {
        const existing = tagsByItemId.get(tagRow.item_id) ?? [];
        existing.push({ id: tagRow.tag_id, name: tagRow.tag_name });
        tagsByItemId.set(tagRow.item_id, existing);
      }
    }

    return rows.map((row) => {
      const itemTags = tagsByItemId.get(row.id) ?? [];
      return {
        id: row.id,
        originalName: this.decryptOriginalName(row.original_filename_enc),
        createdAt: row.created_at,
        size: row.file_size,
        mimeType: row.mime_type,
        hasThumbnail: row.thumbnail_enc !== null,
        isFavorite: Boolean(row.is_favorite),
        folderId: row.folder_id ?? undefined,
        folderPath: this.resolveFolderPath(row.folder_id, folderById),
        tagIds: itemTags.map((tag) => tag.id),
        tags: itemTags.map((tag) => tag.name),
        width: row.media_width ?? undefined,
        height: row.media_height ?? undefined,
        durationSeconds: row.media_duration_seconds ?? undefined,
      };
    });
  }

  async addEncryptedFile(
    sourcePath: string,
    metadata: MediaMetadata = {},
    thumbnail?: ThumbnailInput,
    folderId?: number | null,
  ): Promise<VaultItemSummary> {
    if (folderId !== null && folderId !== undefined) {
      const folderExists = this.db
        .prepare('SELECT 1 FROM folders WHERE id = ?')
        .get(folderId) as { 1: number } | undefined;
      if (!folderExists) {
        throw new Error('Folder not found.');
      }
    }

    const key = this.sessionStore.getMasterKey();
    const fileBuffer = await fs.readFile(sourcePath);
    const contentHash = createHash('sha256').update(fileBuffer).digest('hex');

    const itemId = randomUUID();
    const encryptedFilename = `${itemId}.enc`;
    const outputPath = path.join(this.vaultPaths.filesDir, encryptedFilename);

    const encryptedFile = this.cryptoService.encryptBuffer(fileBuffer, key);
    await fs.writeFile(outputPath, encryptedFile.encrypted);

    const originalNamePayload = this.cryptoService.encryptBuffer(
      Buffer.from(path.basename(sourcePath), 'utf8'),
      key,
    );

    const originalFilenameEnc = Buffer.from(
      JSON.stringify({
        iv: originalNamePayload.iv.toString('base64'),
        authTag: originalNamePayload.authTag.toString('base64'),
        data: originalNamePayload.encrypted.toString('base64'),
      }),
      'utf8',
    );

    const mimeType = getMimeType(sourcePath);
    const encryptedThumbnail = thumbnail
      ? this.cryptoService.encryptBuffer(thumbnail.data, key)
      : undefined;

    this.db
      .prepare(
        `INSERT INTO vault_items (
           id,
           encrypted_filename,
           original_filename_enc,
           mime_type,
           file_size,
           folder_id,
           media_width,
           media_height,
           media_duration_seconds,
           thumbnail_mime_type,
           thumbnail_enc,
           thumbnail_iv,
           thumbnail_auth_tag,
           content_hash,
           iv,
           auth_tag
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        itemId,
        encryptedFilename,
        originalFilenameEnc,
        mimeType,
        fileBuffer.byteLength,
        folderId ?? null,
        metadata.width ?? null,
        metadata.height ?? null,
        metadata.durationSeconds ?? null,
        thumbnail?.mimeType ?? null,
        encryptedThumbnail?.encrypted ?? null,
        encryptedThumbnail?.iv ?? null,
        encryptedThumbnail?.authTag ?? null,
        contentHash,
        encryptedFile.iv,
        encryptedFile.authTag,
      );

    const created = this.db
      .prepare('SELECT created_at FROM vault_items WHERE id = ?')
      .get(itemId) as { created_at: string };

    return {
      id: itemId,
      originalName: path.basename(sourcePath),
      createdAt: created.created_at,
      size: fileBuffer.byteLength,
      mimeType,
      hasThumbnail: Boolean(thumbnail),
      isFavorite: false,
      folderId: folderId ?? undefined,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
    };
  }

  listItems(limit = 50): VaultItemSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, original_filename_enc, created_at, file_size, mime_type, is_favorite, folder_id, media_width, media_height, media_duration_seconds, thumbnail_enc
         FROM vault_items
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(limit) as ItemRow[];
    return this.mapRowsToItems(rows);
  }

  listItemsQuery(input: ListItemsQueryInput): ListItemsQueryResult {
    const sort = input.sort in SORT_TO_ORDER_BY ? input.sort : 'newest';
    const limit = Math.max(1, Math.min(input.limit || 100, 200));
    const offset = Math.max(0, input.offset || 0);
    const needsNameSort = sort === 'name_asc' || sort === 'name_desc';

    const totalRow = this.db.prepare('SELECT COUNT(1) AS total FROM vault_items').get() as {
      total: number;
    };
    const total = totalRow.total;

    if (needsNameSort) {
      const allRows = this.db
        .prepare(
          `SELECT id, original_filename_enc, created_at, file_size, mime_type, is_favorite, folder_id, media_width, media_height, media_duration_seconds, thumbnail_enc
           FROM vault_items`
        )
        .all() as ItemRow[];

      const allItems = this.mapRowsToItems(allRows).sort((a, b) => {
        const compared = a.originalName.localeCompare(b.originalName, undefined, {
          sensitivity: 'base',
        });
        return sort === 'name_asc' ? compared : -compared;
      });

      const items = allItems.slice(offset, offset + limit);
      return {
        items,
        total,
        hasMore: offset + items.length < total,
      };
    }

    const orderBy = SORT_TO_ORDER_BY[sort];
    const rows = this.db
      .prepare(
        `SELECT id, original_filename_enc, created_at, file_size, mime_type, is_favorite, folder_id, media_width, media_height, media_duration_seconds, thumbnail_enc
         FROM vault_items
         ORDER BY ${orderBy}
         LIMIT ?
         OFFSET ?`
      )
      .all(limit, offset) as ItemRow[];

    const items = this.mapRowsToItems(rows);
    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  getItemThumbnail(itemId: string): ItemThumbnail {
    const row = this.db
      .prepare(
        `SELECT thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag
         FROM vault_items
         WHERE id = ?`
      )
      .get(itemId) as
      | {
          thumbnail_mime_type: string | null;
          thumbnail_enc: Buffer | null;
          thumbnail_iv: Buffer | null;
          thumbnail_auth_tag: Buffer | null;
        }
      | undefined;

    if (!row) {
      throw new Error('Item not found.');
    }

    if (
      !row.thumbnail_mime_type ||
      !row.thumbnail_enc ||
      !row.thumbnail_iv ||
      !row.thumbnail_auth_tag
    ) {
      throw new Error('Thumbnail not available for this item.');
    }

    const key = this.sessionStore.getMasterKey();
    const decrypted = this.cryptoService.decryptBuffer(
      {
        iv: row.thumbnail_iv,
        authTag: row.thumbnail_auth_tag,
        encrypted: row.thumbnail_enc,
      },
      key,
    );

    return {
      mimeType: row.thumbnail_mime_type,
      base64Data: decrypted.toString('base64'),
    };
  }

  setFavorite(itemId: string, isFavorite: boolean): void {
    this.db
      .prepare('UPDATE vault_items SET is_favorite = ? WHERE id = ?')
      .run(isFavorite ? 1 : 0, itemId);
  }

  renameItem(itemId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error('Name is required.');
    }
    const safeName = path.basename(trimmed);
    if (!safeName) {
      throw new Error('Name is invalid.');
    }

    const encrypted = this.encryptOriginalName(safeName);
    this.db
      .prepare('UPDATE vault_items SET original_filename_enc = ? WHERE id = ?')
      .run(encrypted, itemId);
  }

  async exportItems(
    itemIds: string[],
    targetDir: string,
    onProgress?: (progress: {
      total: number;
      processed: number;
      failed: number;
      currentItemId?: string;
      currentFile?: string;
    }) => void,
  ): Promise<{ exported: number; failed: number }> {
    const total = itemIds.length;
    let processed = 0;
    let failed = 0;

    await fs.access(targetDir);

    for (const itemId of itemIds) {
      try {
        const row = this.db
          .prepare(
            `SELECT id, encrypted_filename, original_filename_enc, iv, auth_tag
             FROM vault_items
             WHERE id = ?`
          )
          .get(itemId) as ExportItemRow | undefined;

        if (!row) {
          throw new Error('Item not found.');
        }

        const encryptedPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
        const encryptedData = await fs.readFile(encryptedPath);
        const key = this.sessionStore.getMasterKey();
        const decrypted = this.cryptoService.decryptBuffer(
          {
            iv: row.iv,
            authTag: row.auth_tag,
            encrypted: encryptedData,
          },
          key,
        );
        const originalName = this.decryptOriginalName(row.original_filename_enc);
        const safeOriginal = originalName && originalName !== 'unknown'
          ? path.basename(originalName)
          : `${row.id}`;
        const resolvedName = safeOriginal || `${row.id}`;
        const outputPath = await this.resolveUniqueExportPath(targetDir, resolvedName);
        await fs.writeFile(outputPath, decrypted);
        onProgress?.({
          total,
          processed: processed + 1,
          failed,
          currentItemId: itemId,
          currentFile: outputPath,
        });
      } catch {
        failed += 1;
        onProgress?.({
          total,
          processed: processed + 1,
          failed,
          currentItemId: itemId,
        });
      } finally {
        processed += 1;
      }
    }

    return {
      exported: processed - failed,
      failed,
    };
  }

  async clearAllItems(): Promise<{ deleted: number }> {
    const rows = this.db
      .prepare('SELECT encrypted_filename FROM vault_items')
      .all() as Array<{ encrypted_filename: string }>;

    for (const row of rows) {
      const filePath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    this.db.prepare('DELETE FROM item_tags').run();
    this.db.prepare('DELETE FROM vault_items').run();
    return { deleted: rows.length };
  }

  async deleteItem(itemId: string): Promise<void> {
    const row = this.db
      .prepare('SELECT encrypted_filename FROM vault_items WHERE id = ?')
      .get(itemId) as { encrypted_filename: string } | undefined;

    if (!row) {
      throw new Error('Item not found.');
    }

    const filePath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error;
      }
    }

    this.db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
    this.db.prepare('DELETE FROM vault_items WHERE id = ?').run(itemId);
  }

  async getDecryptedMedia(itemId: string): Promise<{
    itemId: string;
    mimeType: string;
    fileSize: number;
    data: Buffer;
  }> {
    const row = this.db
      .prepare(
        `SELECT id, encrypted_filename, mime_type, file_size, content_hash, iv, auth_tag
         FROM vault_items
         WHERE id = ?`
      )
      .get(itemId) as MediaItemRow | undefined;

    if (!row) {
      throw new Error('Item not found.');
    }

    const encryptedPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
    const encryptedData = await fs.readFile(encryptedPath);
    const key = this.sessionStore.getMasterKey();
    const decrypted = this.cryptoService.decryptBuffer(
      {
        iv: row.iv,
        authTag: row.auth_tag,
        encrypted: encryptedData,
      },
      key,
    );
    if (row.content_hash) {
      const decryptedHash = createHash('sha256').update(decrypted).digest('hex');
      if (decryptedHash !== row.content_hash) {
        logger.error('content hash mismatch', {
          itemId: row.id,
          expected: row.content_hash,
          actual: decryptedHash,
        });
      } else {
        logger.info('content hash ok', { itemId: row.id });
      }
    }

    return {
      itemId: row.id,
      mimeType: row.mime_type || 'application/octet-stream',
      fileSize: row.file_size,
      data: decrypted,
    };
  }
}

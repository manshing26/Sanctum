import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import { VaultPaths } from './VaultPaths';
import type { ItemThumbnail, VaultItemSummary } from '../../../shared/ipc';

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
           iv,
           auth_tag
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      folderId: folderId ?? undefined,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
    };
  }

  listItems(limit = 50): VaultItemSummary[] {
    const folderRows = this.db
      .prepare('SELECT id, name, parent_id FROM folders')
      .all() as FolderRow[];
    const folderById = new Map(folderRows.map((row) => [row.id, row]));

    const resolveFolderPath = (folderId: number | null): string | undefined => {
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
    };

    const rows = this.db
      .prepare(
        `SELECT id, original_filename_enc, created_at, file_size, mime_type, folder_id, media_width, media_height, media_duration_seconds, thumbnail_enc
         FROM vault_items
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      original_filename_enc: Buffer;
      created_at: string;
      file_size: number;
      mime_type: string;
      folder_id: number | null;
      media_width: number | null;
      media_height: number | null;
      media_duration_seconds: number | null;
      thumbnail_enc: Buffer | null;
    }>;

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
        existing.push({
          id: tagRow.tag_id,
          name: tagRow.tag_name,
        });
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
      folderId: row.folder_id ?? undefined,
      folderPath: resolveFolderPath(row.folder_id),
      tagIds: itemTags.map((tag) => tag.id),
      tags: itemTags.map((tag) => tag.name),
      width: row.media_width ?? undefined,
      height: row.media_height ?? undefined,
      durationSeconds: row.media_duration_seconds ?? undefined,
      };
    });
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
}

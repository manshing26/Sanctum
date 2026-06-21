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
  CreateVideoTimestampInput,
  DeleteVideoTimestampInput,
  RenameVideoTimestampInput,
  SaveVideoPlaybackPositionInput,
  UpdateItemThumbnailInput,
  VaultItemSummary,
  VideoPlaybackPosition,
  VideoTimestamp,
} from '../../../shared/ipc';
import { getMimeTypeForFilename } from '../../../shared/fileTypes';

type EncryptedPayload = { iv: string; authTag: string; data: string };
type MediaMetadata = { width?: number; height?: number; durationSeconds?: number };
type ThumbnailInput = { mimeType: string; data: Buffer };

type FolderRow = { id: number; name: string; parent_id: number | null };

// Row returned by queries that JOIN vault_items + vault_objects
type ItemRow = {
  vault_object_id: string;
  original_filename_enc: Buffer;
  created_at: string;
  file_size: number;
  mime_type: string;
  is_favorite: number | null;
  rating: number | null;
  folder_id: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_seconds: number | null;
  thumbnail_enc: Buffer | null;
};

type MediaItemRow = {
  vault_object_id: string;
  encrypted_filename: string;
  mime_type: string;
  file_size: number;
  content_hash: string | null;
  iv: Buffer;
  auth_tag: Buffer;
};

type ExportItemRow = {
  vault_object_id: string;
  encrypted_filename: string;
  original_filename_enc: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
};

type VideoIdentityRow = {
  vault_object_id: string;
  mime_type: string;
  media_duration_seconds: number | null;
};

const ITEM_SELECT = `
  SELECT vi.vault_object_id, vi.original_filename_enc, vi.file_size, vi.mime_type,
         vi.media_width, vi.media_height, vi.media_duration_seconds, vi.thumbnail_enc,
         vo.created_at, vo.is_favorite, vo.rating, vo.folder_id
  FROM vault_items vi
  INNER JOIN vault_objects vo ON vo.id = vi.vault_object_id
`;

const SORT_TO_ORDER_BY: Record<ListItemsQueryInput['sort'], string> = {
  newest:      'datetime(vo.created_at) DESC, vo.id DESC',
  oldest:      'datetime(vo.created_at) ASC,  vo.id ASC',
  name_asc:    'datetime(vo.created_at) DESC, vo.id DESC',
  name_desc:   'datetime(vo.created_at) DESC, vo.id DESC',
  rating_desc: "COALESCE(vo.rating, 0) DESC, datetime(vo.created_at) DESC, vo.id DESC",
  rating_asc:  "COALESCE(vo.rating, 0) ASC,  datetime(vo.created_at) ASC,  vo.id ASC",
  size_desc:   'vi.file_size DESC, vo.id DESC',
  size_asc:    'vi.file_size ASC,  vo.id ASC',
};

const logger = getLogger('vault');

const VIDEO_PROGRESS_MIN_SECONDS = 15;
const VIDEO_PROGRESS_MIN_DURATION_SECONDS = 45;
const VIDEO_PROGRESS_NEAR_END_SECONDS = 10;
const VIDEO_PROGRESS_NEAR_END_RATIO = 0.05;

const isMeaningfulVideoProgress = (positionSeconds: number, durationSeconds?: number): boolean => {
  if (!Number.isFinite(positionSeconds) || positionSeconds < VIDEO_PROGRESS_MIN_SECONDS) return false;
  if (durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    if (durationSeconds < VIDEO_PROGRESS_MIN_DURATION_SECONDS) return false;
    const remainingSeconds = durationSeconds - positionSeconds;
    if (remainingSeconds <= VIDEO_PROGRESS_NEAR_END_SECONDS) return false;
    if (remainingSeconds <= durationSeconds * VIDEO_PROGRESS_NEAR_END_RATIO) return false;
  }
  return true;
};

const formatVideoTimestampLabel = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export class VaultService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths: VaultPaths,
  ) {}

  private ensureUnlocked(): void {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault is locked.');
    }
  }

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
    while (counter < Number.MAX_SAFE_INTEGER) {
      const suffix = counter === 0 ? '' : ` (${counter + 1})`;
      const candidate = path.join(targetDir, `${base}${suffix}${ext}`);
      try { await fs.access(candidate); counter += 1; } catch { return candidate; }
    }
    throw new Error('Unable to resolve a unique export path.');
  }

  private resolveFolderPath(folderId: number | null, folderById: Map<number, FolderRow>): string | undefined {
    if (folderId === null) return undefined;
    const parts: string[] = [];
    let cursor: number | null = folderId;
    while (cursor !== null) {
      const folder = folderById.get(cursor);
      if (!folder) break;
      parts.unshift(folder.name);
      cursor = folder.parent_id;
    }
    return parts.length > 0 ? parts.join('/') : undefined;
  }

  private mapRowsToItems(rows: ItemRow[]): VaultItemSummary[] {
    const folderRows = this.db.prepare('SELECT id, name, parent_id FROM folders').all() as FolderRow[];
    const folderById = new Map(folderRows.map((row) => [row.id, row]));

    const itemIds = rows.map((row) => row.vault_object_id);
    const tagsByItemId = new Map<string, Array<{ id: number; name: string }>>();
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(', ');
      const tagRows = this.db
        .prepare(
          `SELECT ot.object_id, t.id AS tag_id, t.name AS tag_name
           FROM object_tags ot
           INNER JOIN tags t ON t.id = ot.tag_id
           WHERE ot.object_id IN (${placeholders})
           ORDER BY t.name COLLATE NOCASE`,
        )
        .all(...itemIds) as Array<{ object_id: string; tag_id: number; tag_name: string }>;

      for (const tagRow of tagRows) {
        const existing = tagsByItemId.get(tagRow.object_id) ?? [];
        existing.push({ id: tagRow.tag_id, name: tagRow.tag_name });
        tagsByItemId.set(tagRow.object_id, existing);
      }
    }

    return rows.map((row) => {
      const itemTags = tagsByItemId.get(row.vault_object_id) ?? [];
      const isVideo = row.mime_type.startsWith('video/');
      return {
        id: row.vault_object_id,
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
        durationSeconds: isVideo ? row.media_duration_seconds ?? undefined : undefined,
        rating: row.rating ?? undefined,
      };
    });
  }

  async addEncryptedFile(
    sourcePath: string,
    metadata: MediaMetadata = {},
    thumbnail?: ThumbnailInput,
    folderId?: number | null,
    overrideName?: string,
  ): Promise<VaultItemSummary> {
    if (folderId !== null && folderId !== undefined) {
      const folderExists = this.db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId) as { 1: number } | undefined;
      if (!folderExists) throw new Error('Folder not found.');
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
      Buffer.from(overrideName ?? path.basename(sourcePath), 'utf8'),
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

    const mimeType = getMimeTypeForFilename(sourcePath);
    const sanitizedDurationSeconds = mimeType.startsWith('video/') ? metadata.durationSeconds : undefined;
    const encryptedThumbnail = thumbnail ? this.cryptoService.encryptBuffer(thumbnail.data, key) : undefined;

    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
         VALUES (?, 'file', ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).run(itemId, folderId ?? null);

      this.db.prepare(
        `INSERT INTO vault_items (
           vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
           media_width, media_height, media_duration_seconds,
           thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag,
           content_hash, iv, auth_tag
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        itemId, encryptedFilename, originalFilenameEnc, mimeType, fileBuffer.byteLength,
        metadata.width ?? null, metadata.height ?? null, sanitizedDurationSeconds ?? null,
        thumbnail?.mimeType ?? null,
        encryptedThumbnail?.encrypted ?? null,
        encryptedThumbnail?.iv ?? null,
        encryptedThumbnail?.authTag ?? null,
        contentHash,
        encryptedFile.iv, encryptedFile.authTag,
      );
    });
    tx();

    const created = this.db
      .prepare('SELECT created_at FROM vault_objects WHERE id = ?')
      .get(itemId) as { created_at: string };

    return {
      id: itemId,
      originalName: overrideName ?? path.basename(sourcePath),
      createdAt: created.created_at,
      size: fileBuffer.byteLength,
      mimeType,
      hasThumbnail: Boolean(thumbnail),
      isFavorite: false,
      folderId: folderId ?? undefined,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: sanitizedDurationSeconds,
    };
  }

  listItems(limit = 50): VaultItemSummary[] {
    this.ensureUnlocked();
    const rows = this.db
      .prepare(`${ITEM_SELECT} ORDER BY datetime(vo.created_at) DESC LIMIT ?`)
      .all(limit) as ItemRow[];
    return this.mapRowsToItems(rows);
  }

  listItemsQuery(input: ListItemsQueryInput): ListItemsQueryResult {
    this.ensureUnlocked();
    const sort = input.sort in SORT_TO_ORDER_BY ? input.sort : 'newest';
    const limit = Math.max(1, Math.min(input.limit || 100, 5000));
    const offset = Math.max(0, input.offset || 0);
    const needsNameSort = sort === 'name_asc' || sort === 'name_desc';

    const totalRow = this.db
      .prepare("SELECT COUNT(1) AS total FROM vault_objects WHERE type = 'file'")
      .get() as { total: number };
    const total = totalRow.total;

    if (needsNameSort) {
      const allRows = this.db.prepare(`${ITEM_SELECT}`).all() as ItemRow[];
      const allItems = this.mapRowsToItems(allRows).sort((a, b) => {
        const compared = a.originalName.localeCompare(b.originalName, undefined, { sensitivity: 'base' });
        return sort === 'name_asc' ? compared : -compared;
      });
      const items = allItems.slice(offset, offset + limit);
      return { items, total, hasMore: offset + items.length < total };
    }

    const orderBy = SORT_TO_ORDER_BY[sort];
    const rows = this.db
      .prepare(`${ITEM_SELECT} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(limit, offset) as ItemRow[];
    const items = this.mapRowsToItems(rows);
    return { items, total, hasMore: offset + items.length < total };
  }

  getItemThumbnail(itemId: string): ItemThumbnail {
    this.ensureUnlocked();
    const row = this.db
      .prepare(
        `SELECT thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag
         FROM vault_items WHERE vault_object_id = ?`,
      )
      .get(itemId) as {
        thumbnail_mime_type: string | null;
        thumbnail_enc: Buffer | null;
        thumbnail_iv: Buffer | null;
        thumbnail_auth_tag: Buffer | null;
      } | undefined;

    if (!row) throw new Error('Item not found.');
    if (!row.thumbnail_mime_type || !row.thumbnail_enc || !row.thumbnail_iv || !row.thumbnail_auth_tag) {
      throw new Error('Thumbnail not available for this item.');
    }

    const key = this.sessionStore.getMasterKey();
    const decrypted = this.cryptoService.decryptBuffer(
      { iv: row.thumbnail_iv, authTag: row.thumbnail_auth_tag, encrypted: row.thumbnail_enc },
      key,
    );
    return { mimeType: row.thumbnail_mime_type, base64Data: decrypted.toString('base64') };
  }

  updateItemThumbnail(input: UpdateItemThumbnailInput): VaultItemSummary {
    this.ensureUnlocked();
    const row = this.db
      .prepare(`${ITEM_SELECT} WHERE vi.vault_object_id = ?`)
      .get(input.id) as ItemRow | undefined;
    if (!row) throw new Error('Item not found.');
    if (!row.mime_type.startsWith('video/')) {
      throw new Error('Only video thumbnails can be changed.');
    }

    if (input.thumbnailDataUrl === null) {
      this.db
        .prepare(
          `UPDATE vault_items
           SET thumbnail_mime_type = NULL, thumbnail_enc = NULL, thumbnail_iv = NULL, thumbnail_auth_tag = NULL
           WHERE vault_object_id = ?`,
        )
        .run(input.id);
    } else {
      const match = input.thumbnailDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match?.[1] || !match[2]) throw new Error('Invalid thumbnail data URL.');
      if (!match[1].startsWith('image/')) throw new Error('Thumbnail must be an image.');

      const thumbnailBuffer = Buffer.from(match[2], 'base64');
      if (thumbnailBuffer.length === 0) throw new Error('Invalid thumbnail data URL.');

      const key = this.sessionStore.getMasterKey();
      const encryptedThumbnail = this.cryptoService.encryptBuffer(thumbnailBuffer, key);
      this.db
        .prepare(
          `UPDATE vault_items
           SET thumbnail_mime_type = ?, thumbnail_enc = ?, thumbnail_iv = ?, thumbnail_auth_tag = ?
           WHERE vault_object_id = ?`,
        )
        .run(match[1], encryptedThumbnail.encrypted, encryptedThumbnail.iv, encryptedThumbnail.authTag, input.id);
    }
    this.db
      .prepare(`UPDATE vault_objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(input.id);

    const updated = this.db
      .prepare(`${ITEM_SELECT} WHERE vi.vault_object_id = ?`)
      .get(input.id) as ItemRow | undefined;
    if (!updated) throw new Error('Item not found.');
    return this.mapRowsToItems([updated])[0];
  }

  private getVideoIdentity(itemId: string): VideoIdentityRow {
    this.ensureUnlocked();
    const row = this.db
      .prepare(
        `SELECT vi.vault_object_id, vi.mime_type, vi.media_duration_seconds
         FROM vault_items vi
         INNER JOIN vault_objects vo ON vo.id = vi.vault_object_id
         WHERE vi.vault_object_id = ? AND vo.type = 'file'`,
      )
      .get(itemId) as VideoIdentityRow | undefined;
    if (!row) throw new Error('Item not found.');
    if (!row.mime_type.startsWith('video/')) {
      throw new Error('This item is not a video.');
    }
    return row;
  }

  getVideoPlaybackPosition(itemId: string): VideoPlaybackPosition | null {
    this.getVideoIdentity(itemId);
    const row = this.db
      .prepare(
        `SELECT vault_object_id, position_seconds, duration_seconds, updated_at
         FROM video_playback_positions
         WHERE vault_object_id = ?`,
      )
      .get(itemId) as {
        vault_object_id: string;
        position_seconds: number;
        duration_seconds: number | null;
        updated_at: string;
      } | undefined;
    if (!row) return null;
    return {
      itemId: row.vault_object_id,
      positionSeconds: row.position_seconds,
      durationSeconds: row.duration_seconds ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  saveVideoPlaybackPosition(input: SaveVideoPlaybackPositionInput): VideoPlaybackPosition | null {
    const item = this.getVideoIdentity(input.itemId);
    const durationSeconds = Number.isFinite(input.durationSeconds ?? NaN)
      ? input.durationSeconds
      : item.media_duration_seconds ?? undefined;
    const rawPosition = Number.isFinite(input.positionSeconds) ? input.positionSeconds : 0;
    const positionSeconds = Math.max(0, rawPosition);

    if (!isMeaningfulVideoProgress(positionSeconds, durationSeconds)) {
      this.db
        .prepare('DELETE FROM video_playback_positions WHERE vault_object_id = ?')
        .run(input.itemId);
      return null;
    }

    this.db
      .prepare(
        `INSERT INTO video_playback_positions (vault_object_id, position_seconds, duration_seconds, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(vault_object_id) DO UPDATE SET
           position_seconds = excluded.position_seconds,
           duration_seconds = excluded.duration_seconds,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(input.itemId, positionSeconds, durationSeconds ?? null);

    return this.getVideoPlaybackPosition(input.itemId);
  }

  listVideoTimestamps(itemId: string): VideoTimestamp[] {
    this.getVideoIdentity(itemId);
    const rows = this.db
      .prepare(
        `SELECT id, vault_object_id, label, position_seconds, created_at
         FROM video_timestamps
         WHERE vault_object_id = ?
         ORDER BY position_seconds ASC, datetime(created_at) ASC`,
      )
      .all(itemId) as Array<{
        id: string;
        vault_object_id: string;
        label: string;
        position_seconds: number;
        created_at: string;
      }>;
    return rows.map((row) => ({
      id: row.id,
      itemId: row.vault_object_id,
      label: row.label,
      positionSeconds: row.position_seconds,
      createdAt: row.created_at,
    }));
  }

  createVideoTimestamp(input: CreateVideoTimestampInput): VideoTimestamp {
    const item = this.getVideoIdentity(input.itemId);
    const durationSeconds = item.media_duration_seconds ?? undefined;
    const rawPosition = Number.isFinite(input.positionSeconds) ? input.positionSeconds : 0;
    const positionSeconds = Math.max(
      0,
      durationSeconds !== undefined && durationSeconds > 0
        ? Math.min(rawPosition, durationSeconds)
        : rawPosition,
    );
    const label = input.label?.trim() || formatVideoTimestampLabel(positionSeconds);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO video_timestamps (id, vault_object_id, label, position_seconds, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run(id, input.itemId, label, positionSeconds);
    const created = this.db
      .prepare(
        `SELECT id, vault_object_id, label, position_seconds, created_at
         FROM video_timestamps
         WHERE id = ?`,
      )
      .get(id) as {
        id: string;
        vault_object_id: string;
        label: string;
        position_seconds: number;
        created_at: string;
      };
    return {
      id: created.id,
      itemId: created.vault_object_id,
      label: created.label,
      positionSeconds: created.position_seconds,
      createdAt: created.created_at,
    };
  }

  renameVideoTimestamp(input: RenameVideoTimestampInput): VideoTimestamp {
    this.ensureUnlocked();
    const existing = this.db
      .prepare(
        `SELECT id, vault_object_id, label, position_seconds, created_at
         FROM video_timestamps
         WHERE id = ?`,
      )
      .get(input.id) as {
        id: string;
        vault_object_id: string;
        label: string;
        position_seconds: number;
        created_at: string;
      } | undefined;
    if (!existing) throw new Error('Timestamp not found.');
    this.getVideoIdentity(existing.vault_object_id);

    const label = input.label.trim() || formatVideoTimestampLabel(existing.position_seconds);
    this.db
      .prepare('UPDATE video_timestamps SET label = ? WHERE id = ?')
      .run(label, input.id);

    return {
      id: existing.id,
      itemId: existing.vault_object_id,
      label,
      positionSeconds: existing.position_seconds,
      createdAt: existing.created_at,
    };
  }

  deleteVideoTimestamp(input: DeleteVideoTimestampInput): void {
    this.ensureUnlocked();
    this.db
      .prepare('DELETE FROM video_timestamps WHERE id = ?')
      .run(input.id);
  }

  setRating(itemId: string, rating: number | null): void {
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new Error('Rating must be between 1 and 5.');
    }
    const result = this.db
      .prepare(`UPDATE vault_objects SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(rating, itemId);
    if (result.changes === 0) {
      throw new Error('Item not found.');
    }
  }

  setFavorite(itemId: string, isFavorite: boolean): void {
    this.db
      .prepare(`UPDATE vault_objects SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(isFavorite ? 1 : 0, itemId);
  }

  renameItem(itemId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Name is required.');
    const safeName = path.basename(trimmed);
    if (!safeName) throw new Error('Name is invalid.');
    const encrypted = this.encryptOriginalName(safeName);
    this.db
      .prepare('UPDATE vault_items SET original_filename_enc = ? WHERE vault_object_id = ?')
      .run(encrypted, itemId);
  }

  async exportItems(
    itemIds: string[],
    targetDir: string,
    onProgress?: (progress: {
      total: number; processed: number; failed: number; currentItemId?: string; currentFile?: string;
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
            `SELECT vi.vault_object_id, vi.encrypted_filename, vi.original_filename_enc, vi.iv, vi.auth_tag
             FROM vault_items vi WHERE vi.vault_object_id = ?`,
          )
          .get(itemId) as ExportItemRow | undefined;

        if (!row) throw new Error('Item not found.');

        const encryptedPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
        const encryptedData = await fs.readFile(encryptedPath);
        const key = this.sessionStore.getMasterKey();
        const decrypted = this.cryptoService.decryptBuffer(
          { iv: row.iv, authTag: row.auth_tag, encrypted: encryptedData },
          key,
        );
        const originalName = this.decryptOriginalName(row.original_filename_enc);
        const safeOriginal = originalName && originalName !== 'unknown' ? path.basename(originalName) : `${row.vault_object_id}`;
        const outputPath = await this.resolveUniqueExportPath(targetDir, safeOriginal || `${row.vault_object_id}`);
        await fs.writeFile(outputPath, decrypted);
        onProgress?.({ total, processed: processed + 1, failed, currentItemId: itemId, currentFile: outputPath });
      } catch {
        failed += 1;
        onProgress?.({ total, processed: processed + 1, failed, currentItemId: itemId });
      } finally {
        processed += 1;
      }
    }
    return { exported: processed - failed, failed };
  }

  async openTemporaryFile(itemId: string): Promise<string> {
    const row = this.db
      .prepare(
        `SELECT vi.vault_object_id, vi.encrypted_filename, vi.original_filename_enc, vi.iv, vi.auth_tag
         FROM vault_items vi WHERE vi.vault_object_id = ?`,
      )
      .get(itemId) as ExportItemRow | undefined;

    if (!row) throw new Error('Item not found.');

    const encryptedPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
    const encryptedData = await fs.readFile(encryptedPath);
    const key = this.sessionStore.getMasterKey();
    const decrypted = this.cryptoService.decryptBuffer(
      { iv: row.iv, authTag: row.auth_tag, encrypted: encryptedData },
      key,
    );
    const originalName = this.decryptOriginalName(row.original_filename_enc);
    const safeName = path.basename(originalName && originalName !== 'unknown' ? originalName : row.vault_object_id)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim() || row.vault_object_id;
    const tempOpenDir = path.join(this.vaultPaths.tempDir, 'opened');
    await fs.mkdir(tempOpenDir, { recursive: true });
    const tempPath = path.join(tempOpenDir, `${Date.now()}-${row.vault_object_id}-${safeName}`);
    await fs.writeFile(tempPath, decrypted, { mode: 0o600 });
    await fs.chmod(tempPath, 0o444);
    return tempPath;
  }

  async clearTemporaryOpenFiles(): Promise<void> {
    const tempOpenDir = path.join(this.vaultPaths.tempDir, 'opened');
    await fs.rm(tempOpenDir, { recursive: true, force: true });
    await fs.mkdir(tempOpenDir, { recursive: true });
  }

  async clearAllItems(): Promise<{ deleted: number }> {
    this.ensureUnlocked();
    const safeCount = (tableName: string): number => {
      try {
        return (this.db
          .prepare(`SELECT COUNT(1) AS total FROM ${tableName}`)
          .get() as { total: number }).total;
      } catch {
        return 0;
      }
    };
    const objectCount = safeCount('vault_objects');
    const passwordCount = safeCount('passwords');

    const fileEntries = await fs.readdir(this.vaultPaths.filesDir);
    for (const entry of fileEntries) {
      const filePath = path.join(this.vaultPaths.filesDir, entry);
      try {
        await fs.rm(filePath, { recursive: true, force: true });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') throw error;
      }
    }

    await this.clearTemporaryOpenFiles();

    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.transaction(() => {
        this.db.exec(`
          DROP TABLE IF EXISTS object_tags;
          DROP TABLE IF EXISTS video_timestamps;
          DROP TABLE IF EXISTS video_playback_positions;
          DROP TABLE IF EXISTS vault_items;
          DROP TABLE IF EXISTS bookmarks;
          DROP TABLE IF EXISTS notes;
          DROP TABLE IF EXISTS vault_objects;
          DROP TABLE IF EXISTS passwords;
          DROP TABLE IF EXISTS folders;
          DROP TABLE IF EXISTS tags;

          CREATE TABLE folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (parent_id, name),
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
          );

          CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE vault_objects (
            id          TEXT    PRIMARY KEY,
            type        TEXT    NOT NULL CHECK (type IN ('file', 'bookmark', 'note')),
            folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            rating      INTEGER,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE vault_items (
            vault_object_id       TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            encrypted_filename    TEXT NOT NULL,
            original_filename_enc BLOB NOT NULL,
            mime_type             TEXT,
            file_size             INTEGER NOT NULL,
            media_width           INTEGER,
            media_height          INTEGER,
            media_duration_seconds REAL,
            thumbnail_enc         BLOB,
            thumbnail_iv          BLOB,
            thumbnail_auth_tag    BLOB,
            thumbnail_mime_type   TEXT,
            iv                    BLOB NOT NULL,
            auth_tag              BLOB NOT NULL,
            content_hash          TEXT
          );

          CREATE TABLE bookmarks (
            vault_object_id    TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            title_enc          BLOB NOT NULL,
            url_enc            BLOB NOT NULL,
            thumbnail_enc      BLOB,
            thumbnail_iv       BLOB,
            thumbnail_auth_tag BLOB
          );

          CREATE TABLE notes (
            vault_object_id TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            title_enc       BLOB NOT NULL,
            body_enc        BLOB NOT NULL,
            format          TEXT NOT NULL DEFAULT 'plain' CHECK (format IN ('plain', 'markdown'))
          );

          CREATE TABLE video_playback_positions (
            vault_object_id  TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            position_seconds REAL NOT NULL DEFAULT 0,
            duration_seconds REAL,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE video_timestamps (
            id               TEXT PRIMARY KEY,
            vault_object_id  TEXT NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
            label            TEXT NOT NULL,
            position_seconds REAL NOT NULL,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE object_tags (
            object_id TEXT    NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
            tag_id    INTEGER NOT NULL REFERENCES tags(id)          ON DELETE CASCADE,
            PRIMARY KEY (object_id, tag_id)
          );

          CREATE TABLE passwords (
            id           TEXT PRIMARY KEY,
            domain_enc   BLOB NOT NULL,
            username_enc BLOB NOT NULL,
            password_enc BLOB NOT NULL,
            label_enc    BLOB,
            notes_enc    BLOB,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_vault_objects_folder_id   ON vault_objects(folder_id);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_type        ON vault_objects(type);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_is_favorite ON vault_objects(is_favorite);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_created_at  ON vault_objects(created_at);
          CREATE INDEX IF NOT EXISTS idx_object_tags_object_id     ON object_tags(object_id);
          CREATE INDEX IF NOT EXISTS idx_object_tags_tag_id        ON object_tags(tag_id);
          CREATE INDEX IF NOT EXISTS idx_video_timestamps_object   ON video_timestamps(vault_object_id, position_seconds);
          CREATE INDEX IF NOT EXISTS idx_folders_parent_id         ON folders(parent_id);
          CREATE INDEX IF NOT EXISTS idx_passwords_updated         ON passwords(updated_at);
        `);
      })();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    return { deleted: objectCount + passwordCount };
  }

  async scanImportConflicts(
    filePaths: string[],
    folderId: number | null,
  ): Promise<import('../../../shared/ipc').ConflictItem[]> {
    this.ensureUnlocked();
    const folderItems = this.scanFolderItems(folderId);
    const nameToItem = new Map(folderItems.map((item) => [item.originalName.toLowerCase(), item]));
    const hashToItem = new Map(
      folderItems.filter((item) => item.contentHash !== null).map((item) => [item.contentHash as string, item]),
    );

    const conflicts: import('../../../shared/ipc').ConflictItem[] = [];
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

      const nameMatch = nameToItem.get(fileName.toLowerCase());
      const hashMatch = hashToItem.get(fileHash);

      if (nameMatch) {
        const isExactDuplicate = nameMatch.contentHash === fileHash;
        conflicts.push({
          filePath, fileName,
          existingItemId: nameMatch.id,
          existingItemName: nameMatch.originalName,
          conflictType: isExactDuplicate ? 'exact_duplicate' : 'name_conflict',
        });
      } else if (hashMatch) {
        conflicts.push({
          filePath, fileName,
          existingItemId: hashMatch.id,
          existingItemName: hashMatch.originalName,
          conflictType: 'exact_duplicate',
        });
      }
    }
    return conflicts;
  }

  scanFolderItems(folderId: number | null): Array<{ id: string; originalName: string; contentHash: string | null }> {
    this.ensureUnlocked();
    const rows = this.db
      .prepare(
        `SELECT vi.vault_object_id, vi.original_filename_enc, vi.content_hash
         FROM vault_items vi
         INNER JOIN vault_objects vo ON vo.id = vi.vault_object_id
         WHERE ${folderId === null ? 'vo.folder_id IS NULL' : 'vo.folder_id = ?'}`,
      )
      .all(...(folderId === null ? [] : [folderId])) as Array<{
        vault_object_id: string;
        original_filename_enc: Buffer;
        content_hash: string | null;
      }>;

    return rows.map((row) => ({
      id: row.vault_object_id,
      originalName: this.decryptOriginalName(row.original_filename_enc),
      contentHash: row.content_hash,
    }));
  }

  async replaceItem(
    existingItemId: string,
    sourcePath: string,
    metadata: MediaMetadata = {},
    thumbnail?: ThumbnailInput,
    folderId?: number | null,
    overrideName?: string,
  ): Promise<VaultItemSummary> {
    const metaRow = this.db
      .prepare('SELECT rating, is_favorite FROM vault_objects WHERE id = ?')
      .get(existingItemId) as { rating: number | null; is_favorite: number | null } | undefined;

    const tagRows = this.db
      .prepare('SELECT tag_id FROM object_tags WHERE object_id = ?')
      .all(existingItemId) as Array<{ tag_id: number }>;

    await this.deleteItem(existingItemId);
    const newItem = await this.addEncryptedFile(sourcePath, metadata, thumbnail, folderId, overrideName);

    if (metaRow) {
      if (metaRow.rating !== null) this.setRating(newItem.id, metaRow.rating);
      if (metaRow.is_favorite) this.setFavorite(newItem.id, true);
    }

    if (tagRows.length > 0) {
      const placeholders = tagRows.map(() => '(?, ?)').join(', ');
      const values = tagRows.flatMap((r) => [newItem.id, r.tag_id]);
      this.db
        .prepare(`INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES ${placeholders}`)
        .run(...values);
    }

    return newItem;
  }

  async deleteItem(itemId: string): Promise<void> {
    const row = this.db
      .prepare('SELECT encrypted_filename FROM vault_items WHERE vault_object_id = ?')
      .get(itemId) as { encrypted_filename: string } | undefined;

    if (!row) throw new Error('Item not found.');

    const filePath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
    }

    // CASCADE on vault_objects deletes vault_items and object_tags rows
    this.db.prepare('DELETE FROM vault_objects WHERE id = ?').run(itemId);
  }

  async getDecryptedMedia(itemId: string): Promise<{
    itemId: string; mimeType: string; fileSize: number; data: Buffer;
  }> {
    const row = this.db
      .prepare(
        `SELECT vi.vault_object_id, vi.encrypted_filename, vi.mime_type, vi.file_size, vi.content_hash, vi.iv, vi.auth_tag
         FROM vault_items vi WHERE vi.vault_object_id = ?`,
      )
      .get(itemId) as MediaItemRow | undefined;

    if (!row) throw new Error('Item not found.');

    const encryptedPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
    const encryptedData = await fs.readFile(encryptedPath);
    const key = this.sessionStore.getMasterKey();
    const decrypted = this.cryptoService.decryptBuffer(
      { iv: row.iv, authTag: row.auth_tag, encrypted: encryptedData },
      key,
    );

    if (row.content_hash) {
      const decryptedHash = createHash('sha256').update(decrypted).digest('hex');
      if (decryptedHash !== row.content_hash) {
        logger.error('content hash mismatch', { itemId: row.vault_object_id, expected: row.content_hash, actual: decryptedHash });
      } else {
        logger.info('content hash ok', { itemId: row.vault_object_id });
      }
    }

    return {
      itemId: row.vault_object_id,
      mimeType: row.mime_type || 'application/octet-stream',
      fileSize: row.file_size,
      data: decrypted,
    };
  }
}

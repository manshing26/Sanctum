import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type { BookmarkSummary, CreateBookmarkInput, UpdateBookmarkThumbnailInput } from '../../../shared/ipc';
import { getLogger } from '../../logging/logger';

type BookmarkRow = {
  id: number;
  title_enc: Buffer;
  url_enc: Buffer;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  created_at: string;
  updated_at: string;
};

type EncryptedPayload = {
  iv: string;
  authTag: string;
  data: string;
};

const decryptPayload = (
  payloadBuffer: Buffer,
  cryptoService: CryptoService,
  masterKey: Buffer,
): string => {
  const payload = JSON.parse(payloadBuffer.toString('utf8')) as EncryptedPayload;
  const decrypted = cryptoService.decryptBuffer(
    {
      iv: Buffer.from(payload.iv, 'base64'),
      authTag: Buffer.from(payload.authTag, 'base64'),
      encrypted: Buffer.from(payload.data, 'base64'),
    },
    masterKey,
  );

  return decrypted.toString('utf8');
};

const encryptPayload = (
  value: string,
  cryptoService: CryptoService,
  masterKey: Buffer,
): Buffer => {
  const encrypted = cryptoService.encryptBuffer(Buffer.from(value, 'utf8'), masterKey);
  return Buffer.from(
    JSON.stringify({
      iv: encrypted.iv.toString('base64'),
      authTag: encrypted.authTag.toString('base64'),
      data: encrypted.encrypted.toString('base64'),
    }),
    'utf8',
  );
};

const normalizeHttpUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Bookmark URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    const looksLikeDomain =
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/.*)?$/i.test(
        trimmed,
      );
    if (!looksLikeDomain) {
      throw new Error('Bookmark URL is invalid.');
    }
    parsed = new URL(`https://${trimmed}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Bookmark URL must use http or https.');
  }

  return parsed.toString();
};

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB

const logger = getLogger('bookmark');

export class BookmarkService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
  ) {}

  private getMasterKey(): Buffer {
    try {
      return this.sessionStore.getMasterKey();
    } catch {
      throw new Error('Unlock vault to manage bookmarks.');
    }
  }

  private async fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_THUMBNAIL_BYTES) return null;

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const reader = res.body?.getReader();
      if (!reader) return null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_THUMBNAIL_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }

      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  private async fetchOgImage(pageUrl: string): Promise<Buffer | null> {
    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; privateVault/1.0)' },
      });
      if (!res.ok) return null;
      const html = await res.text();

      const ogMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

      if (!ogMatch?.[1]) return null;

      const imageUrl = new URL(ogMatch[1], pageUrl).toString();
      return this.fetchImageBuffer(imageUrl);
    } catch {
      return null;
    }
  }

  private rowToSummary(row: BookmarkRow, masterKey: Buffer): BookmarkSummary {
    let thumbnailDataUrl: string | undefined;
    if (row.thumbnail_enc && row.thumbnail_iv && row.thumbnail_auth_tag) {
      try {
        const decrypted = this.cryptoService.decryptBuffer(
          { iv: row.thumbnail_iv, authTag: row.thumbnail_auth_tag, encrypted: row.thumbnail_enc },
          masterKey,
        );
        thumbnailDataUrl = `data:image/jpeg;base64,${decrypted.toString('base64')}`;
      } catch {
        // Corrupted thumbnail — skip silently.
      }
    }
    return {
      id: row.id,
      title: decryptPayload(row.title_enc, this.cryptoService, masterKey),
      url: decryptPayload(row.url_enc, this.cryptoService, masterKey),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      thumbnailDataUrl,
    };
  }

  listBookmarks(): BookmarkSummary[] {
    const masterKey = this.getMasterKey();
    const rows = this.db
      .prepare(
        `SELECT id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, created_at, updated_at
         FROM bookmarks
         ORDER BY datetime(updated_at) DESC, id DESC`,
      )
      .all() as BookmarkRow[];

    const bookmarks: BookmarkSummary[] = [];
    for (const row of rows) {
      try {
        bookmarks.push(this.rowToSummary(row, masterKey));
      } catch (error) {
        logger.warn('skipped corrupted row', {
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return bookmarks;
  }

  async createBookmark(input: CreateBookmarkInput): Promise<BookmarkSummary> {
    const masterKey = this.getMasterKey();
    const normalizedUrl = normalizeHttpUrl(input.url);
    const rawTitle = input.title?.trim();
    const resolvedTitle = rawTitle && rawTitle.length > 0 ? rawTitle : normalizedUrl;

    const titleEnc = encryptPayload(resolvedTitle, this.cryptoService, masterKey);
    const urlEnc = encryptPayload(normalizedUrl, this.cryptoService, masterKey);

    // Resolve thumbnail buffer — three sources in priority order:
    // 1. Pre-fetched data URL from the renderer (webview fetch, bypasses bot blocks)
    // 2. og:image URL passed by the renderer (main process fetches it)
    // 3. Fall back: main process fetches the page and extracts og:image itself
    let thumbnailEnc: Buffer | null = null;
    let thumbnailIv: Buffer | null = null;
    let thumbnailAuthTag: Buffer | null = null;

    let thumbBuf: Buffer | null = null;
    if (input.thumbnailDataUrl) {
      try {
        const match = input.thumbnailDataUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (match?.[1]) thumbBuf = Buffer.from(match[1], 'base64');
      } catch {
        // Ignore malformed data URL.
      }
    } else if (input.thumbnailUrl) {
      thumbBuf = await this.fetchImageBuffer(input.thumbnailUrl);
    } else {
      thumbBuf = await this.fetchOgImage(normalizedUrl);
    }

    if (thumbBuf) {
      try {
        const enc = this.cryptoService.encryptBuffer(thumbBuf, masterKey);
        thumbnailEnc = enc.encrypted;
        thumbnailIv = enc.iv;
        thumbnailAuthTag = enc.authTag;
      } catch {
        // Encryption failure — save bookmark without thumbnail.
      }
    }

    const result = this.db
      .prepare(
        `INSERT INTO bookmarks (title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(titleEnc, urlEnc, thumbnailEnc, thumbnailIv, thumbnailAuthTag);

    const created = this.db
      .prepare(
        `SELECT id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, created_at, updated_at
         FROM bookmarks
         WHERE id = ?`,
      )
      .get(result.lastInsertRowid) as BookmarkRow | undefined;

    if (!created) {
      throw new Error('Failed to create bookmark.');
    }

    return this.rowToSummary(created, masterKey);
  }

  async updateThumbnail(input: UpdateBookmarkThumbnailInput): Promise<BookmarkSummary> {
    const masterKey = this.getMasterKey();
    const match = input.thumbnailDataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!match?.[1]) throw new Error('Invalid thumbnail data URL.');
    const thumbBuf = Buffer.from(match[1], 'base64');
    const enc = this.cryptoService.encryptBuffer(thumbBuf, masterKey);

    this.db
      .prepare(
        `UPDATE bookmarks SET thumbnail_enc = ?, thumbnail_iv = ?, thumbnail_auth_tag = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(enc.encrypted, enc.iv, enc.authTag, input.id);

    const row = this.db
      .prepare(
        `SELECT id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, created_at, updated_at FROM bookmarks WHERE id = ?`,
      )
      .get(input.id) as BookmarkRow | undefined;
    if (!row) throw new Error('Bookmark not found.');
    return this.rowToSummary(row, masterKey);
  }

  deleteBookmark(id: number): void {
    this.getMasterKey();
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }
}

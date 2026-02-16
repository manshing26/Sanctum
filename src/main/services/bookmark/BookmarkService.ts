import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type { BookmarkSummary, CreateBookmarkInput } from '../../../shared/ipc';
import { getLogger } from '../../logging/logger';

type BookmarkRow = {
  id: number;
  title_enc: Buffer;
  url_enc: Buffer;
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

  listBookmarks(): BookmarkSummary[] {
    const masterKey = this.getMasterKey();
    const rows = this.db
      .prepare(
        `SELECT id, title_enc, url_enc, created_at, updated_at
         FROM bookmarks
         ORDER BY datetime(updated_at) DESC, id DESC`,
      )
      .all() as BookmarkRow[];

    const bookmarks: BookmarkSummary[] = [];
    for (const row of rows) {
      try {
        bookmarks.push({
          id: row.id,
          title: decryptPayload(row.title_enc, this.cryptoService, masterKey),
          url: decryptPayload(row.url_enc, this.cryptoService, masterKey),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      } catch (error) {
        logger.warn('skipped corrupted row', {
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return bookmarks;
  }

  createBookmark(input: CreateBookmarkInput): BookmarkSummary {
    const masterKey = this.getMasterKey();
    const normalizedUrl = normalizeHttpUrl(input.url);
    const rawTitle = input.title?.trim();
    const resolvedTitle = rawTitle && rawTitle.length > 0 ? rawTitle : normalizedUrl;

    const titleEnc = encryptPayload(resolvedTitle, this.cryptoService, masterKey);
    const urlEnc = encryptPayload(normalizedUrl, this.cryptoService, masterKey);

    const result = this.db
      .prepare(
        `INSERT INTO bookmarks (title_enc, url_enc, created_at, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(titleEnc, urlEnc);

    const created = this.db
      .prepare(
        `SELECT id, title_enc, url_enc, created_at, updated_at
         FROM bookmarks
         WHERE id = ?`,
      )
      .get(result.lastInsertRowid) as BookmarkRow | undefined;

    if (!created) {
      throw new Error('Failed to create bookmark.');
    }

    return {
      id: created.id,
      title: decryptPayload(created.title_enc, this.cryptoService, masterKey),
      url: decryptPayload(created.url_enc, this.cryptoService, masterKey),
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  deleteBookmark(id: number): void {
    this.getMasterKey();
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }
}

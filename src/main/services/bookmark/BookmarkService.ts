import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type {
  BookmarkSummary,
  CreateBookmarkInput,
  UpdateBookmarkThumbnailInput,
  AssignBookmarkFolderInput,
  AssignBookmarksFolderInput,
  AssignBookmarkTagInput,
  UnassignBookmarkTagInput,
  AssignBookmarksTagInput,
  UnassignBookmarksTagInput,
  TagSummary,
  ImportBookmarksResult,
} from '../../../shared/ipc';
import { getLogger } from '../../logging/logger';

// Row returned by queries that JOIN bookmarks + vault_objects
type BookmarkRow = {
  vault_object_id: string;
  title_enc: Buffer;
  url_enc: Buffer;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  folder_id: number | null;
  is_favorite: number | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
};

type BookmarkTagRow = {
  tag_id: number;
  name: string;
  color: string | null;
  tag_created_at: string;
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
  if (!trimmed) throw new Error('Bookmark URL is required.');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    const looksLikeDomain =
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/.*)?$/i.test(trimmed);
    if (!looksLikeDomain) throw new Error('Bookmark URL is invalid.');
    parsed = new URL(`https://${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Bookmark URL must use http or https.');
  }
  return parsed.toString();
};

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const logger = getLogger('bookmark');

const BOOKMARK_SELECT = `
  SELECT b.vault_object_id, b.title_enc, b.url_enc,
         b.thumbnail_enc, b.thumbnail_iv, b.thumbnail_auth_tag,
         vo.folder_id, vo.is_favorite, vo.rating, vo.created_at, vo.updated_at
  FROM bookmarks b
  INNER JOIN vault_objects vo ON vo.id = b.vault_object_id
`;

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
        if (totalBytes > MAX_THUMBNAIL_BYTES) { await reader.cancel(); return null; }
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

  private getBookmarkTags(objectId: string): TagSummary[] {
    const rows = this.db
      .prepare(
        `SELECT ot.tag_id, t.name, t.color, t.created_at AS tag_created_at
         FROM object_tags ot
         JOIN tags t ON t.id = ot.tag_id
         WHERE ot.object_id = ?
         ORDER BY t.name COLLATE NOCASE`,
      )
      .all(objectId) as BookmarkTagRow[];
    return rows.map((r) => ({
      id: r.tag_id,
      name: r.name,
      color: r.color ?? undefined,
      createdAt: r.tag_created_at,
    }));
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
      id: row.vault_object_id,
      title: decryptPayload(row.title_enc, this.cryptoService, masterKey),
      url: decryptPayload(row.url_enc, this.cryptoService, masterKey),
      folderId: row.folder_id,
      isFavorite: Boolean(row.is_favorite),
      rating: row.rating ?? undefined,
      tags: this.getBookmarkTags(row.vault_object_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      thumbnailDataUrl,
    };
  }

  listBookmarks(): BookmarkSummary[] {
    const masterKey = this.getMasterKey();
    const rows = this.db
      .prepare(`${BOOKMARK_SELECT} ORDER BY datetime(vo.updated_at) DESC, vo.id DESC`)
      .all() as BookmarkRow[];

    const bookmarks: BookmarkSummary[] = [];
    for (const row of rows) {
      try {
        bookmarks.push(this.rowToSummary(row, masterKey));
      } catch (error) {
        logger.warn('skipped corrupted row', {
          id: row.vault_object_id,
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

    let thumbnailEnc: Buffer | null = null;
    let thumbnailIv: Buffer | null = null;
    let thumbnailAuthTag: Buffer | null = null;

    let thumbBuf: Buffer | null = null;
    if (input.thumbnailDataUrl) {
      try {
        const match = input.thumbnailDataUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (match?.[1]) thumbBuf = Buffer.from(match[1], 'base64');
      } catch { /* Ignore malformed data URL. */ }
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
      } catch { /* Encryption failure — save bookmark without thumbnail. */ }
    }

    const folderId = input.folderId ?? null;
    const objectId = randomUUID();

    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
         VALUES (?, 'bookmark', ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).run(objectId, folderId);

      this.db.prepare(
        `INSERT INTO bookmarks (vault_object_id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(objectId, titleEnc, urlEnc, thumbnailEnc, thumbnailIv, thumbnailAuthTag);
    });
    tx();

    const created = this.db
      .prepare(`${BOOKMARK_SELECT} WHERE b.vault_object_id = ?`)
      .get(objectId) as BookmarkRow | undefined;
    if (!created) throw new Error('Failed to create bookmark.');
    return this.rowToSummary(created, masterKey);
  }

  async updateThumbnail(input: UpdateBookmarkThumbnailInput): Promise<BookmarkSummary> {
    const masterKey = this.getMasterKey();
    if (input.thumbnailDataUrl === null) {
      this.db
        .prepare(`UPDATE bookmarks SET thumbnail_enc = NULL, thumbnail_iv = NULL, thumbnail_auth_tag = NULL WHERE vault_object_id = ?`)
        .run(input.id);
    } else {
      const match = input.thumbnailDataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!match?.[1]) throw new Error('Invalid thumbnail data URL.');
      const thumbBuf = Buffer.from(match[1], 'base64');
      const enc = this.cryptoService.encryptBuffer(thumbBuf, masterKey);

      this.db
        .prepare(`UPDATE bookmarks SET thumbnail_enc = ?, thumbnail_iv = ?, thumbnail_auth_tag = ? WHERE vault_object_id = ?`)
        .run(enc.encrypted, enc.iv, enc.authTag, input.id);
    }
    this.db
      .prepare(`UPDATE vault_objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(input.id);

    const row = this.db
      .prepare(`${BOOKMARK_SELECT} WHERE b.vault_object_id = ?`)
      .get(input.id) as BookmarkRow | undefined;
    if (!row) throw new Error('Bookmark not found.');
    return this.rowToSummary(row, masterKey);
  }

  deleteBookmark(id: string): void {
    this.getMasterKey();
    // CASCADE on vault_objects deletes bookmarks row and object_tags rows
    this.db.prepare('DELETE FROM vault_objects WHERE id = ? AND type = ?').run(id, 'bookmark');
  }

  renameBookmark(id: string, title: string): BookmarkSummary {
    const masterKey = this.getMasterKey();
    const trimmed = title.trim();
    if (!trimmed) throw new Error('Title cannot be empty.');
    const titleEnc = encryptPayload(trimmed, this.cryptoService, masterKey);
    this.db.prepare(`UPDATE bookmarks SET title_enc = ? WHERE vault_object_id = ?`).run(titleEnc, id);
    this.db.prepare(`UPDATE vault_objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    const row = this.db
      .prepare(`${BOOKMARK_SELECT} WHERE b.vault_object_id = ?`)
      .get(id) as BookmarkRow | undefined;
    if (!row) throw new Error('Bookmark not found.');
    return this.rowToSummary(row, masterKey);
  }

  assignBookmarkFolder(input: AssignBookmarkFolderInput): void {
    this.getMasterKey();
    this.db
      .prepare(`UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'bookmark'`)
      .run(input.folderId, input.bookmarkId);
  }

  assignBookmarksFolder(input: AssignBookmarksFolderInput): void {
    this.getMasterKey();
    if (input.bookmarkIds.length === 0) return;
    const stmt = this.db.prepare(
      `UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'bookmark'`,
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(input.folderId, id);
    });
    tx(input.bookmarkIds);
  }

  assignBookmarkTag(input: AssignBookmarkTagInput): void {
    this.getMasterKey();
    const tagExists = this.db.prepare('SELECT 1 FROM tags WHERE id = ?').get(input.tagId);
    if (!tagExists) throw new Error('Tag not found.');
    const bookmarkExists = this.db
      .prepare("SELECT 1 FROM vault_objects WHERE id = ? AND type = 'bookmark'")
      .get(input.bookmarkId);
    if (!bookmarkExists) throw new Error('Bookmark not found.');
    this.db
      .prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)')
      .run(input.bookmarkId, input.tagId);
  }

  unassignBookmarkTag(input: UnassignBookmarkTagInput): void {
    this.getMasterKey();
    this.db
      .prepare('DELETE FROM object_tags WHERE object_id = ? AND tag_id = ?')
      .run(input.bookmarkId, input.tagId);
  }

  assignBookmarksTag(input: AssignBookmarksTagInput): void {
    this.getMasterKey();
    if (input.bookmarkIds.length === 0) return;
    const tagExists = this.db.prepare('SELECT 1 FROM tags WHERE id = ?').get(input.tagId);
    if (!tagExists) throw new Error('Tag not found.');
    const stmt = this.db.prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)');
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id, input.tagId);
    });
    tx(input.bookmarkIds);
  }

  unassignBookmarksTag(input: UnassignBookmarksTagInput): void {
    this.getMasterKey();
    if (input.bookmarkIds.length === 0) return;
    const placeholders = input.bookmarkIds.map(() => '?').join(', ');
    this.db
      .prepare(`DELETE FROM object_tags WHERE tag_id = ? AND object_id IN (${placeholders})`)
      .run(input.tagId, ...input.bookmarkIds);
  }

  exportBookmarks(ids?: string[]): string {
    const masterKey = this.getMasterKey();
    const hasFilter = ids && ids.length > 0;
    const query = `SELECT b.vault_object_id, b.title_enc, b.url_enc, vo.folder_id, vo.created_at
         FROM bookmarks b
         INNER JOIN vault_objects vo ON vo.id = b.vault_object_id
         ${hasFilter ? `WHERE b.vault_object_id IN (${ids.map(() => '?').join(',')})` : ''}
         ORDER BY vo.created_at ASC, vo.id ASC`;
    const rows = this.db
      .prepare(query)
      .all(...(hasFilter ? ids : [])) as Array<{ vault_object_id: string; title_enc: Buffer; url_enc: Buffer; folder_id: number | null; created_at: string }>;

    type FolderRow = { id: number; name: string; parent_id: number | null };
    const folderRows = this.db.prepare('SELECT id, name, parent_id FROM folders').all() as FolderRow[];
    const folderMap = new Map<number, FolderRow>(folderRows.map((f) => [f.id, f]));
    const getFolderName = (id: number | null): string | null => {
      if (!id) return null;
      return folderMap.get(id)?.name ?? null;
    };

    const byFolder = new Map<number | null, typeof rows>();
    for (const row of rows) {
      const key = row.folder_id;
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(row);
    }

    const renderBookmarks = (items: typeof rows): string =>
      items.map((row) => {
        let title: string;
        let url: string;
        try {
          title = decryptPayload(row.title_enc as Buffer, this.cryptoService, masterKey);
          url = decryptPayload(row.url_enc as Buffer, this.cryptoService, masterKey);
        } catch { return ''; }
        const tags = this.getBookmarkTags(row.vault_object_id).map((t) => t.name).join(',');
        const addDate = Math.floor(new Date(row.created_at).getTime() / 1000);
        const tagsAttr = tags ? ` TAGS="${tags}"` : '';
        const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `    <DT><A HREF="${url}" ADD_DATE="${addDate}"${tagsAttr}>${escaped}</A>`;
      }).filter(Boolean).join('\n');

    let body = '';
    const unfiled = byFolder.get(null) ?? [];
    if (unfiled.length > 0) body += renderBookmarks(unfiled) + '\n';
    for (const [folderId, items] of byFolder.entries()) {
      if (folderId === null) continue;
      const name = getFolderName(folderId) ?? `Folder ${folderId}`;
      const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      body += `    <DT><H3>${escaped}</H3>\n    <DL><p>\n${renderBookmarks(items)}\n    </DL><p>\n`;
    }

    return [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file.',
      '     It will be read and overwritten.',
      '     DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
      body.trimEnd(),
      '</DL><p>',
    ].join('\n');
  }

  async importBookmarks(html: string): Promise<ImportBookmarksResult> {
    const masterKey = this.getMasterKey();
    const result: ImportBookmarksResult = { added: 0, skipped: 0, errors: [] };

    // Collect existing URLs for deduplication
    const existingRows = this.db
      .prepare(`SELECT b.vault_object_id, b.url_enc FROM bookmarks b`)
      .all() as Array<{ vault_object_id: string; url_enc: Buffer }>;
    const existingUrls = new Set<string>();
    for (const row of existingRows) {
      try {
        existingUrls.add(decryptPayload(row.url_enc as Buffer, this.cryptoService, masterKey));
      } catch { /* skip corrupted */ }
    }

    const folderCache = new Map<string, number>();
    const resolveFolder = (name: string): number => {
      const cached = folderCache.get(name);
      if (cached !== undefined) return cached;
      const existing = this.db
        .prepare('SELECT id FROM folders WHERE parent_id IS NULL AND name = ?')
        .get(name) as { id: number } | undefined;
      if (existing) { folderCache.set(name, existing.id); return existing.id; }
      const r = this.db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, NULL)').run(name);
      const id = r.lastInsertRowid as number;
      folderCache.set(name, id);
      return id;
    };

    const tokenRe = /<(\/?)([A-Z0-9]+)([^>]*)>([^<]*)/gi;
    let currentFolderName: string | null = null;
    let match: RegExpExecArray | null;

    while ((match = tokenRe.exec(html)) !== null) {
      const closing = match[1] === '/';
      const tag = match[2].toUpperCase();
      const attrs = match[3];
      const text = match[4].trim();

      if (!closing && tag === 'H3') {
        const name = text.replace(/<[^>]+>/g, '').trim();
        if (name) currentFolderName = name;
        continue;
      }
      if (closing && (tag === 'DL' || tag === 'P')) {
        currentFolderName = null;
        continue;
      }
      if (!closing && tag === 'A') {
        const hrefMatch = /HREF="([^"]+)"/i.exec(attrs);
        if (!hrefMatch) continue;
        const url = hrefMatch[1];
        const title = text || url;

        if (existingUrls.has(url)) { result.skipped++; continue; }

        try {
          const folderId = currentFolderName ? resolveFolder(currentFolderName) : null;
          const tagsMatch = /TAGS="([^"]*)"/i.exec(attrs);
          const tagNames = tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean) : [];

          const created = await this.createBookmark({ title, url, folderId });
          existingUrls.add(url);

          for (const tagName of tagNames) {
            try {
              let tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: number } | undefined;
              if (!tag) {
                const r = this.db.prepare('INSERT INTO tags (name) VALUES (?)').run(tagName);
                tag = { id: r.lastInsertRowid as number };
              }
              this.db
                .prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)')
                .run(created.id, tag.id);
            } catch { /* skip tag errors */ }
          }
          result.added++;
        } catch (err) {
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    return result;
  }
}

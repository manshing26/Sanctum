import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type {
  AssignNoteFolderInput,
  AssignNotesFolderInput,
  AssignNoteTagInput,
  AssignNotesTagInput,
  CreateNoteInput,
  NoteFormat,
  NoteSummary,
  TagSummary,
  UnassignNoteTagInput,
  UnassignNotesTagInput,
  UpdateNoteInput,
} from '../../../shared/ipc';

type NoteRow = {
  vault_object_id: string;
  title_enc: Buffer;
  body_enc: Buffer;
  format: NoteFormat;
  folder_id: number | null;
  is_favorite: number | null;
  created_at: string;
  updated_at: string;
};

type NoteTagRow = {
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

const NOTE_SELECT = `
  SELECT n.vault_object_id, n.title_enc, n.body_enc, n.format,
         vo.folder_id, vo.is_favorite, vo.created_at, vo.updated_at
  FROM notes n
  INNER JOIN vault_objects vo ON vo.id = n.vault_object_id
`;

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

export class NoteService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
  ) {}

  private getMasterKey(): Buffer {
    try {
      return this.sessionStore.getMasterKey();
    } catch {
      throw new Error('Unlock vault to manage notes.');
    }
  }

  private getNoteTags(objectId: string): TagSummary[] {
    const rows = this.db
      .prepare(
        `SELECT ot.tag_id, t.name, t.color, t.created_at AS tag_created_at
         FROM object_tags ot
         JOIN tags t ON t.id = ot.tag_id
         WHERE ot.object_id = ?
         ORDER BY t.name COLLATE NOCASE`,
      )
      .all(objectId) as NoteTagRow[];
    return rows.map((row) => ({
      id: row.tag_id,
      name: row.name,
      color: row.color ?? undefined,
      createdAt: row.tag_created_at,
    }));
  }

  private rowToSummary(row: NoteRow, masterKey: Buffer): NoteSummary {
    return {
      id: row.vault_object_id,
      title: decryptPayload(row.title_enc, this.cryptoService, masterKey),
      body: decryptPayload(row.body_enc, this.cryptoService, masterKey),
      format: row.format,
      folderId: row.folder_id,
      isFavorite: Boolean(row.is_favorite),
      tags: this.getNoteTags(row.vault_object_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listNotes(): NoteSummary[] {
    const masterKey = this.getMasterKey();
    const rows = this.db
      .prepare(`${NOTE_SELECT} ORDER BY datetime(vo.updated_at) DESC, vo.id DESC`)
      .all() as NoteRow[];
    return rows.map((row) => this.rowToSummary(row, masterKey));
  }

  createNote(input: CreateNoteInput): NoteSummary {
    const masterKey = this.getMasterKey();
    const title = input.title.trim() || 'Untitled note';
    const body = input.body ?? '';
    const format = input.format === 'markdown' ? 'markdown' : 'plain';
    const objectId = randomUUID();
    const titleEnc = encryptPayload(title, this.cryptoService, masterKey);
    const bodyEnc = encryptPayload(body, this.cryptoService, masterKey);

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
           VALUES (?, 'note', ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .run(objectId, input.folderId ?? null);
      this.db
        .prepare(`INSERT INTO notes (vault_object_id, title_enc, body_enc, format) VALUES (?, ?, ?, ?)`)
        .run(objectId, titleEnc, bodyEnc, format);
    })();

    const row = this.db
      .prepare(`${NOTE_SELECT} WHERE n.vault_object_id = ?`)
      .get(objectId) as NoteRow | undefined;
    if (!row) throw new Error('Failed to create note.');
    return this.rowToSummary(row, masterKey);
  }

  updateNote(input: UpdateNoteInput): NoteSummary {
    const masterKey = this.getMasterKey();
    const title = input.title.trim();
    if (!title) throw new Error('Note title cannot be empty.');
    const format = input.format === 'markdown' ? 'markdown' : 'plain';
    const titleEnc = encryptPayload(title, this.cryptoService, masterKey);
    const bodyEnc = encryptPayload(input.body, this.cryptoService, masterKey);

    this.db.transaction(() => {
      const result = this.db
        .prepare(`UPDATE notes SET title_enc = ?, body_enc = ?, format = ? WHERE vault_object_id = ?`)
        .run(titleEnc, bodyEnc, format, input.id);
      if (result.changes === 0) throw new Error('Note not found.');
      this.db
        .prepare(`UPDATE vault_objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'note'`)
        .run(input.id);
    })();

    const row = this.db
      .prepare(`${NOTE_SELECT} WHERE n.vault_object_id = ?`)
      .get(input.id) as NoteRow | undefined;
    if (!row) throw new Error('Note not found.');
    return this.rowToSummary(row, masterKey);
  }

  deleteNote(id: string): void {
    this.getMasterKey();
    this.db.prepare(`DELETE FROM vault_objects WHERE id = ? AND type = 'note'`).run(id);
  }

  assignNoteFolder(input: AssignNoteFolderInput): void {
    this.getMasterKey();
    this.db
      .prepare(`UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'note'`)
      .run(input.folderId, input.noteId);
  }

  assignNotesFolder(input: AssignNotesFolderInput): void {
    this.getMasterKey();
    if (input.noteIds.length === 0) return;
    const stmt = this.db.prepare(
      `UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'note'`,
    );
    this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(input.folderId, id);
    })(input.noteIds);
  }

  assignNoteTag(input: AssignNoteTagInput): void {
    this.getMasterKey();
    const tagExists = this.db.prepare('SELECT 1 FROM tags WHERE id = ?').get(input.tagId);
    if (!tagExists) throw new Error('Tag not found.');
    const noteExists = this.db
      .prepare("SELECT 1 FROM vault_objects WHERE id = ? AND type = 'note'")
      .get(input.noteId);
    if (!noteExists) throw new Error('Note not found.');
    this.db
      .prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)')
      .run(input.noteId, input.tagId);
  }

  unassignNoteTag(input: UnassignNoteTagInput): void {
    this.getMasterKey();
    this.db
      .prepare('DELETE FROM object_tags WHERE object_id = ? AND tag_id = ?')
      .run(input.noteId, input.tagId);
  }

  assignNotesTag(input: AssignNotesTagInput): void {
    this.getMasterKey();
    if (input.noteIds.length === 0) return;
    const tagExists = this.db.prepare('SELECT 1 FROM tags WHERE id = ?').get(input.tagId);
    if (!tagExists) throw new Error('Tag not found.');
    const stmt = this.db.prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)');
    this.db.transaction((ids: string[]) => {
      for (const id of ids) stmt.run(id, input.tagId);
    })(input.noteIds);
  }

  unassignNotesTag(input: UnassignNotesTagInput): void {
    this.getMasterKey();
    if (input.noteIds.length === 0) return;
    const placeholders = input.noteIds.map(() => '?').join(', ');
    this.db
      .prepare(`DELETE FROM object_tags WHERE tag_id = ? AND object_id IN (${placeholders})`)
      .run(input.tagId, ...input.noteIds);
  }

  getNote(id: string): NoteSummary {
    const masterKey = this.getMasterKey();
    const row = this.db
      .prepare(`${NOTE_SELECT} WHERE n.vault_object_id = ?`)
      .get(id) as NoteRow | undefined;
    if (!row) throw new Error('Note not found.');
    return this.rowToSummary(row, masterKey);
  }
}

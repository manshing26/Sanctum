import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import { VaultPaths } from './VaultPaths';
import { VaultService } from './VaultService';
import type { CorruptVaultEntry, VaultHealthReport, VaultRepairResult } from '../../../shared/ipc';

type EncryptedPayload = { iv: string; authTag: string; data: string };

type ObjectRow = {
  id: string;
  type: 'file' | 'bookmark' | 'note';
  folder_id: number | null;
};

type FileRow = {
  vault_object_id: string;
  encrypted_filename: string;
  mime_type: string | null;
  original_filename_enc: Buffer;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  iv: Buffer;
  auth_tag: Buffer;
  content_hash: string | null;
};

type BookmarkRow = {
  vault_object_id: string;
  title_enc: Buffer;
  url_enc: Buffer;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
};

type NoteRow = {
  vault_object_id: string;
  title_enc: Buffer;
  body_enc: Buffer;
  format: string;
};

type PasswordRow = {
  id: string;
  domain_enc: Buffer;
  username_enc: Buffer;
  password_enc: Buffer;
  label_enc: Buffer | null;
  notes_enc: Buffer | null;
};

type AudioMetadataRow = {
  vault_object_id: string;
  title_enc: Buffer | null;
  artist_enc: Buffer | null;
  album_enc: Buffer | null;
};

type AudioBookmarkRow = {
  id: string;
  vault_object_id: string;
  label_enc: Buffer;
};

type AudioPlaybackRow = {
  vault_object_id: string;
};

const makeCounts = (): VaultHealthReport['counts'] => ({
  files: 0,
  bookmarks: 0,
  notes: 0,
  passwords: 0,
  thumbnails: 0,
  orphanRows: 0,
  orphanBlobs: 0,
  folderReferences: 0,
});

const timestamp = (): string => new Date().toISOString();

export class VaultRecoveryService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths: VaultPaths,
    private readonly vaultService: VaultService,
  ) {}

  scanHealth(): VaultHealthReport {
    const checkedAt = timestamp();
    const databaseMessage = this.checkDatabase();
    if (databaseMessage) {
      return {
        status: 'malformed_database',
        databaseOk: false,
        entries: [{
          id: 'database',
          kind: 'database',
          issue: databaseMessage,
          action: 'rebuild_database',
        }],
        counts: makeCounts(),
        checkedAt,
        message: 'Vault database needs recovery.',
      };
    }

    this.ensureUnlocked();
    try {
      const entries = this.collectCorruptEntries();
      const counts = this.countEntries(entries);
      return {
        status: entries.length > 0 ? 'corrupt_data' : 'ok',
        databaseOk: true,
        entries,
        counts,
        checkedAt,
        message: entries.length > 0 ? 'Corrupted vault data was detected.' : undefined,
      };
    } catch (error) {
      if (this.isMalformedError(error)) {
        return {
          status: 'malformed_database',
          databaseOk: false,
          entries: [{
            id: 'database',
            kind: 'database',
            issue: 'SQLite reported malformed database pages.',
            action: 'rebuild_database',
          }],
          counts: makeCounts(),
          checkedAt,
          message: 'Vault database needs recovery.',
        };
      }
      throw error;
    }
  }

  async repairCorruptData(): Promise<VaultRepairResult> {
    this.ensureUnlocked();
    const report = this.scanHealth();
    if (report.status === 'malformed_database') {
      throw new Error('Vault database needs rebuild recovery before row repair can run.');
    }

    const entries = report.entries;
    const objectIdsToDelete = entries
      .filter((entry) => entry.action === 'delete_object')
      .map((entry) => entry.id);
    const passwordIdsToDelete = entries
      .filter((entry) => entry.action === 'delete_password')
      .map((entry) => entry.id);
    const thumbnailsToClear = entries.filter((entry) => entry.action === 'clear_thumbnail');
    const orphanRowsToDelete = entries.filter((entry) => entry.action === 'delete_orphan_row');
    const folderRefsToClear = entries
      .filter((entry) => entry.action === 'clear_folder_reference')
      .map((entry) => entry.id);
    const orphanBlobs = entries.filter((entry) => entry.action === 'delete_orphan_blob').map((entry) => entry.id);

    const fileRows = this.db
      .prepare('SELECT vault_object_id, encrypted_filename FROM vault_items')
      .all() as Array<{ vault_object_id: string; encrypted_filename: string }>;
    const filenamesByObjectId = new Map(fileRows.map((row) => [row.vault_object_id, row.encrypted_filename]));
    const filesToRemove = new Set<string>(orphanBlobs);
    for (const objectId of objectIdsToDelete) {
      const filename = filenamesByObjectId.get(objectId);
      if (filename) filesToRemove.add(filename);
    }

    this.db.transaction(() => {
      const deleteObject = this.db.prepare('DELETE FROM vault_objects WHERE id = ?');
      for (const id of objectIdsToDelete) deleteObject.run(id);

      const deletePassword = this.db.prepare('DELETE FROM passwords WHERE id = ?');
      for (const id of passwordIdsToDelete) deletePassword.run(id);

      for (const entry of thumbnailsToClear) {
        if (entry.kind === 'bookmark') {
          this.db
            .prepare('UPDATE bookmarks SET thumbnail_enc = NULL, thumbnail_iv = NULL, thumbnail_auth_tag = NULL WHERE vault_object_id = ?')
            .run(entry.id);
        } else {
          this.db
            .prepare('UPDATE vault_items SET thumbnail_enc = NULL, thumbnail_iv = NULL, thumbnail_auth_tag = NULL, thumbnail_mime_type = NULL WHERE vault_object_id = ?')
            .run(entry.id);
          this.db
            .prepare(`UPDATE audio_metadata SET artwork_source = 'none' WHERE vault_object_id = ?`)
            .run(entry.id);
        }
      }

      for (const entry of orphanRowsToDelete) {
        const [table, ...idParts] = entry.id.split(':');
        const id = idParts.join(':');
        if (table === 'vault_items') this.db.prepare('DELETE FROM vault_items WHERE vault_object_id = ?').run(id);
        if (table === 'bookmarks') this.db.prepare('DELETE FROM bookmarks WHERE vault_object_id = ?').run(id);
        if (table === 'notes') this.db.prepare('DELETE FROM notes WHERE vault_object_id = ?').run(id);
        if (table === 'audio_metadata') this.db.prepare('DELETE FROM audio_metadata WHERE vault_object_id = ?').run(id);
        if (table === 'audio_playback_positions') this.db.prepare('DELETE FROM audio_playback_positions WHERE vault_object_id = ?').run(id);
        if (table === 'audio_bookmarks') this.db.prepare('DELETE FROM audio_bookmarks WHERE id = ?').run(id);
        if (table === 'object_tags') {
          const [objectId, tagId] = id.split('|');
          this.db.prepare('DELETE FROM object_tags WHERE object_id = ? AND tag_id = ?').run(objectId, Number(tagId));
        }
      }

      const clearFolderRef = this.db.prepare('UPDATE vault_objects SET folder_id = NULL WHERE id = ?');
      for (const id of folderRefsToClear) clearFolderRef.run(id);
    })();

    let deletedOrphanBlobs = 0;
    for (const filename of filesToRemove) {
      try {
        await fs.rm(path.join(this.vaultPaths.filesDir, path.basename(filename)), { force: true });
        deletedOrphanBlobs += 1;
      } catch {
        // Keep DB repair successful even if a stale file was already gone.
      }
    }

    this.db.pragma('wal_checkpoint(TRUNCATE)');
    return {
      deletedObjects: objectIdsToDelete.length,
      deletedPasswords: passwordIdsToDelete.length,
      clearedThumbnails: thumbnailsToClear.length,
      deletedOrphanRows: orphanRowsToDelete.length,
      deletedOrphanBlobs,
      clearedFolderReferences: folderRefsToClear.length,
    };
  }

  async recoverMalformedDatabase(): Promise<VaultRepairResult> {
    this.ensureUnlocked();
    const backupPath = await this.backupDamagedVault();
    const cleared = await this.vaultService.clearAllItems();
    return {
      deletedObjects: cleared.deleted,
      deletedPasswords: 0,
      clearedThumbnails: 0,
      deletedOrphanRows: 0,
      deletedOrphanBlobs: 0,
      clearedFolderReferences: 0,
      backupPath,
      requiresRestart: true,
    };
  }

  private ensureUnlocked(): void {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault must be unlocked to recover data.');
    }
  }

  private checkDatabase(): string | null {
    try {
      const rows = this.db.prepare('PRAGMA quick_check').all() as Array<Record<string, string>>;
      const values = rows.flatMap((row) => Object.values(row));
      const problems = values.filter((value) => value !== 'ok');
      return problems.length > 0 ? problems[0] : null;
    } catch (error) {
      return this.isMalformedError(error) ? 'SQLite reported malformed database pages.' : null;
    }
  }

  private collectCorruptEntries(): CorruptVaultEntry[] {
    const entries: CorruptVaultEntry[] = [];
    const key = this.sessionStore.getMasterKey();
    const objectRows = this.db.prepare('SELECT id, type, folder_id FROM vault_objects').all() as ObjectRow[];
    const objectById = new Map(objectRows.map((row) => [row.id, row]));
    const folderIds = new Set((this.db.prepare('SELECT id FROM folders').all() as Array<{ id: number }>).map((row) => row.id));

    const fileRows = this.db.prepare('SELECT * FROM vault_items').all() as FileRow[];
    const fileByObjectId = new Map(fileRows.map((row) => [row.vault_object_id, row]));
    const bookmarkRows = this.db.prepare('SELECT * FROM bookmarks').all() as BookmarkRow[];
    const bookmarkByObjectId = new Map(bookmarkRows.map((row) => [row.vault_object_id, row]));
    const noteRows = this.db.prepare('SELECT * FROM notes').all() as NoteRow[];
    const noteByObjectId = new Map(noteRows.map((row) => [row.vault_object_id, row]));
    const audioMetadataRows = this.db.prepare('SELECT * FROM audio_metadata').all() as AudioMetadataRow[];
    const audioMetadataByObjectId = new Map(audioMetadataRows.map((row) => [row.vault_object_id, row]));

    for (const object of objectRows) {
      if (object.folder_id !== null && !folderIds.has(object.folder_id)) {
        entries.push({
          id: object.id,
          kind: 'folder_reference',
          issue: 'Object references a missing folder.',
          action: 'clear_folder_reference',
        });
      }

      if (object.type === 'file') {
        const row = fileByObjectId.get(object.id);
        if (!row) {
          entries.push({ id: object.id, kind: 'file', issue: 'File object has no file record.', action: 'delete_object' });
          continue;
        }
        this.validateFile(row, key, entries);
        if (row.mime_type?.startsWith('audio/')) {
          const audioMetadata = audioMetadataByObjectId.get(object.id);
          if (audioMetadata) this.validateAudioMetadata(audioMetadata, key, entries);
        }
      } else if (object.type === 'bookmark') {
        const row = bookmarkByObjectId.get(object.id);
        if (!row) {
          entries.push({ id: object.id, kind: 'bookmark', issue: 'Bookmark object has no bookmark record.', action: 'delete_object' });
          continue;
        }
        this.validateBookmark(row, key, entries);
      } else if (object.type === 'note') {
        const row = noteByObjectId.get(object.id);
        if (!row) {
          entries.push({ id: object.id, kind: 'note', issue: 'Note object has no note record.', action: 'delete_object' });
          continue;
        }
        this.validateNote(row, key, entries);
      }
    }

    for (const row of fileRows) {
      const object = objectById.get(row.vault_object_id);
      if (!object || object.type !== 'file') {
        entries.push({
          id: `vault_items:${row.vault_object_id}`,
          kind: 'file',
          issue: 'File row has no matching file object.',
          action: 'delete_orphan_row',
        });
      }
    }
    for (const row of bookmarkRows) {
      const object = objectById.get(row.vault_object_id);
      if (!object || object.type !== 'bookmark') {
        entries.push({
          id: `bookmarks:${row.vault_object_id}`,
          kind: 'bookmark',
          issue: 'Bookmark row has no matching bookmark object.',
          action: 'delete_orphan_row',
        });
      }
    }
    for (const row of noteRows) {
      const object = objectById.get(row.vault_object_id);
      if (!object || object.type !== 'note') {
        entries.push({
          id: `notes:${row.vault_object_id}`,
          kind: 'note',
          issue: 'Note row has no matching note object.',
          action: 'delete_orphan_row',
        });
      }
    }
    for (const row of audioMetadataRows) {
      const object = objectById.get(row.vault_object_id);
      const file = fileByObjectId.get(row.vault_object_id);
      if (!object || object.type !== 'file' || !file?.mime_type?.startsWith('audio/')) {
        entries.push({
          id: `audio_metadata:${row.vault_object_id}`,
          kind: 'file',
          issue: 'Audio metadata has no matching file object.',
          action: 'delete_orphan_row',
        });
      }
    }
    const audioPlaybackRows = this.db
      .prepare('SELECT vault_object_id FROM audio_playback_positions')
      .all() as AudioPlaybackRow[];
    for (const row of audioPlaybackRows) {
      const object = objectById.get(row.vault_object_id);
      const file = fileByObjectId.get(row.vault_object_id);
      if (!object || object.type !== 'file' || !file?.mime_type?.startsWith('audio/')) {
        entries.push({
          id: `audio_playback_positions:${row.vault_object_id}`,
          kind: 'file',
          issue: 'Audio playback progress has no matching audio object.',
          action: 'delete_orphan_row',
        });
      }
    }
    const audioBookmarks = this.db.prepare('SELECT * FROM audio_bookmarks').all() as AudioBookmarkRow[];
    for (const row of audioBookmarks) {
      const object = objectById.get(row.vault_object_id);
      const file = fileByObjectId.get(row.vault_object_id);
      if (!object || object.type !== 'file' || !file?.mime_type?.startsWith('audio/')) {
        entries.push({
          id: `audio_bookmarks:${row.id}`,
          kind: 'file',
          issue: 'Audio bookmark has no matching audio object.',
          action: 'delete_orphan_row',
        });
      } else if (!this.canDecryptPayload(row.label_enc, key)) {
        entries.push({
          id: `audio_bookmarks:${row.id}`,
          kind: 'file',
          issue: 'Audio bookmark cannot be decrypted.',
          action: 'delete_orphan_row',
        });
      }
    }

    const objectTagRows = this.db.prepare('SELECT object_id, tag_id FROM object_tags').all() as Array<{ object_id: string; tag_id: number }>;
    const tagIds = new Set((this.db.prepare('SELECT id FROM tags').all() as Array<{ id: number }>).map((row) => row.id));
    for (const row of objectTagRows) {
      if (!objectById.has(row.object_id) || !tagIds.has(row.tag_id)) {
        entries.push({
          id: `object_tags:${row.object_id}|${row.tag_id}`,
          kind: 'object_tag',
          issue: 'Tag assignment references missing data.',
          action: 'delete_orphan_row',
        });
      }
    }

    const passwords = this.db.prepare('SELECT * FROM passwords').all() as PasswordRow[];
    for (const row of passwords) {
      this.validatePassword(row, key, entries);
    }

    const referencedFiles = new Set(fileRows.map((row) => row.encrypted_filename));
    for (const filename of this.listEncryptedFileNames()) {
      if (!referencedFiles.has(filename)) {
        entries.push({
          id: filename,
          kind: 'orphan_blob',
          issue: 'Encrypted file blob is not referenced by the database.',
          action: 'delete_orphan_blob',
        });
      }
    }

    return this.dedupeEntries(entries);
  }

  private validateFile(row: FileRow, key: Buffer, entries: CorruptVaultEntry[]): void {
    if (!this.canDecryptPayload(row.original_filename_enc, key)) {
      entries.push({ id: row.vault_object_id, kind: 'file', issue: 'File name cannot be decrypted.', action: 'delete_object' });
      return;
    }

    try {
      const encryptedPath = path.join(this.vaultPaths.filesDir, path.basename(row.encrypted_filename));
      const encryptedData = require('node:fs').readFileSync(encryptedPath) as Buffer;
      const decrypted = this.cryptoService.decryptBuffer({ iv: row.iv, authTag: row.auth_tag, encrypted: encryptedData }, key);
      if (row.content_hash) {
        const hash = createHash('sha256').update(decrypted).digest('hex');
        if (hash !== row.content_hash) {
          entries.push({ id: row.vault_object_id, kind: 'file', issue: 'File content hash does not match.', action: 'delete_object' });
          return;
        }
      }
    } catch {
      entries.push({ id: row.vault_object_id, kind: 'file', issue: 'Encrypted file blob cannot be read or decrypted.', action: 'delete_object' });
      return;
    }

    if (row.thumbnail_enc || row.thumbnail_iv || row.thumbnail_auth_tag) {
      try {
        if (!row.thumbnail_enc || !row.thumbnail_iv || !row.thumbnail_auth_tag) throw new Error('Incomplete thumbnail.');
        this.cryptoService.decryptBuffer(
          { iv: row.thumbnail_iv, authTag: row.thumbnail_auth_tag, encrypted: row.thumbnail_enc },
          key,
        );
      } catch {
        entries.push({ id: row.vault_object_id, kind: 'thumbnail', issue: 'File thumbnail cannot be decrypted.', action: 'clear_thumbnail' });
      }
    }
  }

  private validateBookmark(row: BookmarkRow, key: Buffer, entries: CorruptVaultEntry[]): void {
    if (!this.canDecryptPayload(row.title_enc, key) || !this.canDecryptPayload(row.url_enc, key)) {
      entries.push({ id: row.vault_object_id, kind: 'bookmark', issue: 'Bookmark fields cannot be decrypted.', action: 'delete_object' });
      return;
    }
    if (row.thumbnail_enc || row.thumbnail_iv || row.thumbnail_auth_tag) {
      try {
        if (!row.thumbnail_enc || !row.thumbnail_iv || !row.thumbnail_auth_tag) throw new Error('Incomplete thumbnail.');
        this.cryptoService.decryptBuffer(
          { iv: row.thumbnail_iv, authTag: row.thumbnail_auth_tag, encrypted: row.thumbnail_enc },
          key,
        );
      } catch {
        entries.push({ id: row.vault_object_id, kind: 'bookmark', issue: 'Bookmark thumbnail cannot be decrypted.', action: 'clear_thumbnail' });
      }
    }
  }

  private validateNote(row: NoteRow, key: Buffer, entries: CorruptVaultEntry[]): void {
    if (row.format !== 'plain' && row.format !== 'markdown') {
      entries.push({ id: row.vault_object_id, kind: 'note', issue: 'Note format is invalid.', action: 'delete_object' });
      return;
    }
    if (!this.canDecryptPayload(row.title_enc, key) || !this.canDecryptPayload(row.body_enc, key)) {
      entries.push({ id: row.vault_object_id, kind: 'note', issue: 'Note fields cannot be decrypted.', action: 'delete_object' });
    }
  }

  private validateAudioMetadata(row: AudioMetadataRow, key: Buffer, entries: CorruptVaultEntry[]): void {
    const fields = [row.title_enc, row.artist_enc, row.album_enc];
    if (fields.some((field) => field && !this.canDecryptPayload(field, key))) {
      entries.push({
        id: row.vault_object_id,
        kind: 'file',
        issue: 'Audio metadata cannot be decrypted.',
        action: 'delete_object',
      });
    }
  }

  private validatePassword(row: PasswordRow, key: Buffer, entries: CorruptVaultEntry[]): void {
    const requiredOk =
      this.canDecryptPayload(row.domain_enc, key) &&
      this.canDecryptPayload(row.username_enc, key) &&
      this.canDecryptPayload(row.password_enc, key);
    const optionalOk =
      (!row.label_enc || this.canDecryptPayload(row.label_enc, key)) &&
      (!row.notes_enc || this.canDecryptPayload(row.notes_enc, key));
    if (!requiredOk || !optionalOk) {
      entries.push({ id: row.id, kind: 'password', issue: 'Password entry cannot be decrypted.', action: 'delete_password' });
    }
  }

  private canDecryptPayload(payloadBuffer: Buffer, key: Buffer): boolean {
    try {
      const payload = JSON.parse(payloadBuffer.toString('utf8')) as EncryptedPayload;
      if (!payload.iv || !payload.authTag || !payload.data) return false;
      this.cryptoService.decryptBuffer(
        {
          iv: Buffer.from(payload.iv, 'base64'),
          authTag: Buffer.from(payload.authTag, 'base64'),
          encrypted: Buffer.from(payload.data, 'base64'),
        },
        key,
      );
      return true;
    } catch {
      return false;
    }
  }

  private listEncryptedFileNames(): string[] {
    try {
      return require('node:fs')
        .readdirSync(this.vaultPaths.filesDir)
        .filter((entry: string) => entry.endsWith('.enc'));
    } catch {
      return [];
    }
  }

  private countEntries(entries: CorruptVaultEntry[]): VaultHealthReport['counts'] {
    const counts = makeCounts();
    for (const entry of entries) {
      if (entry.action === 'clear_thumbnail') counts.thumbnails += 1;
      if (entry.action === 'delete_orphan_row') counts.orphanRows += 1;
      if (entry.action === 'delete_orphan_blob') counts.orphanBlobs += 1;
      if (entry.action === 'clear_folder_reference') counts.folderReferences += 1;
      if (entry.action === 'delete_password') counts.passwords += 1;
      if (entry.action === 'delete_object') {
        if (entry.kind === 'file') counts.files += 1;
        if (entry.kind === 'bookmark') counts.bookmarks += 1;
        if (entry.kind === 'note') counts.notes += 1;
      }
    }
    return counts;
  }

  private dedupeEntries(entries: CorruptVaultEntry[]): CorruptVaultEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = `${entry.action}:${entry.kind}:${entry.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async backupDamagedVault(): Promise<string> {
    const backupRoot = path.join(
      path.dirname(this.vaultPaths.rootDir),
      `privateVault-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    );
    await fs.cp(this.vaultPaths.rootDir, backupRoot, { recursive: true, force: false });
    return backupRoot;
  }

  private isMalformedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /database disk image is malformed|database is corrupt|malformed database/i.test(message);
  }
}

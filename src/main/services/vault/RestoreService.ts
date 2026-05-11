import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { RestoreProgress } from '../../../shared/ipc';
import type { CryptoService } from '../crypto/CryptoService';
import type { FolderService } from '../folder/FolderService';
import type { VaultPaths } from './VaultPaths';

// v3 backup: vault_items joined with vault_objects
type ItemRowV3 = {
  vault_object_id: string;
  encrypted_filename: string;
  original_filename_enc: Buffer;
  mime_type: string | null;
  file_size: number;
  folder_id: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_seconds: number | null;
  thumbnail_mime_type: string | null;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  iv: Buffer;
  auth_tag: Buffer;
  is_favorite: number | null;
  content_hash: string | null;
  rating: number | null;
  created_at: string;
};

// v2 backup: old flat vault_items
type ItemRowV2 = {
  id: string;
  encrypted_filename: string;
  original_filename_enc: Buffer;
  mime_type: string | null;
  file_size: number;
  folder_id: number | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_seconds: number | null;
  thumbnail_mime_type: string | null;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  iv: Buffer;
  auth_tag: Buffer;
  is_favorite: number | null;
  content_hash: string | null;
  rating: number | null;
  created_at: string;
};

export class RestoreService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly folderService: FolderService,
    private readonly cryptoService: CryptoService,
    private readonly vaultPaths: VaultPaths,
  ) {}

  async verifyBackupPassword(backupPath: string, password: string): Promise<boolean> {
    const zip = new AdmZip(backupPath);
    const dbEntry = zip.getEntry('privatevault.db');
    if (!dbEntry) throw new Error('Invalid backup file: missing database.');
    const tempPath = path.join(this.vaultPaths.tempDir, `verify-${Date.now()}.db`);
    fs.mkdirSync(this.vaultPaths.tempDir, { recursive: true });
    fs.writeFileSync(tempPath, dbEntry.getData());
    const tempDb = new BetterSqlite3(tempPath, { readonly: true });
    try {
      const row = tempDb
        .prepare('SELECT password_verifier FROM auth_state WHERE id = 1')
        .get() as { password_verifier: string } | undefined;
      if (!row) throw new Error('Invalid backup file: no auth state found.');
      return await this.cryptoService.verifyPassword(password, row.password_verifier);
    } finally {
      tempDb.close();
      fs.unlinkSync(tempPath);
    }
  }

  private getBackupSchemaVersion(zip: AdmZip): number {
    const manifestEntry = zip.getEntry('backup_manifest.json');
    if (!manifestEntry) return 2; // older backups without manifest — treat as v2
    try {
      const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as { schemaVersion?: number };
      return manifest.schemaVersion ?? 2;
    } catch {
      return 2;
    }
  }

  private validateManifestSchemaVersion(zip: AdmZip): void {
    const version = this.getBackupSchemaVersion(zip);
    if (version !== 2 && version !== 3) {
      throw new Error(
        `This backup was created with an incompatible version of Sanctum (schema v${version}). Cannot restore.`,
      );
    }
  }

  async replaceVault(
    backupPath: string,
    password: string,
    onProgress?: (progress: RestoreProgress) => void,
  ): Promise<void> {
    const valid = await this.verifyBackupPassword(backupPath, password);
    if (!valid) throw new Error('Incorrect password.');

    const zip = new AdmZip(backupPath);
    this.validateManifestSchemaVersion(zip);
    const encEntries = zip
      .getEntries()
      .filter((e) => e.entryName.startsWith('vault/files/') && e.entryName.endsWith('.enc'));
    const total = encEntries.length;

    if (fs.existsSync(this.vaultPaths.filesDir)) {
      for (const f of fs.readdirSync(this.vaultPaths.filesDir)) {
        if (f.endsWith('.enc')) fs.unlinkSync(path.join(this.vaultPaths.filesDir, f));
      }
    }

    const dbEntry = zip.getEntry('privatevault.db');
    if (!dbEntry) throw new Error('Invalid backup file: missing database.');
    fs.writeFileSync(this.vaultPaths.dbPath, dbEntry.getData());

    const versionEntry = zip.getEntry('vault/version.json');
    if (versionEntry) {
      fs.mkdirSync(path.dirname(this.vaultPaths.versionPath), { recursive: true });
      fs.writeFileSync(this.vaultPaths.versionPath, versionEntry.getData());
    }

    fs.mkdirSync(this.vaultPaths.filesDir, { recursive: true });
    let processed = 0;
    for (const entry of encEntries) {
      const filename = path.basename(entry.entryName);
      fs.writeFileSync(path.join(this.vaultPaths.filesDir, filename), entry.getData());
      processed += 1;
      onProgress?.({ total, processed, currentFile: filename });
    }
  }

  async mergeVault(
    backupPath: string,
    password: string,
    onProgress?: (progress: RestoreProgress) => void,
  ): Promise<void> {
    const valid = await this.verifyBackupPassword(backupPath, password);
    if (!valid) throw new Error('Incorrect password.');

    const zip = new AdmZip(backupPath);
    this.validateManifestSchemaVersion(zip);
    const backupVersion = this.getBackupSchemaVersion(zip);

    const tempPath = path.join(this.vaultPaths.tempDir, `merge-${Date.now()}.db`);
    fs.mkdirSync(this.vaultPaths.tempDir, { recursive: true });

    const dbEntry = zip.getEntry('privatevault.db');
    if (!dbEntry) throw new Error('Invalid backup file: missing database.');
    fs.writeFileSync(tempPath, dbEntry.getData());
    const backupDb = new BetterSqlite3(tempPath, { readonly: true });

    try {
      const today = new Date().toISOString().slice(0, 10);
      const folderName = this.resolveRestoreFolderName(`Restored ${today}`);
      const mergeFolder = this.folderService.createFolder({ name: folderName, parentId: null });

      // Check whether the backup tags table has a color column
      const backupTagColumns = (backupDb.prepare("PRAGMA table_info('tags')").all() as Array<{ name: string }>).map((c) => c.name);
      const backupTagHasColor = backupTagColumns.includes('color');
      const selectBackupTag = backupDb.prepare(
        backupTagHasColor ? 'SELECT name, color FROM tags WHERE id = ?' : 'SELECT name FROM tags WHERE id = ?',
      );

      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?');
      const insertTag = this.db.prepare('INSERT INTO tags (name, color) VALUES (@name, @color)');
      const insertObjectTag = this.db.prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)');

      fs.mkdirSync(this.vaultPaths.filesDir, { recursive: true });

      if (backupVersion >= 3) {
        await this.mergeV3(backupDb, zip, mergeFolder.id, selectBackupTag, findTag, insertTag, insertObjectTag, onProgress);
      } else {
        await this.mergeV2(backupDb, zip, mergeFolder.id, selectBackupTag, findTag, insertTag, insertObjectTag, onProgress);
      }
    } finally {
      backupDb.close();
      fs.unlinkSync(tempPath);
    }
  }

  private async mergeV3(
    backupDb: SqliteDatabase,
    zip: AdmZip,
    mergeFolderId: number,
    selectBackupTag: ReturnType<SqliteDatabase['prepare']>,
    findTag: ReturnType<SqliteDatabase['prepare']>,
    insertTag: ReturnType<SqliteDatabase['prepare']>,
    insertObjectTag: ReturnType<SqliteDatabase['prepare']>,
    onProgress?: (progress: RestoreProgress) => void,
  ): Promise<void> {
    const backupItems = backupDb
      .prepare(
        `SELECT vi.vault_object_id, vi.encrypted_filename, vi.original_filename_enc, vi.mime_type, vi.file_size,
                vi.media_width, vi.media_height, vi.media_duration_seconds,
                vi.thumbnail_mime_type, vi.thumbnail_enc, vi.thumbnail_iv, vi.thumbnail_auth_tag,
                vi.iv, vi.auth_tag, vi.content_hash,
                vo.is_favorite, vo.rating, vo.created_at
         FROM vault_items vi
         INNER JOIN vault_objects vo ON vo.id = vi.vault_object_id`,
      )
      .all() as ItemRowV3[];

    const total = backupItems.length;
    let processed = 0;

    const checkExists = this.db.prepare('SELECT 1 FROM vault_objects WHERE id = ?');
    const insertVaultObject = this.db.prepare(
      `INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
       VALUES (@id, 'file', @folder_id, @is_favorite, @rating, @created_at, @created_at)`,
    );
    const insertVaultItem = this.db.prepare(
      `INSERT INTO vault_items (
         vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
         media_width, media_height, media_duration_seconds,
         thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag,
         iv, auth_tag, content_hash
       ) VALUES (
         @vault_object_id, @encrypted_filename, @original_filename_enc, @mime_type, @file_size,
         @media_width, @media_height, @media_duration_seconds,
         @thumbnail_mime_type, @thumbnail_enc, @thumbnail_iv, @thumbnail_auth_tag,
         @iv, @auth_tag, @content_hash
       )`,
    );

    for (const item of backupItems) {
      if (checkExists.get(item.vault_object_id)) {
        processed++;
        onProgress?.({ total, processed, currentFile: item.encrypted_filename });
        continue;
      }

      const encDestPath = path.join(this.vaultPaths.filesDir, item.encrypted_filename);
      if (!fs.existsSync(encDestPath)) {
        const encEntry = zip.getEntry(`vault/files/${item.encrypted_filename}`);
        if (encEntry) fs.writeFileSync(encDestPath, encEntry.getData());
      }

      insertVaultObject.run({
        id: item.vault_object_id,
        folder_id: mergeFolderId,
        is_favorite: item.is_favorite ?? 0,
        rating: item.rating ?? null,
        created_at: item.created_at,
      });
      insertVaultItem.run({ ...item });

      const backupItemTags = backupDb
        .prepare('SELECT tag_id FROM object_tags WHERE object_id = ?')
        .all(item.vault_object_id) as { tag_id: number }[];
      for (const { tag_id } of backupItemTags) {
        const backupTag = selectBackupTag.get(tag_id) as { name: string; color?: string | null } | undefined;
        if (!backupTag) continue;
        let liveTag = findTag.get(backupTag.name) as { id: number } | undefined;
        if (!liveTag) {
          const r = insertTag.run({ name: backupTag.name, color: backupTag.color ?? null });
          liveTag = { id: r.lastInsertRowid as number };
        }
        insertObjectTag.run([item.vault_object_id, liveTag.id]);
      }

      processed++;
      onProgress?.({ total, processed, currentFile: item.encrypted_filename });
    }
  }

  private async mergeV2(
    backupDb: SqliteDatabase,
    zip: AdmZip,
    mergeFolderId: number,
    selectBackupTag: ReturnType<SqliteDatabase['prepare']>,
    findTag: ReturnType<SqliteDatabase['prepare']>,
    insertTag: ReturnType<SqliteDatabase['prepare']>,
    insertObjectTag: ReturnType<SqliteDatabase['prepare']>,
    onProgress?: (progress: RestoreProgress) => void,
  ): Promise<void> {
    const backupItems = backupDb.prepare('SELECT * FROM vault_items').all() as ItemRowV2[];
    const total = backupItems.length;
    let processed = 0;

    const checkExists = this.db.prepare('SELECT 1 FROM vault_objects WHERE id = ?');
    const insertVaultObject = this.db.prepare(
      `INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
       VALUES (@id, 'file', @folder_id, @is_favorite, @rating, @created_at, @created_at)`,
    );
    const insertVaultItem = this.db.prepare(
      `INSERT INTO vault_items (
         vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
         media_width, media_height, media_duration_seconds,
         thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag,
         iv, auth_tag, content_hash
       ) VALUES (
         @vault_object_id, @encrypted_filename, @original_filename_enc, @mime_type, @file_size,
         @media_width, @media_height, @media_duration_seconds,
         @thumbnail_mime_type, @thumbnail_enc, @thumbnail_iv, @thumbnail_auth_tag,
         @iv, @auth_tag, @content_hash
       )`,
    );

    for (const item of backupItems) {
      if (checkExists.get(item.id)) {
        processed++;
        onProgress?.({ total, processed, currentFile: item.encrypted_filename });
        continue;
      }

      const encDestPath = path.join(this.vaultPaths.filesDir, item.encrypted_filename);
      if (!fs.existsSync(encDestPath)) {
        const encEntry = zip.getEntry(`vault/files/${item.encrypted_filename}`);
        if (encEntry) fs.writeFileSync(encDestPath, encEntry.getData());
      }

      insertVaultObject.run({
        id: item.id,
        folder_id: mergeFolderId,
        is_favorite: item.is_favorite ?? 0,
        rating: item.rating ?? null,
        created_at: item.created_at,
      });
      insertVaultItem.run({
        vault_object_id: item.id,
        encrypted_filename: item.encrypted_filename,
        original_filename_enc: item.original_filename_enc,
        mime_type: item.mime_type,
        file_size: item.file_size,
        media_width: item.media_width,
        media_height: item.media_height,
        media_duration_seconds: item.media_duration_seconds,
        thumbnail_mime_type: item.thumbnail_mime_type,
        thumbnail_enc: item.thumbnail_enc,
        thumbnail_iv: item.thumbnail_iv,
        thumbnail_auth_tag: item.thumbnail_auth_tag,
        iv: item.iv,
        auth_tag: item.auth_tag,
        content_hash: item.content_hash,
      });

      // v2 uses item_tags table
      const backupItemTags = backupDb
        .prepare('SELECT tag_id FROM item_tags WHERE item_id = ?')
        .all(item.id) as { tag_id: number }[];
      for (const { tag_id } of backupItemTags) {
        const backupTag = selectBackupTag.get(tag_id) as { name: string; color?: string | null } | undefined;
        if (!backupTag) continue;
        let liveTag = findTag.get(backupTag.name) as { id: number } | undefined;
        if (!liveTag) {
          const r = insertTag.run({ name: backupTag.name, color: backupTag.color ?? null });
          liveTag = { id: r.lastInsertRowid as number };
        }
        insertObjectTag.run([item.id, liveTag.id]);
      }

      processed++;
      onProgress?.({ total, processed, currentFile: item.encrypted_filename });
    }
  }

  private resolveRestoreFolderName(baseName: string): string {
    const exists = this.db.prepare('SELECT 1 FROM folders WHERE parent_id IS NULL AND name = ?');
    if (!exists.get(baseName)) return baseName;
    for (let i = 2; i < 100; i++) {
      const candidate = `${baseName} _${i}`;
      if (!exists.get(candidate)) return candidate;
    }
    return `${baseName} _${Date.now()}`;
  }
}

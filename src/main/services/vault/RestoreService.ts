import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { RestoreProgress } from '../../../shared/ipc';
import type { CryptoService } from '../crypto/CryptoService';
import type { FolderService } from '../folder/FolderService';
import type { VaultPaths } from './VaultPaths';

type ItemRow = {
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
    if (!dbEntry) {
      throw new Error('Invalid backup file: missing database.');
    }
    const tempPath = path.join(this.vaultPaths.tempDir, `verify-${Date.now()}.db`);
    fs.mkdirSync(this.vaultPaths.tempDir, { recursive: true });
    fs.writeFileSync(tempPath, dbEntry.getData());
    const tempDb = new BetterSqlite3(tempPath, { readonly: true });
    try {
      const row = tempDb
        .prepare('SELECT password_verifier FROM auth_state WHERE id = 1')
        .get() as { password_verifier: string } | undefined;
      if (!row) {
        throw new Error('Invalid backup file: no auth state found.');
      }
      return await this.cryptoService.verifyPassword(password, row.password_verifier);
    } finally {
      tempDb.close();
      fs.unlinkSync(tempPath);
    }
  }

  // Writes backup files to disk. Caller must relaunch the app afterwards.
  async replaceVault(
    backupPath: string,
    password: string,
    onProgress?: (progress: RestoreProgress) => void,
  ): Promise<void> {
    const valid = await this.verifyBackupPassword(backupPath, password);
    if (!valid) {
      throw new Error('Incorrect password.');
    }

    const zip = new AdmZip(backupPath);
    const encEntries = zip
      .getEntries()
      .filter((e) => e.entryName.startsWith('vault/files/') && e.entryName.endsWith('.enc'));
    const total = encEntries.length;

    // Delete existing .enc files
    if (fs.existsSync(this.vaultPaths.filesDir)) {
      for (const f of fs.readdirSync(this.vaultPaths.filesDir)) {
        if (f.endsWith('.enc')) {
          fs.unlinkSync(path.join(this.vaultPaths.filesDir, f));
        }
      }
    }

    // Overwrite the database file (live connection is left to the caller to handle via relaunch)
    const dbEntry = zip.getEntry('privatevault.db');
    if (!dbEntry) {
      throw new Error('Invalid backup file: missing database.');
    }
    fs.writeFileSync(this.vaultPaths.dbPath, dbEntry.getData());

    // Restore version.json
    const versionEntry = zip.getEntry('vault/version.json');
    if (versionEntry) {
      fs.mkdirSync(path.dirname(this.vaultPaths.versionPath), { recursive: true });
      fs.writeFileSync(this.vaultPaths.versionPath, versionEntry.getData());
    }

    // Extract .enc files one by one, reporting progress
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
    if (!valid) {
      throw new Error('Incorrect password.');
    }

    const zip = new AdmZip(backupPath);
    const tempPath = path.join(this.vaultPaths.tempDir, `merge-${Date.now()}.db`);
    fs.mkdirSync(this.vaultPaths.tempDir, { recursive: true });

    const dbEntry = zip.getEntry('privatevault.db');
    if (!dbEntry) {
      throw new Error('Invalid backup file: missing database.');
    }
    fs.writeFileSync(tempPath, dbEntry.getData());
    const backupDb = new BetterSqlite3(tempPath, { readonly: true });

    try {
      const today = new Date().toISOString().slice(0, 10);
      const folderName = this.resolveRestoreFolderName(`Restored ${today}`);
      const mergeFolder = this.folderService.createFolder({ name: folderName, parentId: null });

      const backupItems = backupDb.prepare('SELECT * FROM vault_items').all() as ItemRow[];
      const total = backupItems.length;
      let processed = 0;

      // Check whether the backup tags table has a color column (added via migration — may be absent in older backups)
      const backupTagColumns = (backupDb.prepare("PRAGMA table_info('tags')").all() as Array<{ name: string }>).map((c) => c.name);
      const backupTagHasColor = backupTagColumns.includes('color');
      const selectBackupTag = backupDb.prepare(
        backupTagHasColor
          ? 'SELECT name, color FROM tags WHERE id = ?'
          : 'SELECT name FROM tags WHERE id = ?',
      );

      const checkExists = this.db.prepare('SELECT 1 FROM vault_items WHERE id = ?');
      const insertItem = this.db.prepare(`
        INSERT INTO vault_items (
          id, encrypted_filename, original_filename_enc, mime_type, file_size, folder_id,
          media_width, media_height, media_duration_seconds,
          thumbnail_mime_type, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag,
          iv, auth_tag, is_favorite, content_hash, rating, created_at
        ) VALUES (
          @id, @encrypted_filename, @original_filename_enc, @mime_type, @file_size, @folder_id,
          @media_width, @media_height, @media_duration_seconds,
          @thumbnail_mime_type, @thumbnail_enc, @thumbnail_iv, @thumbnail_auth_tag,
          @iv, @auth_tag, @is_favorite, @content_hash, @rating, @created_at
        )
      `);
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?');
      const insertTag = this.db.prepare('INSERT INTO tags (name, color) VALUES (@name, @color)');
      const insertItemTag = this.db.prepare(
        'INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)',
      );

      fs.mkdirSync(this.vaultPaths.filesDir, { recursive: true });

      for (const item of backupItems) {
        if (checkExists.get(item.id)) {
          processed++;
          onProgress?.({ total, processed, currentFile: item.encrypted_filename });
          continue;
        }

        // Extract .enc file if not already on disk
        const encDestPath = path.join(this.vaultPaths.filesDir, item.encrypted_filename);
        if (!fs.existsSync(encDestPath)) {
          const encEntry = zip.getEntry(`vault/files/${item.encrypted_filename}`);
          if (encEntry) {
            fs.writeFileSync(encDestPath, encEntry.getData());
          }
        }

        // Insert item remapped to the merge folder
        insertItem.run({ ...item, folder_id: mergeFolder.id });

        // Resolve and insert tags
        const backupItemTags = backupDb
          .prepare('SELECT tag_id FROM item_tags WHERE item_id = ?')
          .all(item.id) as { tag_id: number }[];

        for (const { tag_id } of backupItemTags) {
          const backupTag = selectBackupTag.get(tag_id) as
            | { name: string; color?: string | null }
            | undefined;
          if (!backupTag) continue;

          let liveTag = findTag.get(backupTag.name) as { id: number } | undefined;
          if (!liveTag) {
            const result = insertTag.run({ name: backupTag.name, color: backupTag.color ?? null });
            liveTag = { id: result.lastInsertRowid as number };
          }
          insertItemTag.run(item.id, liveTag.id);
        }

        processed++;
        onProgress?.({ total, processed, currentFile: item.encrypted_filename });
      }
    } finally {
      backupDb.close();
      fs.unlinkSync(tempPath);
    }
  }

  private resolveRestoreFolderName(baseName: string): string {
    const exists = this.db.prepare(
      'SELECT 1 FROM folders WHERE parent_id IS NULL AND name = ?',
    );
    if (!exists.get(baseName)) return baseName;
    for (let i = 2; i < 100; i++) {
      const candidate = `${baseName} _${i}`;
      if (!exists.get(candidate)) return candidate;
    }
    return `${baseName} _${Date.now()}`;
  }
}

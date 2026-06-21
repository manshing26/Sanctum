import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { RestoreProgress } from '../../../shared/ipc';
import type { CryptoService } from '../crypto/CryptoService';
import type { VaultPaths } from './VaultPaths';

export class RestoreService {
  constructor(
    private readonly db: SqliteDatabase,
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

  private getBackupSchemaVersion(zip: AdmZip): number | null {
    const manifestEntry = zip.getEntry('backup_manifest.json');
    if (!manifestEntry) return null;
    try {
      const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as { schemaVersion?: number };
      return manifest.schemaVersion ?? null;
    } catch {
      return null;
    }
  }

  private validateManifestSchemaVersion(zip: AdmZip): void {
    const version = this.getBackupSchemaVersion(zip);
    if (version !== 4) {
      throw new Error('This backup was created by an older incompatible version of Sanctum.');
    }
  }

  private copyTableRowsFromBackup(backupDb: SqliteDatabase, tableName: string): void {
    const columns = (backupDb.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>).map((c) => c.name);
    if (columns.length === 0) return;
    const rows = backupDb.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];
    if (rows.length === 0) return;
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const parameters = columns.map((column) => `@${column}`).join(', ');
    const insert = this.db.prepare(`INSERT INTO ${tableName} (${quotedColumns}) VALUES (${parameters})`);
    for (const row of rows) {
      insert.run(row);
    }
  }

  private restoreV4DatabaseFromBackup(backupDb: SqliteDatabase): void {
    const tables = [
      'auth_state',
      'auth_audit_log',
      'vault_config',
      'folders',
      'tags',
      'vault_objects',
      'vault_items',
      'bookmarks',
      'notes',
      'video_playback_positions',
      'video_timestamps',
      'audio_metadata',
      'audio_playback_positions',
      'audio_bookmarks',
      'object_tags',
      'passwords',
      'settings',
      'schema_meta',
    ];

    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.transaction(() => {
        for (const table of [...tables].reverse()) {
          this.db.prepare(`DELETE FROM ${table}`).run();
        }
        for (const table of tables) {
          this.copyTableRowsFromBackup(backupDb, table);
        }
      })();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
    this.db.pragma('wal_checkpoint(TRUNCATE)');
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
    const tempPath = path.join(this.vaultPaths.tempDir, `replace-${Date.now()}.db`);
    fs.mkdirSync(this.vaultPaths.tempDir, { recursive: true });
    fs.writeFileSync(tempPath, dbEntry.getData());
    const backupDb = new BetterSqlite3(tempPath, { readonly: true });
    try {
      this.restoreV4DatabaseFromBackup(backupDb);
    } finally {
      backupDb.close();
      fs.unlinkSync(tempPath);
    }

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

}

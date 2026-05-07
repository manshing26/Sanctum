import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackupProgress } from '../../../shared/ipc';
import type { SessionStore } from '../../state/SessionStore';
import type { VaultPaths } from './VaultPaths';

export class BackupService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly vaultPaths: VaultPaths,
    private readonly sessionStore: SessionStore,
  ) {}

  private ensureUnlocked(): void {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault is locked.');
    }
  }

  async createBackup(
    outputPath: string,
    onProgress?: (progress: BackupProgress) => void,
  ): Promise<void> {
    this.ensureUnlocked();

    // Flush WAL into the main DB file so the copied .db is fully consistent.
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    const itemCount = (this.db.prepare('SELECT COUNT(1) AS count FROM vault_items').get() as { count: number }).count;
    // total = item files + db + version.json
    const total = itemCount + 2;
    let processed = 0;

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 1 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      // Add the database file.
      archive.file(this.vaultPaths.dbPath, { name: 'privatevault.db' });
      processed += 1;
      onProgress?.({ total, processed });

      // Add vault version marker.
      archive.file(this.vaultPaths.versionPath, { name: 'vault/version.json' });
      processed += 1;
      onProgress?.({ total, processed });

      // Add each encrypted item file, reporting progress per file.
      const encFiles = fs.existsSync(this.vaultPaths.filesDir)
        ? fs.readdirSync(this.vaultPaths.filesDir).filter((f) => f.endsWith('.enc'))
        : [];

      for (const filename of encFiles) {
        const filePath = path.join(this.vaultPaths.filesDir, filename);
        archive.file(filePath, { name: `vault/files/${filename}` });
        processed += 1;
        onProgress?.({ total, processed, currentFile: filename });
      }

      // Add manifest.
      const manifest = JSON.stringify({
        createdAt: new Date().toISOString(),
        itemCount,
        version: 1,
      }, null, 2);
      archive.append(manifest, { name: 'backup_manifest.json' });

      void archive.finalize();
    });
  }
}

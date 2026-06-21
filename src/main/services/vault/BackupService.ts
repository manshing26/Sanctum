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

    onProgress?.({ total: 0, processed: 0, phase: 'preparing' });

    // Flush WAL into the main DB file so the copied .db is fully consistent.
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    const encFiles = fs.existsSync(this.vaultPaths.filesDir)
      ? fs.readdirSync(this.vaultPaths.filesDir).filter((f) => f.endsWith('.enc'))
      : [];
    const itemCount = (this.db.prepare('SELECT COUNT(1) AS count FROM vault_items').get() as { count: number }).count;
    // total = encrypted blobs + db + version marker + manifest
    const total = encFiles.length + 3;
    let processed = 0;

    onProgress?.({ total, processed, phase: 'adding' });

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 1 } });

      output.on('close', () => {
        onProgress?.({ total, processed: total, phase: 'complete' });
        resolve();
      });
      archive.on('error', reject);
      archive.pipe(output);

      // Add the database file.
      archive.file(this.vaultPaths.dbPath, { name: 'privatevault.db' });
      processed += 1;
      onProgress?.({ total, processed, phase: 'adding' });

      // Add vault version marker.
      archive.file(this.vaultPaths.versionPath, { name: 'vault/version.json' });
      processed += 1;
      onProgress?.({ total, processed, phase: 'adding' });

      // Add each encrypted item file, reporting progress per file.
      for (const filename of encFiles) {
        const filePath = path.join(this.vaultPaths.filesDir, filename);
        archive.file(filePath, { name: `vault/files/${filename}` });
        processed += 1;
        onProgress?.({ total, processed, currentFile: filename, phase: 'adding' });
      }

      // Add manifest.
      const manifest = JSON.stringify({
        createdAt: new Date().toISOString(),
        schemaVersion: 4,
        recoveryContract: 1,
        itemCount,
        tables: [
          'auth_audit_log',
          'vault_objects', 'vault_items', 'bookmarks', 'notes',
          'video_playback_positions', 'video_timestamps', 'object_tags',
          'audio_metadata', 'audio_playback_positions', 'audio_bookmarks',
          'folders', 'tags', 'passwords', 'schema_meta',
        ],
      }, null, 2);
      archive.append(manifest, { name: 'backup_manifest.json' });
      processed += 1;
      onProgress?.({ total, processed, currentFile: 'backup_manifest.json', phase: 'adding' });

      onProgress?.({ total, processed: total, phase: 'finalizing' });

      void archive.finalize();
    });
  }
}

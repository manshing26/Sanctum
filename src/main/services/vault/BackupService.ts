import fs from 'node:fs';
import path from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import archiver from 'archiver';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { BackupProgress } from '../../../shared/ipc';
import type { SessionStore } from '../../state/SessionStore';
import type { VaultPaths } from './VaultPaths';

type BackupEntry = {
  sourcePath?: string;
  data?: Buffer;
  archiveName: string;
  displayName: string;
  size: number;
  store?: boolean;
};

class CountingStream extends Transform {
  constructor(private readonly onBytes: (bytes: number) => void) {
    super();
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.onBytes(chunk.length);
    callback(null, chunk);
  }
}

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

    onProgress?.({ total: 0, processed: 0, totalBytes: 0, processedBytes: 0, phase: 'preparing' });

    // Flush WAL into the main DB file so the copied .db is fully consistent.
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    const itemCount = (this.db.prepare('SELECT COUNT(1) AS count FROM vault_items').get() as { count: number }).count;
    const manifest = Buffer.from(JSON.stringify({
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
    }, null, 2));

    const entries: BackupEntry[] = [];
    const addFileEntry = (sourcePath: string, archiveName: string, displayName: string, store = false): void => {
      try {
        const stat = fs.statSync(sourcePath);
        if (!stat.isFile()) return;
        entries.push({ sourcePath, archiveName, displayName, size: stat.size, store });
      } catch {
        // Ignore files that disappear while preparing the backup.
      }
    };
    addFileEntry(this.vaultPaths.dbPath, 'privatevault.db', 'privatevault.db');
    addFileEntry(this.vaultPaths.versionPath, 'vault/version.json', 'version.json');
    if (fs.existsSync(this.vaultPaths.filesDir)) {
      for (const filename of fs.readdirSync(this.vaultPaths.filesDir).filter((f) => f.endsWith('.enc'))) {
        addFileEntry(path.join(this.vaultPaths.filesDir, filename), `vault/files/${filename}`, filename, true);
      }
    }
    entries.push({
      data: manifest,
      archiveName: 'backup_manifest.json',
      displayName: 'backup_manifest.json',
      size: manifest.length,
    });

    const total = entries.length;
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    let processed = 0;
    let processedBytes = 0;
    let lastProgressEmitAt = 0;

    const emitProgress = (phase: BackupProgress['phase'], currentFile?: string, force = false): void => {
      const now = Date.now();
      if (!force && phase === 'adding' && now - lastProgressEmitAt < 200) {
        return;
      }
      lastProgressEmitAt = now;
      onProgress?.({
        total,
        processed,
        totalBytes,
        processedBytes: Math.min(processedBytes, totalBytes),
        entryCount: total,
        processedEntries: processed,
        currentFile,
        phase,
      });
    };

    emitProgress('adding', undefined, true);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 1 } });

      output.on('close', () => {
        processed = total;
        processedBytes = totalBytes;
        emitProgress('complete', undefined, true);
        resolve();
      });
      output.on('error', reject);
      archive.on('end', () => {
        processedBytes = totalBytes;
        emitProgress('finalizing', undefined, true);
      });
      archive.on('error', reject);
      archive.pipe(output);

      for (const entry of entries) {
        if (entry.sourcePath) {
          const stream = fs
            .createReadStream(entry.sourcePath)
            .pipe(new CountingStream((bytes) => {
              processedBytes += bytes;
              emitProgress('adding', entry.displayName);
            }));
          archive.append(stream, {
            name: entry.archiveName,
            store: entry.store,
          });
        } else if (entry.data) {
          processedBytes += entry.size;
          archive.append(entry.data, { name: entry.archiveName });
        }
        processed += 1;
        emitProgress('adding', entry.displayName, true);
      }

      void archive.finalize();
    });
  }
}

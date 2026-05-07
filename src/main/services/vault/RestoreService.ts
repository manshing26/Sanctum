import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import BetterSqlite3 from 'better-sqlite3';
import type { RestoreProgress } from '../../../shared/ipc';
import type { CryptoService } from '../crypto/CryptoService';
import type { VaultPaths } from './VaultPaths';

export class RestoreService {
  constructor(
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
}

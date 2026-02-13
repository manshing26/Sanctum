import fs from 'node:fs';
import path from 'node:path';

export class VaultPaths {
  readonly rootDir: string;
  readonly dbPath: string;
  readonly vaultDir: string;
  readonly filesDir: string;
  readonly tempDir: string;
  readonly versionPath: string;

  constructor(userDataPath: string) {
    this.rootDir = path.join(userDataPath, 'privateVault');
    this.dbPath = path.join(this.rootDir, 'privatevault.db');
    this.vaultDir = path.join(this.rootDir, 'vault');
    this.filesDir = path.join(this.vaultDir, 'files');
    this.tempDir = path.join(this.vaultDir, 'tmp');
    this.versionPath = path.join(this.vaultDir, 'version.json');
  }

  ensureDirectories(): void {
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.mkdirSync(this.vaultDir, { recursive: true });
    fs.mkdirSync(this.filesDir, { recursive: true });
    fs.mkdirSync(this.tempDir, { recursive: true });

    if (!fs.existsSync(this.versionPath)) {
      fs.writeFileSync(this.versionPath, JSON.stringify({ version: 1 }, null, 2));
    }
  }
}

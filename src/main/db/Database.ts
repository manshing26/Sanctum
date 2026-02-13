import BetterSqlite3 from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { VaultPaths } from '../services/vault/VaultPaths';

export class DatabaseService {
  private db: SqliteDatabase;

  constructor(private readonly vaultPaths: VaultPaths) {
    this.vaultPaths.ensureDirectories();
    this.db = new BetterSqlite3(this.vaultPaths.dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        password_verifier TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        salt BLOB NOT NULL,
        kdf_params TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_items (
        id TEXT PRIMARY KEY,
        encrypted_filename TEXT NOT NULL,
        original_filename_enc BLOB NOT NULL,
        mime_type TEXT,
        file_size INTEGER NOT NULL,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_vault_items_created_at ON vault_items(created_at);
      CREATE INDEX IF NOT EXISTS idx_vault_items_mime_type ON vault_items(mime_type);
    `);
  }

  getDb(): SqliteDatabase {
    return this.db;
  }
}

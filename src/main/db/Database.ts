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

      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (parent_id, name),
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_items (
        id TEXT PRIMARY KEY,
        encrypted_filename TEXT NOT NULL,
        original_filename_enc BLOB NOT NULL,
        mime_type TEXT,
        file_size INTEGER NOT NULL,
        folder_id INTEGER,
        media_width INTEGER,
        media_height INTEGER,
        media_duration_seconds REAL,
        thumbnail_mime_type TEXT,
        thumbnail_enc BLOB,
        thumbnail_iv BLOB,
        thumbnail_auth_tag BLOB,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS item_tags (
        item_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (item_id, tag_id),
        FOREIGN KEY (item_id) REFERENCES vault_items(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title_enc BLOB NOT NULL,
        url_enc BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_vault_items_created_at ON vault_items(created_at);
      CREATE INDEX IF NOT EXISTS idx_vault_items_mime_type ON vault_items(mime_type);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
      CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_updated_at ON bookmarks(updated_at);
    `);

    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO NOTHING`
      )
      .run('security.secure_delete_on_import', 'false');

    this.ensureVaultItemsColumn('media_width', 'INTEGER');
    this.ensureVaultItemsColumn('media_height', 'INTEGER');
    this.ensureVaultItemsColumn('media_duration_seconds', 'REAL');
    this.ensureVaultItemsColumn('thumbnail_mime_type', 'TEXT');
    this.ensureVaultItemsColumn('thumbnail_enc', 'BLOB');
    this.ensureVaultItemsColumn('thumbnail_iv', 'BLOB');
    this.ensureVaultItemsColumn('thumbnail_auth_tag', 'BLOB');
    this.ensureVaultItemsColumn('folder_id', 'INTEGER');

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vault_items_folder_id ON vault_items(folder_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id)');
  }

  private ensureVaultItemsColumn(columnName: string, columnType: string): void {
    const columns = this.db
      .prepare("PRAGMA table_info('vault_items')")
      .all() as Array<{ name: string }>;

    const hasColumn = columns.some((column) => column.name === columnName);
    if (hasColumn) {
      return;
    }

    this.db.exec(`ALTER TABLE vault_items ADD COLUMN ${columnName} ${columnType}`);
  }

  getDb(): SqliteDatabase {
    return this.db;
  }
}

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
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    // Baseline schema — v4 shapes. CREATE IF NOT EXISTS is safe to re-run.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        password_verifier TEXT NOT NULL,
        failed_attempts INTEGER DEFAULT 0,
        lockout_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_objects (
        id          TEXT    PRIMARY KEY,
        type        TEXT    NOT NULL CHECK (type IN ('file', 'bookmark', 'note')),
        folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        rating      INTEGER,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_items (
        vault_object_id       TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
        encrypted_filename    TEXT NOT NULL,
        original_filename_enc BLOB NOT NULL,
        mime_type             TEXT,
        file_size             INTEGER NOT NULL,
        media_width           INTEGER,
        media_height          INTEGER,
        media_duration_seconds REAL,
        thumbnail_enc         BLOB,
        thumbnail_iv          BLOB,
        thumbnail_auth_tag    BLOB,
        thumbnail_mime_type   TEXT,
        iv                    BLOB NOT NULL,
        auth_tag              BLOB NOT NULL,
        content_hash          TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        vault_object_id    TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
        title_enc          BLOB NOT NULL,
        url_enc            BLOB NOT NULL,
        thumbnail_enc      BLOB,
        thumbnail_iv       BLOB,
        thumbnail_auth_tag BLOB
      );

      CREATE TABLE IF NOT EXISTS notes (
        vault_object_id TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
        title_enc       BLOB NOT NULL,
        body_enc        BLOB NOT NULL,
        format          TEXT NOT NULL DEFAULT 'plain' CHECK (format IN ('plain', 'markdown'))
      );

      CREATE TABLE IF NOT EXISTS video_playback_positions (
        vault_object_id  TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
        position_seconds REAL NOT NULL DEFAULT 0,
        duration_seconds REAL,
        updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS video_timestamps (
        id               TEXT PRIMARY KEY,
        vault_object_id  TEXT NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
        label            TEXT NOT NULL,
        position_seconds REAL NOT NULL,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS object_tags (
        object_id TEXT    NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
        tag_id    INTEGER NOT NULL REFERENCES tags(id)          ON DELETE CASCADE,
        PRIMARY KEY (object_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS schema_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS passwords (
        id           TEXT PRIMARY KEY,
        domain_enc   BLOB NOT NULL,
        username_enc BLOB NOT NULL,
        password_enc BLOB NOT NULL,
        label_enc    BLOB,
        notes_enc    BLOB,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_vault_objects_folder_id   ON vault_objects(folder_id);
      CREATE INDEX IF NOT EXISTS idx_vault_objects_type        ON vault_objects(type);
      CREATE INDEX IF NOT EXISTS idx_vault_objects_is_favorite ON vault_objects(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_vault_objects_created_at  ON vault_objects(created_at);
      CREATE INDEX IF NOT EXISTS idx_object_tags_object_id     ON object_tags(object_id);
      CREATE INDEX IF NOT EXISTS idx_object_tags_tag_id        ON object_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_video_timestamps_object   ON video_timestamps(vault_object_id, position_seconds);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id         ON folders(parent_id);
      CREATE INDEX IF NOT EXISTS idx_passwords_updated         ON passwords(updated_at);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at);
    `);

    // Default settings
    this.db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`)
      .run('security.secure_delete_on_import', 'false');
    this.db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`)
      .run('security.auto_lock_minutes', '10');
    this.db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`)
      .run('security.lock_on_minimize', 'true');

    // Legacy column guards (for DBs that existed before v3)
    this.ensureTableColumn('auth_state', 'failed_attempts', 'INTEGER DEFAULT 0');
    this.ensureTableColumn('auth_state', 'lockout_until', 'DATETIME');
    this.ensureTableColumn('tags', 'color', 'TEXT');

    // Schema version gate
    const versionRow = this.db
      .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    const schemaVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

    if (schemaVersion < 3) {
      this.runSchemaV3Migration(schemaVersion);
    }
    if (schemaVersion < 4) {
      this.runSchemaV4Migration();
    }
    this.repairVaultObjectForeignKeys();

    // Cleanup legacy rows where ffprobe reported pseudo-duration for still images.
    this.db.exec(
      "UPDATE vault_items SET media_duration_seconds = NULL WHERE mime_type LIKE 'image/%' AND media_duration_seconds IS NOT NULL",
    );
  }

  private runSchemaV3Migration(currentVersion: number): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    const migrate = this.db.transaction(() => {
      // Check if old schema (vault_items with id column) still exists
      const oldItemColumns = (this.db.prepare("PRAGMA table_info('vault_items')").all() as Array<{ name: string }>).map((c) => c.name);
      const isOldSchema = oldItemColumns.includes('id') && !oldItemColumns.includes('vault_object_id');

      if (isOldSchema) {
        // ── Step 1: create vault_objects ──────────────────────────────────────
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS vault_objects (
            id          TEXT    PRIMARY KEY,
            type        TEXT    NOT NULL CHECK (type IN ('file', 'bookmark', 'note')),
            folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            rating      INTEGER,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS object_tags (
            object_id TEXT    NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
            tag_id    INTEGER NOT NULL REFERENCES tags(id)          ON DELETE CASCADE,
            PRIMARY KEY (object_id, tag_id)
          );
        `);

        // ── Step 2: migrate vault_items rows into vault_objects ───────────────
        this.db.exec(`
          INSERT OR IGNORE INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
          SELECT id, 'file', folder_id, COALESCE(is_favorite, 0), rating, created_at, created_at
          FROM vault_items;
        `);

        // ── Step 3: migrate bookmarks into vault_objects (generate UUIDs) ─────
        // Use a temp mapping table: old integer id → new UUID text
        this.db.exec(`
          CREATE TEMP TABLE IF NOT EXISTS _bookmark_id_map (
            old_id   INTEGER PRIMARY KEY,
            new_uuid TEXT    NOT NULL
          );
        `);

        // Generate a UUID per bookmark row in JS (more reliable than SQLite hex tricks)
        const bookmarkIds = (this.db.prepare('SELECT id FROM bookmarks').all() as Array<{ id: number }>).map((r) => r.id);
        const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
        const insertMap = this.db.prepare('INSERT INTO _bookmark_id_map (old_id, new_uuid) VALUES (?, ?)');
        const mapTx = this.db.transaction((ids: number[]) => {
          for (const id of ids) insertMap.run(id, randomUUID());
        });
        mapTx(bookmarkIds);

        this.db.exec(`
          INSERT OR IGNORE INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
          SELECT m.new_uuid, 'bookmark', b.folder_id, 0, NULL, b.created_at, b.updated_at
          FROM bookmarks b
          INNER JOIN _bookmark_id_map m ON m.old_id = b.id;
        `);

        // ── Step 4: rename old vault_items, create new child table ────────────
        this.db.exec(`
          ALTER TABLE vault_items RENAME TO _vault_items_old;

          CREATE TABLE vault_items (
            vault_object_id       TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            encrypted_filename    TEXT NOT NULL,
            original_filename_enc BLOB NOT NULL,
            mime_type             TEXT,
            file_size             INTEGER NOT NULL,
            media_width           INTEGER,
            media_height          INTEGER,
            media_duration_seconds REAL,
            thumbnail_enc         BLOB,
            thumbnail_iv          BLOB,
            thumbnail_auth_tag    BLOB,
            thumbnail_mime_type   TEXT,
            iv                    BLOB NOT NULL,
            auth_tag              BLOB NOT NULL,
            content_hash          TEXT
          );

          INSERT INTO vault_items
            (vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
             media_width, media_height, media_duration_seconds,
             thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, thumbnail_mime_type,
             iv, auth_tag, content_hash)
          SELECT
            id, encrypted_filename, original_filename_enc, mime_type, file_size,
            media_width, media_height, media_duration_seconds,
            thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, thumbnail_mime_type,
            iv, auth_tag, content_hash
          FROM _vault_items_old;
        `);

        // ── Step 5: rename old bookmarks, create new child table ──────────────
        this.db.exec(`
          ALTER TABLE bookmarks RENAME TO _bookmarks_old;

          CREATE TABLE bookmarks (
            vault_object_id    TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
            title_enc          BLOB NOT NULL,
            url_enc            BLOB NOT NULL,
            thumbnail_enc      BLOB,
            thumbnail_iv       BLOB,
            thumbnail_auth_tag BLOB
          );

          INSERT INTO bookmarks (vault_object_id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag)
          SELECT m.new_uuid, b.title_enc, b.url_enc, b.thumbnail_enc, b.thumbnail_iv, b.thumbnail_auth_tag
          FROM _bookmarks_old b
          INNER JOIN _bookmark_id_map m ON m.old_id = b.id;
        `);

        // ── Step 6: migrate item_tags → object_tags ───────────────────────────
        const itemTagsExist = (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='item_tags'").get());
        if (itemTagsExist) {
          this.db.exec(`INSERT OR IGNORE INTO object_tags (object_id, tag_id) SELECT item_id, tag_id FROM item_tags;`);
        }

        // ── Step 7: migrate bookmark_tags → object_tags ───────────────────────
        const bookmarkTagsExist = (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bookmark_tags'").get());
        if (bookmarkTagsExist) {
          this.db.exec(`
            INSERT OR IGNORE INTO object_tags (object_id, tag_id)
            SELECT m.new_uuid, bt.tag_id
            FROM bookmark_tags bt
            INNER JOIN _bookmark_id_map m ON m.old_id = bt.bookmark_id;
          `);
        }

        // ── Step 8: drop old tables ───────────────────────────────────────────
        if (itemTagsExist) this.db.exec('DROP TABLE item_tags;');
        if (bookmarkTagsExist) this.db.exec('DROP TABLE bookmark_tags;');
        this.db.exec('DROP TABLE _vault_items_old;');
        this.db.exec('DROP TABLE _bookmarks_old;');
        this.db.exec('DROP TABLE _bookmark_id_map;');

        // ── Step 9: indexes ───────────────────────────────────────────────────
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_vault_objects_folder_id   ON vault_objects(folder_id);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_type        ON vault_objects(type);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_is_favorite ON vault_objects(is_favorite);
          CREATE INDEX IF NOT EXISTS idx_vault_objects_created_at  ON vault_objects(created_at);
          CREATE INDEX IF NOT EXISTS idx_object_tags_object_id     ON object_tags(object_id);
          CREATE INDEX IF NOT EXISTS idx_object_tags_tag_id        ON object_tags(tag_id);
        `);
      }

      // Bump schema version
      this.db
        .prepare(`INSERT INTO schema_meta (key, value) VALUES ('schema_version', '3') ON CONFLICT(key) DO UPDATE SET value = '3'`)
        .run();
    });

    migrate();
  }

  private runSchemaV4Migration(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    const migrate = this.db.transaction(() => {
      const tableRow = this.db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vault_objects'")
        .get() as { sql: string } | undefined;
      const alreadySupportsNotes = tableRow?.sql.includes("'note'") ?? false;

      if (!alreadySupportsNotes) {
        this.db.pragma('foreign_keys = OFF');
        this.db.pragma('legacy_alter_table = ON');
        this.db.exec(`
          ALTER TABLE vault_objects RENAME TO _vault_objects_v3;

          CREATE TABLE vault_objects (
            id          TEXT    PRIMARY KEY,
            type        TEXT    NOT NULL CHECK (type IN ('file', 'bookmark', 'note')),
            folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            rating      INTEGER,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO vault_objects (id, type, folder_id, is_favorite, rating, created_at, updated_at)
          SELECT id, type, folder_id, is_favorite, rating, created_at, updated_at
          FROM _vault_objects_v3;

          DROP TABLE _vault_objects_v3;
        `);
        this.db.pragma('legacy_alter_table = OFF');
        this.db.pragma('foreign_keys = ON');
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          vault_object_id TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
          title_enc       BLOB NOT NULL,
          body_enc        BLOB NOT NULL,
          format          TEXT NOT NULL DEFAULT 'plain' CHECK (format IN ('plain', 'markdown'))
        );

        CREATE INDEX IF NOT EXISTS idx_vault_objects_folder_id   ON vault_objects(folder_id);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_type        ON vault_objects(type);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_is_favorite ON vault_objects(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_created_at  ON vault_objects(created_at);
      `);

      this.db
        .prepare(`INSERT INTO schema_meta (key, value) VALUES ('schema_version', '4') ON CONFLICT(key) DO UPDATE SET value = '4'`)
        .run();
    });

    migrate();
  }

  private repairVaultObjectForeignKeys(): void {
    const childTables = ['vault_items', 'bookmarks', 'notes', 'object_tags'];
    const rows = this.db
      .prepare(
        `SELECT name, sql
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('vault_items', 'bookmarks', 'notes', 'object_tags')`,
      )
      .all() as Array<{ name: string; sql: string | null }>;
    const hasBrokenReference = rows.some((row) => /_vault_objects?_v3/.test(row.sql ?? ''));
    if (!hasBrokenReference) return;

    const existingTables = new Set(rows.map((row) => row.name));
    const rebuildStatements: string[] = [];

    const rebuildVaultItems = (): void => {
      rebuildStatements.push(`
        DROP TABLE IF EXISTS _vault_items_fk_repair;
        ALTER TABLE vault_items RENAME TO _vault_items_fk_repair;
        CREATE TABLE vault_items (
          vault_object_id       TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
          encrypted_filename    TEXT NOT NULL,
          original_filename_enc BLOB NOT NULL,
          mime_type             TEXT,
          file_size             INTEGER NOT NULL,
          media_width           INTEGER,
          media_height          INTEGER,
          media_duration_seconds REAL,
          thumbnail_enc         BLOB,
          thumbnail_iv          BLOB,
          thumbnail_auth_tag    BLOB,
          thumbnail_mime_type   TEXT,
          iv                    BLOB NOT NULL,
          auth_tag              BLOB NOT NULL,
          content_hash          TEXT
        );
        INSERT INTO vault_items (
          vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
          media_width, media_height, media_duration_seconds,
          thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, thumbnail_mime_type,
          iv, auth_tag, content_hash
        )
        SELECT
          vault_object_id, encrypted_filename, original_filename_enc, mime_type, file_size,
          media_width, media_height, media_duration_seconds,
          thumbnail_enc, thumbnail_iv, thumbnail_auth_tag, thumbnail_mime_type,
          iv, auth_tag, content_hash
        FROM _vault_items_fk_repair;
        DROP TABLE _vault_items_fk_repair;
      `);
    };

    const rebuildBookmarks = (): void => {
      rebuildStatements.push(`
        DROP TABLE IF EXISTS _bookmarks_fk_repair;
        ALTER TABLE bookmarks RENAME TO _bookmarks_fk_repair;
        CREATE TABLE bookmarks (
          vault_object_id    TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
          title_enc          BLOB NOT NULL,
          url_enc            BLOB NOT NULL,
          thumbnail_enc      BLOB,
          thumbnail_iv       BLOB,
          thumbnail_auth_tag BLOB
        );
        INSERT INTO bookmarks (vault_object_id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag)
        SELECT vault_object_id, title_enc, url_enc, thumbnail_enc, thumbnail_iv, thumbnail_auth_tag
        FROM _bookmarks_fk_repair;
        DROP TABLE _bookmarks_fk_repair;
      `);
    };

    const rebuildNotes = (): void => {
      rebuildStatements.push(`
        DROP TABLE IF EXISTS _notes_fk_repair;
        ALTER TABLE notes RENAME TO _notes_fk_repair;
        CREATE TABLE notes (
          vault_object_id TEXT PRIMARY KEY REFERENCES vault_objects(id) ON DELETE CASCADE,
          title_enc       BLOB NOT NULL,
          body_enc        BLOB NOT NULL,
          format          TEXT NOT NULL DEFAULT 'plain' CHECK (format IN ('plain', 'markdown'))
        );
        INSERT INTO notes (vault_object_id, title_enc, body_enc, format)
        SELECT vault_object_id, title_enc, body_enc, format
        FROM _notes_fk_repair;
        DROP TABLE _notes_fk_repair;
      `);
    };

    const rebuildObjectTags = (): void => {
      rebuildStatements.push(`
        DROP TABLE IF EXISTS _object_tags_fk_repair;
        ALTER TABLE object_tags RENAME TO _object_tags_fk_repair;
        CREATE TABLE object_tags (
          object_id TEXT    NOT NULL REFERENCES vault_objects(id) ON DELETE CASCADE,
          tag_id    INTEGER NOT NULL REFERENCES tags(id)          ON DELETE CASCADE,
          PRIMARY KEY (object_id, tag_id)
        );
        INSERT OR IGNORE INTO object_tags (object_id, tag_id)
        SELECT object_id, tag_id
        FROM _object_tags_fk_repair;
        DROP TABLE _object_tags_fk_repair;
      `);
    };

    if (existingTables.has('vault_items')) rebuildVaultItems();
    if (existingTables.has('bookmarks')) rebuildBookmarks();
    if (existingTables.has('notes')) rebuildNotes();
    if (existingTables.has('object_tags')) rebuildObjectTags();

    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.exec(rebuildStatements.join('\n'));
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_object_tags_object_id     ON object_tags(object_id);
        CREATE INDEX IF NOT EXISTS idx_object_tags_tag_id        ON object_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_folder_id   ON vault_objects(folder_id);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_type        ON vault_objects(type);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_is_favorite ON vault_objects(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_vault_objects_created_at  ON vault_objects(created_at);
      `);
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }

  private ensureTableColumn(tableName: string, columnName: string, columnType: string): void {
    const columns = this.db
      .prepare(`PRAGMA table_info('${tableName}')`)
      .all() as Array<{ name: string }>;
    if (columns.some((col) => col.name === columnName)) return;
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }

  getDb(): SqliteDatabase {
    return this.db;
  }

  close(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Close should still proceed if checkpointing fails on a damaged DB.
    }
    this.db.close();
  }

  reopen(): void {
    this.close();
    this.db = new BetterSqlite3(this.vaultPaths.dbPath);
    this.initialize();
  }
}

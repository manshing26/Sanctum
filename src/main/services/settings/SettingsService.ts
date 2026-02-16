import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { SecuritySettings, UpdateSecuritySettingsInput } from '../../../shared/ipc';

const SECURE_DELETE_KEY = 'security.secure_delete_on_import';
const EXTENSIONS_KEY = 'browser.extensions.paths';

const parseBoolean = (value: string | undefined): boolean => value === 'true';

export class SettingsService {
  constructor(private readonly db: SqliteDatabase) {}

  getSecuritySettings(): SecuritySettings {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SECURE_DELETE_KEY) as { value: string } | undefined;

    return {
      secureDeleteOnImport: parseBoolean(row?.value),
    };
  }

  updateSecuritySettings(input: UpdateSecuritySettingsInput): SecuritySettings {
    if (typeof input.secureDeleteOnImport === 'boolean') {
      this.db
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(SECURE_DELETE_KEY, String(input.secureDeleteOnImport));
    }

    return this.getSecuritySettings();
  }

  getExtensionPaths(): string[] {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(EXTENSIONS_KEY) as { value: string } | undefined;
    if (!row?.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }

  setExtensionPaths(paths: string[]): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(EXTENSIONS_KEY, JSON.stringify(paths));
  }
}

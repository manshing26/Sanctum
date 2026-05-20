import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  SecuritySettings,
  UpdateSecuritySettingsInput,
  AppearanceSettings,
  UpdateAppearanceSettingsInput,
  BrowserSettings,
  UpdateBrowserSettingsInput,
} from '../../../shared/ipc';
import {
  DEFAULT_SEARCH_ENGINE_ID,
  type SearchEngineId,
  validateCustomSearchTemplate,
} from '../../../shared/browserSearch';

const SECURE_DELETE_KEY = 'security.secure_delete_on_import';
const AUTO_LOCK_MINUTES_KEY = 'security.auto_lock_minutes';
const LOCK_ON_MINIMIZE_KEY = 'security.lock_on_minimize';
const LOCK_ON_SYSTEM_SLEEP_OR_LOCK_KEY = 'security.lock_on_system_sleep_or_lock';
const EXTENSIONS_KEY = 'browser.extensions.paths';

const APPEARANCE_KEYS = {
  thumbnailSize: 'appearance.thumbnail_size',
  gridDensity: 'appearance.grid_density',
  defaultView: 'appearance.default_view',
  textSize: 'appearance.text_size',
} as const;

const APPEARANCE_DEFAULTS: AppearanceSettings = {
  thumbnailSize: 'medium',
  gridDensity: 'comfortable',
  defaultView: 'grid',
  textSize: 'small',
};

const BROWSER_KEYS = {
  clearOnExit: 'browser.clear_on_exit',
  blockPopups: 'browser.block_popups',
  blockThirdPartyCookies: 'browser.block_third_party_cookies',
  homepage: 'browser.homepage',
  searchEngine: 'browser.search_engine',
  customSearchTemplate: 'browser.custom_search_template',
} as const;

const BROWSER_DEFAULTS: BrowserSettings = {
  clearOnExit: true,
  blockPopups: true,
  blockThirdPartyCookies: false,
  homepage: '',
  searchEngine: DEFAULT_SEARCH_ENGINE_ID,
  customSearchTemplate: '',
};

const parseBoolean = (value: string | undefined): boolean => value === 'true';
const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const parseSearchEngine = (value: string | undefined): SearchEngineId => {
  return value === 'duckduckgo' || value === 'brave' || value === 'google' || value === 'bing' || value === 'custom'
    ? value
    : DEFAULT_SEARCH_ENGINE_ID;
};
const parseTextSize = (value: string | undefined): AppearanceSettings['textSize'] => {
  return value === 'small' || value === 'medium' || value === 'large'
    ? value
    : APPEARANCE_DEFAULTS.textSize;
};

export class SettingsService {
  constructor(private readonly db: SqliteDatabase) {}

  private getSetting(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  private setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(key, value);
  }

  // ── Security ─────────────────────────────────────────────────────────

  getSecuritySettings(): SecuritySettings {
    return {
      secureDeleteOnImport: parseBoolean(this.getSetting(SECURE_DELETE_KEY) ?? 'false'),
      autoLockMinutes: parseNumber(this.getSetting(AUTO_LOCK_MINUTES_KEY), 10),
      lockOnMinimize: parseBoolean(this.getSetting(LOCK_ON_MINIMIZE_KEY) ?? 'true'),
      lockOnSystemSleepOrLock: parseBoolean(this.getSetting(LOCK_ON_SYSTEM_SLEEP_OR_LOCK_KEY) ?? 'true'),
    };
  }

  updateSecuritySettings(input: UpdateSecuritySettingsInput): SecuritySettings {
    if (typeof input.secureDeleteOnImport === 'boolean') {
      this.setSetting(SECURE_DELETE_KEY, String(input.secureDeleteOnImport));
    }
    if (typeof input.autoLockMinutes === 'number' && Number.isFinite(input.autoLockMinutes)) {
      this.setSetting(AUTO_LOCK_MINUTES_KEY, String(Math.max(0, Math.floor(input.autoLockMinutes))));
    }
    if (typeof input.lockOnMinimize === 'boolean') {
      this.setSetting(LOCK_ON_MINIMIZE_KEY, String(input.lockOnMinimize));
    }
    if (typeof input.lockOnSystemSleepOrLock === 'boolean') {
      this.setSetting(LOCK_ON_SYSTEM_SLEEP_OR_LOCK_KEY, String(input.lockOnSystemSleepOrLock));
    }
    return this.getSecuritySettings();
  }

  // ── Appearance ───────────────────────────────────────────────────────

  getAppearanceSettings(): AppearanceSettings {
    return {
      thumbnailSize: (this.getSetting(APPEARANCE_KEYS.thumbnailSize) as AppearanceSettings['thumbnailSize']) ?? APPEARANCE_DEFAULTS.thumbnailSize,
      gridDensity: (this.getSetting(APPEARANCE_KEYS.gridDensity) as AppearanceSettings['gridDensity']) ?? APPEARANCE_DEFAULTS.gridDensity,
      defaultView: (this.getSetting(APPEARANCE_KEYS.defaultView) as AppearanceSettings['defaultView']) ?? APPEARANCE_DEFAULTS.defaultView,
      textSize: parseTextSize(this.getSetting(APPEARANCE_KEYS.textSize)),
    };
  }

  updateAppearanceSettings(input: UpdateAppearanceSettingsInput): AppearanceSettings {
    if (input.thumbnailSize !== undefined) {
      this.setSetting(APPEARANCE_KEYS.thumbnailSize, input.thumbnailSize);
    }
    if (input.gridDensity !== undefined) {
      this.setSetting(APPEARANCE_KEYS.gridDensity, input.gridDensity);
    }
    if (input.defaultView !== undefined) {
      this.setSetting(APPEARANCE_KEYS.defaultView, input.defaultView);
    }
    if (input.textSize !== undefined) {
      this.setSetting(APPEARANCE_KEYS.textSize, parseTextSize(input.textSize));
    }
    return this.getAppearanceSettings();
  }

  // ── Browser ──────────────────────────────────────────────────────────

  getBrowserSettings(): BrowserSettings {
    return {
      clearOnExit: parseBoolean(this.getSetting(BROWSER_KEYS.clearOnExit) ?? String(BROWSER_DEFAULTS.clearOnExit)),
      blockPopups: parseBoolean(this.getSetting(BROWSER_KEYS.blockPopups) ?? String(BROWSER_DEFAULTS.blockPopups)),
      blockThirdPartyCookies: parseBoolean(this.getSetting(BROWSER_KEYS.blockThirdPartyCookies) ?? String(BROWSER_DEFAULTS.blockThirdPartyCookies)),
      homepage: this.getSetting(BROWSER_KEYS.homepage) ?? BROWSER_DEFAULTS.homepage,
      searchEngine: parseSearchEngine(this.getSetting(BROWSER_KEYS.searchEngine)),
      customSearchTemplate: this.getSetting(BROWSER_KEYS.customSearchTemplate) ?? BROWSER_DEFAULTS.customSearchTemplate,
    };
  }

  updateBrowserSettings(input: UpdateBrowserSettingsInput): BrowserSettings {
    if (typeof input.clearOnExit === 'boolean') {
      this.setSetting(BROWSER_KEYS.clearOnExit, String(input.clearOnExit));
    }
    if (typeof input.blockPopups === 'boolean') {
      this.setSetting(BROWSER_KEYS.blockPopups, String(input.blockPopups));
    }
    if (typeof input.blockThirdPartyCookies === 'boolean') {
      this.setSetting(BROWSER_KEYS.blockThirdPartyCookies, String(input.blockThirdPartyCookies));
    }
    if (typeof input.homepage === 'string') {
      this.setSetting(BROWSER_KEYS.homepage, input.homepage);
    }
    if (input.searchEngine !== undefined) {
      this.setSetting(BROWSER_KEYS.searchEngine, parseSearchEngine(input.searchEngine));
    }
    if (typeof input.customSearchTemplate === 'string') {
      const error = validateCustomSearchTemplate(input.customSearchTemplate);
      if (error) throw new Error(error);
      this.setSetting(BROWSER_KEYS.customSearchTemplate, input.customSearchTemplate.trim());
    }
    return this.getBrowserSettings();
  }

  // ── Extensions ───────────────────────────────────────────────────────

  getExtensionPaths(): string[] {
    const raw = this.getSetting(EXTENSIONS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }

  setExtensionPaths(paths: string[]): void {
    this.setSetting(EXTENSIONS_KEY, JSON.stringify(paths));
  }
}

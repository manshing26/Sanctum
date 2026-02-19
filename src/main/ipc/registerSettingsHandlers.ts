import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type BrowserSettings,
  type UpdateSecuritySettingsInput,
  type UpdateAppearanceSettingsInput,
  type UpdateBrowserSettingsInput,
} from '../../shared/ipc';
import { SettingsService } from '../services/settings/SettingsService';

type RegisterSettingsHandlersParams = {
  settingsService: SettingsService;
  onBrowserSettingsUpdated?: (settings: BrowserSettings) => void;
};

export const registerSettingsHandlers = ({
  settingsService,
  onBrowserSettingsUpdated,
}: RegisterSettingsHandlersParams): void => {
  // ── Security ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.getSecuritySettings, () => {
    try {
      return { ok: true as const, data: settingsService.getSecuritySettings() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to load security settings.',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.updateSecuritySettings,
    (_event, input: UpdateSecuritySettingsInput) => {
      try {
        return { ok: true as const, data: settingsService.updateSecuritySettings(input) };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to update security settings.',
        };
      }
    },
  );

  // ── Appearance ───────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.getAppearanceSettings, () => {
    try {
      return { ok: true as const, data: settingsService.getAppearanceSettings() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to load appearance settings.',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.updateAppearanceSettings,
    (_event, input: UpdateAppearanceSettingsInput) => {
      try {
        return { ok: true as const, data: settingsService.updateAppearanceSettings(input) };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to update appearance settings.',
        };
      }
    },
  );

  // ── Browser ──────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.getBrowserSettings, () => {
    try {
      return { ok: true as const, data: settingsService.getBrowserSettings() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to load browser settings.',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.updateBrowserSettings,
    (_event, input: UpdateBrowserSettingsInput) => {
      try {
        const next = settingsService.updateBrowserSettings(input);
        onBrowserSettingsUpdated?.(next);
        return { ok: true as const, data: next };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to update browser settings.',
        };
      }
    },
  );
};

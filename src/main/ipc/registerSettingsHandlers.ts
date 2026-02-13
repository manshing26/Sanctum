import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type UpdateSecuritySettingsInput,
} from '../../shared/ipc';
import { SettingsService } from '../services/settings/SettingsService';

type RegisterSettingsHandlersParams = {
  settingsService: SettingsService;
};

export const registerSettingsHandlers = ({
  settingsService,
}: RegisterSettingsHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.getSecuritySettings, () => {
    try {
      return {
        ok: true as const,
        data: settingsService.getSecuritySettings(),
      };
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
        return {
          ok: true as const,
          data: settingsService.updateSecuritySettings(input),
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to update security settings.',
        };
      }
    },
  );
};

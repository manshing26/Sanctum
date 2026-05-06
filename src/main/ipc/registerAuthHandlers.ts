import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type ChangePasswordInput,
  type CreateVaultPasswordInput,
  type SessionChangeReason,
  type UnlockVaultInput,
} from '../../shared/ipc';
import { AuthService } from '../services/auth/AuthService';
import { MainWindowController } from '../windows/MainWindowController';

type RegisterAuthHandlersParams = {
  authService: AuthService;
  mainWindowController: MainWindowController;
  onLock?: (reason: SessionChangeReason) => Promise<void> | void;
};

export const registerAuthHandlers = ({ authService, mainWindowController, onLock }: RegisterAuthHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.createVaultPassword, async (_event, input: CreateVaultPasswordInput) => {
    try {
      await authService.createVaultPassword(input.password);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to create vault password.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unlockVault, async (_event, input: UnlockVaultInput) => {
    try {
      await authService.unlockVault(input.password);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to unlock vault.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.lockVault, async () => {
    try {
      if (onLock) {
        await onLock('manual');
      } else {
        authService.lockVault();
      }
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to lock vault.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.changePassword, async (_event, input: ChangePasswordInput) => {
    try {
      const win = mainWindowController.getWindow();
      await authService.changePassword(input.currentPassword, input.newPassword, (processed, total) => {
        win?.webContents.send(IPC_CHANNELS.changePasswordProgress, { processed, total });
      });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to change password.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getSession, () => authService.getSessionState());
};

import { ipcMain } from 'electron';
import { IPC_CHANNELS, type CreateVaultPasswordInput, type UnlockVaultInput } from '../../shared/ipc';
import { AuthService } from '../services/auth/AuthService';

type RegisterAuthHandlersParams = {
  authService: AuthService;
};

export const registerAuthHandlers = ({ authService }: RegisterAuthHandlersParams): void => {
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

  ipcMain.handle(IPC_CHANNELS.lockVault, () => {
    try {
      authService.lockVault();
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to lock vault.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getSession, () => authService.getSessionState());
};

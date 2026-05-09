import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type CreatePasswordInput,
  type UpdatePasswordInput,
  type DeletePasswordInput,
  type GetPasswordsForDomainInput,
} from '../../shared/ipc';
import { PasswordService } from '../services/password/PasswordService';

type RegisterPasswordHandlersParams = {
  passwordService: PasswordService;
};

export const registerPasswordHandlers = ({
  passwordService,
}: RegisterPasswordHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.listPasswords, () => {
    try {
      return { ok: true as const, data: passwordService.listPasswords() };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to list passwords.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.createPassword, (_event, input: CreatePasswordInput) => {
    try {
      return { ok: true as const, data: passwordService.createPassword(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to create password.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updatePassword, (_event, input: UpdatePasswordInput) => {
    try {
      return { ok: true as const, data: passwordService.updatePassword(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to update password.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.deletePassword, (_event, input: DeletePasswordInput) => {
    try {
      passwordService.deletePassword(input.id);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to delete password.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.getPasswordsForDomain, (_event, input: GetPasswordsForDomainInput) => {
    try {
      return { ok: true as const, data: passwordService.getPasswordsForDomain(input.domain) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to get passwords.' };
    }
  });
};

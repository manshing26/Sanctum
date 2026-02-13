import { dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { IPC_CHANNELS, type ImportRequest } from '../../shared/ipc';
import { MainWindowController } from '../windows/MainWindowController';
import { ImportService } from '../services/import/ImportService';
import { VaultService } from '../services/vault/VaultService';

type RegisterVaultHandlersParams = {
  importService: ImportService;
  vaultService: VaultService;
  mainWindowController: MainWindowController;
};

export const registerVaultHandlers = ({
  importService,
  vaultService,
  mainWindowController,
}: RegisterVaultHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.importFiles, async (_event, input: ImportRequest) => {
    try {
      const importResult = await importService.importFiles(input);
      return {
        ok: true as const,
        data: importResult,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to import files.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listItems, () => {
    return vaultService.listItems();
  });

  ipcMain.handle(IPC_CHANNELS.getItemThumbnail, (_event, itemId: string) => {
    try {
      return {
        ok: true as const,
        data: vaultService.getItemThumbnail(itemId),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to load thumbnail.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.clearAllVaultItems, async () => {
    try {
      const data = await vaultService.clearAllItems();
      return {
        ok: true as const,
        data,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to clear vault items.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.pickFiles, async () => {
    const mainWindow = mainWindowController.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select files to import',
      properties: ['openFile', 'multiSelections'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled) {
      return [];
    }

    return result.filePaths;
  });
};

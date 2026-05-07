import { app, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import {
  IPC_CHANNELS,
  type BackupProgress,
  type BackupVaultInput,
  type DeleteVaultItemInput,
  type ExportItemsInput,
  type ImportRequest,
  type ListItemsQueryInput,
  type RenameItemInput,
  type ScanImportConflictsInput,
  type ToggleFavoriteInput,
  type SetRatingInput,
} from '../../shared/ipc';
import { MainWindowController } from '../windows/MainWindowController';
import { ImportService } from '../services/import/ImportService';
import { VaultService } from '../services/vault/VaultService';
import { BackupService } from '../services/vault/BackupService';

type RegisterVaultHandlersParams = {
  importService: ImportService;
  vaultService: VaultService;
  backupService: BackupService;
  mainWindowController: MainWindowController;
};

export const registerVaultHandlers = ({
  importService,
  vaultService,
  backupService,
  mainWindowController,
}: RegisterVaultHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.importFiles, async (_event, input: ImportRequest) => {
    try {
      const window = mainWindowController.getWindow();
      const importResult = await importService.importFiles(input, (progress) => {
        window?.webContents.send(IPC_CHANNELS.importProgress, progress);
      });
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

  ipcMain.handle(IPC_CHANNELS.scanImportConflicts, async (_event, input: ScanImportConflictsInput) => {
    try {
      const conflicts = await vaultService.scanImportConflicts(
        input.filePaths,
        input.folderId ?? null,
      );
      return { ok: true as const, data: { conflicts } };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to scan for conflicts.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listItems, () => {
    return vaultService.listItems();
  });

  ipcMain.handle(IPC_CHANNELS.listItemsQuery, (_event, input: ListItemsQueryInput) => {
    try {
      return {
        ok: true as const,
        data: vaultService.listItemsQuery(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list items.',
      };
    }
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

  ipcMain.handle(IPC_CHANNELS.deleteVaultItem, async (_event, input: DeleteVaultItemInput) => {
    try {
      await vaultService.deleteItem(input.itemId);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to delete item.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.toggleFavorite, async (_event, input: ToggleFavoriteInput) => {
    try {
      vaultService.setFavorite(input.itemId, input.isFavorite);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to update favorite.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.setRating, async (_event, input: SetRatingInput) => {
    try {
      vaultService.setRating(input.itemId, input.rating);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to set rating.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.renameVaultItem, async (_event, input: RenameItemInput) => {
    try {
      vaultService.renameItem(input.itemId, input.newName);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to rename item.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.exportItems, async (_event, input: ExportItemsInput) => {
    try {
      if (!input.itemIds || input.itemIds.length === 0) {
        return { ok: false as const, error: 'No items selected for export.' };
      }
      const window = mainWindowController.getWindow();
      let targetDir = input.targetDir?.trim();
      if (!targetDir) {
        const dialogOptions: OpenDialogOptions = {
          title: 'Select export folder',
          properties: ['openDirectory'],
        };
        const result = window
          ? await dialog.showOpenDialog(window, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false as const, error: 'Export cancelled.' };
        }
        targetDir = result.filePaths[0];
      }

      const exportResult = await vaultService.exportItems(input.itemIds, targetDir, (progress) => {
        window?.webContents.send(IPC_CHANNELS.exportProgress, progress);
      });
      return {
        ok: true as const,
        data: exportResult,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to export items.',
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

  ipcMain.handle(IPC_CHANNELS.pickBackupSavePath, async () => {
    const window = mainWindowController.getWindow();
    const today = new Date().toISOString().slice(0, 10);
    const dialogOptions: SaveDialogOptions = {
      title: 'Save backup',
      defaultPath: `privatevault-backup-${today}.pvbackup`,
      filters: [{ name: 'Vault Backup', extensions: ['pvbackup'] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    return result.canceled ? null : result.filePath ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.backupVault, async (_event, input: BackupVaultInput) => {
    try {
      const window = mainWindowController.getWindow();
      await backupService.createBackup(input.outputPath, (progress: BackupProgress) => {
        window?.webContents.send(IPC_CHANNELS.backupProgress, progress);
      });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to create backup.',
      };
    }
  });
};

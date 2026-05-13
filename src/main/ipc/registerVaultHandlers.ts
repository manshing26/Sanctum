import fs from 'node:fs';
import path from 'node:path';
import { dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import {
  IPC_CHANNELS,
  type BackupProgress,
  type BackupVaultInput,
  type ClearAllVaultItemsInput,
  type DeleteVaultItemInput,
  type ExportItemsInput,
  type ImportRequest,
  type ListItemsQueryInput,
  type OpenTemporaryFileInput,
  type RenameItemInput,
  type RestoreVaultInput,
  type ScanImportConflictsInput,
  type ToggleFavoriteInput,
  type SetRatingInput,
} from '../../shared/ipc';
import { MainWindowController } from '../windows/MainWindowController';
import { ImportService } from '../services/import/ImportService';
import { VaultService } from '../services/vault/VaultService';
import { BackupService } from '../services/vault/BackupService';
import { RestoreService } from '../services/vault/RestoreService';
import { AuthService } from '../services/auth/AuthService';

type RegisterVaultHandlersParams = {
  importService: ImportService;
  vaultService: VaultService;
  authService: AuthService;
  backupService: BackupService;
  restoreService: RestoreService;
  mainWindowController: MainWindowController;
};

const RISK_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'node_modules'];

const isRiskyExportTarget = (targetDir: string): boolean => {
  let cursor = path.resolve(targetDir);
  const root = path.parse(cursor).root;
  while (true) {
    for (const marker of RISK_MARKERS) {
      if (fs.existsSync(path.join(cursor, marker))) return true;
    }
    if (cursor === root) break;
    cursor = path.dirname(cursor);
  }
  return false;
};

const confirmRiskyExportTarget = async (
  targetDir: string,
  owner: Electron.BrowserWindow | null,
): Promise<boolean> => {
  if (!isRiskyExportTarget(targetDir)) return true;
  const options = {
    type: 'warning' as const,
    buttons: ['Choose Another Folder', 'Export Anyway'],
    defaultId: 0,
    cancelId: 0,
    title: 'Export into coding workspace?',
    message: 'This folder looks like a coding workspace.',
    detail: 'Exported files are decrypted plaintext. AI agents and project tools may scan files placed here.',
  };
  const result = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
};

export const registerVaultHandlers = ({
  importService,
  vaultService,
  authService,
  backupService,
  restoreService,
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

  ipcMain.handle(IPC_CHANNELS.clearAllVaultItems, async (_event, input: ClearAllVaultItemsInput) => {
    try {
      if (!input.password) {
        return { ok: false as const, error: 'Enter your vault password to delete vault data.' };
      }
      const valid = await authService.verifyCurrentPassword(input.password);
      if (!valid) {
        return { ok: false as const, error: 'Incorrect password.' };
      }
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
        if (!(await confirmRiskyExportTarget(targetDir, window))) {
          return { ok: false as const, error: 'Export cancelled.' };
        }
      } else if (!(await confirmRiskyExportTarget(targetDir, window))) {
        return { ok: false as const, error: 'Export cancelled.' };
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

  ipcMain.handle(IPC_CHANNELS.openTemporaryFile, async (_event, input: OpenTemporaryFileInput) => {
    try {
      const tempPath = await vaultService.openTemporaryFile(input.itemId);
      const openError = await shell.openPath(tempPath);
      if (openError) throw new Error(openError);
      return { ok: true as const, data: { path: tempPath } };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to open temporary file.',
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

  ipcMain.handle(IPC_CHANNELS.pickRestoreFile, async () => {
    const window = mainWindowController.getWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Select backup file',
      filters: [{ name: 'Vault Backup', extensions: ['pvbackup'] }],
      properties: ['openFile'],
    };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.restoreVault, async (_event, input: RestoreVaultInput) => {
    const window = mainWindowController.getWindow();
    if (input.mode === 'merge') {
      try {
        await restoreService.mergeVault(input.backupPath, input.password, (progress) => {
          window?.webContents.send(IPC_CHANNELS.restoreProgress, progress);
        });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Merge restore failed.',
        };
      }
    }
    try {
      await restoreService.replaceVault(input.backupPath, input.password, (progress) => {
        window?.webContents.send(IPC_CHANNELS.restoreProgress, progress);
      });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to restore vault.',
      };
    }
  });
};

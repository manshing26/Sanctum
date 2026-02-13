import { ipcMain } from 'electron';
import type {
  AssignItemFolderInput,
  AssignItemsFolderInput,
  CreateFolderInput,
  MoveFolderInput,
  RenameFolderInput,
} from '../../shared/ipc';
import { IPC_CHANNELS } from '../../shared/ipc';
import { FolderService } from '../services/folder/FolderService';

type RegisterFolderHandlersParams = {
  folderService: FolderService;
};

export const registerFolderHandlers = ({ folderService }: RegisterFolderHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.createFolder, (_event, input: CreateFolderInput) => {
    try {
      return {
        ok: true as const,
        data: folderService.createFolder(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to create folder.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listFoldersTree, () => {
    try {
      return {
        ok: true as const,
        data: folderService.listFoldersTree(),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list folders.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.renameFolder, (_event, input: RenameFolderInput) => {
    try {
      return {
        ok: true as const,
        data: folderService.renameFolder(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to rename folder.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.moveFolder, (_event, input: MoveFolderInput) => {
    try {
      return {
        ok: true as const,
        data: folderService.moveFolder(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to move folder.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.deleteFolder, (_event, folderId: number) => {
    try {
      folderService.deleteFolder(folderId);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to delete folder.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignItemFolder, (_event, input: AssignItemFolderInput) => {
    try {
      folderService.assignItemFolder(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to assign item folder.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignItemsFolder, (_event, input: AssignItemsFolderInput) => {
    try {
      folderService.bulkAssignItemsFolder(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to assign folders for items.',
      };
    }
  });
};

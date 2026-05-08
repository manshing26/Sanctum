import { app, dialog, ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type CreateBookmarkInput,
  type DeleteBookmarkInput,
  type ExtensionStartupError,
  type ExtensionSummary,
} from '../../shared/ipc';
import { BookmarkService } from '../services/bookmark/BookmarkService';
import { DownloadService } from '../services/download/DownloadService';
import { SettingsService } from '../services/settings/SettingsService';
import { BrowserWindowController } from '../windows/BrowserWindowController';
import { MainWindowController } from '../windows/MainWindowController';
import type { Session } from 'electron';

type RegisterBrowserHandlersParams = {
  browserWindowController: BrowserWindowController;
  mainWindowController: MainWindowController;
  bookmarkService: BookmarkService;
  downloadService: DownloadService;
  settingsService: SettingsService;
  browserSession: Session;
  getExtensionStartupErrors?: () => ExtensionStartupError[];
};

export const registerBrowserHandlers = ({
  browserWindowController,
  mainWindowController,
  bookmarkService,
  downloadService,
  settingsService,
  browserSession,
  getExtensionStartupErrors,
}: RegisterBrowserHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.openBrowserWindow, () => {
    browserWindowController.open(mainWindowController.getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.closeBrowserWindow, () => {
    browserWindowController.close();
  });

  ipcMain.handle(IPC_CHANNELS.clearBrowserData, async () => {
    try {
      await browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      await browserSession.clearCache();
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to clear browser data.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listBookmarks, () => {
    try {
      return {
        ok: true as const,
        data: bookmarkService.listBookmarks(),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list bookmarks.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.createBookmark, async (_event, input: CreateBookmarkInput) => {
    try {
      return {
        ok: true as const,
        data: await bookmarkService.createBookmark(input),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to create bookmark.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.deleteBookmark, (_event, input: DeleteBookmarkInput) => {
    try {
      bookmarkService.deleteBookmark(input.id);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to delete bookmark.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.cancelDownload, (_event, id: string) => {
    try {
      const cancelled = downloadService.cancelDownload(id);
      return cancelled
        ? { ok: true as const }
        : { ok: false as const, error: 'Download not found.' };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to cancel download.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listExtensions, () => {
    try {
      const summaries = browserSession.extensions
        .getAllExtensions()
        .map((ext) => ({
          id: ext.id,
          name: ext.name,
          version: ext.version,
        })) as ExtensionSummary[];
      return { ok: true as const, data: summaries };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list extensions.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listExtensionStartupErrors, () => {
    try {
      return { ok: true as const, data: getExtensionStartupErrors?.() ?? [] };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list extension startup errors.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.loadExtension, async () => {
    try {
      if (app.isPackaged) {
        return {
          ok: false as const,
          error: 'Extension loading is only available in development builds.',
        };
      }

      const parent = browserWindowController.getWindow() ?? mainWindowController.getWindow();
      const result = parent
        ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, error: 'No extension folder selected.' };
      }

      const extensionPath = result.filePaths[0];
      const loaded = await browserSession.loadExtension(extensionPath);
      const stored = settingsService.getExtensionPaths();
      if (!stored.includes(extensionPath)) {
        settingsService.setExtensionPaths([...stored, extensionPath]);
      }

      return {
        ok: true as const,
        data: {
          summary: {
            id: loaded.id,
            name: loaded.name,
            version: loaded.version,
          },
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to load extension.',
      };
    }
  });
};

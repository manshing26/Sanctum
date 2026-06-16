import { app, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type BookmarksChangedPayload,
  type CreateBookmarkInput,
  type DeleteBookmarkInput,
  type UpdateBookmarkThumbnailInput,
  type ImportPageCaptureInput,
  type AssignBookmarkFolderInput,
  type AssignBookmarksFolderInput,
  type AssignBookmarkTagInput,
  type UnassignBookmarkTagInput,
  type AssignBookmarksTagInput,
  type UnassignBookmarksTagInput,
  type ImportBookmarksInput,
  type ExtensionStartupError,
  type ExtensionSummary,
  type OpenExternalPrivateInput,
} from '../../shared/ipc';
import { BookmarkService } from '../services/bookmark/BookmarkService';
import { listPrivateOpenTargets, openExternalPrivate } from '../services/browser/ExternalPrivateBrowserService';
import { DownloadService } from '../services/download/DownloadService';
import { ImportService } from '../services/import/ImportService';
import { SettingsService } from '../services/settings/SettingsService';
import { BrowserWindowController } from '../windows/BrowserWindowController';
import { MainWindowController } from '../windows/MainWindowController';
import type { Session } from 'electron';

type RegisterBrowserHandlersParams = {
  browserWindowController: BrowserWindowController;
  mainWindowController: MainWindowController;
  bookmarkService: BookmarkService;
  downloadService: DownloadService;
  importService: ImportService;
  settingsService: SettingsService;
  browserSession: Session;
  getExtensionStartupErrors?: () => ExtensionStartupError[];
  onBeforeClearData?: () => Promise<void> | void;
};

const broadcastBookmarksChanged = (
  reason: BookmarksChangedPayload['reason'],
  windows: Array<Electron.BrowserWindow | null>,
): void => {
  const payload: BookmarksChangedPayload = { reason };
  const sent = new Set<number>();
  for (const window of windows) {
    if (!window || window.isDestroyed() || sent.has(window.id)) continue;
    sent.add(window.id);
    window.webContents.send(IPC_CHANNELS.bookmarksChanged, payload);
  }
};

export const registerBrowserHandlers = ({
  browserWindowController,
  mainWindowController,
  bookmarkService,
  downloadService,
  importService,
  settingsService,
  browserSession,
  getExtensionStartupErrors,
  onBeforeClearData,
}: RegisterBrowserHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.openBrowserWindow, () => {
    browserWindowController.open(mainWindowController.getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.closeBrowserWindow, () => {
    browserWindowController.close();
  });

  ipcMain.handle(IPC_CHANNELS.allowPopupHost, (_event, host: string) => {
    try {
      return { ok: true as const, data: settingsService.allowPopupHost(host) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to allow pop-ups for this site.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.listPrivateOpenTargets, () => {
    try {
      return { ok: true as const, data: listPrivateOpenTargets() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to list private browsers.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.openExternalPrivate, async (_event, input: OpenExternalPrivateInput) => {
    try {
      await openExternalPrivate(input);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Could not open private browser.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.clearBrowserData, async () => {
    try {
      await onBeforeClearData?.();
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

  ipcMain.handle(IPC_CHANNELS.importPageCapture, async (_event, input: ImportPageCaptureInput) => {
    const base64 = input.pngBase64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.byteLength === 0) {
      return { ok: false as const, error: 'Capture failed.' };
    }

    const tempDir = path.join(app.getPath('temp'), 'sanctum-captures');
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '-');
    const source = input.pageUrl || input.pageTitle || 'page';
    const domain = (() => {
      try {
        return new URL(source).hostname;
      } catch {
        return source;
      }
    })()
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'page';
    const tempPath = path.join(tempDir, `capture-${domain}-${timestamp}.png`);

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(tempPath, buffer);
      const importResult = await importService.importFiles({
        filePaths: [tempPath],
        folderId: null,
        deleteOriginals: false,
      });
      return { ok: true as const, data: importResult };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to import capture.',
      };
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
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
      const data = await bookmarkService.createBookmark(input);
      broadcastBookmarksChanged('created', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const, data };
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
      broadcastBookmarksChanged('deleted', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to delete bookmark.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updateBookmarkThumbnail, async (_event, input: UpdateBookmarkThumbnailInput) => {
    try {
      const data = await bookmarkService.updateThumbnail(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const, data };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to update thumbnail.',
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

  ipcMain.handle(IPC_CHANNELS.renameBookmark, (_event, input: { id: string; title: string }) => {
    try {
      const data = bookmarkService.renameBookmark(input.id, input.title);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const, data };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to rename bookmark.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignBookmarkFolder, (_event, input: AssignBookmarkFolderInput) => {
    try {
      bookmarkService.assignBookmarkFolder(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign folder.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignBookmarksFolder, (_event, input: AssignBookmarksFolderInput) => {
    try {
      bookmarkService.assignBookmarksFolder(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign folder.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignBookmarkTag, (_event, input: AssignBookmarkTagInput) => {
    try {
      bookmarkService.assignBookmarkTag(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign tag.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignBookmarkTag, (_event, input: UnassignBookmarkTagInput) => {
    try {
      bookmarkService.unassignBookmarkTag(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to unassign tag.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.assignBookmarksTag, (_event, input: AssignBookmarksTagInput) => {
    try {
      bookmarkService.assignBookmarksTag(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to assign tags.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.unassignBookmarksTag, (_event, input: UnassignBookmarksTagInput) => {
    try {
      bookmarkService.unassignBookmarksTag(input);
      broadcastBookmarksChanged('updated', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to unassign tags.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.exportBookmarks, (_event, input?: { ids?: string[] }) => {
    try {
      return { ok: true as const, data: bookmarkService.exportBookmarks(input?.ids) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to export bookmarks.' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.importBookmarks, async (_event, input: ImportBookmarksInput) => {
    try {
      const data = await bookmarkService.importBookmarks(input.html);
      broadcastBookmarksChanged('imported', [mainWindowController.getWindow(), browserWindowController.getWindow()]);
      return { ok: true as const, data };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Failed to import bookmarks.' };
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

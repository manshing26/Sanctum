import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type CreateBookmarkInput,
  type DeleteBookmarkInput,
} from '../../shared/ipc';
import { BookmarkService } from '../services/bookmark/BookmarkService';
import { BrowserWindowController } from '../windows/BrowserWindowController';
import { MainWindowController } from '../windows/MainWindowController';

type RegisterBrowserHandlersParams = {
  browserWindowController: BrowserWindowController;
  mainWindowController: MainWindowController;
  bookmarkService: BookmarkService;
};

export const registerBrowserHandlers = ({
  browserWindowController,
  mainWindowController,
  bookmarkService,
}: RegisterBrowserHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.openBrowserWindow, () => {
    browserWindowController.open(mainWindowController.getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.closeBrowserWindow, () => {
    browserWindowController.close();
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

  ipcMain.handle(IPC_CHANNELS.createBookmark, (_event, input: CreateBookmarkInput) => {
    try {
      return {
        ok: true as const,
        data: bookmarkService.createBookmark(input),
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
};

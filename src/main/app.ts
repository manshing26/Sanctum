import { app, BrowserWindow, session } from 'electron';
import { DatabaseService } from './db/Database';
import { registerAuthHandlers } from './ipc/registerAuthHandlers';
import { registerFolderHandlers } from './ipc/registerFolderHandlers';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { registerMediaHandlers } from './ipc/registerMediaHandlers';
import { registerSettingsHandlers } from './ipc/registerSettingsHandlers';
import { registerTagHandlers } from './ipc/registerTagHandlers';
import { registerVaultHandlers } from './ipc/registerVaultHandlers';
import { AuthService } from './services/auth/AuthService';
import { CryptoService } from './services/crypto/CryptoService';
import { ImportService } from './services/import/ImportService';
import { MetadataService } from './services/import/MetadataService';
import { ThumbnailService } from './services/import/ThumbnailService';
import { FolderService } from './services/folder/FolderService';
import { SecureDeleteService } from './services/security/SecureDeleteService';
import { SettingsService } from './services/settings/SettingsService';
import { TagService } from './services/tag/TagService';
import { VaultPaths } from './services/vault/VaultPaths';
import { MediaSessionService } from './services/vault/MediaSessionService';
import { VaultService } from './services/vault/VaultService';
import { SessionStore } from './state/SessionStore';
import { MainWindowController } from './windows/MainWindowController';
import { SettingsWindowController } from './windows/SettingsWindowController';

const applyCspHeaders = (): void => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = app.isPackaged
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: privatevault-media:; media-src 'self' data: blob: privatevault-media:;"
      : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data: blob: privatevault-media:; media-src 'self' data: blob: privatevault-media:;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
};

export const bootstrapApp = (): void => {
  if (require('electron-squirrel-startup')) {
    app.quit();
    return;
  }

  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return;
  }

  const mainWindowController = new MainWindowController();
  const settingsWindowController = new SettingsWindowController();

  app.on('second-instance', () => {
    const window = mainWindowController.getWindow();
    if (!window) {
      mainWindowController.create();
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  });

  app.on('ready', () => {
    applyCspHeaders();
    const vaultPaths = new VaultPaths(app.getPath('userData'));
    const database = new DatabaseService(vaultPaths);
    const sessionStore = new SessionStore();
    const cryptoService = new CryptoService();
    const authService = new AuthService(database.getDb(), cryptoService, sessionStore);
    const settingsService = new SettingsService(database.getDb());
    const secureDeleteService = new SecureDeleteService();
    const metadataService = new MetadataService();
    const thumbnailService = new ThumbnailService();
    const folderService = new FolderService(database.getDb(), sessionStore);
    const tagService = new TagService(database.getDb(), sessionStore);
    const vaultService = new VaultService(
      database.getDb(),
      cryptoService,
      sessionStore,
      vaultPaths,
    );
    const importService = new ImportService(
      vaultService,
      settingsService,
      secureDeleteService,
      metadataService,
      thumbnailService,
    );
    const mediaSessionService = new MediaSessionService(vaultService, vaultPaths);
    mediaSessionService.start();

    void session.defaultSession.protocol.handle('privatevault-media', (request) => {
      const rangeHeader =
        request.headers instanceof Headers
          ? request.headers.get('range')
          : null;
      return mediaSessionService.createProtocolResponse(request.url, rangeHeader);
    });

    mainWindowController.create();

    registerIpcHandlers({
      mainWindowController,
      settingsWindowController,
    });
    registerAuthHandlers({
      authService,
      onLock: async () => {
        await mediaSessionService.clearAllSessions();
      },
    });
    registerSettingsHandlers({
      settingsService,
    });
    registerFolderHandlers({
      folderService,
    });
    registerTagHandlers({
      tagService,
    });
    registerVaultHandlers({
      importService,
      vaultService,
      mainWindowController,
    });
    registerMediaHandlers({
      mediaSessionService,
    });

    app.once('before-quit', () => {
      void mediaSessionService.stop();
      session.defaultSession.protocol.unhandle('privatevault-media');
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindowController.create();
    }
  });
};

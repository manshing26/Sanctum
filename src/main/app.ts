import { app, BrowserWindow, Menu, protocol, session } from 'electron';
import { DatabaseService } from './db/Database';
import { registerAuthHandlers } from './ipc/registerAuthHandlers';
import { registerBrowserHandlers } from './ipc/registerBrowserHandlers';
import { registerFolderHandlers } from './ipc/registerFolderHandlers';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { registerMediaHandlers } from './ipc/registerMediaHandlers';
import { registerSettingsHandlers } from './ipc/registerSettingsHandlers';
import { registerTagHandlers } from './ipc/registerTagHandlers';
import { registerVaultHandlers } from './ipc/registerVaultHandlers';
import { AuthService } from './services/auth/AuthService';
import { BookmarkService } from './services/bookmark/BookmarkService';
import { CryptoService } from './services/crypto/CryptoService';
import { DownloadService } from './services/download/DownloadService';
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
import { BROWSER_PARTITION, BrowserWindowController } from './windows/BrowserWindowController';
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'privatevault-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

export const bootstrapApp = (): void => {
  // Suppress noisy Chromium guest view logs such as ERR_ABORTED on rapid navigations.
  app.commandLine.appendSwitch('disable-logging');
  app.commandLine.appendSwitch('log-level', '3');
  // Reduce audio service sandbox issues in webview guest processes.
  app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');
  // Filter known-noise console errors in dev output.
  const originalStderrWrite: typeof process.stderr.write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((...args: Parameters<typeof originalStderrWrite>): boolean => {
    const chunk = args[0];
    const cb = args.length > 2 ? args[2] : args.length > 1 ? args[1] : undefined;
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (
      text.includes('GUEST_VIEW_MANAGER_CALL') ||
      text.includes('ERR_ABORTED (-3)') ||
      text.includes('ERR_NAME_NOT_RESOLVED') ||
      text.includes('SharedImageManager::Produce') ||
      text.includes('Invalid mailbox') ||
      text.includes('MojoAudioOutputIPC failed to acquire factory')
    ) {
      if (typeof cb === 'function') {
        cb();
      }
      return true;
    }
    return originalStderrWrite(...args);
  }) as typeof process.stderr.write;

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
  const browserWindowController = new BrowserWindowController();
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
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      headers.DNT = '1';
      delete headers.Referer;

      try {
        if (details.resourceType !== 'mainFrame') {
          const initiator = (details as { initiator?: string }).initiator || details.referrer || '';
          const initiatorHost = initiator ? new URL(initiator).hostname : '';
          const targetHost = new URL(details.url).hostname;
          if (initiatorHost && initiatorHost !== targetHost) {
            delete headers.Cookie;
          }
        }
      } catch {
        // Ignore parsing errors.
      }

      callback({ requestHeaders: headers });
    });

    browserSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders ?? {};
      try {
        if (details.resourceType !== 'mainFrame') {
          const initiator = (details as { initiator?: string }).initiator || details.referrer || '';
          const initiatorHost = initiator ? new URL(initiator).hostname : '';
          const targetHost = new URL(details.url).hostname;
          if (initiatorHost && initiatorHost !== targetHost) {
            delete responseHeaders['set-cookie'];
            delete responseHeaders['Set-Cookie'];
          }
        }
      } catch {
        // Ignore parsing errors.
      }

      callback({ responseHeaders });
    });

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
    const bookmarkService = new BookmarkService(database.getDb(), cryptoService, sessionStore);
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
    const downloadService = new DownloadService(
      browserSession,
      vaultPaths,
      importService,
      browserWindowController,
      sessionStore,
    );
    const mediaSessionService = new MediaSessionService(vaultService, vaultPaths);
    mediaSessionService.start();

    downloadService.start();

    browserWindowController.setOnClosed(() => {
      void browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      void browserSession.clearCache();
    });

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
    registerBrowserHandlers({
      browserWindowController,
      mainWindowController,
      bookmarkService,
      downloadService,
      settingsService,
      browserSession,
    });
    registerAuthHandlers({
      authService,
      onLock: async () => {
        browserWindowController.close();
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

    const isMediaUrl = (url: string): boolean =>
      /\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp|heic)$/i.test(url);

    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() !== 'webview') {
        return;
      }

      contents.setWindowOpenHandler(() => ({ action: 'deny' }));

      contents.on('context-menu', (_eventMenu, params) => {
        const targetUrl = params.srcURL || params.linkURL || '';
        const isMedia =
          params.mediaType === 'video' ||
          params.mediaType === 'image' ||
          (targetUrl && isMediaUrl(targetUrl));

        if (!isMedia || !targetUrl) {
          return;
        }

        const menu = Menu.buildFromTemplate([
          {
            label: 'Save to Vault',
            click: () => {
              contents.downloadURL(targetUrl);
            },
          },
        ]);
        menu.popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined });
      });
    });

    app.once('before-quit', () => {
      void mediaSessionService.stop();
      void browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      void browserSession.clearCache();
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

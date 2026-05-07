import { app, BrowserWindow, Menu, powerMonitor, protocol, session, webContents } from 'electron';
import type {
  BrowserSettings,
  ExtensionStartupError,
  SecuritySettings,
  SessionChangeReason,
} from '../shared/ipc';
import { IPC_CHANNELS } from '../shared/ipc';
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
import { BackupService } from './services/vault/BackupService';
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

type BrowserNetworkPolicy = {
  strictCrossSiteCookieBlocking: boolean;
  stripReferer: boolean;
};

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

  app.on('ready', async () => {
    applyCspHeaders();
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    const extensionStartupErrors: ExtensionStartupError[] = [];
    const browserNetworkPolicy: BrowserNetworkPolicy = {
      strictCrossSiteCookieBlocking: false,
      stripReferer: false,
    };
    let securitySettings: SecuritySettings = {
      secureDeleteOnImport: false,
      autoLockMinutes: 10,
      lockOnMinimize: true,
    };
    const applyBrowserSettingsToPolicy = (settings: BrowserSettings): void => {
      browserNetworkPolicy.strictCrossSiteCookieBlocking = Boolean(settings.blockThirdPartyCookies);
      // Keep compatibility by default; only strict mode strips cross-site cookies.
      browserNetworkPolicy.stripReferer = false;
    };
    const applySecuritySettings = (settings: SecuritySettings): void => {
      securitySettings = settings;
    };
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      headers.DNT = '1';
      if (browserNetworkPolicy.stripReferer) {
        delete headers.Referer;
      }

      try {
        if (browserNetworkPolicy.strictCrossSiteCookieBlocking && details.resourceType !== 'mainFrame') {
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
        if (browserNetworkPolicy.strictCrossSiteCookieBlocking && details.resourceType !== 'mainFrame') {
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
    const authService = new AuthService(database.getDb(), cryptoService, sessionStore, vaultPaths);
    const settingsService = new SettingsService(database.getDb());
    applyBrowserSettingsToPolicy(settingsService.getBrowserSettings());
    applySecuritySettings(settingsService.getSecuritySettings());
    const secureDeleteService = new SecureDeleteService();
    const metadataService = new MetadataService();
    const thumbnailService = new ThumbnailService();
    const folderService = new FolderService(database.getDb(), sessionStore, vaultPaths);
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
    const backupService = new BackupService(database.getDb(), vaultPaths, sessionStore);
    const mediaSessionService = new MediaSessionService(vaultService, vaultPaths);
    mediaSessionService.start();

    downloadService.start();

    for (const extensionPath of settingsService.getExtensionPaths()) {
      if (app.isPackaged) {
        extensionStartupErrors.push({
          path: extensionPath,
          error: 'Skipped: extension loading is disabled in production builds.',
        });
        continue;
      }

      try {
        await browserSession.loadExtension(extensionPath);
      } catch (error) {
        extensionStartupErrors.push({
          path: extensionPath,
          error: error instanceof Error ? error.message : 'Failed to load extension.',
        });
      }
    }

    browserWindowController.setOnClosed(() => {
      void browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      void browserSession.clearCache();
    });

    let isLocking = false;
    const performGlobalLock = async (reason: SessionChangeReason): Promise<void> => {
      if (isLocking || sessionStore.getState().status !== 'unlocked') {
        return;
      }

      isLocking = true;
      try {
        // Mute all webContents immediately so audio stops synchronously before
        // any async teardown. This covers webviews in the main window (same-window
        // browser) which are guest processes that keep playing until explicitly stopped.
        for (const wc of webContents.getAllWebContents()) {
          wc.setAudioMuted(true);
        }

        authService.lockVault();
        browserWindowController.close();
        await mediaSessionService.clearAllSessions();

        const win = mainWindowController.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.sessionChanged, {
            state: authService.getSessionState(),
            reason,
          });
        }
      } finally {
        isLocking = false;
      }
    };

    const idleLockInterval = setInterval(() => {
      if (sessionStore.getState().status !== 'unlocked') {
        return;
      }
      if (securitySettings.autoLockMinutes <= 0) {
        return;
      }
      const idleSeconds = powerMonitor.getSystemIdleTime();
      if (idleSeconds >= securitySettings.autoLockMinutes * 60) {
        void performGlobalLock('idle_timeout');
      }
    }, 15_000);

    void session.defaultSession.protocol.handle('privatevault-media', (request) => {
      const rangeHeader =
        request.headers instanceof Headers
          ? request.headers.get('range')
          : null;
      return mediaSessionService.createProtocolResponse(request.url, rangeHeader);
    });

    const mainWindow = mainWindowController.create();
    mainWindow.on('minimize', () => {
      if (!securitySettings.lockOnMinimize) {
        return;
      }
      if (sessionStore.getState().status !== 'unlocked') {
        return;
      }
      // Send the lock signal synchronously before the async lock completes so the
      // renderer blanks immediately. On macOS this ensures the Dock thumbnail and
      // the un-minimize animation show the lock screen rather than the gallery.
      mainWindow.webContents.send(IPC_CHANNELS.sessionChanged, {
        state: { status: 'locked', hasVault: true },
        reason: 'window_minimize',
      } satisfies import('../shared/ipc').SessionChangedPayload);
      void performGlobalLock('window_minimize');
    });

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
      getExtensionStartupErrors: () => [...extensionStartupErrors],
    });
    registerAuthHandlers({
      authService,
      mainWindowController,
      onLock: performGlobalLock,
    });
    registerSettingsHandlers({
      settingsService,
      onSecuritySettingsUpdated: applySecuritySettings,
      onBrowserSettingsUpdated: applyBrowserSettingsToPolicy,
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
      backupService,
      mainWindowController,
    });
    registerMediaHandlers({
      mediaSessionService,
    });

    const isMediaUrl = (url: string): boolean =>
      /\.(mp4|webm|mov|mkv|jpg|jpeg|png|gif|webp|heic)$/i.test(url);
    const isAllowedDownloadProtocol = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };

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
        if (!isAllowedDownloadProtocol(targetUrl)) {
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
      clearInterval(idleLockInterval);
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

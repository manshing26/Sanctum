import fs from 'node:fs/promises';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, powerMonitor, powerSaveBlocker, protocol, session, webContents, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { Input } from 'electron';
import type {
  BrowserCommand,
  BrowserSettings,
  ExtensionStartupError,
  ResetAllAppDataInput,
  SecuritySettings,
  SessionChangeReason,
} from '../shared/ipc';
import { IPC_CHANNELS } from '../shared/ipc';
import { DatabaseService } from './db/Database';
import { registerAuthHandlers } from './ipc/registerAuthHandlers';
import { registerBrowserHandlers } from './ipc/registerBrowserHandlers';
import { registerPasswordHandlers } from './ipc/registerPasswordHandlers';
import { registerFolderHandlers } from './ipc/registerFolderHandlers';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { registerMediaHandlers } from './ipc/registerMediaHandlers';
import { registerNoteHandlers } from './ipc/registerNoteHandlers';
import { registerSettingsHandlers } from './ipc/registerSettingsHandlers';
import { registerTagHandlers } from './ipc/registerTagHandlers';
import { registerVaultHandlers } from './ipc/registerVaultHandlers';
import { AuthService } from './services/auth/AuthService';
import { BookmarkService } from './services/bookmark/BookmarkService';
import { isHttpUrl, listPrivateOpenTargets, openExternalPrivate } from './services/browser/ExternalPrivateBrowserService';
import { NoteService } from './services/note/NoteService';
import { PasswordService } from './services/password/PasswordService';
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
import { RestoreService } from './services/vault/RestoreService';
import { VaultService } from './services/vault/VaultService';
import { VaultRecoveryService } from './services/vault/VaultRecoveryService';
import { SessionStore } from './state/SessionStore';
import { MainWindowController } from './windows/MainWindowController';
import { BROWSER_PARTITION, BrowserWindowController } from './windows/BrowserWindowController';

const applyCspHeaders = (): void => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = app.isPackaged
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: privatevault-media:; img-src 'self' data: blob: privatevault-media:; media-src 'self' data: blob: privatevault-media:; frame-src 'self' blob: privatevault-media:; object-src 'self' blob: privatevault-media:;"
      : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: blob: privatevault-media:; img-src 'self' data: blob: privatevault-media:; media-src 'self' data: blob: privatevault-media:; frame-src 'self' blob: privatevault-media:; object-src 'self' blob: privatevault-media:;";

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
  let requestManualLock: (() => void) | null = null;
  const sendBrowserCommandToWindow = (window: BrowserWindow | null, command: BrowserCommand): void => {
    if (!window || window.isDestroyed()) {
      return;
    }
    window.webContents.send(IPC_CHANNELS.browserCommand, command);
  };
  const pageFocusIsEditable = async (contents: WebContents): Promise<boolean> => {
    try {
      return await contents.executeJavaScript(`
        (() => {
          const el = document.activeElement;
          if (!el) return false;
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(el.isContentEditable);
        })()
      `, true) === true;
    } catch {
      return false;
    }
  };
  const commandFromKeyboardInput = (input: Input): BrowserCommand | null => {
    if (input.type !== 'keyDown') {
      return null;
    }

    const key = input.key.toLowerCase();
    const code = input.code.toLowerCase();
    const isLeft = key === 'arrowleft' || key === 'left' || code === 'arrowleft';
    const isRight = key === 'arrowright' || key === 'right' || code === 'arrowright';
    const isMac = process.platform === 'darwin';

    if (isMac && input.meta && !input.alt && !input.control) {
      if (isLeft || key === '[') return 'history-back';
      if (isRight || key === ']') return 'history-forward';
      if (key === 't') return 'new-tab';
      if (key === 'w') return 'close-active-tab';
      if (key === 'r') return 'reload-or-stop';
      if (key === 'l') return 'focus-address';
      if (key === 'b') return 'toggle-saved-web';
    }

    if (!isMac && input.alt && !input.control && !input.meta) {
      if (isLeft) return 'history-back';
      if (isRight) return 'history-forward';
    }

    if (!isMac && input.control && !input.alt && !input.meta) {
      if (key === 't') return 'new-tab';
      if (key === 'w') return 'close-active-tab';
      if (key === 'r') return 'reload-or-stop';
      if (key === 'l') return 'focus-address';
      if (key === 'b') return 'toggle-saved-web';
    }

    return null;
  };
  const commandFromAppCommand = (command: string): BrowserCommand | null => {
    if (command === 'browser-backward') return 'history-back';
    if (command === 'browser-forward') return 'history-forward';
    return null;
  };
  const commandFromSwipeDirection = (direction: string): BrowserCommand | null => {
    if (direction === 'right') return 'history-back';
    if (direction === 'left') return 'history-forward';
    return null;
  };
  const playingMediaContentsIds = new Set<number>();
  const trackedMediaContentsIds = new Set<number>();
  let vaultVideoPlaybackActive = false;
  let vaultAudioPlaybackActive = false;
  let allowPlaybackPowerBlocker = false;
  let powerSaveBlockerId: number | null = null;
  const hasActivePlayback = (): boolean =>
    playingMediaContentsIds.size > 0 || vaultVideoPlaybackActive || vaultAudioPlaybackActive;
  const updatePowerSaveBlocker = (): void => {
    if (hasActivePlayback() && allowPlaybackPowerBlocker) {
      if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
      return;
    }

    if (powerSaveBlockerId !== null) {
      if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
      }
      powerSaveBlockerId = null;
    }
  };
  const clearPlaybackState = (): void => {
    playingMediaContentsIds.clear();
    vaultVideoPlaybackActive = false;
    vaultAudioPlaybackActive = false;
    updatePowerSaveBlocker();
  };
  const wireMediaPlaybackTracking = (contents: WebContents): void => {
    if (trackedMediaContentsIds.has(contents.id)) {
      return;
    }
    trackedMediaContentsIds.add(contents.id);
    contents.on('media-started-playing', () => {
      playingMediaContentsIds.add(contents.id);
      updatePowerSaveBlocker();
    });
    contents.on('media-paused', () => {
      playingMediaContentsIds.delete(contents.id);
      updatePowerSaveBlocker();
    });
    contents.on('destroyed', () => {
      playingMediaContentsIds.delete(contents.id);
      trackedMediaContentsIds.delete(contents.id);
      updatePowerSaveBlocker();
    });
  };
  const wireBrowserWindowShortcuts = (window: BrowserWindow): void => {
    window.webContents.on('before-input-event', (event, input) => {
      const command = commandFromKeyboardInput(input);
      if (!command) {
        return;
      }
      if (command === 'toggle-saved-web') {
        return;
      }
      event.preventDefault();
      sendBrowserCommandToWindow(window, command);
    });
    window.on('app-command', (event, command) => {
      const browserCommand = commandFromAppCommand(command);
      if (!browserCommand) {
        return;
      }
      event.preventDefault();
      sendBrowserCommandToWindow(window, browserCommand);
    });
    window.on('swipe', (event, direction) => {
      const command = commandFromSwipeDirection(direction);
      if (!command) {
        return;
      }
      event.preventDefault();
      sendBrowserCommandToWindow(window, command);
    });
  };
  const wireBrowserWindow = (window: BrowserWindow): void => {
    wireBrowserWindowShortcuts(window);
    wireMediaPlaybackTracking(window.webContents);
  };
  browserWindowController.setOnCreated(wireBrowserWindow);

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
      lockOnSystemSleepOrLock: true,
      minimizeOnLock: false,
    };
    const applyBrowserSettingsToPolicy = (settings: BrowserSettings): void => {
      browserNetworkPolicy.strictCrossSiteCookieBlocking = Boolean(settings.blockThirdPartyCookies);
      // Keep compatibility by default; only strict mode strips cross-site cookies.
      browserNetworkPolicy.stripReferer = false;
    };
    const applySecuritySettings = (settings: SecuritySettings): void => {
      securitySettings = settings;
    };
    const exitBrowserFullscreen = async (): Promise<void> => {
      const windows = [mainWindowController.getWindow(), browserWindowController.getWindow()];
      for (const win of windows) {
        if (!win || win.isDestroyed()) continue;
        try {
          if (win.isFullScreen()) {
            win.setFullScreen(false);
          }
        } catch {
          // Ignore fullscreen cleanup failures.
        }
        try {
          win.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen ? document.exitFullscreen() : undefined', true);
        } catch {
          // Ignore renderer fullscreen cleanup failures.
        }
      }

      await Promise.allSettled(
        webContents.getAllWebContents().map(async (wc) => {
          if (wc.isDestroyed()) return;
          try {
            await wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen ? document.exitFullscreen() : undefined', true);
          } catch {
            // Some internal or destroyed contents cannot run scripts.
          }
        }),
      );
    };
    const clearBrowserData = async (): Promise<void> => {
      await exitBrowserFullscreen();
      await browserSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      await browserSession.clearCache();
    };
    browserSession.setPermissionCheckHandler((_webContents, permission) => permission === 'fullscreen');
    browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'fullscreen');
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
    const noteService = new NoteService(database.getDb(), cryptoService, sessionStore);
    const passwordService = new PasswordService(database.getDb(), cryptoService, sessionStore);
    const vaultService = new VaultService(
      database.getDb(),
      cryptoService,
      sessionStore,
      vaultPaths,
    );
    const vaultRecoveryService = new VaultRecoveryService(
      database.getDb(),
      cryptoService,
      sessionStore,
      vaultPaths,
      vaultService,
    );
    let isResettingAllData = false;
    let databaseClosed = false;
    void vaultService.clearTemporaryOpenFiles();
    const importService = new ImportService(
      vaultService,
      settingsService,
      secureDeleteService,
      metadataService,
      thumbnailService,
      vaultPaths,
    );
    const downloadService = new DownloadService(
      browserSession,
      vaultPaths,
      importService,
      browserWindowController,
      sessionStore,
    );
    const backupService = new BackupService(database.getDb(), vaultPaths, sessionStore);
    const restoreService = new RestoreService(database.getDb(), cryptoService, vaultPaths);
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
      if (settingsService.getBrowserSettings().clearOnExit) {
        void clearBrowserData();
      }
    });

    let isLocking = false;
    let audioSleepTimer: { mode: 'duration' | 'end_of_track'; expiresAt?: number } | null = null;
    let audioSleepTimeout: NodeJS.Timeout | null = null;
    const clearAudioSleepTimer = (): void => {
      if (audioSleepTimeout) clearTimeout(audioSleepTimeout);
      audioSleepTimeout = null;
      audioSleepTimer = null;
    };
    const performGlobalLock = async (reason: SessionChangeReason): Promise<void> => {
      if (isLocking || sessionStore.getState().status !== 'unlocked') {
        return;
      }

      isLocking = true;
      try {
        clearAudioSleepTimer();
        allowPlaybackPowerBlocker = false;
        await exitBrowserFullscreen();
        // Mute all webContents immediately so audio stops synchronously before
        // any async teardown. This covers webviews in the main window (same-window
        // browser) which are guest processes that keep playing until explicitly stopped.
        for (const wc of webContents.getAllWebContents()) {
          wc.setAudioMuted(true);
        }
        clearPlaybackState();

        authService.lockVault();
        browserWindowController.close();
        await mediaSessionService.clearAllSessions();
        await vaultService.clearTemporaryOpenFiles();

        const win = mainWindowController.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.sessionChanged, {
            state: authService.getSessionState(),
            reason,
          });
          if (securitySettings.minimizeOnLock && reason !== 'window_minimize' && !win.isMinimized()) {
            win.minimize();
          }
        }
      } finally {
        isLocking = false;
      }
    };
    requestManualLock = () => {
      if (sessionStore.getState().status !== 'unlocked') {
        return;
      }
      void performGlobalLock('manual');
    };
    ipcMain.handle(IPC_CHANNELS.setVideoPlaybackActive, (_event, input: { active?: boolean }) => {
      vaultVideoPlaybackActive = input.active === true;
      updatePowerSaveBlocker();
      return { ok: true as const };
    });
    ipcMain.handle(IPC_CHANNELS.setAudioPlaybackActive, (_event, input: { active?: boolean }) => {
      vaultAudioPlaybackActive = input.active === true;
      updatePowerSaveBlocker();
      return { ok: true as const };
    });
    const audioSleepState = () => {
      if (!audioSleepTimer) return null;
      const remainingSeconds = audioSleepTimer.expiresAt
        ? Math.max(0, Math.ceil((audioSleepTimer.expiresAt - Date.now()) / 1000))
        : undefined;
      return {
        mode: audioSleepTimer.mode,
        expiresAt: audioSleepTimer.expiresAt
          ? new Date(audioSleepTimer.expiresAt).toISOString()
          : undefined,
        remainingSeconds,
      };
    };
    const scheduleAudioSleepLock = (expiresAt: number): void => {
      if (audioSleepTimeout) clearTimeout(audioSleepTimeout);
      audioSleepTimeout = setTimeout(() => {
        audioSleepTimeout = null;
        void performGlobalLock('audio_sleep_timer');
      }, Math.max(0, expiresAt - Date.now()));
    };
    ipcMain.handle(IPC_CHANNELS.setAudioSleepTimer, (_event, input: { mode?: string; minutes?: number }) => {
      clearAudioSleepTimer();
      if (input.mode === 'end_of_track') {
        audioSleepTimer = { mode: 'end_of_track' };
        return { ok: true as const, data: audioSleepState()! };
      }
      const minutes = Math.max(1, Math.min(480, Math.floor(input.minutes ?? 0)));
      const expiresAt = Date.now() + minutes * 60_000;
      audioSleepTimer = { mode: 'duration', expiresAt };
      scheduleAudioSleepLock(expiresAt);
      return { ok: true as const, data: audioSleepState()! };
    });
    ipcMain.handle(IPC_CHANNELS.extendAudioSleepTimer, (_event, input: { minutes?: number }) => {
      if (!audioSleepTimer || audioSleepTimer.mode !== 'duration') {
        return { ok: false as const, error: 'No duration sleep timer is active.' };
      }
      const minutes = Math.max(1, Math.min(480, Math.floor(input.minutes ?? 0)));
      const expiresAt = Math.max(Date.now(), audioSleepTimer.expiresAt ?? Date.now()) + minutes * 60_000;
      audioSleepTimer = { mode: 'duration', expiresAt };
      scheduleAudioSleepLock(expiresAt);
      return { ok: true as const, data: audioSleepState()! };
    });
    ipcMain.handle(IPC_CHANNELS.cancelAudioSleepTimer, () => {
      clearAudioSleepTimer();
      return { ok: true as const };
    });
    ipcMain.handle(IPC_CHANNELS.getAudioSleepTimer, () => ({
      ok: true as const,
      data: audioSleepState(),
    }));
    ipcMain.handle(IPC_CHANNELS.completeAudioSleepTimerTrack, () => {
      if (audioSleepTimer?.mode === 'end_of_track') {
        void performGlobalLock('audio_sleep_timer');
      }
      return { ok: true as const };
    });
    try {
      globalShortcut.register('CommandOrControl+Shift+L', () => {
        requestManualLock?.();
      });
    } catch {
      // Shortcut registration can fail if the OS owns the accelerator.
    }

    const idleLockInterval = setInterval(() => {
      if (sessionStore.getState().status !== 'unlocked') {
        return;
      }
      if (securitySettings.autoLockMinutes <= 0) {
        return;
      }
      const idleSeconds = powerMonitor.getSystemIdleTime();
      if (hasActivePlayback()) {
        return;
      }
      if (idleSeconds >= securitySettings.autoLockMinutes * 60) {
        void performGlobalLock('idle_timeout');
      }
    }, 15_000);

    const clearSessionData = async (targetSession: Electron.Session): Promise<void> => {
      await targetSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql'],
      });
      await targetSession.clearCache();
    };

    ipcMain.handle(IPC_CHANNELS.resetAllAppData, async (_event, input: ResetAllAppDataInput) => {
      try {
        if (sessionStore.getState().status !== 'unlocked') {
          return { ok: false as const, error: 'Unlock the vault before resetting Sanctum.' };
        }
        if (input.confirmation.trim().toUpperCase() !== 'RESET SANCTUM') {
          return { ok: false as const, error: 'Type RESET SANCTUM to confirm.' };
        }
        if (!input.password) {
          return { ok: false as const, error: 'Enter your vault password to reset Sanctum.' };
        }

        const valid = await authService.verifyCurrentPassword(input.password);
        if (!valid) {
          return { ok: false as const, error: 'Incorrect password.' };
        }

        isResettingAllData = true;
        clearAudioSleepTimer();
        allowPlaybackPowerBlocker = false;
        clearInterval(idleLockInterval);
        await exitBrowserFullscreen();
        for (const wc of webContents.getAllWebContents()) {
          wc.setAudioMuted(true);
        }
        clearPlaybackState();
        browserWindowController.close();
        await mediaSessionService.clearAllSessions();
        await mediaSessionService.stop();
        await vaultService.clearTemporaryOpenFiles();
        await Promise.all([
          clearSessionData(session.defaultSession),
          clearSessionData(browserSession),
        ]);

        database.close();
        databaseClosed = true;
        await fs.rm(vaultPaths.rootDir, { recursive: true, force: true });

        return { ok: true as const, data: { exitRequired: true as const } };
      } catch (error) {
        isResettingAllData = false;
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to reset Sanctum.',
        };
      }
    });

    void session.defaultSession.protocol.handle('privatevault-media', (request) => {
      const rangeHeader =
        request.headers instanceof Headers
          ? request.headers.get('range')
          : null;
      return mediaSessionService.createProtocolResponse(request.url, rangeHeader);
    });

    const mainWindow = mainWindowController.create();
    wireMediaPlaybackTracking(mainWindow.webContents);
    app.on('before-quit', () => {
      clearAudioSleepTimer();
      clearPlaybackState();
      if (!isResettingAllData) {
        void vaultService.clearTemporaryOpenFiles();
      }
    });
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
    powerMonitor.on('lock-screen', () => {
      if (!securitySettings.lockOnSystemSleepOrLock) {
        return;
      }
      void performGlobalLock('system_lock');
    });
    powerMonitor.on('suspend', () => {
      if (!securitySettings.lockOnSystemSleepOrLock) {
        return;
      }
      void performGlobalLock('system_sleep');
    });

    registerIpcHandlers();
    registerBrowserHandlers({
      browserWindowController,
      mainWindowController,
      bookmarkService,
      downloadService,
      importService,
      settingsService,
      browserSession,
      onBeforeClearData: exitBrowserFullscreen,
      getExtensionStartupErrors: () => [...extensionStartupErrors],
    });
    registerAuthHandlers({
      authService,
      mainWindowController,
      onUnlock: () => {
        allowPlaybackPowerBlocker = true;
        updatePowerSaveBlocker();
      },
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
      vaultRecoveryService,
      authService,
      backupService,
      restoreService,
      mainWindowController,
    });
    registerNoteHandlers({
      noteService,
      mainWindowController,
    });
    registerMediaHandlers({
      mediaSessionService,
    });
    registerPasswordHandlers({
      passwordService,
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
    const normalizePopupHost = (host: string): string => host.trim().toLowerCase().replace(/^www\./, '');
    const getWebviewHostWindow = (contents: WebContents): BrowserWindow | null =>
      contents.hostWebContents
        ? BrowserWindow.fromWebContents(contents.hostWebContents)
        : BrowserWindow.fromWebContents(contents);
    const buildPopupRequest = (contents: WebContents, targetUrl: string): import('../shared/ipc').BrowserPopupRequest | null => {
      try {
        const target = new URL(targetUrl);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
          return null;
        }
        const requestingUrl = contents.getURL();
        const requestingHost = normalizePopupHost(requestingUrl ? new URL(requestingUrl).hostname : '');
        if (!requestingHost) {
          return null;
        }
        const allowedPopupHosts = settingsService.getBrowserSettings().allowedPopupHosts;
        return {
          id: `popup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          url: target.toString(),
          requestingHost,
          targetHost: normalizePopupHost(target.hostname),
          allowed: allowedPopupHosts.includes(requestingHost),
          createdAt: Date.now(),
        };
      } catch {
        return null;
      }
    };

    app.on('web-contents-created', (_event, contents) => {
      wireMediaPlaybackTracking(contents);
      if (contents.getType() !== 'webview') {
        return;
      }
      contents.once('destroyed', () => {
        void exitBrowserFullscreen();
      });

      contents.setWindowOpenHandler(({ url }) => {
        const request = buildPopupRequest(contents, url);
        if (request) {
          const hostWindow = getWebviewHostWindow(contents);
          hostWindow?.webContents.send(IPC_CHANNELS.popupBlocked, request);
        }
        return { action: 'deny' };
      });
      contents.on('before-input-event', (event, input) => {
        const command = commandFromKeyboardInput(input);
        if (!command) {
          return;
        }
        if (command === 'toggle-saved-web') {
          void pageFocusIsEditable(contents).then((isEditable) => {
            if (isEditable) return;
            sendBrowserCommandToWindow(getWebviewHostWindow(contents), command);
          });
          return;
        }
        event.preventDefault();
        sendBrowserCommandToWindow(getWebviewHostWindow(contents), command);
      });

      contents.on('context-menu', (_eventMenu, params) => {
        const hostWindow = getWebviewHostWindow(contents);
        const linkUrl = (() => {
          if (!params.linkURL || !isHttpUrl(params.linkURL)) {
            return '';
          }
          try {
            return new URL(params.linkURL).toString();
          } catch {
            return '';
          }
        })();
        const targetUrl = params.srcURL || params.linkURL || '';
        const isMedia =
          params.mediaType === 'video' ||
          params.mediaType === 'image' ||
          (targetUrl && isMediaUrl(targetUrl));
        const template: MenuItemConstructorOptions[] = [];

        if (linkUrl) {
          template.push({
            label: 'Open Link in New Tab',
            click: () => {
              hostWindow?.webContents.send(IPC_CHANNELS.openUrlInTab, { url: linkUrl });
            },
          });

          const privateTargets = listPrivateOpenTargets().filter((target) => target.available);
          if (privateTargets.length > 0) {
            template.push({
              label: 'Open Private In...',
              submenu: privateTargets.map((target) => ({
                label: target.label,
                click: () => {
                  void openExternalPrivate({ url: linkUrl, browser: target.id }).catch(() => {
                    if (hostWindow && !hostWindow.isDestroyed()) {
                      void dialog.showMessageBox(hostWindow, {
                        type: 'error',
                        message: 'Could not open private browser.',
                        buttons: ['OK'],
                      });
                    }
                  });
                },
              })),
            });
          } else {
            template.push({
              label: 'No supported private browser found',
              enabled: false,
            });
          }
        }

        if (isMedia && targetUrl && isAllowedDownloadProtocol(targetUrl)) {
          if (template.length > 0) {
            template.push({ type: 'separator' });
          }
          template.push({
            label: 'Save to Vault',
            click: () => {
              contents.downloadURL(targetUrl);
            },
          });
        }

        if (template.length === 0) {
          return;
        }

        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: hostWindow ?? undefined });
      });
    });

    app.once('before-quit', () => {
      globalShortcut.unregister('CommandOrControl+Shift+L');
      clearInterval(idleLockInterval);
      if (!isResettingAllData) {
        void mediaSessionService.stop();
      }
      if (!isResettingAllData && settingsService.getBrowserSettings().clearOnExit) {
        void clearBrowserData();
      }
      session.defaultSession.protocol.unhandle('privatevault-media');
    });
    app.once('will-quit', () => {
      if (!databaseClosed) {
        database.close();
      }
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

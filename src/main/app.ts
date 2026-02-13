import { app, BrowserWindow, session } from 'electron';
import { DatabaseService } from './db/Database';
import { registerAuthHandlers } from './ipc/registerAuthHandlers';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { registerVaultHandlers } from './ipc/registerVaultHandlers';
import { AuthService } from './services/auth/AuthService';
import { CryptoService } from './services/crypto/CryptoService';
import { ImportService } from './services/import/ImportService';
import { VaultPaths } from './services/vault/VaultPaths';
import { VaultService } from './services/vault/VaultService';
import { SessionStore } from './state/SessionStore';
import { MainWindowController } from './windows/MainWindowController';
import { SettingsWindowController } from './windows/SettingsWindowController';

const applyCspHeaders = (): void => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = app.isPackaged
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
      : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:;";

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
    const vaultService = new VaultService(
      database.getDb(),
      cryptoService,
      sessionStore,
      vaultPaths,
    );
    const importService = new ImportService(vaultService);

    mainWindowController.create();

    registerIpcHandlers({
      mainWindowController,
      settingsWindowController,
    });
    registerAuthHandlers({
      authService,
    });
    registerVaultHandlers({
      importService,
      vaultService,
      mainWindowController,
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

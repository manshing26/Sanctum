import { BrowserWindow } from 'electron';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export class MainWindowController {
  private window: BrowserWindow | null = null;

  create(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      return this.window;
    }

    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 960,
      minHeight: 640,
      show: false,
      webPreferences: {
        preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    this.window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    this.window.once('ready-to-show', () => {
      this.window?.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    return this.window;
  }

  getWindow(): BrowserWindow | null {
    if (this.window && this.window.isDestroyed()) {
      this.window = null;
    }

    return this.window;
  }
}

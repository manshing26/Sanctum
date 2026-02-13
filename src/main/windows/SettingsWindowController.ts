import { BrowserWindow } from 'electron';

declare const SETTINGS_WINDOW_WEBPACK_ENTRY: string;
declare const SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export class SettingsWindowController {
  private window: BrowserWindow | null = null;

  open(parent: BrowserWindow | null): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 560,
      height: 640,
      minWidth: 480,
      minHeight: 560,
      parent: parent ?? undefined,
      modal: false,
      show: false,
      webPreferences: {
        preload: SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    this.window.loadURL(SETTINGS_WINDOW_WEBPACK_ENTRY);

    this.window.once('ready-to-show', () => {
      this.window?.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  close(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.window = null;
      return;
    }

    this.window.close();
    this.window = null;
  }
}

import { BrowserWindow } from 'electron';

export const BROWSER_PARTITION = 'persist:privatevault-browser';

declare const BROWSER_WINDOW_WEBPACK_ENTRY: string;
declare const BROWSER_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type BrowserWindowControllerOptions = {
  onClosed?: () => void;
};

export class BrowserWindowController {
  private window: BrowserWindow | null = null;

  constructor(private readonly options: BrowserWindowControllerOptions = {}) {}

  open(parent: BrowserWindow | null): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return this.window;
    }

    this.window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 1024,
      minHeight: 680,
      parent: parent ?? undefined,
      show: false,
      webPreferences: {
        preload: BROWSER_WINDOW_PRELOAD_WEBPACK_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: true,
        partition: BROWSER_PARTITION,
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false,
      },
    });

    this.window.loadURL(BROWSER_WINDOW_WEBPACK_ENTRY);

    this.window.once('ready-to-show', () => {
      this.window?.show();
      this.window?.focus();
    });

    this.window.on('closed', () => {
      this.window = null;
      this.options.onClosed?.();
    });

    return this.window;
  }

  close(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.window = null;
      return;
    }

    this.window.close();
    this.window = null;
  }

  getWindow(): BrowserWindow | null {
    if (this.window && this.window.isDestroyed()) {
      this.window = null;
    }

    return this.window;
  }
}

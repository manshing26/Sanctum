import type { BrowserAPI, ElectronAPI } from './ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    browserAPI: BrowserAPI;
  }
}

export {};

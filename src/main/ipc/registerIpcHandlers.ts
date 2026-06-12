import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNELS.openSettings, () => {
    // Settings now live in the main application tab.
  });

  ipcMain.handle(IPC_CHANNELS.closeSettings, () => {
    // Legacy settings window has been removed.
  });

  ipcMain.handle(IPC_CHANNELS.getVersion, () => app.getVersion());

  ipcMain.handle(IPC_CHANNELS.quitApp, () => {
    if (app.isPackaged) {
      app.relaunch();
    }
    app.exit(0);
  });

  ipcMain.handle(IPC_CHANNELS.exitApp, () => {
    app.exit(0);
  });
};

import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { MainWindowController } from '../windows/MainWindowController';
import { SettingsWindowController } from '../windows/SettingsWindowController';

type RegisterIpcHandlersParams = {
  mainWindowController: MainWindowController;
  settingsWindowController: SettingsWindowController;
};

export const registerIpcHandlers = ({
  mainWindowController,
  settingsWindowController,
}: RegisterIpcHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.openSettings, () => {
    settingsWindowController.open(mainWindowController.getWindow());
  });

  ipcMain.handle(IPC_CHANNELS.closeSettings, () => {
    settingsWindowController.close();
  });

  ipcMain.handle(IPC_CHANNELS.getVersion, () => app.getVersion());

  ipcMain.handle(IPC_CHANNELS.quitApp, () => {
    if (app.isPackaged) {
      app.relaunch();
    }
    app.exit(0);
  });
};

import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type UpdateBrowserSettingsInput,
  type CreateBookmarkInput,
  type DeleteBookmarkInput,
  type DownloadProgress,
} from '../shared/ipc';

contextBridge.exposeInMainWorld('browserAPI', {
  closeBrowserWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeBrowserWindow),
  listBookmarks: () => ipcRenderer.invoke(IPC_CHANNELS.listBookmarks),
  createBookmark: (input: CreateBookmarkInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBookmark, input),
  deleteBookmark: (input: DeleteBookmarkInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteBookmark, input),
  onDownloadUpdate: (handler: (payload: DownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DownloadProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.downloadUpdate, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.downloadUpdate, listener);
    };
  },
  cancelDownload: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.cancelDownload, id),
  listExtensions: () => ipcRenderer.invoke(IPC_CHANNELS.listExtensions),
  loadExtension: () => ipcRenderer.invoke(IPC_CHANNELS.loadExtension),
  getBrowserSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getBrowserSettings),
  updateBrowserSettings: (input: UpdateBrowserSettingsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateBrowserSettings, input),
  listExtensionStartupErrors: () => ipcRenderer.invoke(IPC_CHANNELS.listExtensionStartupErrors),
});

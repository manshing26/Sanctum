import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type CreateBookmarkInput,
  type DeleteBookmarkInput,
} from '../shared/ipc';

contextBridge.exposeInMainWorld('browserAPI', {
  closeBrowserWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeBrowserWindow),
  listBookmarks: () => ipcRenderer.invoke(IPC_CHANNELS.listBookmarks),
  createBookmark: (input: CreateBookmarkInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBookmark, input),
  deleteBookmark: (input: DeleteBookmarkInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteBookmark, input),
});

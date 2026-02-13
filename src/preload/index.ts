import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type CreateVaultPasswordInput,
  type ImportRequest,
  type UnlockVaultInput,
} from '../shared/ipc';

contextBridge.exposeInMainWorld('electronAPI', {
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  closeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.closeSettings),
  appVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getVersion),
  createVaultPassword: (input: CreateVaultPasswordInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createVaultPassword, input),
  unlockVault: (input: UnlockVaultInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unlockVault, input),
  lockVault: () => ipcRenderer.invoke(IPC_CHANNELS.lockVault),
  getSession: () => ipcRenderer.invoke(IPC_CHANNELS.getSession),
  importFiles: (input: ImportRequest) => ipcRenderer.invoke(IPC_CHANNELS.importFiles, input),
  listItems: () => ipcRenderer.invoke(IPC_CHANNELS.listItems),
  pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
});

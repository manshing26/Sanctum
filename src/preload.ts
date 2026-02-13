import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Add specific IPC methods here as needed
  // Example: getVersion: () => ipcRenderer.invoke('get-version'),
});

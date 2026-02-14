import { contextBridge, ipcRenderer } from 'electron';
import {
  type AssignItemFolderInput,
  type AssignItemsFolderInput,
  type AssignItemTagInput,
  type AssignItemsTagInput,
  type CreateFolderInput,
  type CreateTagInput,
  IPC_CHANNELS,
  type MoveFolderInput,
  type RenameTagInput,
  type RenameFolderInput,
  type UnassignItemTagInput,
  type UnassignItemsTagInput,
  type CreateVaultPasswordInput,
  type CloseMediaSessionInput,
  type ImportRequest,
  type ListItemsQueryInput,
  type OpenMediaSessionInput,
  type UnlockVaultInput,
  type UpdateSecuritySettingsInput,
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
  listItemsQuery: (input: ListItemsQueryInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.listItemsQuery, input),
  getItemThumbnail: (itemId: string) => ipcRenderer.invoke(IPC_CHANNELS.getItemThumbnail, itemId),
  openMediaSession: (input: OpenMediaSessionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.openMediaSession, input),
  closeMediaSession: (input: CloseMediaSessionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.closeMediaSession, input),
  pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
  clearAllVaultItems: () => ipcRenderer.invoke(IPC_CHANNELS.clearAllVaultItems),
  createFolder: (input: CreateFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.createFolder, input),
  listFoldersTree: () => ipcRenderer.invoke(IPC_CHANNELS.listFoldersTree),
  renameFolder: (input: RenameFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.renameFolder, input),
  moveFolder: (input: MoveFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.moveFolder, input),
  deleteFolder: (folderId: number) => ipcRenderer.invoke(IPC_CHANNELS.deleteFolder, folderId),
  assignItemFolder: (input: AssignItemFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignItemFolder, input),
  assignItemsFolder: (input: AssignItemsFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignItemsFolder, input),
  createTag: (input: CreateTagInput) => ipcRenderer.invoke(IPC_CHANNELS.createTag, input),
  listTags: () => ipcRenderer.invoke(IPC_CHANNELS.listTags),
  renameTag: (input: RenameTagInput) => ipcRenderer.invoke(IPC_CHANNELS.renameTag, input),
  deleteTag: (tagId: number) => ipcRenderer.invoke(IPC_CHANNELS.deleteTag, tagId),
  assignItemTag: (input: AssignItemTagInput) => ipcRenderer.invoke(IPC_CHANNELS.assignItemTag, input),
  unassignItemTag: (input: UnassignItemTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignItemTag, input),
  assignItemsTag: (input: AssignItemsTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignItemsTag, input),
  unassignItemsTag: (input: UnassignItemsTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignItemsTag, input),
  getSecuritySettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSecuritySettings),
  updateSecuritySettings: (input: UpdateSecuritySettingsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSecuritySettings, input),
});

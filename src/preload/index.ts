import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  type AssignItemFolderInput,
  type AssignItemsFolderInput,
  type AssignItemTagInput,
  type AssignItemsTagInput,
  type BrowserCommand,
  type AppearanceSettings,
  type BackupProgress,
  type BackupVaultInput,
  type RestoreProgress,
  type RestoreVaultInput,
  type ChangePasswordInput,
  type ChangePasswordProgress,
  type CreateBookmarkInput,
  type CreateFolderInput,
  type CreateTagInput,
  type DeleteBookmarkInput,
  type DownloadProgress,
  type ExportItemsInput,
  IPC_CHANNELS,
  type MoveFolderInput,
  type RenameItemInput,
  type RenameTagInput,
  type RenameFolderInput,
  type ScanImportConflictsInput,
  type ToggleFavoriteInput,
  type UnassignItemTagInput,
  type UnassignItemsTagInput,
  type CreateVaultPasswordInput,
  type CloseMediaSessionInput,
  type ClearAllVaultItemsInput,
  type ExportProgress,
  type ImportRequest,
  type ImportProgress,
  type ListItemsQueryInput,
  type OpenMediaSessionInput,
  type OpenTemporaryFileInput,
  type UnlockVaultInput,
  type UpdateSecuritySettingsInput,
  type UpdateAppearanceSettingsInput,
  type UpdateBrowserSettingsInput,
  type UpdateTagColorInput,
  type SetRatingInput,
  type SessionChangedPayload,
  type CreatePasswordInput,
  type UpdatePasswordInput,
  type DeletePasswordInput,
  type GetPasswordsForDomainInput,
  type UpdateBookmarkThumbnailInput,
  type AssignBookmarkFolderInput,
  type AssignBookmarksFolderInput,
  type AssignBookmarkTagInput,
  type UnassignBookmarkTagInput,
  type AssignBookmarksTagInput,
  type UnassignBookmarksTagInput,
  type ImportBookmarksInput,
  type ImportPageCaptureInput,
  type AssignNoteFolderInput,
  type AssignNotesFolderInput,
  type AssignNoteTagInput,
  type UnassignNoteTagInput,
  type AssignNotesTagInput,
  type UnassignNotesTagInput,
  type CreateNoteInput,
  type UpdateNoteInput,
  type DeleteNoteInput,
  type ExportNoteInput,
} from '../shared/ipc';

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  closeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.closeSettings),
  openBrowserWindow: () => ipcRenderer.invoke(IPC_CHANNELS.openBrowserWindow),
  closeBrowserWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeBrowserWindow),
  appVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getVersion),
  createVaultPassword: (input: CreateVaultPasswordInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createVaultPassword, input),
  unlockVault: (input: UnlockVaultInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unlockVault, input),
  lockVault: () => ipcRenderer.invoke(IPC_CHANNELS.lockVault),
  changePassword: (input: ChangePasswordInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.changePassword, input),
  getSession: () => ipcRenderer.invoke(IPC_CHANNELS.getSession),
  listAuthAuditLog: () => ipcRenderer.invoke(IPC_CHANNELS.listAuthAuditLog),
  importFiles: (input: ImportRequest) => ipcRenderer.invoke(IPC_CHANNELS.importFiles, input),
  scanImportConflicts: (input: ScanImportConflictsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.scanImportConflicts, input),
  listItems: () => ipcRenderer.invoke(IPC_CHANNELS.listItems),
  listItemsQuery: (input: ListItemsQueryInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.listItemsQuery, input),
  getItemThumbnail: (itemId: string) => ipcRenderer.invoke(IPC_CHANNELS.getItemThumbnail, itemId),
  openMediaSession: (input: OpenMediaSessionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.openMediaSession, input),
  closeMediaSession: (input: CloseMediaSessionInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.closeMediaSession, input),
  openTemporaryFile: (input: OpenTemporaryFileInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.openTemporaryFile, input),
  pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
  clearAllVaultItems: (input: ClearAllVaultItemsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.clearAllVaultItems, input),
  deleteVaultItem: (input: { itemId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteVaultItem, input),
  toggleFavorite: (input: ToggleFavoriteInput) => ipcRenderer.invoke(IPC_CHANNELS.toggleFavorite, input),
  setRating: (input: SetRatingInput) => ipcRenderer.invoke(IPC_CHANNELS.setRating, input),
  renameVaultItem: (input: RenameItemInput) => ipcRenderer.invoke(IPC_CHANNELS.renameVaultItem, input),
  exportItems: (input: ExportItemsInput) => ipcRenderer.invoke(IPC_CHANNELS.exportItems, input),
  createFolder: (input: CreateFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.createFolder, input),
  listFoldersTree: () => ipcRenderer.invoke(IPC_CHANNELS.listFoldersTree),
  renameFolder: (input: RenameFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.renameFolder, input),
  moveFolder: (input: MoveFolderInput) => ipcRenderer.invoke(IPC_CHANNELS.moveFolder, input),
  deleteFolder: (folderId: number, deleteItems: boolean) => ipcRenderer.invoke(IPC_CHANNELS.deleteFolder, folderId, deleteItems),
  assignItemFolder: (input: AssignItemFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignItemFolder, input),
  assignItemsFolder: (input: AssignItemsFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignItemsFolder, input),
  createTag: (input: CreateTagInput) => ipcRenderer.invoke(IPC_CHANNELS.createTag, input),
  listTags: () => ipcRenderer.invoke(IPC_CHANNELS.listTags),
  renameTag: (input: RenameTagInput) => ipcRenderer.invoke(IPC_CHANNELS.renameTag, input),
  deleteTag: (tagId: number) => ipcRenderer.invoke(IPC_CHANNELS.deleteTag, tagId),
  updateTagColor: (input: UpdateTagColorInput) => ipcRenderer.invoke(IPC_CHANNELS.updateTagColor, input),
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
  onSessionChanged: (handler: (payload: SessionChangedPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SessionChangedPayload) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.sessionChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.sessionChanged, listener);
    };
  },
  getAppearanceSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getAppearanceSettings),
  updateAppearanceSettings: (input: UpdateAppearanceSettingsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateAppearanceSettings, input),
  getBrowserSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getBrowserSettings),
  updateBrowserSettings: (input: UpdateBrowserSettingsInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateBrowserSettings, input),
  onChangePasswordProgress: (handler: (payload: ChangePasswordProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ChangePasswordProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.changePasswordProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.changePasswordProgress, listener);
    };
  },
  onImportProgress: (handler: (payload: ImportProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ImportProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.importProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.importProgress, listener);
    };
  },
  onExportProgress: (handler: (payload: ExportProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ExportProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.exportProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.exportProgress, listener);
    };
  },
  pickBackupSavePath: () => ipcRenderer.invoke(IPC_CHANNELS.pickBackupSavePath),
  backupVault: (input: BackupVaultInput) => ipcRenderer.invoke(IPC_CHANNELS.backupVault, input),
  onBackupProgress: (handler: (payload: BackupProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: BackupProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.backupProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.backupProgress, listener);
    };
  },
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  pickRestoreFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickRestoreFile),
  restoreVault: (input: RestoreVaultInput) => ipcRenderer.invoke(IPC_CHANNELS.restoreVault, input),
  onRestoreProgress: (handler: (payload: RestoreProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RestoreProgress) => {
      handler(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.restoreProgress, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.restoreProgress, listener);
    };
  },
  listPasswords: () => ipcRenderer.invoke(IPC_CHANNELS.listPasswords),
  createPassword: (i: CreatePasswordInput) => ipcRenderer.invoke(IPC_CHANNELS.createPassword, i),
  updatePassword: (i: UpdatePasswordInput) => ipcRenderer.invoke(IPC_CHANNELS.updatePassword, i),
  deletePassword: (i: DeletePasswordInput) => ipcRenderer.invoke(IPC_CHANNELS.deletePassword, i),
  getPasswordsForDomain: (i: GetPasswordsForDomainInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.getPasswordsForDomain, i),
  assignBookmarkFolder: (input: AssignBookmarkFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignBookmarkFolder, input),
  assignBookmarksFolder: (input: AssignBookmarksFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignBookmarksFolder, input),
  assignBookmarkTag: (input: AssignBookmarkTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignBookmarkTag, input),
  unassignBookmarkTag: (input: UnassignBookmarkTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignBookmarkTag, input),
  assignBookmarksTag: (input: AssignBookmarksTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignBookmarksTag, input),
  unassignBookmarksTag: (input: UnassignBookmarksTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignBookmarksTag, input),
  exportBookmarks: (input?: { ids?: string[] }) => ipcRenderer.invoke(IPC_CHANNELS.exportBookmarks, input),
  importBookmarks: (input: ImportBookmarksInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.importBookmarks, input),
  renameBookmark: (input: { id: string; title: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameBookmark, input),
  listBookmarks: () => ipcRenderer.invoke(IPC_CHANNELS.listBookmarks),
  deleteBookmark: (input: DeleteBookmarkInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteBookmark, input),
  updateBookmarkThumbnail: (input: UpdateBookmarkThumbnailInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateBookmarkThumbnail, input),
  listNotes: () => ipcRenderer.invoke(IPC_CHANNELS.listNotes),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke(IPC_CHANNELS.createNote, input),
  updateNote: (input: UpdateNoteInput) => ipcRenderer.invoke(IPC_CHANNELS.updateNote, input),
  deleteNote: (input: DeleteNoteInput) => ipcRenderer.invoke(IPC_CHANNELS.deleteNote, input),
  assignNoteFolder: (input: AssignNoteFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignNoteFolder, input),
  assignNotesFolder: (input: AssignNotesFolderInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignNotesFolder, input),
  assignNoteTag: (input: AssignNoteTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignNoteTag, input),
  unassignNoteTag: (input: UnassignNoteTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignNoteTag, input),
  assignNotesTag: (input: AssignNotesTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.assignNotesTag, input),
  unassignNotesTag: (input: UnassignNotesTagInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.unassignNotesTag, input),
  exportNote: (input: ExportNoteInput) => ipcRenderer.invoke(IPC_CHANNELS.exportNote, input),
});

contextBridge.exposeInMainWorld('browserAPI', {
  closeBrowserWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeBrowserWindow),
  onBrowserCommand: (handler: (command: BrowserCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: BrowserCommand) => {
      handler(command);
    };
    ipcRenderer.on(IPC_CHANNELS.browserCommand, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.browserCommand, listener);
    };
  },
  getAppearanceSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppearanceSettings) as Promise<{
      ok: boolean;
      data?: AppearanceSettings;
      error?: string;
    }>,
  clearData: () => ipcRenderer.invoke(IPC_CHANNELS.clearBrowserData),
  importPageCapture: (input: ImportPageCaptureInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.importPageCapture, input),
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
  updateBookmarkThumbnail: (input: UpdateBookmarkThumbnailInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateBookmarkThumbnail, input),
  listFoldersTree: () => ipcRenderer.invoke(IPC_CHANNELS.listFoldersTree),
  listTags: () => ipcRenderer.invoke(IPC_CHANNELS.listTags),
});

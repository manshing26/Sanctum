export const IPC_CHANNELS = {
  openSettings: 'app:open-settings',
  closeSettings: 'app:close-settings',
  getVersion: 'app:get-version',
  openBrowserWindow: 'browser:open-window',
  closeBrowserWindow: 'browser:close-window',
  clearBrowserData: 'browser:clear-data',
  listBookmarks: 'browser:bookmarks:list',
  createBookmark: 'browser:bookmarks:create',
  deleteBookmark: 'browser:bookmarks:delete',
  updateBookmarkThumbnail: 'browser:bookmarks:update-thumbnail',
  assignBookmarkFolder:  'vault:bookmarks:assign-folder',
  assignBookmarksFolder: 'vault:bookmarks:assign-folders',
  assignBookmarkTag:     'vault:bookmarks:assign-tag',
  unassignBookmarkTag:   'vault:bookmarks:unassign-tag',
  assignBookmarksTag:    'vault:bookmarks:assign-tags-bulk',
  unassignBookmarksTag:  'vault:bookmarks:unassign-tags-bulk',
  exportBookmarks:       'vault:bookmarks:export',
  importBookmarks:       'vault:bookmarks:import',
  renameBookmark:        'vault:bookmarks:rename',
  listNotes:             'vault:notes:list',
  createNote:            'vault:notes:create',
  updateNote:            'vault:notes:update',
  deleteNote:            'vault:notes:delete',
  assignNoteFolder:      'vault:notes:assign-folder',
  assignNotesFolder:     'vault:notes:assign-folders',
  assignNoteTag:         'vault:notes:assign-tag',
  unassignNoteTag:       'vault:notes:unassign-tag',
  assignNotesTag:        'vault:notes:assign-tags-bulk',
  unassignNotesTag:      'vault:notes:unassign-tags-bulk',
  exportNote:            'vault:notes:export',
  downloadUpdate: 'browser:downloads:update',
  cancelDownload: 'browser:downloads:cancel',
  listExtensions: 'browser:extensions:list',
  loadExtension: 'browser:extensions:load',
  listExtensionStartupErrors: 'browser:extensions:list-startup-errors',
  createVaultPassword: 'auth:create-vault-password',
  unlockVault: 'auth:unlock-vault',
  lockVault: 'auth:lock-vault',
  changePassword: 'auth:change-password',
  getSession: 'auth:get-session',
  sessionChanged: 'auth:session-changed',
  importFiles: 'vault:import-files',
  listItems: 'vault:list-items',
  listItemsQuery: 'vault:list-items-query',
  getItemThumbnail: 'vault:get-item-thumbnail',
  openMediaSession: 'vault:open-media-session',
  closeMediaSession: 'vault:close-media-session',
  openTemporaryFile: 'vault:open-temporary-file',
  pickFiles: 'vault:pick-files',
  clearAllVaultItems: 'vault:clear-all-items',
  deleteVaultItem: 'vault:delete-item',
  toggleFavorite: 'vault:toggle-favorite',
  setRating: 'vault:set-rating',
  renameVaultItem: 'vault:rename-item',
  exportItems: 'vault:export-items',
  importProgress: 'vault:import-progress',
  exportProgress: 'vault:export-progress',
  createFolder: 'folders:create',
  listFoldersTree: 'folders:list-tree',
  renameFolder: 'folders:rename',
  moveFolder: 'folders:move',
  deleteFolder: 'folders:delete',
  assignItemFolder: 'folders:assign-item',
  assignItemsFolder: 'folders:assign-items',
  scanImportConflicts: 'vault:scan-import-conflicts',
  createTag: 'tags:create',
  listTags: 'tags:list',
  renameTag: 'tags:rename',
  deleteTag: 'tags:delete',
  updateTagColor: 'tags:update-color',
  assignItemTag: 'tags:assign-item',
  unassignItemTag: 'tags:unassign-item',
  assignItemsTag: 'tags:assign-items',
  unassignItemsTag: 'tags:unassign-items',
  changePasswordProgress: 'auth:change-password-progress',
  backupVault: 'vault:backup',
  backupProgress: 'vault:backup-progress',
  pickBackupSavePath: 'vault:backup-pick-path',
  restoreVault: 'vault:restore',
  restoreProgress: 'vault:restore-progress',
  pickRestoreFile: 'vault:restore-pick-file',
  quitApp: 'app:quit',
  getSecuritySettings: 'settings:get-security',
  updateSecuritySettings: 'settings:update-security',
  getAppearanceSettings: 'settings:get-appearance',
  updateAppearanceSettings: 'settings:update-appearance',
  getBrowserSettings: 'settings:get-browser',
  updateBrowserSettings: 'settings:update-browser',
  listPasswords:         'passwords:list',
  createPassword:        'passwords:create',
  updatePassword:        'passwords:update',
  deletePassword:        'passwords:delete',
  getPasswordsForDomain: 'passwords:for-domain',
} as const;

export type CreateVaultPasswordInput = {
  password: string;
};

export type UnlockVaultInput = {
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type SessionState = {
  status: 'locked' | 'unlocked';
  hasVault: boolean;
};

export type SessionChangeReason = 'manual' | 'idle_timeout' | 'window_minimize';

export type SessionChangedPayload = {
  state: SessionState;
  reason: SessionChangeReason;
};

export type ImportRequest = {
  filePaths: string[];
  deleteOriginals?: boolean;
  folderId?: number | null;
  conflictResolutions?: ConflictResolution[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  warnings?: string[];
};

export type ConflictType = 'exact_duplicate' | 'name_conflict';

export type ConflictItem = {
  filePath: string;
  fileName: string;
  existingItemId: string;
  existingItemName: string;
  conflictType: ConflictType;
};

export type ConflictAction = 'replace' | 'keep_both' | 'skip';

export type ConflictResolution = {
  filePath: string;
  action: ConflictAction;
  existingItemId?: string;
};

export type ScanImportConflictsInput = {
  filePaths: string[];
  folderId?: number | null;
};

export type ScanImportConflictsResult = {
  conflicts: ConflictItem[];
};

export type OperationResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export type VaultItemSummary = {
  id: string;
  originalName: string;
  createdAt: string;
  size: number;
  mimeType: string;
  hasThumbnail: boolean;
  isFavorite: boolean;
  folderId?: number;
  folderPath?: string;
  tagIds?: number[];
  tags?: string[];
  width?: number;
  height?: number;
  durationSeconds?: number;
  rating?: number;
};

export type VaultListSort =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc'
  | 'rating_desc'
  | 'rating_asc';

export type ListItemsQueryInput = {
  limit: number;
  offset: number;
  sort: VaultListSort;
};

export type ListItemsQueryResult = {
  items: VaultItemSummary[];
  total: number;
  hasMore: boolean;
};

export type ItemThumbnail = {
  mimeType: string;
  base64Data: string;
};

export type OpenMediaSessionInput = {
  itemId: string;
};

export type OpenMediaSessionResult = {
  token: string;
  mediaUrl: string;
  mimeType: string;
  fileSize: number;
  expiresAt: string;
};

export type CloseMediaSessionInput = {
  token: string;
};

export type OpenTemporaryFileInput = {
  itemId: string;
};

export type OpenTemporaryFileResult = {
  path: string;
};

export type SecuritySettings = {
  secureDeleteOnImport: boolean;
  autoLockMinutes: number;
  lockOnMinimize: boolean;
};

export type UpdateSecuritySettingsInput = Partial<SecuritySettings>;

export type AppearanceSettings = {
  thumbnailSize: 'small' | 'medium' | 'large';
  gridDensity: 'compact' | 'comfortable' | 'spacious';
  defaultView: 'grid' | 'list';
};

export type UpdateAppearanceSettingsInput = Partial<AppearanceSettings>;

export type BrowserSettings = {
  clearOnExit: boolean;
  blockPopups: boolean;
  blockThirdPartyCookies: boolean;
  homepage: string;
};

export type UpdateBrowserSettingsInput = Partial<BrowserSettings>;

export type FolderNode = {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: string;
  children: FolderNode[];
};

export type CreateFolderInput = {
  name: string;
  parentId?: number | null;
};

export type RenameFolderInput = {
  folderId: number;
  name: string;
};

export type MoveFolderInput = {
  folderId: number;
  parentId: number | null;
};

export type AssignItemFolderInput = {
  itemId: string;
  folderId: number | null;
};

export type AssignItemsFolderInput = {
  itemIds: string[];
  folderId: number | null;
};

export type TagSummary = {
  id: number;
  name: string;
  color?: string;
  createdAt: string;
};

export type CreateTagInput = {
  name: string;
  color?: string;
};

export type UpdateTagColorInput = {
  tagId: number;
  color: string | null;
};

export type RenameTagInput = {
  tagId: number;
  name: string;
};

export type AssignItemTagInput = {
  itemId: string;
  tagId: number;
};

export type UnassignItemTagInput = {
  itemId: string;
  tagId: number;
};

export type AssignItemsTagInput = {
  itemIds: string[];
  tagId: number;
};

export type UnassignItemsTagInput = {
  itemIds: string[];
  tagId: number;
};

export type BookmarkSummary = {
  id: string;
  title: string;
  url: string;
  folderId: number | null;
  isFavorite: boolean;
  rating?: number;
  tags: TagSummary[];
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl?: string;
};

export type CreateBookmarkInput = {
  title?: string;
  url: string;
  folderId?: number | null;
  thumbnailUrl?: string;
  thumbnailDataUrl?: string;
};

export type DeleteBookmarkInput = {
  id: string;
};

export type UpdateBookmarkThumbnailInput = {
  id: string;
  thumbnailDataUrl: string;
};

export type AssignBookmarkFolderInput = {
  bookmarkId: string;
  folderId: number | null;
};

export type AssignBookmarksFolderInput = {
  bookmarkIds: string[];
  folderId: number | null;
};

export type AssignBookmarkTagInput = {
  bookmarkId: string;
  tagId: number;
};

export type UnassignBookmarkTagInput = {
  bookmarkId: string;
  tagId: number;
};

export type AssignBookmarksTagInput = {
  bookmarkIds: string[];
  tagId: number;
};

export type UnassignBookmarksTagInput = {
  bookmarkIds: string[];
  tagId: number;
};

export type ImportBookmarksInput = {
  html: string;
};

export type ImportBookmarksResult = {
  added: number;
  skipped: number;
  errors: string[];
};

export type NoteFormat = 'plain' | 'markdown';

export type NoteSummary = {
  id: string;
  title: string;
  body: string;
  format: NoteFormat;
  folderId: number | null;
  isFavorite: boolean;
  tags: TagSummary[];
  createdAt: string;
  updatedAt: string;
};

export type CreateNoteInput = {
  title: string;
  body?: string;
  format?: NoteFormat;
  folderId?: number | null;
};

export type UpdateNoteInput = {
  id: string;
  title: string;
  body: string;
  format: NoteFormat;
};

export type DeleteNoteInput = {
  id: string;
};

export type AssignNoteFolderInput = {
  noteId: string;
  folderId: number | null;
};

export type AssignNotesFolderInput = {
  noteIds: string[];
  folderId: number | null;
};

export type AssignNoteTagInput = {
  noteId: string;
  tagId: number;
};

export type UnassignNoteTagInput = {
  noteId: string;
  tagId: number;
};

export type AssignNotesTagInput = {
  noteIds: string[];
  tagId: number;
};

export type UnassignNotesTagInput = {
  noteIds: string[];
  tagId: number;
};

export type ExportNoteInput = {
  id: string;
  targetDir?: string;
};

export type ExportNoteResult = {
  path: string;
};

export type PasswordSummary = {
  id: string;
  domain: string;
  username: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PasswordDetail = PasswordSummary & {
  password: string;
  notes: string | null;
};

export type CreatePasswordInput = {
  domain: string;
  username: string;
  password: string;
  label?: string;
  notes?: string;
};

export type UpdatePasswordInput = CreatePasswordInput & { id: string };

export type DeletePasswordInput = { id: string };

export type GetPasswordsForDomainInput = { domain: string };

export type DeleteVaultItemInput = {
  itemId: string;
};

export type ClearAllVaultItemsInput = {
  password: string;
};

export type ClearAllVaultItemsResult = {
  deleted: number;
};

export type ToggleFavoriteInput = {
  itemId: string;
  isFavorite: boolean;
};

export type SetRatingInput = {
  itemId: string;
  rating: number | null;
};

export type RenameItemInput = {
  itemId: string;
  newName: string;
};

export type ExportItemsInput = {
  itemIds: string[];
  targetDir: string;
};

export type ChangePasswordProgress = {
  total: number;
  processed: number;
};

export type ImportProgress = {
  total: number;
  processed: number;
  failed: number;
  currentFile?: string;
};

export type ExportProgress = {
  total: number;
  processed: number;
  failed: number;
  currentItemId?: string;
  currentFile?: string;
};

export type BackupProgress = {
  total: number;
  processed: number;
  currentFile?: string;
};

export type BackupVaultInput = {
  outputPath: string;
};

export type RestoreMode = 'replace' | 'merge';

export type RestoreVaultInput = {
  backupPath: string;
  password: string;
  mode: RestoreMode;
};

export type RestoreProgress = {
  total: number;
  processed: number;
  currentFile?: string;
};

export type DownloadState = 'downloading' | 'completed' | 'cancelled' | 'failed';

export type DownloadProgress = {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  state: DownloadState;
  error?: string;
};

export type ExtensionSummary = {
  id: string;
  name: string;
  version: string;
};

export type LoadExtensionResult = {
  summary: ExtensionSummary;
};

export type ExtensionStartupError = {
  path: string;
  error: string;
};

export type ElectronAPI = {
  getPathForFile: (file: File) => string;
  openSettings: () => Promise<void>;
  closeSettings: () => Promise<void>;
  openBrowserWindow: () => Promise<void>;
  closeBrowserWindow: () => Promise<void>;
  appVersion: () => Promise<string>;
  createVaultPassword: (input: CreateVaultPasswordInput) => Promise<OperationResult>;
  unlockVault: (input: UnlockVaultInput) => Promise<OperationResult>;
  lockVault: () => Promise<OperationResult>;
  changePassword: (input: ChangePasswordInput) => Promise<OperationResult>;
  getSession: () => Promise<SessionState>;
  importFiles: (input: ImportRequest) => Promise<OperationResult<ImportResult>>;
  scanImportConflicts: (input: ScanImportConflictsInput) => Promise<OperationResult<ScanImportConflictsResult>>;
  listItems: () => Promise<VaultItemSummary[]>;
  listItemsQuery: (input: ListItemsQueryInput) => Promise<OperationResult<ListItemsQueryResult>>;
  getItemThumbnail: (itemId: string) => Promise<OperationResult<ItemThumbnail>>;
  openMediaSession: (
    input: OpenMediaSessionInput,
  ) => Promise<OperationResult<OpenMediaSessionResult>>;
  closeMediaSession: (input: CloseMediaSessionInput) => Promise<OperationResult>;
  openTemporaryFile: (input: OpenTemporaryFileInput) => Promise<OperationResult<OpenTemporaryFileResult>>;
  pickFiles: () => Promise<string[]>;
  clearAllVaultItems: (input: ClearAllVaultItemsInput) => Promise<OperationResult<ClearAllVaultItemsResult>>;
  deleteVaultItem: (input: DeleteVaultItemInput) => Promise<OperationResult>;
  toggleFavorite: (input: ToggleFavoriteInput) => Promise<OperationResult>;
  setRating: (input: SetRatingInput) => Promise<OperationResult>;
  renameVaultItem: (input: RenameItemInput) => Promise<OperationResult>;
  exportItems: (input: ExportItemsInput) => Promise<OperationResult<{ exported: number; failed: number }>>;
  backupVault: (input: BackupVaultInput) => Promise<OperationResult>;
  pickBackupSavePath: () => Promise<string | null>;
  restoreVault: (input: RestoreVaultInput) => Promise<OperationResult>;
  pickRestoreFile: () => Promise<string | null>;
  quitApp: () => Promise<void>;
  onChangePasswordProgress: (handler: (payload: ChangePasswordProgress) => void) => () => void;
  onImportProgress: (handler: (payload: ImportProgress) => void) => () => void;
  onExportProgress: (handler: (payload: ExportProgress) => void) => () => void;
  onBackupProgress: (handler: (payload: BackupProgress) => void) => () => void;
  onRestoreProgress: (handler: (payload: RestoreProgress) => void) => () => void;
  createFolder: (input: CreateFolderInput) => Promise<OperationResult<FolderNode>>;
  listFoldersTree: () => Promise<OperationResult<FolderNode[]>>;
  renameFolder: (input: RenameFolderInput) => Promise<OperationResult<FolderNode>>;
  moveFolder: (input: MoveFolderInput) => Promise<OperationResult<FolderNode>>;
  deleteFolder: (folderId: number, deleteItems: boolean) => Promise<OperationResult>;
  assignItemFolder: (input: AssignItemFolderInput) => Promise<OperationResult>;
  assignItemsFolder: (input: AssignItemsFolderInput) => Promise<OperationResult>;
  createTag: (input: CreateTagInput) => Promise<OperationResult<TagSummary>>;
  listTags: () => Promise<OperationResult<TagSummary[]>>;
  renameTag: (input: RenameTagInput) => Promise<OperationResult<TagSummary>>;
  deleteTag: (tagId: number) => Promise<OperationResult>;
  updateTagColor: (input: UpdateTagColorInput) => Promise<OperationResult<TagSummary>>;
  assignItemTag: (input: AssignItemTagInput) => Promise<OperationResult>;
  unassignItemTag: (input: UnassignItemTagInput) => Promise<OperationResult>;
  assignItemsTag: (input: AssignItemsTagInput) => Promise<OperationResult>;
  unassignItemsTag: (input: UnassignItemsTagInput) => Promise<OperationResult>;
  getSecuritySettings: () => Promise<OperationResult<SecuritySettings>>;
  updateSecuritySettings: (
    input: UpdateSecuritySettingsInput,
  ) => Promise<OperationResult<SecuritySettings>>;
  onSessionChanged: (handler: (payload: SessionChangedPayload) => void) => () => void;
  getAppearanceSettings: () => Promise<OperationResult<AppearanceSettings>>;
  updateAppearanceSettings: (
    input: UpdateAppearanceSettingsInput,
  ) => Promise<OperationResult<AppearanceSettings>>;
  getBrowserSettings: () => Promise<OperationResult<BrowserSettings>>;
  updateBrowserSettings: (
    input: UpdateBrowserSettingsInput,
  ) => Promise<OperationResult<BrowserSettings>>;
  listPasswords: () => Promise<OperationResult<PasswordSummary[]>>;
  createPassword: (i: CreatePasswordInput) => Promise<OperationResult<PasswordSummary>>;
  updatePassword: (i: UpdatePasswordInput) => Promise<OperationResult<PasswordSummary>>;
  deletePassword: (i: DeletePasswordInput) => Promise<OperationResult>;
  getPasswordsForDomain: (i: GetPasswordsForDomainInput) => Promise<OperationResult<PasswordDetail[]>>;
  assignBookmarkFolder: (input: AssignBookmarkFolderInput) => Promise<OperationResult>;
  assignBookmarksFolder: (input: AssignBookmarksFolderInput) => Promise<OperationResult>;
  assignBookmarkTag: (input: AssignBookmarkTagInput) => Promise<OperationResult>;
  unassignBookmarkTag: (input: UnassignBookmarkTagInput) => Promise<OperationResult>;
  assignBookmarksTag: (input: AssignBookmarksTagInput) => Promise<OperationResult>;
  unassignBookmarksTag: (input: UnassignBookmarksTagInput) => Promise<OperationResult>;
  exportBookmarks: (input?: { ids?: string[] }) => Promise<OperationResult<string>>;
  importBookmarks: (input: ImportBookmarksInput) => Promise<OperationResult<ImportBookmarksResult>>;
  renameBookmark: (input: { id: string; title: string }) => Promise<OperationResult<BookmarkSummary>>;
  listBookmarks: () => Promise<OperationResult<BookmarkSummary[]>>;
  deleteBookmark: (input: DeleteBookmarkInput) => Promise<OperationResult>;
  updateBookmarkThumbnail: (input: UpdateBookmarkThumbnailInput) => Promise<OperationResult<BookmarkSummary>>;
  listNotes: () => Promise<OperationResult<NoteSummary[]>>;
  createNote: (input: CreateNoteInput) => Promise<OperationResult<NoteSummary>>;
  updateNote: (input: UpdateNoteInput) => Promise<OperationResult<NoteSummary>>;
  deleteNote: (input: DeleteNoteInput) => Promise<OperationResult>;
  assignNoteFolder: (input: AssignNoteFolderInput) => Promise<OperationResult>;
  assignNotesFolder: (input: AssignNotesFolderInput) => Promise<OperationResult>;
  assignNoteTag: (input: AssignNoteTagInput) => Promise<OperationResult>;
  unassignNoteTag: (input: UnassignNoteTagInput) => Promise<OperationResult>;
  assignNotesTag: (input: AssignNotesTagInput) => Promise<OperationResult>;
  unassignNotesTag: (input: UnassignNotesTagInput) => Promise<OperationResult>;
  exportNote: (input: ExportNoteInput) => Promise<OperationResult<ExportNoteResult>>;
};

export type BrowserAPI = {
  closeBrowserWindow: () => Promise<void>;
  clearData: () => Promise<OperationResult>;
  listBookmarks: () => Promise<OperationResult<BookmarkSummary[]>>;
  createBookmark: (input: CreateBookmarkInput) => Promise<OperationResult<BookmarkSummary>>;
  deleteBookmark: (input: DeleteBookmarkInput) => Promise<OperationResult>;
  updateBookmarkThumbnail: (input: UpdateBookmarkThumbnailInput) => Promise<OperationResult<BookmarkSummary>>;
  onDownloadUpdate: (handler: (payload: DownloadProgress) => void) => () => void;
  cancelDownload: (id: string) => Promise<OperationResult>;
  listExtensions: () => Promise<OperationResult<ExtensionSummary[]>>;
  loadExtension: () => Promise<OperationResult<LoadExtensionResult>>;
  getBrowserSettings: () => Promise<OperationResult<BrowserSettings>>;
  updateBrowserSettings: (input: UpdateBrowserSettingsInput) => Promise<OperationResult<BrowserSettings>>;
  listExtensionStartupErrors: () => Promise<OperationResult<ExtensionStartupError[]>>;
  listFoldersTree: () => Promise<OperationResult<FolderNode[]>>;
  listTags: () => Promise<OperationResult<TagSummary[]>>;
};

export type AuthScreenMode = 'login' | 'create-account' | 'loading';

export type AuthFormValues = {
  password: string;
  confirmPassword?: string;
};

export type AuthFormErrors = {
  password?: string;
  confirmPassword?: string;
};

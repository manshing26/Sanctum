export const IPC_CHANNELS = {
  openSettings: 'app:open-settings',
  closeSettings: 'app:close-settings',
  getVersion: 'app:get-version',
  openBrowserWindow: 'browser:open-window',
  closeBrowserWindow: 'browser:close-window',
  listBookmarks: 'browser:bookmarks:list',
  createBookmark: 'browser:bookmarks:create',
  deleteBookmark: 'browser:bookmarks:delete',
  downloadUpdate: 'browser:downloads:update',
  cancelDownload: 'browser:downloads:cancel',
  listExtensions: 'browser:extensions:list',
  loadExtension: 'browser:extensions:load',
  createVaultPassword: 'auth:create-vault-password',
  unlockVault: 'auth:unlock-vault',
  lockVault: 'auth:lock-vault',
  getSession: 'auth:get-session',
  importFiles: 'vault:import-files',
  listItems: 'vault:list-items',
  listItemsQuery: 'vault:list-items-query',
  getItemThumbnail: 'vault:get-item-thumbnail',
  openMediaSession: 'vault:open-media-session',
  closeMediaSession: 'vault:close-media-session',
  pickFiles: 'vault:pick-files',
  clearAllVaultItems: 'vault:clear-all-items',
  deleteVaultItem: 'vault:delete-item',
  createFolder: 'folders:create',
  listFoldersTree: 'folders:list-tree',
  renameFolder: 'folders:rename',
  moveFolder: 'folders:move',
  deleteFolder: 'folders:delete',
  assignItemFolder: 'folders:assign-item',
  assignItemsFolder: 'folders:assign-items',
  createTag: 'tags:create',
  listTags: 'tags:list',
  renameTag: 'tags:rename',
  deleteTag: 'tags:delete',
  assignItemTag: 'tags:assign-item',
  unassignItemTag: 'tags:unassign-item',
  assignItemsTag: 'tags:assign-items',
  unassignItemsTag: 'tags:unassign-items',
  getSecuritySettings: 'settings:get-security',
  updateSecuritySettings: 'settings:update-security',
} as const;

export type CreateVaultPasswordInput = {
  password: string;
};

export type UnlockVaultInput = {
  password: string;
};

export type SessionState = {
  status: 'locked' | 'unlocked';
  hasVault: boolean;
};

export type ImportRequest = {
  filePaths: string[];
  deleteOriginals?: boolean;
  folderId?: number | null;
};

export type ImportResult = {
  imported: number;
  failed: number;
  errors: string[];
  warnings?: string[];
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
  folderId?: number;
  folderPath?: string;
  tagIds?: number[];
  tags?: string[];
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type VaultListSort =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc';

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

export type SecuritySettings = {
  secureDeleteOnImport: boolean;
};

export type UpdateSecuritySettingsInput = Partial<SecuritySettings>;

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
  createdAt: string;
};

export type CreateTagInput = {
  name: string;
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
  id: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateBookmarkInput = {
  title?: string;
  url: string;
};

export type DeleteBookmarkInput = {
  id: number;
};

export type DeleteVaultItemInput = {
  itemId: string;
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

export type ElectronAPI = {
  openSettings: () => Promise<void>;
  closeSettings: () => Promise<void>;
  openBrowserWindow: () => Promise<void>;
  closeBrowserWindow: () => Promise<void>;
  appVersion: () => Promise<string>;
  createVaultPassword: (input: CreateVaultPasswordInput) => Promise<OperationResult>;
  unlockVault: (input: UnlockVaultInput) => Promise<OperationResult>;
  lockVault: () => Promise<OperationResult>;
  getSession: () => Promise<SessionState>;
  importFiles: (input: ImportRequest) => Promise<OperationResult<ImportResult>>;
  listItems: () => Promise<VaultItemSummary[]>;
  listItemsQuery: (input: ListItemsQueryInput) => Promise<OperationResult<ListItemsQueryResult>>;
  getItemThumbnail: (itemId: string) => Promise<OperationResult<ItemThumbnail>>;
  openMediaSession: (
    input: OpenMediaSessionInput,
  ) => Promise<OperationResult<OpenMediaSessionResult>>;
  closeMediaSession: (input: CloseMediaSessionInput) => Promise<OperationResult>;
  pickFiles: () => Promise<string[]>;
  clearAllVaultItems: () => Promise<OperationResult<{ deleted: number }>>;
  deleteVaultItem: (input: DeleteVaultItemInput) => Promise<OperationResult>;
  createFolder: (input: CreateFolderInput) => Promise<OperationResult<FolderNode>>;
  listFoldersTree: () => Promise<OperationResult<FolderNode[]>>;
  renameFolder: (input: RenameFolderInput) => Promise<OperationResult<FolderNode>>;
  moveFolder: (input: MoveFolderInput) => Promise<OperationResult<FolderNode>>;
  deleteFolder: (folderId: number) => Promise<OperationResult>;
  assignItemFolder: (input: AssignItemFolderInput) => Promise<OperationResult>;
  assignItemsFolder: (input: AssignItemsFolderInput) => Promise<OperationResult>;
  createTag: (input: CreateTagInput) => Promise<OperationResult<TagSummary>>;
  listTags: () => Promise<OperationResult<TagSummary[]>>;
  renameTag: (input: RenameTagInput) => Promise<OperationResult<TagSummary>>;
  deleteTag: (tagId: number) => Promise<OperationResult>;
  assignItemTag: (input: AssignItemTagInput) => Promise<OperationResult>;
  unassignItemTag: (input: UnassignItemTagInput) => Promise<OperationResult>;
  assignItemsTag: (input: AssignItemsTagInput) => Promise<OperationResult>;
  unassignItemsTag: (input: UnassignItemsTagInput) => Promise<OperationResult>;
  getSecuritySettings: () => Promise<OperationResult<SecuritySettings>>;
  updateSecuritySettings: (
    input: UpdateSecuritySettingsInput,
  ) => Promise<OperationResult<SecuritySettings>>;
};

export type BrowserAPI = {
  closeBrowserWindow: () => Promise<void>;
  listBookmarks: () => Promise<OperationResult<BookmarkSummary[]>>;
  createBookmark: (input: CreateBookmarkInput) => Promise<OperationResult<BookmarkSummary>>;
  deleteBookmark: (input: DeleteBookmarkInput) => Promise<OperationResult>;
  onDownloadUpdate: (handler: (payload: DownloadProgress) => void) => () => void;
  cancelDownload: (id: string) => Promise<OperationResult>;
  listExtensions: () => Promise<OperationResult<ExtensionSummary[]>>;
  loadExtension: () => Promise<OperationResult<LoadExtensionResult>>;
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

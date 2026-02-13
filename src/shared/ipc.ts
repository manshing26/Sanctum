export const IPC_CHANNELS = {
  openSettings: 'app:open-settings',
  closeSettings: 'app:close-settings',
  getVersion: 'app:get-version',
  createVaultPassword: 'auth:create-vault-password',
  unlockVault: 'auth:unlock-vault',
  lockVault: 'auth:lock-vault',
  getSession: 'auth:get-session',
  importFiles: 'vault:import-files',
  listItems: 'vault:list-items',
  getItemThumbnail: 'vault:get-item-thumbnail',
  pickFiles: 'vault:pick-files',
  clearAllVaultItems: 'vault:clear-all-items',
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

export type ItemThumbnail = {
  mimeType: string;
  base64Data: string;
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

export type ElectronAPI = {
  openSettings: () => Promise<void>;
  closeSettings: () => Promise<void>;
  appVersion: () => Promise<string>;
  createVaultPassword: (input: CreateVaultPasswordInput) => Promise<OperationResult>;
  unlockVault: (input: UnlockVaultInput) => Promise<OperationResult>;
  lockVault: () => Promise<OperationResult>;
  getSession: () => Promise<SessionState>;
  importFiles: (input: ImportRequest) => Promise<OperationResult<ImportResult>>;
  listItems: () => Promise<VaultItemSummary[]>;
  getItemThumbnail: (itemId: string) => Promise<OperationResult<ItemThumbnail>>;
  pickFiles: () => Promise<string[]>;
  clearAllVaultItems: () => Promise<OperationResult<{ deleted: number }>>;
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

export type AuthScreenMode = 'login' | 'create-account' | 'loading';

export type AuthFormValues = {
  password: string;
  confirmPassword?: string;
};

export type AuthFormErrors = {
  password?: string;
  confirmPassword?: string;
};

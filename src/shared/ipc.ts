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
  pickFiles: 'vault:pick-files',
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
};

export type ImportResult = {
  imported: number;
  failed: number;
  errors: string[];
};

export type OperationResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export type VaultItemSummary = {
  id: string;
  createdAt: string;
  size: number;
  mimeType: string;
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
  pickFiles: () => Promise<string[]>;
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

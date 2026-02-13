import React, { useEffect, useMemo, useState } from 'react';
import type {
  FolderNode,
  AuthFormErrors,
  AuthFormValues,
  CreateFolderInput,
  AuthScreenMode,
  ImportResult,
  SecuritySettings,
  SessionState,
  TagSummary,
  VaultItemSummary,
} from '../shared/ipc';

const PASSWORD_MIN_LENGTH = 12;

const getPasswordChecks = (password: string): string[] => {
  const failures: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    failures.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    failures.push('One uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    failures.push('One lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    failures.push('One number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    failures.push('One special character');
  }

  return failures;
};

const validateUnlock = (values: AuthFormValues): AuthFormErrors => {
  return {
    password: values.password ? undefined : 'Password is required.',
  };
};

const validateSetup = (values: AuthFormValues): AuthFormErrors => {
  const passwordChecks = getPasswordChecks(values.password);

  return {
    password:
      passwordChecks.length > 0
        ? `Password must include: ${passwordChecks.join(', ')}.`
        : undefined,
    confirmPassword:
      values.confirmPassword === values.password
        ? undefined
        : 'Passwords do not match.',
  };
};

const classNames = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

type FormCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

const FormCard = ({
  title,
  subtitle,
  children,
}: FormCardProps): React.JSX.Element => {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-soft">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
      <div className="mt-8 space-y-5">{children}</div>
    </div>
  );
};

type InputFieldProps = {
  id: string;
  label: string;
  type: 'password' | 'text';
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

const InputField = ({
  id,
  label,
  type,
  value,
  error,
  onChange,
}: InputFieldProps): React.JSX.Element => {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-text-primary">{label}</span>
      <input
        id={id}
        type={type}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={classNames(
          'w-full rounded-lg border bg-bg px-3 py-2 text-sm text-text-primary outline-none transition focus:ring-2',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20'
            : 'border-border focus:border-accent focus:ring-accent/25',
        )}
      />
      {error ? <span className="mt-2 block text-xs text-danger">{error}</span> : null}
    </label>
  );
};

const TopBar = ({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element => {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">privateVault</p>
        <p className="text-sm text-text-primary">Week 2 encryption and vault core</p>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition hover:border-accent hover:text-accent"
      >
        Open Settings
      </button>
    </header>
  );
};

const PrimaryButton = ({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}): React.JSX.Element => {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={classNames(
        'w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition',
        disabled
          ? 'cursor-not-allowed bg-border text-text-muted'
          : 'bg-accent text-accent-foreground hover:opacity-90 active:opacity-80',
      )}
    >
      {children}
    </button>
  );
};

type ThumbnailMap = Record<string, string>;

type FolderOption = {
  id: number;
  label: string;
};

const flattenFolderOptions = (folders: FolderNode[], depth = 0): FolderOption[] => {
  const options: FolderOption[] = [];
  const prefix = depth > 0 ? `${'  '.repeat(depth)}- ` : '';

  for (const folder of folders) {
    options.push({
      id: folder.id,
      label: `${prefix}${folder.name}`,
    });
    options.push(...flattenFolderOptions(folder.children, depth + 1));
  }

  return options;
};

const FolderTreeView = ({ folders }: { folders: FolderNode[] }): React.JSX.Element => {
  if (folders.length === 0) {
    return <p className="text-xs text-text-muted">No folders yet.</p>;
  }

  return (
    <ul className="space-y-1 text-xs text-text-muted">
      {folders.map((folder) => (
        <li key={folder.id}>
          <p>{folder.name}</p>
          {folder.children.length > 0 ? <FolderTreeView folders={folder.children} /> : null}
        </li>
      ))}
    </ul>
  );
};

const ItemList = ({
  items,
  thumbnails,
  folderOptions,
  tags,
  onAssignFolder,
  onToggleTag,
}: {
  items: VaultItemSummary[];
  thumbnails: ThumbnailMap;
  folderOptions: FolderOption[];
  tags: TagSummary[];
  onAssignFolder: (itemId: string, folderId: number | null) => Promise<void>;
  onToggleTag: (itemId: string, tagId: number, assigned: boolean) => Promise<void>;
}): React.JSX.Element => {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
        No items imported yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-text-muted"
        >
          {thumbnails[item.id] ? (
            <img
              src={thumbnails[item.id]}
              alt={item.originalName}
              className="mb-3 h-28 w-28 rounded-md border border-border object-cover"
            />
          ) : null}
          <p className="text-sm text-text-primary">{item.originalName}</p>
          <p className="break-all">ID: {item.id}</p>
          <label className="mt-2 block">
            <span className="mr-2 text-xs text-text-muted">Folder:</span>
            <select
              value={item.folderId ?? 'unfiled'}
              onChange={(event) => {
                const selectedValue = event.target.value;
                const nextFolderId = selectedValue === 'unfiled' ? null : Number(selectedValue);
                void onAssignFolder(item.id, nextFolderId);
              }}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
            >
              <option value="unfiled">Unfiled</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>
          <p>Path: {item.folderPath ?? 'Unfiled'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isAssigned = Boolean(item.tagIds?.includes(tag.id));
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => void onToggleTag(item.id, tag.id, isAssigned)}
                  className={classNames(
                    'rounded-md border px-2 py-1 text-xs',
                    isAssigned
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-muted',
                  )}
                >
                  {isAssigned ? `#${tag.name} x` : `+ #${tag.name}`}
                </button>
              );
            })}
          </div>
          <p>Tags: {item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'None'}</p>
          <p>{item.mimeType}</p>
          <p>{item.size} bytes</p>
          <p>
            {item.width ?? '-'} x {item.height ?? '-'}
          </p>
          <p>
            Duration:{' '}
            {item.durationSeconds !== undefined ? `${item.durationSeconds.toFixed(2)}s` : '-'}
          </p>
          <p>{item.createdAt}</p>
        </div>
      ))}
    </div>
  );
};

export const App = (): React.JSX.Element => {
  const [mode, setMode] = useState<AuthScreenMode>('loading');
  const [session, setSession] = useState<SessionState>({ status: 'locked', hasVault: false });
  const [message, setMessage] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [items, setItems] = useState<VaultItemSummary[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [thumbnails, setThumbnails] = useState<ThumbnailMap>({});
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<'root' | number>('root');
  const [importFolderId, setImportFolderId] = useState<'unfiled' | number>('unfiled');
  const [newTagName, setNewTagName] = useState('');
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    secureDeleteOnImport: false,
  });
  const [deleteOriginalsOverride, setDeleteOriginalsOverride] = useState<
    'default' | 'true' | 'false'
  >('default');
  const [isBusy, setIsBusy] = useState(false);

  const [unlockValues, setUnlockValues] = useState<AuthFormValues>({
    password: '',
  });

  const [setupValues, setSetupValues] = useState<AuthFormValues>({
    password: '',
    confirmPassword: '',
  });

  const unlockErrors = useMemo(() => validateUnlock(unlockValues), [unlockValues]);
  const setupErrors = useMemo(() => validateSetup(setupValues), [setupValues]);

  const canSubmitUnlock = !unlockErrors.password;
  const canSubmitSetup = !setupErrors.password && !setupErrors.confirmPassword;

  const loadFolders = async (): Promise<void> => {
    const foldersResult = await window.electronAPI.listFoldersTree();
    if (!foldersResult.ok) {
      setMessage(foldersResult.error);
      return;
    }

    setFolders(foldersResult.data);
    setFolderOptions(flattenFolderOptions(foldersResult.data));
  };

  const loadTags = async (): Promise<void> => {
    const tagsResult = await window.electronAPI.listTags();
    if (!tagsResult.ok) {
      setMessage(tagsResult.error);
      return;
    }

    setTags(tagsResult.data);
  };

  const loadItems = async (): Promise<VaultItemSummary[]> => {
    const listedItems = await window.electronAPI.listItems();
    setItems(listedItems);

    const thumbnailEntries = await Promise.all(
      listedItems
        .filter((item) => item.hasThumbnail)
        .map(async (item) => {
          const thumbnailResult = await window.electronAPI.getItemThumbnail(item.id);
          if (!thumbnailResult.ok) {
            return null;
          }

          return [
            item.id,
            `data:${thumbnailResult.data.mimeType};base64,${thumbnailResult.data.base64Data}`,
          ] as const;
        }),
    );

    const nextThumbnails: ThumbnailMap = {};
    for (const entry of thumbnailEntries) {
      if (!entry) {
        continue;
      }

      nextThumbnails[entry[0]] = entry[1];
    }

    setThumbnails(nextThumbnails);
    return listedItems;
  };

  const refreshSession = async (): Promise<SessionState> => {
    const state = await window.electronAPI.getSession();
    setSession(state);

    if (state.status === 'unlocked') {
      setMode('loading');
      await loadItems();
      await loadFolders();
      await loadTags();
      const securityResult = await window.electronAPI.getSecuritySettings();
      if (securityResult.ok) {
        setSecuritySettings(securityResult.data);
      }
    } else {
      setItems([]);
      setFolders([]);
      setTags([]);
      setFolderOptions([]);
      setThumbnails({});
      setImportResult(null);
      setMode(state.hasVault ? 'login' : 'create-account');
    }

    return state;
  };

  useEffect(() => {
    void refreshSession().then((state) => {
      if (state.status === 'unlocked') {
        setMode('loading');
      }
    });
  }, []);

  const openSettings = async (): Promise<void> => {
    await window.electronAPI.openSettings();
  };

  const handleUnlock = async (): Promise<void> => {
    setIsBusy(true);
    setMessage('');

    try {
      const unlockResult = await window.electronAPI.unlockVault({ password: unlockValues.password });
      if (!unlockResult.ok) {
        setMessage(unlockResult.error);
        return;
      }

      await refreshSession();
      setMode('loading');
      setMessage('Vault unlocked.');
      setUnlockValues({ password: '' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unlock failed.';
      setMessage(errorMessage);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateVaultPassword = async (): Promise<void> => {
    setIsBusy(true);
    setMessage('');

    try {
      const createResult = await window.electronAPI.createVaultPassword({
        password: setupValues.password,
      });
      if (!createResult.ok) {
        setMessage(createResult.error);
        return;
      }

      await refreshSession();
      setMode('loading');
      setMessage('Vault password set and vault unlocked.');
      setSetupValues({ password: '', confirmPassword: '' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Setup failed.';
      setMessage(errorMessage);
    } finally {
      setIsBusy(false);
    }
  };

  const handleLock = async (): Promise<void> => {
    const lockResult = await window.electronAPI.lockVault();
    if (!lockResult.ok) {
      setMessage(lockResult.error);
      return;
    }

    await refreshSession();
    setMessage('Vault locked.');
  };

  const handleImport = async (): Promise<void> => {
    setIsBusy(true);
    setMessage('');

    try {
      const selectedFiles = await window.electronAPI.pickFiles();
      if (selectedFiles.length === 0) {
        setMessage('No files selected.');
        return;
      }

      const importResultPayload = await window.electronAPI.importFiles({
        filePaths: selectedFiles,
        deleteOriginals:
          deleteOriginalsOverride === 'default'
            ? undefined
            : deleteOriginalsOverride === 'true',
        folderId: importFolderId === 'unfiled' ? null : importFolderId,
      });
      if (!importResultPayload.ok) {
        setMessage(importResultPayload.error);
        return;
      }

      const result = importResultPayload.data;
      setImportResult(result);
      await loadItems();
      setMessage(`Import complete: ${result.imported} imported, ${result.failed} failed.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Import failed.';
      setMessage(errorMessage);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRefreshItems = async (): Promise<void> => {
    try {
      const listedItems = await loadItems();
      await loadFolders();
      await loadTags();
      setMessage(`Refreshed. ${listedItems.length} item(s) loaded.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh items.';
      setMessage(errorMessage);
    }
  };

  const handleUpdateSecureDeleteDefault = async (
    secureDeleteOnImport: boolean,
  ): Promise<void> => {
    const updateResult = await window.electronAPI.updateSecuritySettings({
      secureDeleteOnImport,
    });

    if (!updateResult.ok) {
      setMessage(updateResult.error);
      return;
    }

    setSecuritySettings(updateResult.data);
    setMessage(
      `Default secure delete on import is now ${
        updateResult.data.secureDeleteOnImport ? 'enabled' : 'disabled'
      }.`,
    );
  };

  const handleCreateFolder = async (): Promise<void> => {
    const payload: CreateFolderInput = {
      name: newFolderName,
      parentId: newFolderParentId === 'root' ? null : newFolderParentId,
    };

    const createResult = await window.electronAPI.createFolder(payload);
    if (!createResult.ok) {
      setMessage(createResult.error);
      return;
    }

    setNewFolderName('');
    await loadFolders();
    setMessage('Folder created.');
  };

  const handleDeleteFolder = async (folderId: number): Promise<void> => {
    const deleteResult = await window.electronAPI.deleteFolder(folderId);
    if (!deleteResult.ok) {
      setMessage(deleteResult.error);
      return;
    }

    await loadFolders();
    await loadItems();
    setMessage('Folder deleted.');
  };

  const handleAssignFolder = async (itemId: string, folderId: number | null): Promise<void> => {
    const assignResult = await window.electronAPI.assignItemFolder({
      itemId,
      folderId,
    });
    if (!assignResult.ok) {
      setMessage(assignResult.error);
      return;
    }

    await loadItems();
  };

  const handleCreateTag = async (): Promise<void> => {
    const createResult = await window.electronAPI.createTag({ name: newTagName });
    if (!createResult.ok) {
      setMessage(createResult.error);
      return;
    }

    setNewTagName('');
    await loadTags();
    setMessage('Tag created.');
  };

  const handleDeleteTag = async (tagId: number): Promise<void> => {
    const deleteResult = await window.electronAPI.deleteTag(tagId);
    if (!deleteResult.ok) {
      setMessage(deleteResult.error);
      return;
    }

    await loadTags();
    await loadItems();
    setMessage('Tag deleted.');
  };

  const handleToggleTag = async (
    itemId: string,
    tagId: number,
    assigned: boolean,
  ): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignItemTag({ itemId, tagId })
      : await window.electronAPI.assignItemTag({ itemId, tagId });

    if (!response.ok) {
      setMessage(response.error);
      return;
    }

    await loadItems();
  };

  const isUnlocked = session.status === 'unlocked';

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <TopBar onOpenSettings={openSettings} />

      <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-5xl flex-col px-6 py-10">
        {message ? (
          <div className="mb-5 rounded-lg border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-accent">
            {message}
          </div>
        ) : null}

        {isUnlocked ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h1 className="text-xl font-semibold text-text-primary">Vault unlocked</h1>
              <p className="mt-2 text-sm text-text-muted">
                Encrypted storage is active. Import files to start building your vault.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isBusy}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Import Files
                </button>
                <button
                  type="button"
                  onClick={() => void handleRefreshItems()}
                  className="rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text-primary"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void handleLock()}
                  className="rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text-primary"
                >
                  Lock Vault
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-bg p-6">
              <p className="mb-3 text-sm text-text-muted">Imported items: {items.length}</p>

              <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                <p className="font-medium text-text-primary">Secure delete (dev hook)</p>
                <p className="mt-1">
                  Default setting: {securitySettings.secureDeleteOnImport ? 'On' : 'Off'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleUpdateSecureDeleteDefault(true)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                  >
                    Set Default On
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUpdateSecureDeleteDefault(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                  >
                    Set Default Off
                  </button>
                  <label className="text-xs">
                    Import override:
                    <select
                      value={deleteOriginalsOverride}
                      onChange={(event) =>
                        setDeleteOriginalsOverride(
                          event.target.value as 'default' | 'true' | 'false',
                        )
                      }
                      className="ml-2 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                    >
                      <option value="default">Use Default</option>
                      <option value="true">Force On</option>
                      <option value="false">Force Off</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                <p className="font-medium text-text-primary">Folders (beta)</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="New folder name"
                    className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                  />
                  <label className="text-xs">
                    Parent:
                    <select
                      value={newFolderParentId}
                      onChange={(event) =>
                        setNewFolderParentId(
                          event.target.value === 'root' ? 'root' : Number(event.target.value),
                        )
                      }
                      className="ml-2 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                    >
                      <option value="root">Root</option>
                      {folderOptions.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCreateFolder()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                  >
                    Create Folder
                  </button>
                </div>
                <div className="mt-3">
                  <FolderTreeView folders={folders} />
                </div>
                {folderOptions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {folderOptions.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => void handleDeleteFolder(folder.id)}
                        className="rounded-md border border-danger px-2 py-1 text-xs text-danger"
                      >
                        Delete {folder.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                <label className="text-xs">
                  Import target folder:
                  <select
                    value={importFolderId}
                    onChange={(event) =>
                      setImportFolderId(
                        event.target.value === 'unfiled' ? 'unfiled' : Number(event.target.value),
                      )
                    }
                    className="ml-2 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                  >
                    <option value="unfiled">Unfiled</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                <p className="font-medium text-text-primary">Tags (beta)</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    placeholder="New tag name"
                    className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateTag()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                  >
                    Create Tag
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.length === 0 ? (
                    <p className="text-xs text-text-muted">No tags yet.</p>
                  ) : (
                    tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => void handleDeleteTag(tag.id)}
                        className="rounded-md border border-danger px-2 py-1 text-xs text-danger"
                      >
                        Delete #{tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <ItemList
                items={items}
                thumbnails={thumbnails}
                folderOptions={folderOptions}
                tags={tags}
                onAssignFolder={handleAssignFolder}
                onToggleTag={handleToggleTag}
              />

              {importResult && importResult.errors.length > 0 ? (
                <div className="mt-4 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-xs text-danger">
                  {importResult.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : null}

              {importResult && importResult.warnings && importResult.warnings.length > 0 ? (
                <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">
                  {importResult.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isUnlocked && mode === 'login' ? (
          <div className="flex justify-center">
            <FormCard
              title="Unlock vault"
              subtitle="Enter your vault password to unlock local encrypted storage."
            >
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmitUnlock) {
                    return;
                  }

                  void handleUnlock();
                }}
              >
                <InputField
                  id="unlock-password"
                  label="Password"
                  type="password"
                  value={unlockValues.password}
                  error={unlockErrors.password}
                  onChange={(value) => setUnlockValues((prev) => ({ ...prev, password: value }))}
                />
                <PrimaryButton disabled={!canSubmitUnlock || isBusy}>Unlock Vault</PrimaryButton>
              </form>
            </FormCard>
          </div>
        ) : null}

        {!isUnlocked && mode === 'create-account' ? (
          <div className="flex justify-center">
            <FormCard
              title="Create vault password"
              subtitle="Set a strong password. It cannot be recovered if lost."
            >
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmitSetup) {
                    return;
                  }

                  void handleCreateVaultPassword();
                }}
              >
                <InputField
                  id="create-password"
                  label="Password"
                  type="password"
                  value={setupValues.password}
                  error={setupErrors.password}
                  onChange={(value) => setSetupValues((prev) => ({ ...prev, password: value }))}
                />
                <InputField
                  id="create-confirm-password"
                  label="Confirm password"
                  type="password"
                  value={setupValues.confirmPassword ?? ''}
                  error={setupErrors.confirmPassword}
                  onChange={(value) =>
                    setSetupValues((prev) => ({ ...prev, confirmPassword: value }))
                  }
                />
                <PrimaryButton disabled={!canSubmitSetup || isBusy}>Set Vault Password</PrimaryButton>
              </form>
            </FormCard>
          </div>
        ) : null}
      </main>
    </div>
  );
};

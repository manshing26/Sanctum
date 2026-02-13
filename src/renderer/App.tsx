import React, { useEffect, useMemo, useState } from 'react';
import type {
  AuthFormErrors,
  AuthFormValues,
  AuthScreenMode,
  ImportResult,
  SessionState,
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

const ItemList = ({ items }: { items: VaultItemSummary[] }): React.JSX.Element => {
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
          <p className="text-sm text-text-primary">{item.id}</p>
          <p>{item.mimeType}</p>
          <p>{item.size} bytes</p>
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

  const refreshSession = async (): Promise<SessionState> => {
    const state = await window.electronAPI.getSession();
    setSession(state);

    if (state.status === 'unlocked') {
      setMode('loading');
      const listedItems = await window.electronAPI.listItems();
      setItems(listedItems);
    } else {
      setItems([]);
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
      });
      if (!importResultPayload.ok) {
        setMessage(importResultPayload.error);
        return;
      }

      const result = importResultPayload.data;
      setImportResult(result);
      setItems(await window.electronAPI.listItems());
      setMessage(`Import complete: ${result.imported} imported, ${result.failed} failed.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Import failed.';
      setMessage(errorMessage);
    } finally {
      setIsBusy(false);
    }
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
                  onClick={() => void handleLock()}
                  className="rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text-primary"
                >
                  Lock Vault
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-bg p-6">
              <p className="mb-3 text-sm text-text-muted">Imported items: {items.length}</p>
              <ItemList items={items} />

              {importResult && importResult.errors.length > 0 ? (
                <div className="mt-4 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-xs text-danger">
                  {importResult.errors.map((error) => (
                    <p key={error}>{error}</p>
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

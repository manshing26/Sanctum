import React, { useEffect, useMemo, useState } from 'react';
import type { AuthFormErrors, AuthFormValues, AuthScreenMode, SessionState } from '../shared/ipc';
import { GalleryPage } from './features/gallery/GalleryPage';

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

const validateUnlock = (values: AuthFormValues): AuthFormErrors => ({
  password: values.password ? undefined : 'Password is required.',
});

const validateSetup = (values: AuthFormValues): AuthFormErrors => {
  const passwordChecks = getPasswordChecks(values.password);
  return {
    password:
      passwordChecks.length > 0
        ? `Password must include: ${passwordChecks.join(', ')}.`
        : undefined,
    confirmPassword:
      values.confirmPassword === values.password ? undefined : 'Passwords do not match.',
  };
};

const classNames = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

const TopBar = ({
  onOpenSettings,
  onOpenBrowser,
  isUnlocked,
}: {
  onOpenSettings: () => void;
  onOpenBrowser: () => void;
  isUnlocked: boolean;
}): React.JSX.Element => (
  <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-5">
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-text-muted">privateVault</p>
      <p className="text-sm text-text-primary">Gallery + Browser integration</p>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenBrowser}
        disabled={!isUnlocked}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        Browse Web
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition hover:border-accent hover:text-accent"
      >
        Open Settings
      </button>
    </div>
  </header>
);

const PrimaryButton = ({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}): React.JSX.Element => (
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

const InputField = ({
  id,
  label,
  type,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  type: 'password' | 'text';
  value: string;
  error?: string;
  onChange: (value: string) => void;
}): React.JSX.Element => (
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

const AuthCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.JSX.Element => (
  <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-soft">
    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
    <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
    <div className="mt-8 space-y-5">{children}</div>
  </div>
);

export const App = (): React.JSX.Element => {
  const [mode, setMode] = useState<AuthScreenMode>('loading');
  const [session, setSession] = useState<SessionState>({ status: 'locked', hasVault: false });
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const [unlockValues, setUnlockValues] = useState<AuthFormValues>({ password: '' });
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
    if (state.status !== 'unlocked') {
      setMode(state.hasVault ? 'login' : 'create-account');
    }
    return state;
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  const openSettings = async (): Promise<void> => {
    await window.electronAPI.openSettings();
  };

  const openBrowser = async (): Promise<void> => {
    const result = await refreshSession();
    if (result.status !== 'unlocked') {
      setMessage('Unlock vault before opening browser.');
      return;
    }

    await window.electronAPI.openBrowserWindow();
  };

  const handleUnlock = async (): Promise<void> => {
    setIsBusy(true);
    setMessage('');
    try {
      const result = await window.electronAPI.unlockVault({ password: unlockValues.password });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      await refreshSession();
      setMessage('Vault unlocked.');
      setUnlockValues({ password: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unlock failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateVaultPassword = async (): Promise<void> => {
    setIsBusy(true);
    setMessage('');
    try {
      const result = await window.electronAPI.createVaultPassword({
        password: setupValues.password,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      await refreshSession();
      setMessage('Vault password set and vault unlocked.');
      setSetupValues({ password: '', confirmPassword: '' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLock = async (): Promise<void> => {
    const result = await window.electronAPI.lockVault();
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    await refreshSession();
    setMessage('Vault locked.');
  };

  const isUnlocked = session.status === 'unlocked';

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <TopBar onOpenSettings={openSettings} onOpenBrowser={openBrowser} isUnlocked={isUnlocked} />

      <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1400px] flex-col px-6 py-6">
        {message ? (
          <div className="mb-4 rounded-lg border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-accent">
            {message}
          </div>
        ) : null}

        {isUnlocked ? (
          <GalleryPage onLockVault={handleLock} onMessage={setMessage} />
        ) : null}

        {!isUnlocked && mode === 'login' ? (
          <div className="flex justify-center pt-10">
            <AuthCard
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
            </AuthCard>
          </div>
        ) : null}

        {!isUnlocked && mode === 'create-account' ? (
          <div className="flex justify-center pt-10">
            <AuthCard
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
            </AuthCard>
          </div>
        ) : null}
      </main>
    </div>
  );
};

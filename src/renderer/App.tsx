import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Globe, Settings, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AuthScreenMode, SessionState } from '../shared/ipc';
import { Button } from './components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/Card';
import { Label } from './components/ui/Label';
import { PasswordInput } from './components/ui/PasswordInput';
import { Alert, AlertDescription } from './components/ui/Alert';
import { Spinner } from './components/ui/Spinner';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/Tooltip';
import { GalleryPage } from './features/gallery/GalleryPage';
import { SettingsPage } from './features/settings/SettingsPage';

const PASSWORD_MIN_LENGTH = 12;

interface PasswordCheck {
  label: string;
  met: boolean;
}

const getPasswordChecks = (password: string): PasswordCheck[] => [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
  { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'One lowercase letter', met: /[a-z]/.test(password) },
  { label: 'One number', met: /[0-9]/.test(password) },
  { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
];

// ── Top Bar ──────────────────────────────────────────────────────────
const TopBar: React.FC<{
  onOpenSettings: () => void;
  onOpenBrowser: () => void;
  onLockVault: () => void;
  isUnlocked: boolean;
}> = ({ onOpenSettings, onOpenBrowser, onLockVault, isUnlocked }) => (
  <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-border px-6 py-3">
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
        <Shield className="h-4 w-4 text-accent" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text-primary">privateVault</p>
        <p className="text-xs text-text-muted">Encrypted media vault</p>
      </div>
    </div>

    <div className="justify-self-center">
      {isUnlocked && (
        <Button
          variant="danger-solid"
          size="sm"
          onClick={onLockVault}
          className="gap-1.5 px-4 font-semibold shadow-soft"
          aria-label="Lock vault"
        >
          <Lock className="h-3.5 w-3.5" />
          Lock Vault
        </Button>
      )}
    </div>

    <div className="flex items-center justify-self-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenBrowser}
            disabled={!isUnlocked}
            aria-label="Open browser"
          >
            <Globe className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Browse Web</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
    </div>
  </header>
);

// ── Unlock Screen ────────────────────────────────────────────────────
const UnlockScreen: React.FC<{
  onUnlock: (password: string) => Promise<void>;
  isBusy: boolean;
  error: string;
}> = ({ onUnlock, isBusy, error }) => {
  const [password, setPassword] = useState('');
  const canSubmit = password.length > 0 && !isBusy;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
            <Lock className="h-6 w-6 text-accent" />
          </div>
          <CardTitle>Unlock Vault</CardTitle>
          <CardDescription>
            Enter your vault password to access encrypted storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) void onUnlock(password);
            }}
          >
            {error && (
              <Alert variant="danger">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="unlock-password">Password</Label>
              <PasswordInput
                id="unlock-password"
                placeholder="Enter vault password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!error}
                autoFocus
              />
            </div>

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Unlocking...
                </>
              ) : (
                'Unlock Vault'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Create Account Screen ────────────────────────────────────────────
const CreateAccountScreen: React.FC<{
  onCreate: (password: string) => Promise<void>;
  isBusy: boolean;
  error: string;
}> = ({ onCreate, isBusy, error }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const checks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordValid = checks.every((c) => c.met);
  const passwordsMatch = password === confirmPassword;
  const canSubmit = passwordValid && passwordsMatch && confirmPassword.length > 0 && !isBusy;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
            <Shield className="h-6 w-6 text-accent" />
          </div>
          <CardTitle>Create Vault Password</CardTitle>
          <CardDescription>
            Set a strong password to protect your encrypted vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) void onCreate(password);
            }}
          >
            {error && (
              <Alert variant="danger">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your password cannot be recovered if lost. Choose something memorable.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <PasswordInput
                id="create-password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showStrength
                autoFocus
              />
            </div>

            {/* Password requirements */}
            {password.length > 0 && (
              <div className="space-y-1">
                {checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-xs">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        check.met ? 'bg-success' : 'bg-border'
                      }`}
                    />
                    <span className={check.met ? 'text-text-muted' : 'text-text-muted/60'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <PasswordInput
                id="confirm-password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={confirmPassword.length > 0 && !passwordsMatch}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-danger">Passwords do not match.</p>
              )}
            </div>

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating vault...
                </>
              ) : (
                'Create Vault'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Loading Screen ───────────────────────────────────────────────────
const LoadingScreen: React.FC = () => (
  <div className="flex flex-1 items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-text-muted">Loading vault...</p>
    </div>
  </div>
);

// ── Main App ─────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const [mode, setMode] = useState<AuthScreenMode>('loading');
  const [session, setSession] = useState<SessionState>({ status: 'locked', hasVault: false });
  const [isBusy, setIsBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

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

  const openSettings = (): void => {
    setShowSettings(true);
  };

  const openBrowser = async (): Promise<void> => {
    const result = await refreshSession();
    if (result.status !== 'unlocked') {
      toast.error('Unlock vault before opening browser.');
      return;
    }
    await window.electronAPI.openBrowserWindow();
  };

  const handleUnlock = async (password: string): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      const result = await window.electronAPI.unlockVault({ password });
      if (!result.ok) {
        setAuthError(result.error);
        return;
      }
      await refreshSession();
      toast.success('Vault unlocked.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unlock failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreate = async (password: string): Promise<void> => {
    setIsBusy(true);
    setAuthError('');
    try {
      const result = await window.electronAPI.createVaultPassword({ password });
      if (!result.ok) {
        setAuthError(result.error);
        return;
      }
      await refreshSession();
      toast.success('Vault created and unlocked.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLock = async (): Promise<void> => {
    const result = await window.electronAPI.lockVault();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await refreshSession();
    toast.info('Vault locked.');
  };

  const isUnlocked = session.status === 'unlocked';

  return (
    <div className="flex h-screen flex-col bg-bg text-text-primary">
      <TopBar
        onOpenSettings={openSettings}
        onOpenBrowser={openBrowser}
        onLockVault={() => void handleLock()}
        isUnlocked={isUnlocked}
      />

      {mode === 'loading' && <LoadingScreen />}

      {isUnlocked && showSettings && (
        <SettingsPage onBack={() => setShowSettings(false)} />
      )}

      {isUnlocked && !showSettings && (
        <GalleryPage
          onMessage={(msg) => toast.info(msg)}
        />
      )}

      {!isUnlocked && mode === 'login' && (
        <UnlockScreen onUnlock={handleUnlock} isBusy={isBusy} error={authError} />
      )}

      {!isUnlocked && mode === 'create-account' && (
        <CreateAccountScreen onCreate={handleCreate} isBusy={isBusy} error={authError} />
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Shield,
  HardDrive,
  Info,
  Trash2,
  Palette,
  Globe,
  Timer,
  Monitor,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Switch';
import { Separator } from '../../components/ui/Separator';
import { Label } from '../../components/ui/Label';
import { Input } from '../../components/ui/Input';
import { Alert, AlertDescription } from '../../components/ui/Alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/Dialog';
import { ScrollArea } from '../../components/ui/ScrollArea';
import { cn } from '../../lib/utils';
import { PasswordInput } from '../../components/ui/PasswordInput';
import type { SecuritySettings, AppearanceSettings, BrowserSettings } from '../../../shared/ipc';

type SettingsCategory = 'security' | 'appearance' | 'browser' | 'storage' | 'about';

const NAV_ITEMS: { id: SettingsCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'about', label: 'About', icon: Info },
];

// ── Reusable setting row ─────────────────────────────────────────────
const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0 space-y-0.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-text-muted">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// ── Select component for settings ────────────────────────────────────
const SettingSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-8 rounded-md border border-border bg-bg px-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

const SettingSwitch: React.FC<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}> = ({ checked, onCheckedChange, onLabel = 'On', offLabel = 'Off' }) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        'inline-flex min-w-[46px] justify-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
        checked
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-border bg-bg text-text-muted',
      )}
      aria-live="polite"
    >
      {checked ? onLabel : offLabel}
    </span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

// ── Change Password Card ─────────────────────────────────────────────
const ChangePasswordCard: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const passwordsMatch = newPassword === confirmPassword;
  const newPasswordValid = newPassword.length >= 8;
  const canSubmit =
    currentPassword.length > 0 &&
    newPasswordValid &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    !isSubmitting;

  const stopTimer = (): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setProgress(null);
    setElapsedSeconds(0);
    setIsSubmitting(true);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
    }, 1000);

    const unsubscribe = window.electronAPI.onChangePasswordProgress((p) => {
      setProgress(p);
    });

    try {
      const result = await window.electronAPI.changePassword({ currentPassword, newPassword });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setProgress(null);
    } finally {
      unsubscribe();
      stopTimer();
      setIsSubmitting(false);
    }
  };

  const formatElapsed = (s: number): string => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4 text-text-muted" />
          Change Password
        </CardTitle>
        <CardDescription>
          Re-encrypts all vault data with the new password. You will remain logged in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">Current password</Label>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">New password</Label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              showStrength
              error={newPassword.length > 0 && !newPasswordValid}
              disabled={isSubmitting}
            />
            {newPassword.length > 0 && !newPasswordValid && (
              <p className="text-xs text-danger">Password must be at least 8 characters.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">Confirm new password</Label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              error={confirmPassword.length > 0 && !passwordsMatch}
              disabled={isSubmitting}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-danger">Passwords do not match.</p>
            )}
          </div>

          {isSubmitting && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  {pct !== null
                    ? `Re-encrypting files… ${progress!.processed} / ${progress!.total}`
                    : 'Verifying password…'}
                </span>
                <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: pct !== null ? `${pct}%` : '0%' }}
                />
              </div>
              {pct !== null && (
                <p className="text-right text-xs text-text-muted tabular-nums">{pct}%</p>
              )}
            </div>
          )}

          {error && (
            <Alert variant="danger">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="sm" disabled={!canSubmit} className="w-full">
            {isSubmitting ? 'Changing password…' : 'Change Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

// ── Security Settings ────────────────────────────────────────────────
const SecuritySection: React.FC = () => {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getSecuritySettings().then((result) => {
      if (result.ok) setSettings(result.data);
      setLoading(false);
    });
  }, []);

  const updateSetting = async (
    key: keyof SecuritySettings,
    value: SecuritySettings[keyof SecuritySettings],
  ): Promise<void> => {
    const result = await window.electronAPI.updateSecuritySettings({ [key]: value });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSettings(result.data);
    toast.success('Setting updated.');
  };

  if (loading || !settings) {
    return <p className="text-sm text-text-muted">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Security</h2>
        <p className="text-sm text-text-muted">Configure security and privacy settings for your vault.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <SettingRow
            label="Secure delete on import"
            description="Overwrite original files with 3-pass secure erase after importing to vault."
          >
            <SettingSwitch
              checked={settings.secureDeleteOnImport}
              onCheckedChange={(checked) => void updateSetting('secureDeleteOnImport', checked)}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <SettingRow
            label="Auto-lock timeout"
            description="Automatically lock the vault after a period of inactivity."
          >
            <div className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-text-muted" />
              <SettingSelect
                value={String(settings.autoLockMinutes)}
                onChange={(value) => void updateSetting('autoLockMinutes', Number(value))}
                options={[
                  { value: '0', label: 'Off' },
                  { value: '5', label: '5 min' },
                  { value: '10', label: '10 min' },
                  { value: '15', label: '15 min' },
                  { value: '30', label: '30 min' },
                  { value: '60', label: '60 min' },
                ]}
              />
            </div>
          </SettingRow>

          <Separator />

          <SettingRow
            label="Lock on minimize"
            description="Automatically lock the vault when the window is minimized."
          >
            <div className="flex items-center gap-2">
              <Monitor className="h-3.5 w-3.5 text-text-muted" />
              <SettingSwitch
                checked={settings.lockOnMinimize}
                onCheckedChange={(checked) => void updateSetting('lockOnMinimize', checked)}
              />
            </div>
          </SettingRow>
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
};

// ── Appearance Settings ──────────────────────────────────────────────
const AppearanceSection: React.FC = () => {
  const [settings, setSettings] = useState<AppearanceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getAppearanceSettings().then((result) => {
      if (result.ok) setSettings(result.data);
      setLoading(false);
    });
  }, []);

  const update = async (patch: Partial<AppearanceSettings>): Promise<void> => {
    const result = await window.electronAPI.updateAppearanceSettings(patch);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSettings(result.data);
    toast.success('Setting updated.');
  };

  if (loading || !settings) {
    return <p className="text-sm text-text-muted">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Appearance</h2>
        <p className="text-sm text-text-muted">Customize the look and feel of the gallery.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <SettingRow
            label="Thumbnail size"
            description="Size of thumbnail previews in the gallery grid."
          >
            <SettingSelect
              value={settings.thumbnailSize}
              onChange={(v) => void update({ thumbnailSize: v as AppearanceSettings['thumbnailSize'] })}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Grid density"
            description="Spacing between items in the gallery."
          >
            <SettingSelect
              value={settings.gridDensity}
              onChange={(v) => void update({ gridDensity: v as AppearanceSettings['gridDensity'] })}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'spacious', label: 'Spacious' },
              ]}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Default view"
            description="Default gallery layout when opening the app."
          >
            <SettingSelect
              value={settings.defaultView}
              onChange={(v) => void update({ defaultView: v as AppearanceSettings['defaultView'] })}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'list', label: 'List' },
              ]}
            />
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Browser Settings ─────────────────────────────────────────────────
const BrowserSection: React.FC = () => {
  const [settings, setSettings] = useState<BrowserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getBrowserSettings().then((result) => {
      if (result.ok) setSettings(result.data);
      setLoading(false);
    });
  }, []);

  const update = async (patch: Partial<BrowserSettings>): Promise<void> => {
    const result = await window.electronAPI.updateBrowserSettings(patch);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSettings(result.data);
    toast.success('Setting updated.');
  };

  if (loading || !settings) {
    return <p className="text-sm text-text-muted">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Browser</h2>
        <p className="text-sm text-text-muted">Configure the built-in private browser.</p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <SettingRow
            label="Clear data on exit"
            description="Clear browsing data (cookies, cache, history) when closing the browser."
          >
            <SettingSwitch
              checked={settings.clearOnExit}
              onCheckedChange={(checked) => void update({ clearOnExit: checked })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Block pop-ups"
            description="Prevent websites from opening pop-up windows."
          >
            <SettingSwitch
              checked={settings.blockPopups}
              onCheckedChange={(checked) => void update({ blockPopups: checked })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Block third-party cookies (may break some sites)"
            description="Block cookies from domains other than the current page. Can cause login/challenge loops on anti-bot protected websites."
          >
            <SettingSwitch
              checked={settings.blockThirdPartyCookies}
              onCheckedChange={(checked) => void update({ blockThirdPartyCookies: checked })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Homepage URL"
            description="URL to load when opening a new browser tab."
          >
            <Input
              value={settings.homepage}
              onChange={(e) => void update({ homepage: e.target.value })}
              placeholder="about:blank"
              className="h-8 w-48 text-xs"
            />
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Storage Settings ─────────────────────────────────────────────────
const StorageSection: React.FC = () => {
  const [showWipeDialog, setShowWipeDialog] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const handleWipeVault = async (): Promise<void> => {
    setIsWiping(true);
    try {
      const result = await window.electronAPI.clearAllVaultItems();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${result.data.deleted} items from vault.`);
      setShowWipeDialog(false);
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Storage</h2>
        <p className="text-sm text-text-muted">Manage vault storage and data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vault Data</CardTitle>
          <CardDescription>
            All files are stored encrypted with AES-256-GCM in your local vault directory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="danger-solid"
            size="sm"
            onClick={() => setShowWipeDialog(true)}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete All Vault Items
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showWipeDialog} onOpenChange={setShowWipeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Vault Items</DialogTitle>
            <DialogDescription>
              This will permanently delete all encrypted files, thumbnails, and metadata from your vault. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowWipeDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="danger-solid"
              onClick={() => void handleWipeVault()}
              disabled={isWiping}
            >
              {isWiping ? 'Deleting...' : 'Delete Everything'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── About Section ────────────────────────────────────────────────────
const AboutSection: React.FC = () => {
  const [version, setVersion] = useState('...');

  useEffect(() => {
    void window.electronAPI.appVersion().then(setVersion);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">About</h2>
        <p className="text-sm text-text-muted">Application information.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Application</span>
            <span className="text-sm font-medium text-text-primary">privateVault</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Version</span>
            <span className="text-sm font-medium text-text-primary">{version}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Encryption</span>
            <span className="text-sm font-medium text-text-primary">AES-256-GCM</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Key Derivation</span>
            <span className="text-sm font-medium text-text-primary">Argon2id</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Platform</span>
            <span className="text-sm font-medium text-text-primary">Electron + React</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Settings Page ────────────────────────────────────────────────────
export const SettingsPage: React.FC = () => {
  const [category, setCategory] = useState<SettingsCategory>('security');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar navigation */}
        <nav className="w-48 shrink-0 border-r border-border p-2">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    category === item.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content area */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-2xl p-6">
            {category === 'security' && <SecuritySection />}
            {category === 'appearance' && <AppearanceSection />}
            {category === 'browser' && <BrowserSection />}
            {category === 'storage' && <StorageSection />}
            {category === 'about' && <AboutSection />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

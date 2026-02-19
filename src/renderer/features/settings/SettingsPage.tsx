import React, { useEffect, useState } from 'react';
import {
  Shield,
  HardDrive,
  Info,
  Trash2,
  AlertTriangle,
  Palette,
  Globe,
  Timer,
  Monitor,
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

  const updateSetting = async (key: keyof SecuritySettings, value: boolean): Promise<void> => {
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
            <Switch
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
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Timer className="h-3.5 w-3.5" />
              Coming soon
            </div>
          </SettingRow>

          <Separator />

          <SettingRow
            label="Lock on minimize"
            description="Automatically lock the vault when the window is minimized."
          >
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Monitor className="h-3.5 w-3.5" />
              Coming soon
            </div>
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Vault Password</CardTitle>
          <CardDescription>
            Your vault is protected by an Argon2id-derived encryption key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Password change is not yet available. This feature is planned for a future update.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
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
            <Switch
              checked={settings.clearOnExit}
              onCheckedChange={(checked) => void update({ clearOnExit: checked })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Block pop-ups"
            description="Prevent websites from opening pop-up windows."
          >
            <Switch
              checked={settings.blockPopups}
              onCheckedChange={(checked) => void update({ blockPopups: checked })}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Block third-party cookies"
            description="Block cookies from domains other than the page you're visiting."
          >
            <Switch
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

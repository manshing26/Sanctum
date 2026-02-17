import React, { useEffect, useState } from 'react';
import {
  Shield,
  HardDrive,
  Info,
  ArrowLeft,
  Trash2,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Switch';
import { Separator } from '../../components/ui/Separator';
import { Label } from '../../components/ui/Label';
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
import type { SecuritySettings } from '../../../shared/ipc';

type SettingsCategory = 'security' | 'storage' | 'about';

type SettingsPageProps = {
  onBack: () => void;
};

const NAV_ITEMS: { id: SettingsCategory; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'about', label: 'About', icon: Info },
];

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
        <CardContent className="space-y-4 pt-6">
          {/* Secure delete on import */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Secure delete on import</Label>
              <p className="text-xs text-text-muted">
                Overwrite original files with 3-pass secure erase after importing to vault.
              </p>
            </div>
            <Switch
              checked={settings.secureDeleteOnImport}
              onCheckedChange={(checked) => void updateSetting('secureDeleteOnImport', checked)}
            />
          </div>
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
export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [category, setCategory] = useState<SettingsCategory>('security');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-text-primary">Settings</h1>
      </div>

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
            {category === 'storage' && <StorageSection />}
            {category === 'about' && <AboutSection />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

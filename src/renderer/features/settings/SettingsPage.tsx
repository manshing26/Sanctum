import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RestoreCountdownDialog } from '../../components/ui/RestoreCountdownDialog';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { SanctumConfirmDialog, SanctumDialog } from '../../components/ui';
import type { AuthAuditEntry, SecuritySettings, AppearanceSettings, BrowserSettings, BackupProgress, RestoreProgress, VaultHealthReport, VaultStorageSummary } from '../../../shared/ipc';
import { VAULT_PASSWORD_MIN_LENGTH, isVaultPasswordLongEnough } from '../../../shared/authPolicy';
import type { SearchEngineId } from '../../../shared/browserSearch';
import { validateCustomSearchTemplate } from '../../../shared/browserSearch';
import { applyTextScale, fontSize } from '../../theme/typography';

// ── Design tokens ────────────────────────────────────────────────────
const T = {
  bg:          '#0a0c0b',
  bg2:         '#10110f',
  line:        'rgba(220,220,200,0.07)',
  line2:       'rgba(220,220,200,0.12)',
  text:        '#e8e6dc',
  mute:        '#79817a',
  mute2:       '#4d524d',
  accent:      '#7c9a92',
  accentGlow:  'rgba(124,154,146,0.12)',
  danger:      '#c36b5f',
  dangerGlow:  'rgba(195,107,95,0.10)',
  warn:        '#c08a5e',
  success:     '#6a9e7f',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

const formatAuditTimestamp = (value: string): string => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = `${value.includes('T') ? value : value.replace(' ', 'T')}${hasTimezone ? '' : 'Z'}`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const auditEventLabel = (eventType: AuthAuditEntry['eventType']): string => {
  switch (eventType) {
    case 'change_password':
      return 'Password';
    case 'delete_all_vault_items':
      return 'Delete All';
    case 'restore_vault':
      return 'Restore';
    case 'repair_vault':
      return 'Repair';
    case 'unlock':
    default:
      return 'Unlock';
  }
};

// ── Nav items ────────────────────────────────────────────────────────
type SettingsCategory = 'security' | 'appearance' | 'browser' | 'storage' | 'about';

const NAV_ITEMS: { id: SettingsCategory; label: string; roman: string; icon: React.ReactNode }[] = [
  {
    id: 'security', label: 'Security', roman: 'i',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 1L2 3.5v4C2 10.5 4.5 13 7 13s5-2.5 5-5.5v-4L7 1z"/>
      </svg>
    ),
  },
  {
    id: 'appearance', label: 'Appearance', roman: 'ii',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5.5"/>
        <path d="M7 1.5v11M1.5 7h11"/>
      </svg>
    ),
  },
  {
    id: 'browser', label: 'Browser', roman: 'iii',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="11" height="11"/>
        <line x1="1.5" y1="5" x2="12.5" y2="5"/>
        <circle cx="4" cy="3.25" r="0.6" fill="currentColor" stroke="none"/>
        <circle cx="6" cy="3.25" r="0.6" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'storage', label: 'Storage', roman: 'iv',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="7" cy="4" rx="5" ry="2"/>
        <path d="M2 4v6c0 1.1 2.24 2 5 2s5-.9 5-2V4"/>
        <path d="M2 7c0 1.1 2.24 2 5 2s5-.9 5-2"/>
      </svg>
    ),
  },
  {
    id: 'about', label: 'About', roman: 'v',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5.5"/>
        <line x1="7" y1="6" x2="7" y2="10"/>
        <circle cx="7" cy="4" r="0.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
];

// ── Shared primitives ────────────────────────────────────────────────
const SectionHeading: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <div style={{ marginBottom: 24 }}>
    <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(26), letterSpacing: '-0.02em', color: T.text, margin: '0 0 4px' }}>{title}</h2>
    <p style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', color: T.mute2, margin: 0 }}>{sub}</p>
  </div>
);

const SettingCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ border: `1px solid ${T.line2}`, background: T.bg2 }}>
    {children}
  </div>
);

const CardSection: React.FC<{ title?: string; description?: string; children?: React.ReactNode; noPad?: boolean }> = ({ title, description, children, noPad }) => (
  <div style={{ borderBottom: `1px solid ${T.line}`, padding: noPad ? 0 : '16px 20px' }}>
    {(title || description) && (
      <div style={{ marginBottom: children ? 12 : 0 }}>
        {title && <p style={{ fontFamily: MONO, fontSize: fontSize(11), letterSpacing: '0.04em', color: T.text, margin: '0 0 2px' }}>{title}</p>}
        {description && <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.5 }}>{description}</p>}
      </div>
    )}
    {children}
  </div>
);

const SettingRow: React.FC<{ label: string; description?: string; children: React.ReactNode; last?: boolean }> = ({ label, description, children, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    padding: '12px 20px',
    borderBottom: last ? 'none' : `1px solid ${T.line}`,
  }}>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.text, margin: '0 0 2px' }}>{label}</p>
      {description && <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.5 }}>{description}</p>}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, margin: '0 0 6px' }}>{children}</p>
);

const SanctumSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      height: 30,
      padding: '0 10px',
      background: T.bg,
      border: `1px solid ${T.line2}`,
      color: T.text,
      fontFamily: MONO,
      fontSize: fontSize(11),
      cursor: 'pointer',
      outline: 'none',
    }}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value} style={{ background: T.bg }}>{o.label}</option>
    ))}
  </select>
);

const SanctumSwitch: React.FC<{ checked: boolean; onCheckedChange: (v: boolean) => void }> = ({ checked, onCheckedChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange(!checked)}
    style={{
      width: 36, height: 20,
      background: checked ? T.accent : T.line2,
      border: `1px solid ${checked ? T.accent : T.line2}`,
      position: 'relative',
      cursor: 'pointer',
      padding: 0,
      transition: 'background 0.15s',
    }}
  >
    <span style={{
      position: 'absolute',
      top: 2, left: checked ? 17 : 2,
      width: 14, height: 14,
      background: checked ? T.bg : T.mute,
      transition: 'left 0.15s',
    }} />
  </button>
);

const SanctumInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    style={{
      height: 32,
      padding: '0 10px',
      background: T.bg,
      border: `1px solid ${T.line2}`,
      color: T.text,
      fontFamily: MONO,
      fontSize: fontSize(11),
      outline: 'none',
      width: '100%',
      ...props.style,
    }}
  />
);

const PrimaryBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { full?: boolean }> = ({ full, style, children, ...props }) => (
  <button
    type="button"
    {...props}
    style={{
      height: 36,
      padding: '0 18px',
      background: props.disabled ? 'rgba(124,154,146,0.15)' : T.accent,
      border: `1px solid ${props.disabled ? T.line2 : T.accent}`,
      color: props.disabled ? T.mute : T.bg,
      fontFamily: MONO,
      fontSize: fontSize(11),
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      width: full ? '100%' : undefined,
      ...style,
    }}
  >
    {children}
  </button>
);

const SecondaryBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, children, ...props }) => (
  <button
    type="button"
    {...props}
    style={{
      height: 32,
      padding: '0 14px',
      background: 'none',
      border: `1px solid ${T.line2}`,
      color: props.disabled ? T.mute2 : T.mute,
      fontFamily: MONO,
      fontSize: fontSize(11),
      letterSpacing: '0.04em',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
      ...style,
    }}
  >
    {children}
  </button>
);

const DangerBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, children, ...props }) => (
  <button
    type="button"
    {...props}
    style={{
      height: 32,
      padding: '0 14px',
      background: T.dangerGlow,
      border: `1px solid ${T.danger}`,
      color: T.danger,
      fontFamily: MONO,
      fontSize: fontSize(11),
      letterSpacing: '0.04em',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
      ...style,
    }}
  >
    {children}
  </button>
);

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ padding: '8px 12px', background: T.dangerGlow, border: `1px solid ${T.danger}`, fontFamily: MONO, fontSize: fontSize(10), color: T.danger }}>
    {message}
  </div>
);

const ProgressBar: React.FC<{ pct: number; label: string }> = ({ pct, label }) => (
  <div style={{ padding: '10px 12px', border: `1px solid ${T.line2}`, background: T.bg }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>{pct}%</span>
    </div>
    <div style={{ height: 2, background: T.line2 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: T.accent, transition: 'width 0.2s' }} />
    </div>
  </div>
);

const healthProblemCount = (report: VaultHealthReport | null): number => {
  if (!report) return 0;
  return Object.values(report.counts).reduce((total, value) => total + value, 0);
};

const healthSummaryText = (report: VaultHealthReport): string => {
  if (report.status === 'ok') return 'No vault data problems detected.';
  if (report.status === 'malformed_database') return 'The database needs rebuild recovery.';
  const parts = [
    report.counts.files ? `${report.counts.files} file${report.counts.files === 1 ? '' : 's'}` : '',
    report.counts.bookmarks ? `${report.counts.bookmarks} bookmark${report.counts.bookmarks === 1 ? '' : 's'}` : '',
    report.counts.notes ? `${report.counts.notes} note${report.counts.notes === 1 ? '' : 's'}` : '',
    report.counts.passwords ? `${report.counts.passwords} password${report.counts.passwords === 1 ? '' : 's'}` : '',
    report.counts.thumbnails ? `${report.counts.thumbnails} thumbnail${report.counts.thumbnails === 1 ? '' : 's'}` : '',
    report.counts.orphanRows ? `${report.counts.orphanRows} orphan row${report.counts.orphanRows === 1 ? '' : 's'}` : '',
    report.counts.orphanBlobs ? `${report.counts.orphanBlobs} orphan blob${report.counts.orphanBlobs === 1 ? '' : 's'}` : '',
    report.counts.folderReferences ? `${report.counts.folderReferences} folder reference${report.counts.folderReferences === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `Found ${parts.join(', ')}.` : 'Corrupted vault data was detected.';
};

const formatStorageSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

// ── Change Password ──────────────────────────────────────────────────
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
  const newPasswordValid = isVaultPasswordLongEnough(newPassword);
  const canSubmit = currentPassword.length > 0 && newPasswordValid && confirmPassword.length > 0 && passwordsMatch && !isSubmitting;

  const stopTimer = (): void => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null); setProgress(null); setElapsedSeconds(0); setIsSubmitting(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
    }, 1000);
    const unsubscribe = window.electronAPI.onChangePasswordProgress((p) => setProgress(p));
    try {
      const result = await window.electronAPI.changePassword({ currentPassword, newPassword });
      if (!result.ok) { setError(result.error); return; }
      toast.success('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setProgress(null);
    } finally {
      unsubscribe(); stopTimer(); setIsSubmitting(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : null;

  return (
    <SettingCard>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.line}` }}>
        <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.text, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={T.mute} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="6" r="3"/><path d="M4 9.5V13h6v-3.5"/>
          </svg>
          Change Password
        </p>
        <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>Re-encrypts all vault data with the new password. You will remain logged in.</p>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <FieldLabel>Current password</FieldLabel>
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" autoComplete="current-password" disabled={isSubmitting} />
        </div>
        <div>
          <FieldLabel>New password</FieldLabel>
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" autoComplete="new-password" showStrength error={newPassword.length > 0 && !newPasswordValid} disabled={isSubmitting} />
          {newPassword.length > 0 && !newPasswordValid && (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, marginTop: 4 }}>Minimum {VAULT_PASSWORD_MIN_LENGTH} characters.</p>
          )}
        </div>
        <div>
          <FieldLabel>Confirm new password</FieldLabel>
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" error={confirmPassword.length > 0 && !passwordsMatch} disabled={isSubmitting} />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, marginTop: 4 }}>Passwords do not match.</p>
          )}
        </div>

        {isSubmitting && (
          <ProgressBar
            pct={pct ?? 0}
            label={pct !== null ? `Re-encrypting… ${progress!.processed} / ${progress!.total}` : `Verifying… ${elapsedSeconds}s`}
          />
        )}
        {error && <ErrorBanner message={error} />}

        <PrimaryBtn type="submit" disabled={!canSubmit} full>
          {isSubmitting ? 'Changing password…' : 'Change Password'}
        </PrimaryBtn>
      </form>
    </SettingCard>
  );
};

// ── Security ─────────────────────────────────────────────────────────
const SecuritySection: React.FC = () => {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuthAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [confirmClearAudit, setConfirmClearAudit] = useState(false);
  const [clearingAudit, setClearingAudit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getSecuritySettings().then((r) => { if (r.ok) setSettings(r.data); setLoading(false); });
    void window.electronAPI.listAuthAuditLog().then((r) => {
      if (r.ok) {
        setAuditEntries(r.data);
        setAuditError(null);
      } else {
        setAuditError(r.error);
      }
      setAuditLoading(false);
    });
  }, []);

  const update = async (key: keyof SecuritySettings, value: SecuritySettings[keyof SecuritySettings]): Promise<void> => {
    const r = await window.electronAPI.updateSecuritySettings({ [key]: value });
    if (!r.ok) { toast.error(r.error); return; }
    setSettings(r.data);
    toast.success('Setting updated.');
  };

  const handleClearAudit = async (): Promise<void> => {
    setClearingAudit(true);
    const result = await window.electronAPI.clearAuthAuditLog();
    setClearingAudit(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAuditEntries([]);
    setConfirmClearAudit(false);
    toast.success('Audit records deleted.');
  };

  if (loading || !settings) return <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.mute }}>Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading title="Security" sub="Configure security and privacy settings for your vault." />

      <SettingCard>
        <SettingRow label="Auto-lock timeout" description="Automatically lock the vault after a period of inactivity.">
          <SanctumSelect
            value={String(settings.autoLockMinutes)}
            onChange={(v) => void update('autoLockMinutes', Number(v))}
            options={[
              { value: '0', label: 'Off' },
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' },
              { value: '60', label: '60 min' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Lock on minimize" description="Automatically lock the vault when the window is minimized.">
          <SanctumSwitch checked={settings.lockOnMinimize} onCheckedChange={(v) => void update('lockOnMinimize', v)} />
        </SettingRow>
        <SettingRow label="Lock when computer locks or sleeps" description="Automatically lock the vault when the OS session locks or the computer enters sleep.">
          <SanctumSwitch checked={settings.lockOnSystemSleepOrLock} onCheckedChange={(v) => void update('lockOnSystemSleepOrLock', v)} />
        </SettingRow>
        <SettingRow label="Minimize after lock" description="Automatically minimize Sanctum after the vault locks.">
          <SanctumSwitch checked={settings.minimizeOnLock} onCheckedChange={(v) => void update('minimizeOnLock', v)} />
        </SettingRow>
        <SettingRow label="Lock shortcut" description="Cmd/Ctrl + Shift + L locks Sanctum." last>
          <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>Enabled</span>
        </SettingRow>
      </SettingCard>

      <ChangePasswordCard />

      <SettingCard>
        <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: fontSize(11), letterSpacing: '0.04em', color: T.text, margin: '0 0 2px' }}>Audit</p>
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.5 }}>Recent security events.</p>
          </div>
          {auditEntries.length > 0 && (
            <DangerBtn
              type="button"
              onClick={() => setConfirmClearAudit(true)}
              style={{ height: 26, padding: '0 10px', fontSize: fontSize(9), flexShrink: 0 }}
            >
              Delete All
            </DangerBtn>
          )}
        </div>
        <CardSection noPad>
          <div style={{ padding: '12px 20px 16px' }}>
          {auditLoading ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>Loading…</p>
          ) : auditError ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, margin: 0 }}>{auditError}</p>
          ) : auditEntries.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>No login records yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px, 1fr) auto auto minmax(110px, 1.2fr)',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 10px',
                      border: `1px solid ${T.line}`,
                      background: T.bg,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatAuditTimestamp(entry.createdAt)}
                    </span>
                    <span
                      style={{
                        padding: '2px 7px',
                        border: `1px solid ${T.line2}`,
                        color: T.mute,
                        background: T.bg2,
                        fontFamily: MONO,
                        fontSize: fontSize(9),
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {auditEventLabel(entry.eventType)}
                    </span>
                    <span
                      style={{
                        padding: '2px 7px',
                        border: `1px solid ${entry.success ? T.success : T.danger}`,
                        color: entry.success ? T.success : T.danger,
                        background: entry.success ? 'rgba(106,158,127,0.10)' : T.dangerGlow,
                        fontFamily: MONO,
                        fontSize: fontSize(9),
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {entry.success ? 'Success' : 'Failed'}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, margin: 0 }}>
                Showing latest {auditEntries.length} record{auditEntries.length === 1 ? '' : 's'}.
              </p>
            </div>
          )}
          </div>
        </CardSection>
      </SettingCard>

      <SanctumConfirmDialog
        open={confirmClearAudit}
        onOpenChange={setConfirmClearAudit}
        title="Delete all audit records?"
        description="This clears only the Security audit log. Vault items and settings are not affected."
        variant="danger"
        confirmLabel={clearingAudit ? 'Deleting...' : 'Delete All'}
        busy={clearingAudit}
        onConfirm={handleClearAudit}
        zIndex={100}
      />
    </div>
  );
};

// ── Appearance ───────────────────────────────────────────────────────
const AppearanceSection: React.FC = () => {
  const [settings, setSettings] = useState<AppearanceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getAppearanceSettings().then((r) => { if (r.ok) setSettings(r.data); setLoading(false); });
  }, []);

  const update = async (patch: Partial<AppearanceSettings>): Promise<void> => {
    const r = await window.electronAPI.updateAppearanceSettings(patch);
    if (!r.ok) { toast.error(r.error); return; }
    setSettings(r.data);
    applyTextScale(r.data.textSize);
    toast.success('Setting updated.');
  };

  if (loading || !settings) return <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.mute }}>Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading title="Appearance" sub="Customize the look and feel of the gallery." />

      <SettingCard>
        <SettingRow label="Text size" description="Scale app text while keeping thumbnails and layout density unchanged.">
          <SanctumSelect
            value={settings.textSize}
            onChange={(v) => void update({ textSize: v as AppearanceSettings['textSize'] })}
            options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
          />
        </SettingRow>
        <SettingRow label="Thumbnail size" description="Size of thumbnail previews in the gallery grid.">
          <SanctumSelect
            value={settings.thumbnailSize}
            onChange={(v) => void update({ thumbnailSize: v as AppearanceSettings['thumbnailSize'] })}
            options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
          />
        </SettingRow>
        <SettingRow label="Default view" description="Default gallery layout when opening the app." last>
          <SanctumSelect
            value={settings.defaultView}
            onChange={(v) => void update({ defaultView: v as AppearanceSettings['defaultView'] })}
            options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]}
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
};

// ── Browser ──────────────────────────────────────────────────────────
const BrowserSection: React.FC = () => {
  const [settings, setSettings] = useState<BrowserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [customTemplateError, setCustomTemplateError] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI.getBrowserSettings().then((r) => { if (r.ok) setSettings(r.data); setLoading(false); });
  }, []);

  const update = async (patch: Partial<BrowserSettings>): Promise<void> => {
    const r = await window.electronAPI.updateBrowserSettings(patch);
    if (!r.ok) { toast.error(r.error); return; }
    setSettings(r.data);
    toast.success('Setting updated.');
  };
  const updateCustomSearchTemplate = async (value: string): Promise<void> => {
    const error = validateCustomSearchTemplate(value);
    setCustomTemplateError(error);
    if (error) return;
    await update({ customSearchTemplate: value });
  };

  if (loading || !settings) return <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.mute }}>Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading title="Browser" sub="Configure the built-in private browser." />

      <SettingCard>
        <SettingRow label="Clear data on exit" description="Clear browsing data (cookies, cache, history) when closing the browser.">
          <SanctumSwitch checked={settings.clearOnExit} onCheckedChange={(v) => void update({ clearOnExit: v })} />
        </SettingRow>
        <SettingRow label="Block third-party cookies" description="Block cookies from domains other than the current page. Can cause login loops on some sites.">
          <SanctumSwitch checked={settings.blockThirdPartyCookies} onCheckedChange={(v) => void update({ blockThirdPartyCookies: v })} />
        </SettingRow>
        <SettingRow label="Default search engine" description="Used when the address bar text is not a URL." last={settings.searchEngine !== 'custom'}>
          <SanctumSelect
            value={settings.searchEngine}
            onChange={(v) => void update({ searchEngine: v as SearchEngineId })}
            options={[
              { value: 'duckduckgo', label: 'DuckDuckGo' },
              { value: 'brave', label: 'Brave Search' },
              { value: 'google', label: 'Google' },
              { value: 'bing', label: 'Bing' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </SettingRow>
        {settings.searchEngine === 'custom' && (
          <SettingRow label="Custom search URL" description="Use {query} where the search text should be inserted." last>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <SanctumInput
                value={settings.customSearchTemplate}
                onChange={(e) => {
                  const value = e.target.value;
                  setSettings((prev) => prev ? { ...prev, customSearchTemplate: value } : prev);
                  setCustomTemplateError(validateCustomSearchTemplate(value));
                }}
                onBlur={(e) => void updateCustomSearchTemplate(e.target.value)}
                placeholder="https://example.com/search?q={query}"
                style={{ width: 280 }}
              />
              {customTemplateError && (
                <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.danger }}>{customTemplateError}</span>
              )}
            </div>
          </SettingRow>
        )}
      </SettingCard>
    </div>
  );
};

// ── Backup Card ──────────────────────────────────────────────────────
const BackupCard: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBackup = async (): Promise<void> => {
    setSuccessPath(null); setErrorMsg(null);
    const outputPath = await window.electronAPI.pickBackupSavePath();
    if (!outputPath) return;
    setIsRunning(true); setProgress(null);
    const unsub = window.electronAPI.onBackupProgress((p) => setProgress(p));
    try {
      const result = await window.electronAPI.backupVault({ outputPath });
      if (result.ok) setSuccessPath(outputPath); else setErrorMsg(result.error);
    } finally { unsub(); setIsRunning(false); setProgress(null); }
  };

  const pct = progress
    ? progress.phase === 'complete'
      ? 100
      : progress.totalBytes && progress.totalBytes > 0
        ? Math.min(99, Math.floor(((progress.processedBytes ?? 0) / progress.totalBytes) * 100))
        : progress.total > 0
          ? Math.min(99, Math.floor((progress.processed / progress.total) * 100))
          : 0
    : 0;
  const progressLabel = progress?.phase === 'preparing'
    ? 'Preparing backup...'
    : progress?.phase === 'finalizing'
      ? 'Finalizing backup...'
      : progress
        ? progress.totalBytes && progress.totalBytes > 0
          ? `Backing up ${formatStorageSize(progress.processedBytes ?? 0)} / ${formatStorageSize(progress.totalBytes)}...`
          : `Backing up ${progress.processed} / ${progress.total} entries...`
        : '';

  return (
    <SettingCard>
      <CardSection title="Backup Vault" description="Create an encrypted backup with files, bookmarks, notes, passwords, folders, tags, and metadata.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SecondaryBtn onClick={() => void handleBackup()} disabled={isRunning}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="1.5" width="11" height="11"/><polyline points="4.5,7 7,9.5 9.5,7"/><line x1="7" y1="4" x2="7" y2="9.5"/>
            </svg>
            {isRunning ? 'Backing up…' : 'Create Backup'}
          </SecondaryBtn>
          {isRunning && progress && <ProgressBar pct={pct} label={progressLabel} />}
          {successPath && !isRunning && (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.success, wordBreak: 'break-all' }}>Saved to {successPath}</p>
          )}
          {errorMsg && !isRunning && <ErrorBanner message={errorMsg} />}
        </div>
      </CardSection>
    </SettingCard>
  );
};

const RestoreCard: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [password, setPassword] = useState('');
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePickFile = async (): Promise<void> => {
    const picked = await window.electronAPI.pickRestoreFile();
    if (!picked) return;
    setBackupPath(picked); setPassword(''); setErrorMsg(null); setReplaced(false);
  };

  const handleRestore = async (): Promise<void> => {
    if (!backupPath || !password) return;
    setErrorMsg(null); setIsRunning(true); setProgress(null);
    const unsub = window.electronAPI.onRestoreProgress((p) => setProgress(p));
    try {
      const result = await window.electronAPI.restoreVault({ backupPath, password, mode: 'replace' });
      if (result.ok) setReplaced(true); else setErrorMsg(result.error);
    } finally { unsub(); setIsRunning(false); setProgress(null); }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <SettingCard>
      <CardSection title="Restore Vault" description="Replace the current vault with a .pvbackup file. Requires the backup password.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <SecondaryBtn onClick={() => void handlePickFile()} disabled={isRunning}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="1.5" width="11" height="11"/><polyline points="4.5,7 7,4.5 9.5,7"/><line x1="7" y1="4.5" x2="7" y2="10"/>
              </svg>
              Choose Backup…
            </SecondaryBtn>
          </div>

          {backupPath && !replaced && (
            <div style={{ border: `1px solid ${T.line2}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{backupPath}</p>
              <div>
                <FieldLabel>Backup password</FieldLabel>
                <PasswordInput
                  placeholder="Enter backup password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && password && !isRunning) void handleRestore(); }}
                  error={!!errorMsg}
                  disabled={isRunning}
                />
              </div>
              <DangerBtn onClick={() => void handleRestore()} disabled={!password || isRunning} style={{ width: '100%', justifyContent: 'center' }}>
                {isRunning ? 'Restoring…' : 'Replace Current Vault'}
              </DangerBtn>
            </div>
          )}

          {isRunning && progress && <ProgressBar pct={pct} label={`Restoring ${progress.processed} / ${progress.total} entries…`} />}
          {replaced && <RestoreCountdownDialog />}
          {errorMsg && !isRunning && <ErrorBanner message={errorMsg} />}
        </div>
      </CardSection>
    </SettingCard>
  );
};

const ResetCompleteDialog: React.FC = () => {
  const [seconds, setSeconds] = useState(10);
  const calledRef = React.useRef(false);

  const exit = (): void => {
    if (calledRef.current) return;
    calledRef.current = true;
    void window.electronAPI.exitApp();
  };

  useEffect(() => {
    if (seconds <= 0) {
      exit();
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10050,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: 380,
        maxWidth: 'calc(100vw - 48px)',
        border: `1px solid ${T.line2}`,
        background: T.bg2,
        padding: 24,
        textAlign: 'center',
      }}>
        <div style={{
          width: 46,
          height: 46,
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${T.success}`,
          background: 'rgba(106,158,127,0.12)',
          color: T.success,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ margin: '0 0 6px', fontFamily: SERIF, fontSize: fontSize(20), color: T.text }}>Sanctum Reset</p>
        <p style={{ margin: '0 0 18px', fontFamily: MONO, fontSize: fontSize(11), lineHeight: 1.6, color: T.mute }}>
          Local Sanctum data has been deleted. The app will close now. Open Sanctum again to create a new vault.
        </p>
        <DangerBtn onClick={exit} style={{ width: '100%', justifyContent: 'center' }}>
          Exit Now
        </DangerBtn>
        <p style={{ margin: '12px 0 0', fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>
          Closing automatically in {seconds}s...
        </p>
      </div>
    </div>
  );
};

// ── Storage ──────────────────────────────────────────────────────────
const StorageSection: React.FC = () => {
  const [storageSummary, setStorageSummary] = useState<VaultStorageSummary | null>(null);
  const [isLoadingStorageSummary, setIsLoadingStorageSummary] = useState(true);
  const [storageSummaryUnavailable, setStorageSummaryUnavailable] = useState(false);
  const [showWipeDialog, setShowWipeDialog] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipePassword, setWipePassword] = useState('');
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [showFullResetDialog, setShowFullResetDialog] = useState(false);
  const [isFullResetting, setIsFullResetting] = useState(false);
  const [fullResetComplete, setFullResetComplete] = useState(false);
  const [fullResetPassword, setFullResetPassword] = useState('');
  const [fullResetPhrase, setFullResetPhrase] = useState('');
  const [fullResetError, setFullResetError] = useState<string | null>(null);
  const [healthReport, setHealthReport] = useState<VaultHealthReport | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [isScanningHealth, setIsScanningHealth] = useState(false);
  const [isRepairingHealth, setIsRepairingHealth] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const refreshStorageSummary = useCallback(async (): Promise<void> => {
    setIsLoadingStorageSummary(true);
    setStorageSummaryUnavailable(false);
    try {
      const result = await window.electronAPI.getVaultStorageSummary();
      if (!result.ok) {
        setStorageSummary(null);
        setStorageSummaryUnavailable(true);
        return;
      }
      setStorageSummary(result.data);
    } catch {
      setStorageSummary(null);
      setStorageSummaryUnavailable(true);
    } finally {
      setIsLoadingStorageSummary(false);
    }
  }, []);

  useEffect(() => {
    void refreshStorageSummary();
  }, [refreshStorageSummary]);

  const handleWipeVault = async (): Promise<void> => {
    if (!wipePassword) return;
    setWipeError(null);
    setIsWiping(true);
    try {
      const r = await window.electronAPI.clearAllVaultItems({ password: wipePassword });
      if (!r.ok) {
        setWipeError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(`Vault reset. Deleted ${r.data.deleted} saved object(s).`);
      setWipePassword('');
      setShowWipeDialog(false);
      await refreshStorageSummary();
    } finally { setIsWiping(false); }
  };

  const closeWipeDialog = (): void => {
    if (isWiping) return;
    setShowWipeDialog(false);
    setWipePassword('');
    setWipeError(null);
  };

  const closeFullResetDialog = (): void => {
    if (isFullResetting) return;
    setShowFullResetDialog(false);
    setFullResetPassword('');
    setFullResetPhrase('');
    setFullResetError(null);
  };

  const handleFullReset = async (): Promise<void> => {
    if (!fullResetPassword || fullResetPhrase.trim().toUpperCase() !== 'RESET SANCTUM') return;
    setFullResetError(null);
    setIsFullResetting(true);
    try {
      const result = await window.electronAPI.resetAllAppData({
        password: fullResetPassword,
        confirmation: fullResetPhrase,
      });
      if (!result.ok) {
        setFullResetError(result.error);
        toast.error(result.error);
        setIsFullResetting(false);
        return;
      }
      setShowFullResetDialog(false);
      setFullResetComplete(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset Sanctum.';
      setFullResetError(message);
      toast.error(message);
      setIsFullResetting(false);
    }
  };

  const handleScanHealth = async (): Promise<void> => {
    setIsScanningHealth(true);
    setHealthError(null);
    try {
      const result = await window.electronAPI.scanVaultHealth({ mode: 'deep' });
      if (!result.ok) {
        setHealthError(result.error);
        toast.error(result.error);
        return;
      }
      setHealthReport(result.data);
      if (result.data.status === 'ok') toast.success('Vault health check passed.');
      if (result.data.status === 'corrupt_data') toast.warning('Vault repair is available.');
      if (result.data.status === 'malformed_database') toast.error('Vault database needs recovery.');
    } finally {
      setIsScanningHealth(false);
    }
  };

  const handleRepairHealth = async (): Promise<void> => {
    setIsRepairingHealth(true);
    setHealthError(null);
    try {
      const result = await window.electronAPI.repairCorruptVaultData();
      if (!result.ok) {
        setHealthError(result.error);
        toast.error(result.error);
        return;
      }
      setConfirmRepair(false);
      toast.success('Vault data repaired.');
      await handleScanHealth();
      await refreshStorageSummary();
    } finally {
      setIsRepairingHealth(false);
    }
  };

  const handleRecoverMalformed = async (): Promise<void> => {
    setIsRepairingHealth(true);
    setHealthError(null);
    try {
      const result = await window.electronAPI.recoverMalformedDatabase();
      if (!result.ok) {
        setHealthError(result.error);
        toast.error(result.error);
        return;
      }
      setConfirmRebuild(false);
      toast.success('Vault database rebuilt. Restart Sanctum to finish recovery.');
      setHealthReport(null);
      await refreshStorageSummary();
    } finally {
      setIsRepairingHealth(false);
    }
  };

  const totalHealthProblems = healthProblemCount(healthReport);
  const fullResetPhraseValid = fullResetPhrase.trim().toUpperCase() === 'RESET SANCTUM';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading title="Storage" sub="Manage vault storage and data." />
      {fullResetComplete && <ResetCompleteDialog />}

      <SettingCard>
        <CardSection title="Vault Storage" description="Persistent encrypted vault data stored on this device.">
          {isLoadingStorageSummary ? (
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>
              Calculating vault size...
            </div>
          ) : storageSummaryUnavailable || !storageSummary ? (
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>
              Vault storage information is unavailable.
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: SERIF,
                fontSize: fontSize(30),
                fontWeight: 300,
                color: T.text,
                lineHeight: 1.1,
              }}>
                {formatStorageSize(storageSummary.totalBytes)}
              </div>
              <div style={{
                marginTop: 8,
                fontFamily: MONO,
                fontSize: fontSize(10),
                color: T.mute,
                lineHeight: 1.6,
              }}>
                {storageSummary.fileCount} files · {storageSummary.bookmarkCount} bookmarks · {storageSummary.noteCount} notes · {storageSummary.passwordCount} passwords
              </div>
            </div>
          )}
        </CardSection>
      </SettingCard>

      <BackupCard />
      <RestoreCard />

      <SettingCard>
        <CardSection
          title="Vault Recovery"
          description="Scan encrypted vault records for unreadable objects, broken references, orphaned blobs, and database damage."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(11), color: T.mute2 }}>
              Deep scan checks encrypted file contents and may take time for large vaults.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SecondaryBtn onClick={() => void handleScanHealth()} disabled={isScanningHealth || isRepairingHealth}>
                {isScanningHealth ? 'Scanning...' : 'Scan Vault Health'}
              </SecondaryBtn>
              {healthReport?.status === 'corrupt_data' && (
                <DangerBtn onClick={() => setConfirmRepair(true)} disabled={isRepairingHealth}>
                  Repair {totalHealthProblems} Issue{totalHealthProblems === 1 ? '' : 's'}
                </DangerBtn>
              )}
              {healthReport?.status === 'malformed_database' && (
                <DangerBtn onClick={() => setConfirmRebuild(true)} disabled={isRepairingHealth}>
                  Rebuild Vault Database
                </DangerBtn>
              )}
            </div>
            {healthReport && (
              <div style={{
                padding: '10px 12px',
                border: `1px solid ${healthReport.status === 'ok' ? T.line2 : healthReport.status === 'malformed_database' ? T.danger : T.warn}`,
                background: T.bg,
                fontFamily: MONO,
                fontSize: fontSize(10),
                color: healthReport.status === 'ok' ? T.success : healthReport.status === 'malformed_database' ? T.danger : T.warn,
                lineHeight: 1.6,
              }}>
                {healthSummaryText(healthReport)}
              </div>
            )}
            {healthError && <ErrorBanner message={healthError} />}
          </div>
        </CardSection>
      </SettingCard>

      <SettingCard>
        <CardSection title="Vault Data" description="All files, bookmarks, notes, passwords, folders, and tags are encrypted locally.">
          <DangerBtn onClick={() => { setWipeError(null); setWipePassword(''); setShowWipeDialog(true); }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,3.5 12,3.5"/><path d="M5 3.5V2.5h4v1"/><rect x="3" y="3.5" width="8" height="9"/>
              <line x1="5.5" y1="6" x2="5.5" y2="10"/><line x1="8.5" y1="6" x2="8.5" y2="10"/>
            </svg>
            Delete All Vault Items
          </DangerBtn>
        </CardSection>
      </SettingCard>

      <SettingCard>
        <CardSection
          title="Reset Sanctum"
          description="Return Sanctum to first launch. This deletes the vault password, encrypted vault data, app settings, audit log, browser data, and saved browser tabs."
        >
          <DangerBtn onClick={() => {
            setFullResetError(null);
            setFullResetPassword('');
            setFullResetPhrase('');
            setShowFullResetDialog(true);
          }}>
            Reset Sanctum
          </DangerBtn>
        </CardSection>
      </SettingCard>

      {/* Wipe confirm modal */}
      {showWipeDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          display: 'grid', placeItems: 'center',
        }} onClick={closeWipeDialog}>
          <div style={{
            width: 420, background: T.bg2,
            border: `1px solid ${T.line2}`,
            padding: 28,
          }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(20), color: T.text, margin: '0 0 8px' }}>Delete All Vault Items</p>
            <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.mute, margin: '0 0 18px', lineHeight: 1.6 }}>
              This will permanently delete encrypted files, bookmarks, notes, passwords, folders, tags, and vault metadata. Your vault password and app settings stay in place.
            </p>
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Current vault password</FieldLabel>
              <PasswordInput
                autoFocus
                value={wipePassword}
                onChange={(e) => { setWipePassword(e.target.value); setWipeError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && wipePassword && !isWiping) void handleWipeVault(); }}
                placeholder="Enter vault password"
                autoComplete="current-password"
                error={!!wipeError}
                disabled={isWiping}
              />
            </div>
            {wipeError && <ErrorBanner message={wipeError} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <SecondaryBtn onClick={closeWipeDialog} disabled={isWiping}>Cancel</SecondaryBtn>
              <DangerBtn onClick={() => void handleWipeVault()} disabled={isWiping || !wipePassword}>
                {isWiping ? 'Deleting…' : 'Delete Everything'}
              </DangerBtn>
            </div>
          </div>
        </div>
      )}

      <SanctumDialog
        open={showFullResetDialog}
        onOpenChange={(open) => { if (!open) closeFullResetDialog(); else setShowFullResetDialog(true); }}
        title="Reset Sanctum completely?"
        description="This returns Sanctum to first launch. It deletes the vault password, encrypted files, bookmarks, notes, passwords, folders, tags, audit log, settings, browser data, and saved browser tabs. External backup files are not deleted."
        variant="danger"
        size="md"
        busy={isFullResetting}
        closeOnOverlay={!isFullResetting}
        footer={(
          <>
            <SecondaryBtn onClick={closeFullResetDialog} disabled={isFullResetting}>Cancel</SecondaryBtn>
            <DangerBtn
              onClick={() => void handleFullReset()}
              disabled={isFullResetting || !fullResetPassword || !fullResetPhraseValid}
            >
              {isFullResetting ? 'Resetting...' : 'Reset Sanctum'}
            </DangerBtn>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <FieldLabel>Current vault password</FieldLabel>
            <PasswordInput
              autoFocus
              value={fullResetPassword}
              onChange={(e) => { setFullResetPassword(e.target.value); setFullResetError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fullResetPassword && fullResetPhraseValid && !isFullResetting) {
                  void handleFullReset();
                }
              }}
              placeholder="Enter vault password"
              autoComplete="current-password"
              error={!!fullResetError}
              disabled={isFullResetting}
            />
          </div>
          <div>
            <FieldLabel>Type RESET SANCTUM to confirm</FieldLabel>
            <input
              value={fullResetPhrase}
              onChange={(e) => { setFullResetPhrase(e.target.value); setFullResetError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fullResetPassword && fullResetPhraseValid && !isFullResetting) {
                  void handleFullReset();
                }
              }}
              placeholder="RESET SANCTUM"
              disabled={isFullResetting}
              style={{
                width: '100%',
                height: 34,
                boxSizing: 'border-box',
                background: T.bg,
                border: `1px solid ${fullResetError ? T.danger : T.line2}`,
                color: T.text,
                fontFamily: MONO,
                fontSize: fontSize(11),
                letterSpacing: '0.08em',
                padding: '0 10px',
                outline: 'none',
              }}
            />
          </div>
          {fullResetError && <ErrorBanner message={fullResetError} />}
        </div>
      </SanctumDialog>

      <SanctumConfirmDialog
        open={confirmRepair}
        onOpenChange={setConfirmRepair}
        title="Repair corrupted vault data?"
        description="Sanctum will delete only unreadable objects and orphaned records. Valid vault data is kept."
        variant="danger"
        confirmLabel={isRepairingHealth ? 'Repairing...' : 'Repair'}
        busy={isRepairingHealth}
        onConfirm={handleRepairHealth}
        zIndex={10000}
      >
        <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.6 }}>
          {healthReport ? healthSummaryText(healthReport) : 'Corrupted vault data was detected.'}
        </p>
      </SanctumConfirmDialog>

      <SanctumConfirmDialog
        open={confirmRebuild}
        onOpenChange={setConfirmRebuild}
        title="Rebuild vault database?"
        description="Sanctum will create a recovery copy first, then reset vault data so the app can open again."
        variant="danger"
        confirmLabel={isRepairingHealth ? 'Rebuilding...' : 'Rebuild'}
        busy={isRepairingHealth}
        onConfirm={handleRecoverMalformed}
        zIndex={10000}
      >
        <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.6 }}>
          Use this only when SQLite reports the vault database is malformed. Files are copied to a recovery folder before the rebuild.
        </p>
      </SanctumConfirmDialog>
    </div>
  );
};

// ── About ────────────────────────────────────────────────────────────
const AboutSection: React.FC = () => {
  const [version, setVersion] = useState('…');
  useEffect(() => { void window.electronAPI.appVersion().then(setVersion); }, []);

  const rows: { label: string; value: string; accent?: boolean }[] = [
    { label: 'Application', value: 'Sanctum' },
    { label: 'Version', value: version },
    { label: 'Encryption', value: 'AES-256-GCM', accent: true },
    { label: 'Key Derivation', value: 'Argon2id', accent: true },
    { label: 'Platform', value: 'Electron + React' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeading title="About" sub="Application information." />

      <SettingCard>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '11px 20px',
            borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : 'none',
          }}>
            <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>{row.label}</span>
            <span style={{ fontFamily: MONO, fontSize: fontSize(11), color: row.accent ? T.accent : T.text }}>{row.value}</span>
          </div>
        ))}
      </SettingCard>
    </div>
  );
};

// ── Settings Page ────────────────────────────────────────────────────
export const SettingsPage: React.FC = () => {
  const [category, setCategory] = useState<SettingsCategory>('security');

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Sidebar nav */}
      <nav style={{
        width: 200, flexShrink: 0,
        borderRight: `1px solid ${T.line}`,
        padding: '16px 0',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <p style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.14em', textTransform: 'uppercase', color: T.mute2, padding: '0 16px', marginBottom: 8 }}>
          · Settings ·
        </p>
        {NAV_ITEMS.map((item) => {
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                background: active ? T.accentGlow : 'none',
                border: 'none',
                borderLeft: `2px solid ${active ? T.accent : 'transparent'}`,
                color: active ? T.accent : T.mute,
                fontFamily: MONO, fontSize: fontSize(11),
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'color 0.1s',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {category === 'security'   && <SecuritySection />}
          {category === 'appearance' && <AppearanceSection />}
          {category === 'browser'    && <BrowserSection />}
          {category === 'storage'    && <StorageSection />}
          {category === 'about'      && <AboutSection />}
        </div>
      </div>
    </div>
  );
};

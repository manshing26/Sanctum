import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AuthScreenMode, RestoreProgress, SessionState, VaultHealthReport } from '../shared/ipc';
import { PasswordInput } from './components/ui/PasswordInput';
import { VaultPage } from './features/gallery/VaultPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { BrowserWorkspace, type BrowserWorkspaceHandle } from './features/browser/BrowserWorkspace';
import { RestoreCountdownDialog } from './components/ui/RestoreCountdownDialog';
import { SanctumConfirmDialog } from './components/ui';
import { PasswordManagerPage } from './features/passwords/PasswordManagerPage';
import { VAULT_PASSWORD_MIN_LENGTH, isVaultPasswordLongEnough } from '../shared/authPolicy';
import { applyTextScale, fontSize } from './theme/typography';

const T = {
  bg: '#0a0c0b',
  bg2: '#10110f',
  line: 'rgba(220,220,200,0.07)',
  line2: 'rgba(220,220,200,0.12)',
  text: '#e8e6dc',
  mute: '#79817a',
  mute2: '#4d524d',
  accent: '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.15)',
  danger: '#c36b5f',
  warn: '#c08a5e',
  success: '#6a9e7f',
};
const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

interface PasswordCheck {
  label: string;
  met: boolean;
}

const getPasswordChecks = (password: string): PasswordCheck[] => [
  { label: `At least ${VAULT_PASSWORD_MIN_LENGTH} characters`, met: isVaultPasswordLongEnough(password) },
];

// ── Top Bar ──────────────────────────────────────────────────────────
type AppTab = 'gallery' | 'browser' | 'settings' | 'passwords';

// Inline SVG sigil — matches sanctum-gallery.html
const SanctumSigil: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 L3 6 L3 12 Q3 18 12 22 Q21 18 21 12 L21 6 Z"/>
    <path d="M12 7 L12 17 M9 11 L15 11"/>
  </svg>
);

const LockIcon: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="1"/>
    <path d="M8 11 L8 7 Q8 3 12 3 Q16 3 16 7 L16 11"/>
  </svg>
);

const TABS: { id: AppTab; label: string; numeral: string }[] = [
  { id: 'gallery',   label: 'Vault',     numeral: 'I'   },
  { id: 'browser',   label: 'Browser',   numeral: 'II'  },
  { id: 'passwords', label: 'Passwords', numeral: 'III' },
  { id: 'settings',  label: 'Settings',  numeral: 'IV'  },
];

const TopBar: React.FC<{
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onLockVault: () => void;
  isUnlocked: boolean;
}> = ({ activeTab, onSelectTab, onLockVault, isUnlocked }) => (
  <header style={{
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 24,
    padding: '14px 24px',
    borderBottom: '1px solid rgba(220,220,200,0.07)',
    background: '#0a0c0b',
    WebkitAppRegion: 'drag',
  } as React.CSSProperties}>
    {/* Brand */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7c9a92', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <SanctumSigil />
      <div>
        <div style={{ fontSize: fontSize(13), fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#e8e6dc' }}>Sanctum</div>
        <div style={{ fontSize: fontSize(9), letterSpacing: '0.18em', textTransform: 'uppercase', color: '#79817a', marginTop: 2, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Cabinet</div>
      </div>
    </div>

    {/* Tab nav */}
    <nav style={{ display: 'flex', justifyContent: 'center', gap: 24, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => isUnlocked && onSelectTab(tab.id)}
            disabled={!isUnlocked}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              background: 'none',
              border: 'none',
              borderBottom: active ? '1px solid #7c9a92' : '1px solid transparent',
              paddingBottom: 6,
              cursor: isUnlocked ? 'pointer' : 'default',
              color: active ? '#e8e6dc' : '#79817a',
              fontSize: fontSize(9),
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              opacity: isUnlocked ? 1 : 0.4,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: fontSize(8), color: active ? '#7c9a92' : '#4d524d' }}>
              {tab.numeral}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>

    {/* Right: status + lock */}
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {isUnlocked && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fontSize(9), letterSpacing: '0.24em', textTransform: 'uppercase', color: '#7c9a92', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="#7c9a92" stroke="none"><circle cx="12" cy="12" r="5"/></svg>
          unlocked
        </span>
      )}
      <button
        onClick={onLockVault}
        disabled={!isUnlocked}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 14px',
          background: isUnlocked ? T.warn : 'transparent',
          color: isUnlocked ? T.bg : T.mute,
          border: isUnlocked ? `1px solid ${T.warn}` : '1px solid rgba(220,220,200,0.12)',
          cursor: isUnlocked ? 'pointer' : 'default',
          fontSize: fontSize(10),
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontFamily: 'inherit',
          opacity: isUnlocked ? 1 : 0.4,
        }}
      >
        <LockIcon /> Lock
      </button>
    </div>
  </header>
);

// ── Shared auth field styles ─────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: MONO,
  fontSize: fontSize(9),
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.mute,
  marginBottom: 6,
};

const primaryBtn = (disabled = false): React.CSSProperties => ({
  width: '100%',
  height: 36,
  background: disabled ? T.mute2 : T.accent,
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: '#0a0c0b',
  fontFamily: MONO,
  fontSize: fontSize(11),
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 0,
  opacity: disabled ? 0.55 : 1,
  transition: 'opacity 0.15s',
});

const ghostBtn = (disabled = false): React.CSSProperties => ({
  height: 32,
  padding: '0 14px',
  background: 'none',
  border: `1px solid ${T.line2}`,
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: T.mute,
  fontFamily: MONO,
  fontSize: fontSize(10),
  letterSpacing: '0.08em',
  borderRadius: 0,
  opacity: disabled ? 0.5 : 1,
});

const SpinSvg: React.FC = () => (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"
      style={{ animation: 'auth-spin 0.9s linear infinite', flexShrink: 0 }}>
      <path d="M12 7A5 5 0 1 1 7 2" />
    </svg>
    <style>{`@keyframes auth-spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
  </>
);

// ── Restore from Backup ──────────────────────────────────────────────
const RestoreFromBackupSection: React.FC = () => {
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [restored, setRestored] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePickFile = async (): Promise<void> => {
    const picked = await window.electronAPI.pickRestoreFile();
    if (!picked) return;
    setBackupPath(picked);
    setPassword('');
    setErrorMsg(null);
  };

  const handleRestore = async (): Promise<void> => {
    if (!backupPath || !password) return;
    setErrorMsg(null);
    setIsRunning(true);
    setProgress(null);
    const unsub = window.electronAPI.onRestoreProgress((p) => setProgress(p));
    try {
      const result = await window.electronAPI.restoreVault({ backupPath, password, mode: 'replace' });
      if (result.ok) setRestored(true);
      else setErrorMsg(result.error);
    } finally {
      unsub();
      setIsRunning(false);
      setProgress(null);
    }
  };

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  if (restored) return <RestoreCountdownDialog />;

  if (!backupPath) {
    return (
      <button
        type="button"
        onClick={() => void handlePickFile()}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, letterSpacing: '0.06em', padding: 0 }}
      >
        Restore from backup…
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${T.line2}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
        {backupPath}
      </p>

      {errorMsg && (
        <div style={{ border: `1px solid ${T.danger}`, padding: '8px 10px', background: 'rgba(195,107,95,0.08)' }}>
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, margin: 0 }}>{errorMsg}</p>
        </div>
      )}

      <div>
        <label htmlFor="restore-pw" style={labelStyle}>Backup password</label>
        <PasswordInput
          id="restore-pw"
          placeholder="Enter backup password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && password && !isRunning) void handleRestore(); }}
          error={!!errorMsg}
          disabled={isRunning}
          autoFocus
        />
      </div>

      {isRunning && progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ height: 2, width: '100%', background: T.line2 }}>
            <div style={{ height: '100%', background: T.accent, width: `${progressPct}%`, transition: 'width 0.2s' }} />
          </div>
          <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute, margin: 0 }}>
            Restoring {progress.processed} / {progress.total} entries…
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => { setBackupPath(null); setErrorMsg(null); }}
          disabled={isRunning}
          style={ghostBtn(isRunning)}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={!password || isRunning}
          style={{ ...primaryBtn(!password || isRunning), flex: 1 }}
        >
          {isRunning ? <><SpinSvg />Restoring…</> : 'Restore Vault'}
        </button>
      </div>
    </div>
  );
};

// ── Auth page shell ──────────────────────────────────────────────────
const AuthMain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    position: 'relative',
    flex: 1,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    // radial accent glow at centre + bg-2
    background: `radial-gradient(circle at 50% 42%, rgba(124,154,146,0.09), transparent 28%), ${T.bg2}`,
  }}>
    {/* Inset hairline frame */}
    <div style={{
      position: 'absolute', inset: 24, pointerEvents: 'none',
      border: `1px solid ${T.line}`,
    }} />
    {children}
  </div>
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
    <AuthMain>
      <section style={{
        position: 'relative',
        width: 'min(560px, calc(100vw - 48px))',
        border: `1px solid ${T.line2}`,
        // slight accent tint matching reference: color-mix approximated
        background: 'color-mix(in srgb, #0a0c0b 88%, #7c9a92 12%)' as string,
      }}>
        {/* Header: 2-col — seal icon | title */}
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: `1px solid ${T.line}` }}>
          <div style={{
            display: 'grid', placeItems: 'center',
            borderRight: `1px solid ${T.line}`,
            color: T.accent,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" /><path d="M8 11 L8 7 Q8 3 12 3 Q16 3 16 7 L16 11" />
            </svg>
          </div>
          <div style={{ padding: '22px 24px 20px' }}>
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>
              · Sealed cabinet ·
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: 'clamp(36px, 5vw, 58px)',
              fontWeight: 300,
              lineHeight: 0.96,
              letterSpacing: '-0.02em',
              color: T.text,
            }}>
              Unlock Sanctum
            </h1>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {/* Notice row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto',
            gap: 16, alignItems: 'start',
            paddingBottom: 22,
            borderBottom: `1px solid ${T.line}`,
          }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>
                Private media vault
              </div>
              <p style={{ margin: '8px 0 0', maxWidth: '38ch', color: T.mute, fontSize: fontSize(13), lineHeight: 1.6 }}>
                Enter the cabinet passphrase to restore Gallery, Bookmarks, Browser history, and saved references on this device.
              </p>
            </div>
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), lineHeight: 1.8, textAlign: 'right', color: T.mute2 }}>
              aes-256-gcm<br />local keychain<br />zero cloud read
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) void onUnlock(password); }}>
            {error && (
              <div style={{ marginTop: 16, border: `1px solid ${T.danger}`, padding: '9px 12px', background: 'rgba(195,107,95,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke={T.danger} strokeWidth="1.4" style={{ flexShrink: 0 }}>
                  <path d="M6.5 1L12 11.5H1z" /><line x1="6.5" y1="5" x2="6.5" y2="8" /><circle cx="6.5" cy="9.5" r="0.5" fill={T.danger} />
                </svg>
                <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, margin: 0 }}>{error}</p>
              </div>
            )}

            <label htmlFor="unlock-password" style={{ display: 'block', margin: '22px 0 8px', fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>
              Passphrase
            </label>
            <PasswordInput
              id="unlock-password"
              placeholder="enter vault passphrase"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!error}
              autoFocus
            />

            <div style={{ marginTop: 14 }}>
              <button type="submit" disabled={!canSubmit} style={primaryBtn(!canSubmit)}>
                {isBusy ? <><SpinSvg />Unlocking…</> : 'Unlock Cabinet'}
              </button>
            </div>
          </form>

          {/* Hint footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 18, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute2 }}>
            <span>passphrase required</span>
            <span>silentium · sigillum</span>
          </div>
        </div>
      </section>

      {/* Status toast */}
      <div style={{
        position: 'absolute', right: 24, bottom: 24,
        width: 'min(360px, calc(100vw - 48px))',
        display: 'grid', gridTemplateColumns: 'auto 1fr',
        alignItems: 'center', gap: 14,
        padding: '14px 16px',
        border: `1px solid ${T.line2}`,
        background: T.bg,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.warn} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 8 L12 12 M12 16 L12 16" />
        </svg>
        <div>
          <strong style={{ display: 'block', fontSize: fontSize(13), fontWeight: 600, color: T.text }}>Cabinet locked</strong>
          <span style={{ display: 'block', marginTop: 4, fontFamily: MONO, fontSize: fontSize(11), color: T.mute }}>Awaiting local passphrase.</span>
        </div>
      </div>
    </AuthMain>
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
  const passwordValid = isVaultPasswordLongEnough(password);
  const passwordsMatch = password === confirmPassword;
  const canSubmit = passwordValid && passwordsMatch && confirmPassword.length > 0 && !isBusy;

  return (
    <AuthMain>
      <section style={{
        position: 'relative',
        width: 'min(560px, calc(100vw - 48px))',
        border: `1px solid ${T.line2}`,
        background: 'color-mix(in srgb, #0a0c0b 88%, #7c9a92 12%)' as string,
      }}>
        {/* Header: seal icon | title */}
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: 'grid', placeItems: 'center', borderRight: `1px solid ${T.line}`, color: T.accent }}>
            <SanctumSigil />
          </div>
          <div style={{ padding: '22px 24px 20px' }}>
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>
              · New cabinet ·
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: 'clamp(36px, 5vw, 58px)',
              fontWeight: 300,
              lineHeight: 0.96,
              letterSpacing: '-0.02em',
              color: T.text,
            }}>
              Initialise Sanctum
            </h1>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {/* Notice row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto',
            gap: 16, alignItems: 'start',
            paddingBottom: 22,
            borderBottom: `1px solid ${T.line}`,
          }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>
                Create passphrase
              </div>
              <p style={{ margin: '8px 0 0', maxWidth: '38ch', color: T.mute, fontSize: fontSize(13), lineHeight: 1.6 }}>
                Set a passphrase with at least {VAULT_PASSWORD_MIN_LENGTH} characters. It cannot be recovered if lost — choose something memorable.
              </p>
            </div>
            <div style={{ fontFamily: MONO, fontSize: fontSize(10), lineHeight: 1.8, textAlign: 'right', color: T.mute2 }}>
              aes-256-gcm<br />local keychain<br />zero cloud read
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) void onCreate(password); }}>
            {error && (
              <div style={{ marginTop: 16, border: `1px solid ${T.danger}`, padding: '9px 12px', background: 'rgba(195,107,95,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke={T.danger} strokeWidth="1.4" style={{ flexShrink: 0 }}>
                  <path d="M6.5 1L12 11.5H1z" /><line x1="6.5" y1="5" x2="6.5" y2="8" /><circle cx="6.5" cy="9.5" r="0.5" fill={T.danger} />
                </svg>
                <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, margin: 0 }}>{error}</p>
              </div>
            )}

            <label htmlFor="create-password" style={{ display: 'block', margin: '22px 0 8px', fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>
              Passphrase
            </label>
            <PasswordInput
              id="create-password"
              placeholder="create a strong passphrase"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showStrength
              autoFocus
            />

            {/* Requirement checklist */}
            {password.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                {checks.map((check) => (
                  <div key={check.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      {check.met ? (
                        <><circle cx="5" cy="5" r="4.5" fill={T.success} /><path d="M2.5 5l1.8 1.8 3.2-3.2" stroke="#0a0c0b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></>
                      ) : (
                        <circle cx="5" cy="5" r="4.5" stroke={T.line2} />
                      )}
                    </svg>
                    <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: check.met ? T.mute : T.mute2, letterSpacing: '0.04em' }}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <label htmlFor="confirm-password" style={{ display: 'block', margin: '18px 0 8px', fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>
              Confirm passphrase
            </label>
            <PasswordInput
              id="confirm-password"
              placeholder="confirm your passphrase"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmPassword.length > 0 && !passwordsMatch}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.danger, marginTop: 5, marginBottom: 0 }}>
                Passphrases do not match.
              </p>
            )}

            <div style={{ marginTop: 14 }}>
              <button type="submit" disabled={!canSubmit} style={primaryBtn(!canSubmit)}>
                {isBusy ? <><SpinSvg />Sealing vault…</> : 'Initialise Vault'}
              </button>
            </div>
          </form>

          {/* Hint footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 18, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute2 }}>
            <RestoreFromBackupSection />
            <span>silentium · sigillum</span>
          </div>
        </div>
      </section>
    </AuthMain>
  );
};

// ── Loading Screen ───────────────────────────────────────────────────
const LoadingScreen: React.FC = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={T.accent} strokeWidth="1.5"
        style={{ animation: 'auth-spin 0.9s linear infinite' }}>
        <path d="M16 9A7 7 0 1 1 9 2" />
      </svg>
      <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, letterSpacing: '0.1em', margin: 0 }}>
        Loading vault…
      </p>
    </div>
    <style>{`@keyframes auth-spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
  </div>
);


// ── Main App ─────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const [mode, setMode] = useState<AuthScreenMode>('loading');
  const [session, setSession] = useState<SessionState>({ status: 'locked', hasVault: false });
  const [isBusy, setIsBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<AppTab>('gallery');
  const [shouldMountBrowser, setShouldMountBrowser] = useState(false);
  const [pendingBrowserUrl, setPendingBrowserUrl] = useState<string | null>(null);
  const [healthPrompt, setHealthPrompt] = useState<VaultHealthReport | null>(null);
  const [isRepairingHealth, setIsRepairingHealth] = useState(false);
  const healthScanRanRef = useRef(false);
  const browserRef = useRef<BrowserWorkspaceHandle>(null);

  useEffect(() => {
    void window.electronAPI.getAppearanceSettings().then((result) => {
      if (result.ok) {
        applyTextScale(result.data.textSize);
      }
    });
  }, []);

  const refreshSession = async (): Promise<SessionState> => {
    const state = await window.electronAPI.getSession();
    setSession(state);
    setMode(state.status === 'unlocked' ? 'login' : state.hasVault ? 'login' : 'create-account');
    return state;
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSessionChanged(({ state, reason }) => {
      setSession(state);
      setMode(state.status === 'unlocked' ? 'login' : state.hasVault ? 'login' : 'create-account');
      if (reason === 'idle_timeout') {
        toast.warning('Vault locked due to inactivity.');
      } else if (reason === 'window_minimize') {
        toast.info('Vault locked on minimize.');
      } else if (reason === 'system_lock') {
        toast.warning('Vault locked because computer was locked.');
      } else if (reason === 'system_sleep') {
        toast.warning('Vault locked before sleep.');
      } else if (reason === 'audio_sleep_timer') {
        toast.warning('Vault locked by audio sleep timer.');
      }
    });
    return unsubscribe;
  }, []);

  const isUnlocked = session.status === 'unlocked';

  useEffect(() => {
    if (isUnlocked) {
      setShouldMountBrowser(true);
    } else {
      healthScanRanRef.current = false;
      setHealthPrompt(null);
    }
  }, [isUnlocked]);

  useEffect(() => {
    if (!isUnlocked || healthScanRanRef.current) return;
    healthScanRanRef.current = true;
    void window.electronAPI.scanVaultHealth().then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.status !== 'ok') {
        setHealthPrompt(result.data);
      }
    });
  }, [isUnlocked]);

  const handleRepairHealthPrompt = async (): Promise<void> => {
    setIsRepairingHealth(true);
    try {
      const result = await window.electronAPI.repairCorruptVaultData();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHealthPrompt(null);
      toast.success('Vault data repaired.');
      window.location.reload();
    } finally {
      setIsRepairingHealth(false);
    }
  };

  const handleRecoverMalformedPrompt = async (): Promise<void> => {
    setIsRepairingHealth(true);
    try {
      const result = await window.electronAPI.recoverMalformedDatabase();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHealthPrompt(null);
      toast.success('Vault database rebuilt. Restart Sanctum to finish recovery.');
    } finally {
      setIsRepairingHealth(false);
    }
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

  return (
    <div className="flex h-screen flex-col" style={{ background: '#0a0c0b', color: '#e8e6dc' }}>
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLockVault={() => void handleLock()}
        isUnlocked={isUnlocked}
      />

      <div className="relative flex min-h-0 flex-1">
        {mode === 'loading' && !isUnlocked && <LoadingScreen />}

        {isUnlocked && activeTab === 'gallery' && (
          <div className="flex min-h-0 flex-1">
            <VaultPage
              onMessage={(msg: string) => toast.info(msg)}
              onOpenUrlInBrowser={(url) => {
                setPendingBrowserUrl(url);
                setActiveTab('browser');
              }}
            />
          </div>
        )}

        {isUnlocked && activeTab === 'settings' && (
          <div className="flex min-h-0 flex-1">
            <SettingsPage />
          </div>
        )}

        {isUnlocked && activeTab === 'passwords' && (
          <div className="flex min-h-0 flex-1">
            <PasswordManagerPage />
          </div>
        )}

        {shouldMountBrowser && (
          <div className={isUnlocked && activeTab === 'browser' ? 'flex min-h-0 flex-1' : 'hidden'}>
            <BrowserWorkspace
              mode="same-window"
              showLeftPanel
              showCloseButton={false}
              isActive={isUnlocked && activeTab === 'browser'}
              pendingUrl={pendingBrowserUrl}
              onPendingUrlConsumed={() => setPendingBrowserUrl(null)}
              imperativeRef={browserRef}
            />
          </div>
        )}

        {!isUnlocked && mode === 'login' && (
          <UnlockScreen onUnlock={handleUnlock} isBusy={isBusy} error={authError} />
        )}

        {!isUnlocked && mode === 'create-account' && (
          <CreateAccountScreen onCreate={handleCreate} isBusy={isBusy} error={authError} />
        )}
      </div>

      <SanctumConfirmDialog
        open={Boolean(healthPrompt)}
        onOpenChange={(open) => { if (!open) setHealthPrompt(null); }}
        title={healthPrompt?.status === 'malformed_database' ? 'Vault database needs recovery' : 'Repair corrupted vault data?'}
        description={
          healthPrompt?.status === 'malformed_database'
            ? 'Sanctum detected database damage. A recovery copy will be saved before rebuilding vault data.'
            : 'Sanctum detected unreadable vault records. Repair deletes only corrupted objects and orphaned data.'
        }
        variant="danger"
        confirmLabel={
          isRepairingHealth
            ? 'Working...'
            : healthPrompt?.status === 'malformed_database'
              ? 'Rebuild'
              : 'Repair'
        }
        busy={isRepairingHealth}
        onConfirm={healthPrompt?.status === 'malformed_database' ? handleRecoverMalformedPrompt : handleRepairHealthPrompt}
        zIndex={10000}
      >
        <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.6 }}>
          {healthPrompt?.status === 'malformed_database'
            ? 'If rebuild succeeds, restart Sanctum before importing or editing vault data again.'
            : `Issues found: ${healthPrompt ? Object.values(healthPrompt.counts).reduce((total, value) => total + value, 0) : 0}.`}
        </p>
      </SanctumConfirmDialog>
    </div>
  );
};

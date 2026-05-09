import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreatePasswordInput, PasswordDetail, PasswordSummary, UpdatePasswordInput } from '../../../shared/ipc';
import { toast } from 'sonner';

const T = {
  bg:         '#0a0c0b',
  bg2:        '#10110f',
  line:       'rgba(220,220,200,0.07)',
  line2:      'rgba(220,220,200,0.12)',
  text:       '#e8e6dc',
  mute:       '#79817a',
  mute2:      '#4d524d',
  accent:     '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.12)',
  danger:     '#c36b5f',
  dangerGlow: 'rgba(195,107,95,0.10)',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

const formatRelative = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

// ── Icons ────────────────────────────────────────────────────────────

const IcoKey: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5" cy="7" r="3.5"/>
    <path d="M8 7h5M11 7v2"/>
  </svg>
);

const IcoEye: React.FC<{ crossed?: boolean }> = ({ crossed = false }) => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    {crossed ? (
      <>
        <path d="M2 2l10 10M5.4 5.5C4.5 6 3.5 7 2 7c2 2.5 5.5 4 10 0-1-1-2-1.8-3-2"/>
        <path d="M7 3.5C8.5 3.2 10 3.8 12 7c-.5.5-1 1-1.5 1.3"/>
      </>
    ) : (
      <>
        <path d="M1 7c2-4 10-4 12 0"/>
        <path d="M1 7c2 4 10 4 12 0"/>
        <circle cx="7" cy="7" r="2"/>
      </>
    )}
  </svg>
);

const IcoCopy: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="8" height="9"/>
    <path d="M10 4V2.5H2v9h1.5"/>
  </svg>
);

const IcoEdit: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 10.5l1.5-1.5 7-7 1.5 1.5-7 7L2 12z"/>
    <path d="M10.5 2l1.5 1.5"/>
  </svg>
);

const IcoTrash: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,3.5 12,3.5"/>
    <path d="M5 3.5V2.5h4v1"/>
    <rect x="3" y="3.5" width="8" height="9"/>
    <line x1="5.5" y1="6" x2="5.5" y2="10"/>
    <line x1="8.5" y1="6" x2="8.5" y2="10"/>
  </svg>
);

const IcoPlus: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="6" y1="2" x2="6" y2="10"/>
    <line x1="2" y1="6" x2="10" y2="6"/>
  </svg>
);

const IcoChevron: React.FC<{ dir: 'left' | 'right' }> = ({ dir }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {dir === 'left'
      ? <polyline points="6.5,2 3.5,5 6.5,8"/>
      : <polyline points="3.5,2 6.5,5 3.5,8"/>}
  </svg>
);

// ── Password field input ─────────────────────────────────────────────

const PwField: React.FC<{
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}> = ({ id, value, onChange, placeholder, disabled, autoFocus }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{
          width: '100%', height: 32, paddingLeft: 10, paddingRight: 34,
          background: T.bg, border: `1px solid ${T.line2}`,
          color: T.text, fontFamily: MONO, fontSize: 11, outline: 'none',
          boxSizing: 'border-box', opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.mute, padding: 0, display: 'flex', alignItems: 'center',
        }}
      >
        <IcoEye crossed={show} />
      </button>
    </div>
  );
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, margin: '0 0 5px' }}>
    {children}
  </p>
);

const TextInput: React.FC<{
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}> = ({ id, value, onChange, placeholder, disabled, autoFocus }) => (
  <input
    id={id}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    autoFocus={autoFocus}
    style={{
      width: '100%', height: 32, paddingLeft: 10, paddingRight: 10,
      background: T.bg, border: `1px solid ${T.line2}`,
      color: T.text, fontFamily: MONO, fontSize: 11, outline: 'none',
      boxSizing: 'border-box', opacity: disabled ? 0.5 : 1,
    }}
  />
);

const TextAreaInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, disabled }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    rows={3}
    style={{
      width: '100%', padding: '8px 10px',
      background: T.bg, border: `1px solid ${T.line2}`,
      color: T.text, fontFamily: MONO, fontSize: 11, outline: 'none',
      boxSizing: 'border-box', resize: 'none', opacity: disabled ? 0.5 : 1,
    }}
  />
);

// ── Entry form ────────────────────────────────────────────────────────

type FormState = {
  domain: string;
  username: string;
  password: string;
  label: string;
  notes: string;
};

const emptyForm = (): FormState => ({ domain: '', username: '', password: '', label: '', notes: '' });

const EntryForm: React.FC<{
  initial?: FormState;
  isBusy: boolean;
  onSubmit: (f: FormState) => void;
  onCancel: () => void;
  isEdit: boolean;
}> = ({ initial, isBusy, onSubmit, onCancel, isEdit }) => {
  const [form, setForm] = useState<FormState>(initial ?? emptyForm());
  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const canSubmit = form.domain.trim() && form.username.trim() && form.password.trim();

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit && !isBusy) onSubmit(form); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div>
        <FieldLabel>Domain</FieldLabel>
        <TextInput value={form.domain} onChange={set('domain')} placeholder="github.com" autoFocus disabled={isBusy} />
      </div>
      <div>
        <FieldLabel>Username / Email</FieldLabel>
        <TextInput value={form.username} onChange={set('username')} placeholder="user@example.com" disabled={isBusy} />
      </div>
      <div>
        <FieldLabel>Password</FieldLabel>
        <PwField value={form.password} onChange={set('password')} placeholder="•••••••••" disabled={isBusy} />
      </div>
      <div>
        <FieldLabel>Label (optional)</FieldLabel>
        <TextInput value={form.label} onChange={set('label')} placeholder="Work, Personal…" disabled={isBusy} />
      </div>
      <div>
        <FieldLabel>Notes (optional)</FieldLabel>
        <TextAreaInput value={form.notes} onChange={set('notes')} placeholder="Recovery email, 2FA backup…" disabled={isBusy} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || isBusy}
          style={{
            flex: 1, height: 32,
            background: (!canSubmit || isBusy) ? T.mute2 : T.accent,
            border: 'none', color: T.bg,
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: (!canSubmit || isBusy) ? 'default' : 'pointer',
            opacity: (!canSubmit || isBusy) ? 0.6 : 1,
          }}
        >
          {isEdit ? 'Save changes' : 'Add entry'}
        </button>
      </div>
    </form>
  );
};

// ── Inspector panel ───────────────────────────────────────────────────

type InspectorMode = 'view' | 'edit' | 'delete-confirm';

const Inspector: React.FC<{
  entry: PasswordSummary;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, f: FormState) => Promise<void>;
  isBusy: boolean;
}> = ({ entry, onDelete, onUpdate, isBusy }) => {
  const [mode, setMode] = useState<InspectorMode>('view');
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const prevId = useRef(entry.id);

  useEffect(() => {
    if (prevId.current !== entry.id) {
      prevId.current = entry.id;
      setMode('view');
      setRevealedPassword(null);
    }
  }, [entry.id]);

  const handleReveal = async (): Promise<void> => {
    if (revealedPassword !== null) {
      setRevealedPassword(null);
      return;
    }
    setIsRevealing(true);
    try {
      const r = await window.electronAPI.getPasswordsForDomain({ domain: entry.domain });
      if (!r.ok) { toast.error(r.error); return; }
      const match = (r.data as PasswordDetail[]).find((d) => d.id === entry.id);
      if (match) setRevealedPassword(match.password);
      else toast.error('Password not found.');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopyUsername = async (): Promise<void> => {
    await navigator.clipboard.writeText(entry.username);
    toast.success('Username copied.');
  };

  const handleCopyPassword = async (): Promise<void> => {
    let pw = revealedPassword;
    if (!pw) {
      const r = await window.electronAPI.getPasswordsForDomain({ domain: entry.domain });
      if (!r.ok) { toast.error(r.error); return; }
      const match = (r.data as PasswordDetail[]).find((d) => d.id === entry.id);
      if (!match) { toast.error('Password not found.'); return; }
      pw = match.password;
    }
    await navigator.clipboard.writeText(pw);
    toast.success('Password copied.');
  };

  if (mode === 'edit') {
    const initial: FormState = {
      domain: entry.domain,
      username: entry.username,
      label: entry.label ?? '',
      password: '',
      notes: '',
    };
    return (
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 16, color: T.text, margin: '0 0 16px' }}>Edit entry</p>
        <EntryForm
          initial={initial}
          isBusy={isBusy}
          isEdit
          onCancel={() => setMode('view')}
          onSubmit={(f) => void onUpdate(entry.id, f).then(() => setMode('view'))}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Domain */}
      <div>
        <FieldLabel>Domain</FieldLabel>
        <p style={{ fontFamily: MONO, fontSize: 12, color: T.text, margin: 0 }}>{entry.domain}</p>
      </div>

      {/* Username */}
      <div>
        <FieldLabel>Username</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: T.text, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.username}
          </p>
          <button
            type="button"
            onClick={() => void handleCopyUsername()}
            title="Copy username"
            style={{ background: 'none', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}
          >
            <IcoCopy /> Copy
          </button>
        </div>
      </div>

      {/* Password */}
      <div>
        <FieldLabel>Password</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: T.text, margin: 0, flex: 1, letterSpacing: revealedPassword ? '0.02em' : '0.14em' }}>
            {revealedPassword ?? '••••••••••••'}
          </p>
          <button
            type="button"
            onClick={() => void handleReveal()}
            disabled={isRevealing}
            title={revealedPassword ? 'Hide' : 'Reveal'}
            style={{ background: 'none', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}
          >
            <IcoEye crossed={!!revealedPassword} /> {revealedPassword ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyPassword()}
            title="Copy password"
            style={{ background: 'none', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 9 }}
          >
            <IcoCopy /> Copy
          </button>
        </div>
      </div>

      {/* Label */}
      {entry.label && (
        <div>
          <FieldLabel>Label</FieldLabel>
          <p style={{ fontFamily: MONO, fontSize: 11, color: T.mute, margin: 0 }}>{entry.label}</p>
        </div>
      )}

      {/* Timestamps */}
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, margin: 0 }}>
          Added {formatRelative(entry.createdAt)} · Updated {formatRelative(entry.updatedAt)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setMode('edit')}
          style={{ flex: 1, height: 28, background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <IcoEdit /> Edit
        </button>
        {mode === 'delete-confirm' ? (
          <button
            type="button"
            onClick={() => void onDelete(entry.id)}
            disabled={isBusy}
            style={{ flex: 1, height: 28, background: T.dangerGlow, border: `1px solid ${T.danger}`, color: T.danger, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Confirm delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode('delete-confirm')}
            style={{ flex: 1, height: 28, background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <IcoTrash /> Delete
          </button>
        )}
      </div>
      {mode === 'delete-confirm' && (
        <button
          type="button"
          onClick={() => setMode('view')}
          style={{ height: 24, background: 'none', border: 'none', color: T.mute2, fontFamily: MONO, fontSize: 9, cursor: 'pointer' }}
        >
          Cancel
        </button>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────

export const PasswordManagerPage: React.FC = () => {
  const [entries, setEntries] = useState<PasswordSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await window.electronAPI.listPasswords();
      if (r.ok) setEntries(r.data);
      else toast.error(r.error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.domain.includes(q) || e.username.toLowerCase().includes(q) || (e.label ?? '').toLowerCase().includes(q),
    );
  }, [entries, search]);

  const selectedEntry = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const handleAdd = async (form: FormState): Promise<void> => {
    setIsBusy(true);
    try {
      const input: CreatePasswordInput = {
        domain: form.domain,
        username: form.username,
        password: form.password,
        label: form.label || undefined,
        notes: form.notes || undefined,
      };
      const r = await window.electronAPI.createPassword(input);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Password saved.');
      setShowAdd(false);
      await load();
      setSelectedId(r.data.id);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdate = async (id: string, form: FormState): Promise<void> => {
    setIsBusy(true);
    try {
      const input: UpdatePasswordInput = {
        id,
        domain: form.domain,
        username: form.username,
        password: form.password,
        label: form.label || undefined,
        notes: form.notes || undefined,
      };
      const r = await window.electronAPI.updatePassword(input);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Entry updated.');
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setIsBusy(true);
    try {
      const r = await window.electronAPI.deletePassword({ id });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Entry deleted.');
      setSelectedId(null);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.accent }}>
          <IcoKey />
          <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 16, color: T.text }}>Passwords</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, letterSpacing: '0.06em' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · aes-256-gcm
        </span>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', width: 200 }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={T.mute2} strokeWidth="1.4" strokeLinecap="round" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="5" cy="5" r="3.5"/><line x1="8" y1="8" x2="11" y2="11"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: '100%', height: 28, paddingLeft: 26, paddingRight: 8, background: T.bg2, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: 10, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="button"
          onClick={() => { setShowAdd(true); setSelectedId(null); }}
          style={{ height: 28, padding: '0 12px', background: T.accent, border: 'none', color: T.bg, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <IcoPlus /> Add
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: `1px solid ${T.line}`, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 24, fontFamily: MONO, fontSize: 10, color: T.mute2 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, margin: 0 }}>
                {search ? 'No entries match your search.' : 'No passwords saved yet.'}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  style={{ height: 28, padding: '0 12px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: '0.06em' }}
                >
                  Add your first entry
                </button>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                  {(['№', 'Domain', 'Username', 'Label', 'Saved'] as const).map((h, i) => (
                    <th key={h} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, fontWeight: 400, textAlign: 'left', padding: '6px 10px', width: i === 0 ? 36 : undefined }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const isSelected = e.id === selectedId;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => { setSelectedId(e.id); setShowAdd(false); }}
                      style={{
                        borderBottom: `1px solid ${T.line}`,
                        background: isSelected ? T.accentGlow : 'none',
                        borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, padding: '8px 10px' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td style={{ fontFamily: MONO, fontSize: 10, color: isSelected ? T.accent : T.text, padding: '8px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.domain}
                      </td>
                      <td style={{ fontFamily: MONO, fontSize: 10, color: T.mute, padding: '8px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.username}
                      </td>
                      <td style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, padding: '8px 10px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.label ?? '—'}
                      </td>
                      <td style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {formatRelative(e.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Inspector toggle strip */}
        <button
          type="button"
          onClick={() => setInspectorOpen((o) => !o)}
          style={{
            width: 20, background: T.accentGlow, border: 'none',
            borderLeft: `1px solid ${T.accent}`,
            color: T.accent, cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
        >
          <IcoChevron dir={inspectorOpen ? 'right' : 'left'} />
        </button>

        {/* Inspector / Add panel */}
        {inspectorOpen && (
          <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${T.line}`, overflowY: 'auto', background: T.bg2 }}>
            {showAdd ? (
              <div style={{ padding: '16px 20px' }}>
                <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 16, color: T.text, margin: '0 0 16px' }}>New entry</p>
                <EntryForm
                  isBusy={isBusy}
                  isEdit={false}
                  onCancel={() => setShowAdd(false)}
                  onSubmit={(f) => void handleAdd(f)}
                />
              </div>
            ) : selectedEntry ? (
              <Inspector
                entry={selectedEntry}
                isBusy={isBusy}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            ) : (
              <div style={{ padding: 20, fontFamily: MONO, fontSize: 10, color: T.mute2 }}>
                Select an entry to view details.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

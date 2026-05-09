import React, { useEffect, useRef, useState } from 'react';

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
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type RenameItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (newName: string) => void;
};

const splitName = (name: string): { base: string; ext: string } => {
  const i = name.lastIndexOf('.');
  if (i > 0) return { base: name.slice(0, i), ext: name.slice(i + 1) };
  return { base: name, ext: '' };
};

export const RenameItemDialog = ({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: RenameItemDialogProps): React.JSX.Element => {
  const { base: initialBase, ext: initialExt } = splitName(currentName);
  const [base, setBase] = useState(initialBase);
  const [ext, setExt] = useState(initialExt);
  const baseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const { base: b, ext: e } = splitName(currentName);
      setBase(b);
      setExt(e);
      setTimeout(() => { baseRef.current?.select(); }, 50);
    }
  }, [open, currentName]);

  const buildName = (): string => {
    const cleanExt = ext.trim().replace(/^\.+/, '');
    return cleanExt ? `${base.trim()}.${cleanExt}` : base.trim();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const newName = buildName();
    if (!newName || newName === currentName) { onOpenChange(false); return; }
    onConfirm(newName);
    onOpenChange(false);
  };

  const isValid = base.trim().length > 0;

  if (!open) return <></>;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{ width: 380, background: T.bg2, border: `1px solid ${T.line2}`, padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, color: T.text, margin: '0 0 18px' }}>Rename</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={baseRef}
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="File name"
              autoFocus
              style={{ flex: 1, minWidth: 0, height: 36, padding: '0 10px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: 11, outline: 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', width: 80, height: 36, border: `1px solid ${T.line2}`, background: T.bg, padding: '0 8px' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: T.mute2, userSelect: 'none' }}>.</span>
              <input
                value={ext}
                onChange={(e) => setExt(e.target.value.replace(/^\.+/, ''))}
                placeholder="ext"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: T.text, fontFamily: MONO, fontSize: 11, outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              style={{ height: 32, padding: '0 14px', background: isValid ? T.accent : T.accentGlow, border: `1px solid ${T.accent}`, color: isValid ? T.bg : T.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isValid ? 'pointer' : 'default' }}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

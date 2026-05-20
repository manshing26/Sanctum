import React from 'react';
import type { ConflictAction, ConflictItem, ConflictResolution } from '../../../../shared/ipc';
import { fontSize } from '../../../theme/typography';

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
  warn:       '#c08a5e',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type ImportConflictDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  onConfirm: (decisions: ConflictResolution[]) => void;
};

const ACTION_LABELS: Record<ConflictAction, string> = {
  replace:   'Replace',
  keep_both: 'Keep both',
  skip:      'Skip',
};

const CONFLICT_TYPE_LABEL: Record<ConflictItem['conflictType'], string> = {
  exact_duplicate: 'Exact duplicate',
  name_conflict:   'Name conflict',
};

export const ImportConflictDialog = ({
  open,
  onOpenChange,
  conflicts,
  onConfirm,
}: ImportConflictDialogProps): React.JSX.Element => {
  const [decisions, setDecisions] = React.useState<Map<string, ConflictAction>>(
    () => new Map(conflicts.map((c) => [c.filePath, 'skip'])),
  );

  React.useEffect(() => {
    setDecisions(new Map(conflicts.map((c) => [c.filePath, 'skip'])));
  }, [conflicts]);

  const setAll = (action: ConflictAction): void => {
    setDecisions(new Map(conflicts.map((c) => [c.filePath, action])));
  };

  const setOne = (filePath: string, action: ConflictAction): void => {
    setDecisions((prev) => new Map(prev).set(filePath, action));
  };

  const handleConfirm = (): void => {
    const result: ConflictResolution[] = conflicts.map((c) => ({
      filePath: c.filePath,
      action: decisions.get(c.filePath) ?? 'skip',
      existingItemId: c.existingItemId,
    }));
    onConfirm(result);
  };

  if (!open) return <></>;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{ width: 560, background: T.bg2, border: `1px solid ${T.line2}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(20), color: T.text, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke={T.warn} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1L13 12H1Z"/><line x1="7" y1="5" x2="7" y2="8.5"/><circle cx="7" cy="10.5" r="0.6" fill={T.warn} stroke="none"/>
            </svg>
            Import conflicts ({conflicts.length})
          </p>
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>
            The following files already exist in the destination. Choose what to do for each.
          </p>
        </div>

        {/* Apply-to-all */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute2 }}>Apply to all:</span>
          {(['replace', 'keep_both', 'skip'] as ConflictAction[]).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setAll(action)}
              style={{ height: 24, padding: '0 10px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>

        {/* Conflict list */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '10px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conflicts.map((conflict) => {
            const current = decisions.get(conflict.filePath) ?? 'skip';
            const isExact = conflict.conflictType === 'exact_duplicate';
            return (
              <div key={conflict.filePath} style={{ border: `1px solid ${T.line2}`, background: T.bg, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.text, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conflict.fileName}</p>
                    <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute, margin: 0 }}>
                      Existing: <span style={{ fontStyle: 'italic' }}>{conflict.existingItemName}</span>
                    </p>
                  </div>
                  <span style={{
                    flexShrink: 0, padding: '2px 7px',
                    border: `1px solid ${isExact ? T.line2 : T.warn}`,
                    background: isExact ? 'none' : 'rgba(192,138,94,0.08)',
                    color: isExact ? T.mute : T.warn,
                    fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    {CONFLICT_TYPE_LABEL[conflict.conflictType]}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {(['replace', 'keep_both', 'skip'] as ConflictAction[]).map((action) => {
                    const isActive = current === action;
                    const activeColor = action === 'replace' ? T.danger : action === 'keep_both' ? T.accent : T.mute;
                    const activeGlow  = action === 'replace' ? T.dangerGlow : action === 'keep_both' ? T.accentGlow : 'rgba(121,129,122,0.10)';
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => setOne(conflict.filePath, action)}
                        style={{
                          flex: 1, height: 26,
                          background: isActive ? activeGlow : 'none',
                          border: `1px solid ${isActive ? activeColor : T.line2}`,
                          color: isActive ? activeColor : T.mute,
                          fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 24px 18px', borderTop: `1px solid ${T.line}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{ height: 32, padding: '0 14px', background: T.accent, border: `1px solid ${T.accent}`, color: T.bg, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';

const T = {
  bg:       '#0a0c0b',
  bg2:      '#10110f',
  line:     'rgba(220,220,200,0.07)',
  line2:    'rgba(220,220,200,0.12)',
  text:     '#e8e6dc',
  mute:     '#79817a',
  mute2:    '#4d524d',
  accent:   '#7c9a92',
  danger:   '#c36b5f',
  dangerGlow: 'rgba(195,107,95,0.10)',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type DeleteFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  onKeepFiles: () => void;
  onDeleteFiles: () => void;
  isBusy?: boolean;
};

export const DeleteFolderDialog = ({
  open,
  onOpenChange,
  folderName,
  onKeepFiles,
  onDeleteFiles,
  isBusy = false,
}: DeleteFolderDialogProps): React.JSX.Element => {
  if (!open) return <></>;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
      onClick={() => { if (!isBusy) onOpenChange(false); }}
    >
      <div
        style={{ width: 420, background: T.bg2, border: `1px solid ${T.line2}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, color: T.text, margin: '0 0 4px' }}>Delete folder</p>
          <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute, margin: 0 }}>
            "{folderName}" contains files. What would you like to do with them?
          </p>
        </div>

        {/* Options */}
        <div style={{ padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            disabled={isBusy}
            onClick={onKeepFiles}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              background: 'none', border: `1px solid ${T.line2}`,
              cursor: isBusy ? 'default' : 'pointer',
              textAlign: 'left', opacity: isBusy ? 0.5 : 1,
              transition: 'border-color 0.1s',
            }}
            onMouseEnter={(e) => { if (!isBusy) (e.currentTarget as HTMLButtonElement).style.borderColor = T.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.line2; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={T.mute} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M1 3.5h5l1.5 1.5H13v7H1z"/>
            </svg>
            <div>
              <p style={{ fontFamily: MONO, fontSize: 11, color: T.text, margin: '0 0 3px' }}>Keep files</p>
              <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute, margin: 0 }}>Files are moved to root and the folder is removed.</p>
            </div>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onDeleteFiles}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              background: T.dangerGlow, border: `1px solid ${T.danger}`,
              cursor: isBusy ? 'default' : 'pointer',
              textAlign: 'left', opacity: isBusy ? 0.5 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={T.danger} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="2,3.5 12,3.5"/><path d="M5 3.5V2.5h4v1"/><rect x="3" y="3.5" width="8" height="9"/>
              <line x1="5.5" y1="6" x2="5.5" y2="10"/><line x1="8.5" y1="6" x2="8.5" y2="10"/>
            </svg>
            <div>
              <p style={{ fontFamily: MONO, fontSize: 11, color: T.danger, margin: '0 0 3px' }}>Delete files</p>
              <p style={{ fontFamily: MONO, fontSize: 10, color: T.danger, opacity: 0.7, margin: 0 }}>Permanently delete the folder and all files inside. Cannot be undone.</p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 18px' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
            style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isBusy ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import type { SecuritySettings, TagSummary, VaultItemSummary } from '../../../../shared/ipc';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/Sheet';
import { StarRating } from '../../../components/ui/StarRating';
import { getVaultFileKind, isPreviewableMimeType } from '../../../../shared/fileTypes';

const T = {
  bg: '#0a0c0b',
  line: 'rgba(220,220,200,0.07)',
  line2: 'rgba(220,220,200,0.12)',
  text: '#e8e6dc',
  mute: '#79817a',
  mute2: '#4d524d',
  accent: '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.15)',
  warn: '#d6a84f',
  danger: '#c36b5f',
};
const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

type ItemDetailsPanelProps = {
  item: VaultItemSummary | null;
  thumbnailUrl?: string;
  tags: TagSummary[];
  securitySettings: SecuritySettings;
  onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void;
  onUpdateSecureDeleteDefault: (enabled: boolean) => void;
  onOpenItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onExportItem?: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onRenameItem: (itemId: string, newName: string) => void;
  onSetRating: (itemId: string, rating: number | null) => void;
  onGoToFolder?: (itemId: string) => void;
  selectedCount: number;
};

const actionBtn = (variant: 'default' | 'ghost' | 'danger' | 'warn'): React.CSSProperties => ({
  height: 28, padding: '0 12px',
  background: variant === 'default' ? T.accent : variant === 'danger' ? T.danger : variant === 'warn' ? T.warn : 'none',
  border: variant === 'ghost' ? `1px solid ${T.line2}` : 'none',
  cursor: 'pointer',
  color: variant === 'ghost' ? T.mute : '#0a0c0b',
  fontFamily: MONO, fontSize: 10,
  letterSpacing: '0.06em', textTransform: 'uppercase' as const,
  borderRadius: 0,
});

const iconBtn = (): React.CSSProperties => ({
  width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: `1px solid ${T.line2}`,
  cursor: 'pointer', color: T.mute, padding: 0, borderRadius: 0,
  flexShrink: 0,
});

const fieldRow = (label: string, value: React.ReactNode, mono = false): React.ReactNode => (
  <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6, alignItems: 'start' }}>
    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, paddingTop: 1 }}>{label}</span>
    <span style={{ fontFamily: mono ? MONO : 'inherit', fontSize: mono ? 10 : 12, color: T.text, wordBreak: 'break-all' }}>{value}</span>
  </div>
);

// ── Inline details content ────────────────────────────────────────────
const DetailsContent: React.FC<ItemDetailsPanelProps> = ({
  item,
  thumbnailUrl,
  tags,
  onToggleTag,
  onOpenItem,
  onDeleteItem,
  onExportItem,
  onToggleFavorite,
  onRenameItem,
  onSetRating,
  onGoToFolder,
  selectedCount,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [baseDraft, setBaseDraft] = useState('');
  const [extDraft, setExtDraft] = useState('');

  const splitName = (name: string): { base: string; ext: string } => {
    const i = name.lastIndexOf('.');
    return i > 0 ? { base: name.slice(0, i), ext: name.slice(i + 1) } : { base: name, ext: '' };
  };

  const buildName = (): string => {
    const cleanExt = extDraft.trim().replace(/^\.+/, '');
    return cleanExt ? `${baseDraft.trim()}.${cleanExt}` : baseDraft.trim();
  };

  useEffect(() => {
    const { base, ext } = splitName(item?.originalName ?? '');
    setBaseDraft(base);
    setExtDraft(ext);
    setIsRenaming(false);
  }, [item?.id, item?.originalName]);

  if (!item) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: T.mute }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.4}>
          <rect x="3" y="3" width="12" height="12" /><rect x="17" y="3" width="12" height="12" />
          <rect x="3" y="17" width="12" height="12" /><rect x="17" y="17" width="12" height="12" />
        </svg>
        <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: T.mute2 }}>Select an object to inspect</p>
      </div>
    );
  }

  if (selectedCount > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0' }}>
        <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>{selectedCount} objects selected</p>
        <p style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, opacity: 0.7 }}>Select a single object for details</p>
      </div>
    );
  }

  const fileKind = getVaultFileKind(item.mimeType);
  const isVid = fileKind === 'video';
  const canPreview = isPreviewableMimeType(item.mimeType);

  return (
    <div style={{ padding: '16px 14px' }}>
      {/* Thumbnail preview */}
      <div style={{ aspectRatio: '4/3', marginBottom: 14, overflow: 'hidden', background: '#0d0f0d', border: `1px solid ${T.line}` }}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={item.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isVid ? (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <rect x="2" y="3" width="16" height="22" /><polyline points="18,7 26,4 26,24 18,21" />
              </svg>
            ) : fileKind === 'document' ? (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <path d="M8 3h8l5 5v17H8z" />
                <path d="M16 3v6h5" />
                <line x1="11" y1="14" x2="17" y2="14" />
                <line x1="11" y1="18" x2="17" y2="18" />
                <line x1="11" y1="22" x2="15" y2="22" />
              </svg>
            ) : fileKind === 'image' ? (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <rect x="2" y="2" width="24" height="24" /><circle cx="9" cy="9" r="3" />
                <polyline points="2,19 8,13 13,18 18,14 26,19 26,26 2,26" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <path d="M8 3h8l5 5v17H8z" />
                <path d="M16 3v6h5" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Name / rename */}
      <div style={{ marginBottom: 14 }}>
        {isRenaming ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              autoFocus
              value={baseDraft}
              onChange={(e) => setBaseDraft(e.target.value)}
              style={{
                flex: 1, minWidth: 80, height: 26,
                background: 'transparent', border: `1px solid ${T.accent}`,
                color: T.text, fontFamily: MONO, fontSize: 11,
                padding: '0 6px', outline: 'none', borderRadius: 0,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { const n = buildName(); if (n && n !== item.originalName) onRenameItem(item.id, n); setIsRenaming(false); }
                if (e.key === 'Escape') { const { base, ext } = splitName(item.originalName); setBaseDraft(base); setExtDraft(ext); setIsRenaming(false); }
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', height: 26, border: `1px solid ${T.line2}`, padding: '0 4px', gap: 2 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>.</span>
              <input
                value={extDraft}
                onChange={(e) => setExtDraft(e.target.value.replace(/^\.+/, ''))}
                placeholder="ext"
                style={{ width: 32, background: 'transparent', border: 'none', color: T.text, fontFamily: MONO, fontSize: 10, outline: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { const n = buildName(); if (n && n !== item.originalName) onRenameItem(item.id, n); setIsRenaming(false); }
                  if (e.key === 'Escape') { const { base, ext } = splitName(item.originalName); setBaseDraft(base); setExtDraft(ext); setIsRenaming(false); }
                }}
              />
            </div>
            <button type="button" disabled={!baseDraft.trim() || buildName() === item.originalName}
              onClick={() => { const n = buildName(); if (n && n !== item.originalName) onRenameItem(item.id, n); setIsRenaming(false); }}
              style={{ ...iconBtn(), borderColor: T.accent, color: T.accent }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1.5 5l2.5 2.5 5-5" />
              </svg>
            </button>
            <button type="button" onClick={() => { const { base, ext } = splitName(item.originalName); setBaseDraft(base); setExtDraft(ext); setIsRenaming(false); }} style={iconBtn()}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ flex: 1, minWidth: 0, fontFamily: SERIF, fontSize: 16, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {item.originalName}
            </p>
            <button type="button" onClick={() => setIsRenaming(true)} title="Rename" style={iconBtn()}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M7 1.5l2.5 2.5-6 6H1v-2.5z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button type="button" onClick={() => onOpenItem(item.id)} style={{ ...actionBtn(canPreview ? 'default' : 'warn'), flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="5.5" cy="5.5" r="4.5" /><circle cx="5.5" cy="5.5" r="1.8" />
          </svg>
          {canPreview ? 'Open' : 'Open Read-Only Copy'}
        </button>
        <button type="button"
          onClick={() => onToggleFavorite(item.id, !item.isFavorite)}
          title={item.isFavorite ? 'Unfavourite' : 'Favourite'}
          style={{ ...iconBtn(), background: item.isFavorite ? T.accentGlow : 'none', borderColor: item.isFavorite ? T.accent : T.line2, color: item.isFavorite ? T.accent : T.mute }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill={item.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
          </svg>
        </button>
        <button type="button" onClick={() => onDeleteItem(item.id)} title="Delete" style={{ ...iconBtn(), borderColor: T.danger, color: T.danger }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3">
            <polyline points="1.5,2.5 9.5,2.5" /><path d="M3 2.5V1.5h5v1" /><rect x="2" y="2.5" width="7" height="8" />
          </svg>
        </button>
      </div>
      {fileKind !== 'image' && fileKind !== 'video' && onExportItem && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <button type="button" onClick={() => onExportItem(item.id)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="5,1 5,6.5" /><polyline points="2.5,4 5,6.5 7.5,4" /><line x1="1.5" y1="8.5" x2="8.5" y2="8.5" /></svg>
            Export
          </button>
        </div>
      )}
      {item.folderId != null && onGoToFolder && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <button type="button" onClick={() => onGoToFolder(item.id)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 8V3a1 1 0 0 1 1-1h2l1 1h3a1 1 0 0 1 1 1v4z" /></svg>
            Go to Folder
          </button>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Metadata fields */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 10 }}>· Info ·</div>
        {fieldRow('Type', item.mimeType, true)}
        {fieldRow('Size', formatFileSize(item.size), true)}
        {item.width && item.height && fieldRow('Dimensions', `${item.width} × ${item.height}`, true)}
        {item.durationSeconds !== undefined && item.durationSeconds > 0 && fieldRow('Duration', `${item.durationSeconds.toFixed(1)}s`, true)}
        {fieldRow('Cipher', <span style={{ color: T.accent, fontFamily: MONO, fontSize: 10 }}>aes-256-gcm</span>)}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Rating */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Rating ·</div>
        <StarRating value={item.rating} onChange={(rating) => onSetRating(item.id, rating)} />
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Tags */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Tags ·</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((tag) => {
            const assigned = Boolean(item.tagIds?.includes(tag.id));
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(item.id, tag.id, assigned)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px',
                  background: assigned ? T.accentGlow : 'none',
                  border: `1px solid ${assigned ? T.accent : T.line2}`,
                  cursor: 'pointer',
                  color: assigned ? T.accent : T.mute,
                  fontFamily: MONO, fontSize: 10, borderRadius: 0,
                }}
              >
                {tag.color && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                )}
                {tag.name}
                {assigned && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                )}
              </button>
            );
          })}
          {tags.length === 0 && (
            <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>No tags available</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Inline sidebar ────────────────────────────────────────────────────
export const ItemDetailsSidebar: React.FC<ItemDetailsPanelProps> = (props) => (
  <div style={{ height: '100%', overflowY: 'auto', background: T.bg }}>
    <DetailsContent {...props} />
  </div>
);

// ── Sheet panel (for smaller screens) ────────────────────────────────
export const ItemDetailsSheet: React.FC<
  ItemDetailsPanelProps & { open: boolean; onOpenChange: (open: boolean) => void }
> = ({ open, onOpenChange, ...props }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-80 p-0">
      <div style={{ borderBottom: `1px solid ${T.line}`, padding: '10px 14px' }}>
        <SheetTitle style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2 }}>
          Inspector
        </SheetTitle>
      </div>
      <div style={{ height: 'calc(100vh - 44px)', overflowY: 'auto' }}>
        <DetailsContent {...props} />
      </div>
    </SheetContent>
  </Sheet>
);

// Legacy export
export const ItemDetailsPanel = ItemDetailsSidebar;

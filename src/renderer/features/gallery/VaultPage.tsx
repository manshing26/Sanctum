import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  BookmarkSummary,
  ConflictItem,
  ConflictResolution,
  CreateFolderInput,
  FolderNode,
  TagSummary,
  VaultListSort,
} from '../../../shared/ipc';
import { FolderSidebar } from './components/FolderSidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryListView } from './components/GalleryListView';
import { GalleryToolbar } from './components/GalleryToolbar';
import { ItemDetailsSidebar } from './components/ItemDetailsPanel';
import { MoveToFolderDialog } from './components/MoveToFolderDialog';
import { ImportSettingsDialog } from './components/ImportSettingsDialog';
import { DeleteFolderDialog } from './components/DeleteFolderDialog';
import { ImportConflictDialog } from './components/ImportConflictDialog';
import { useGalleryState } from './state/useGalleryState';
import { MediaViewerOverlay } from '../viewer/MediaViewerOverlay';

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
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type VaultPageProps = {
  onMessage?: (message: string) => void;
  onOpenUrlInBrowser?: (url: string) => void;
  onScrapeImages?: () => Promise<string[]>;
};

// ── Bookmark List Row ─────────────────────────────────────────────────
const BookmarkListRow: React.FC<{
  bookmark: BookmarkSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ bookmark, selected, isMultiSelect, onClick }) => {
  const hostname = (() => { try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; } })();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        background: selected ? T.accentGlow : 'none',
        borderBottom: `1px solid ${T.line}`,
        borderLeft: `2px solid ${selected ? T.accent : 'transparent'}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {isMultiSelect && (
        <div style={{
          width: 14, height: 14, flexShrink: 0,
          border: `1px solid ${selected ? T.accent : T.line2}`,
          background: selected ? T.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#0a0c0b" strokeWidth="1.8"><path d="M1.5 4l2 2 3-3" /></svg>}
        </div>
      )}
      {/* Thumbnail */}
      <div style={{ width: 40, height: 28, flexShrink: 0, background: '#0d0f0d', overflow: 'hidden', border: `1px solid ${T.line}` }}>
        {bookmark.thumbnailDataUrl ? (
          <img src={bookmark.thumbnailDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
        )}
      </div>
      {/* Title + hostname */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bookmark.title}
        </p>
        <p style={{ margin: '1px 0 0', fontFamily: MONO, fontSize: 9, color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hostname}
        </p>
      </div>
      {/* Tags */}
      {bookmark.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {bookmark.tags.slice(0, 3).map((t) => (
            <span key={t.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 5px',
              background: T.accentGlow, border: `1px solid ${T.line2}`,
              fontFamily: MONO, fontSize: 8, color: T.accent,
            }}>
              {t.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color }} />}
              {t.name}
            </span>
          ))}
        </div>
      )}
      {/* Date */}
      <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, flexShrink: 0 }}>
        {new Date(bookmark.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
};

// ── Bookmark Card ─────────────────────────────────────────────────────
const BookmarkCard: React.FC<{
  bookmark: BookmarkSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ bookmark, selected, isMultiSelect, onClick }) => {
  const hostname = (() => { try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; } })();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: selected ? T.accentGlow : T.bg2,
        border: `1px solid ${selected ? T.accent : T.line}`,
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none',
        transition: 'border-color 0.1s',
      }}
    >
      {/* Thumbnail / placeholder */}
      <div style={{ aspectRatio: '16/9', background: '#0d0f0d', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {bookmark.thumbnailDataUrl ? (
          <img src={bookmark.thumbnailDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
        )}
        {isMultiSelect && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 16, height: 16,
            border: `1.5px solid ${selected ? T.accent : 'rgba(255,255,255,0.5)'}`,
            background: selected ? T.accent : 'rgba(10,12,11,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {selected && <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#0a0c0b" strokeWidth="2"><path d="M1.5 4.5l2 2 4-4" /></svg>}
          </div>
        )}
      </div>
      {/* Footer */}
      <div style={{ padding: '8px 10px', flex: 1 }}>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 11, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bookmark.title}
        </p>
        <p style={{ margin: '2px 0 0', fontFamily: MONO, fontSize: 9, color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hostname}
        </p>
        {bookmark.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
            {bookmark.tags.map((t) => (
              <span key={t.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 5px',
                background: T.accentGlow,
                border: `1px solid ${T.line2}`,
                fontFamily: MONO, fontSize: 8, color: T.accent,
              }}>
                {t.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color }} />}
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Bookmark Inspector ────────────────────────────────────────────────
const BookmarkInspector: React.FC<{
  bookmark: BookmarkSummary;
  tags: TagSummary[];
  folders: FolderNode[];
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleTag: (bookmarkId: string, tagId: number, assigned: boolean) => void;
  onAssignFolder: (bookmarkId: string, folderId: number | null) => void;
  onOpenInBrowser?: (url: string) => void;
  onChangeThumbnail?: (bookmark: BookmarkSummary) => void;
}> = ({ bookmark, tags, folders, onDelete, onRename, onToggleTag, onAssignFolder, onOpenInBrowser, onChangeThumbnail }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(bookmark.title);

  useEffect(() => {
    setTitleDraft(bookmark.title);
    setIsRenaming(false);
  }, [bookmark.id, bookmark.title]);

  const flatFolders = (nodes: FolderNode[], depth = 0): Array<{ id: number; label: string }> => {
    const out: Array<{ id: number; label: string }> = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` });
      out.push(...flatFolders(n.children, depth + 1));
    }
    return out;
  };

  const iconBtn = (): React.CSSProperties => ({
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: `1px solid ${T.line2}`,
    cursor: 'pointer', color: T.mute, padding: 0, borderRadius: 0, flexShrink: 0,
  });

  const actionBtn = (variant: 'default' | 'ghost' | 'danger'): React.CSSProperties => ({
    height: 28, padding: '0 12px',
    background: variant === 'default' ? T.accent : variant === 'danger' ? T.danger : 'none',
    border: variant === 'ghost' ? `1px solid ${T.line2}` : 'none',
    cursor: 'pointer',
    color: variant === 'ghost' ? T.mute : '#0a0c0b',
    fontFamily: MONO, fontSize: 10,
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    borderRadius: 0,
  });

  const fieldRow = (label: string, value: React.ReactNode): React.ReactNode => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6, alignItems: 'start' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, paddingTop: 1 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.text, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding: '16px 14px' }}>
      {/* Thumbnail */}
      <div style={{ aspectRatio: '16/9', marginBottom: 14, overflow: 'hidden', background: '#0d0f0d', border: `1px solid ${T.line}` }}>
        {bookmark.thumbnailDataUrl ? (
          <img src={bookmark.thumbnailDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
        )}
      </div>

      {/* Title / rename */}
      <div style={{ marginBottom: 14 }}>
        {isRenaming ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              style={{ flex: 1, height: 26, background: 'transparent', border: `1px solid ${T.accent}`, color: T.text, fontFamily: MONO, fontSize: 11, padding: '0 6px', outline: 'none', borderRadius: 0 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (titleDraft.trim() && titleDraft !== bookmark.title) onRename(bookmark.id, titleDraft.trim()); setIsRenaming(false); }
                if (e.key === 'Escape') { setTitleDraft(bookmark.title); setIsRenaming(false); }
              }}
            />
            <button type="button" disabled={!titleDraft.trim() || titleDraft === bookmark.title}
              onClick={() => { if (titleDraft.trim()) onRename(bookmark.id, titleDraft.trim()); setIsRenaming(false); }}
              style={{ ...iconBtn(), borderColor: T.accent, color: T.accent }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 5l2.5 2.5 5-5" /></svg>
            </button>
            <button type="button" onClick={() => { setTitleDraft(bookmark.title); setIsRenaming(false); }} style={iconBtn()}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" /></svg>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ flex: 1, minWidth: 0, fontFamily: SERIF, fontSize: 15, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {bookmark.title}
            </p>
            <button type="button" onClick={() => setIsRenaming(true)} title="Rename" style={iconBtn()}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M7 1.5l2.5 2.5-6 6H1v-2.5z" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {onOpenInBrowser && (
          <button type="button" onClick={() => onOpenInBrowser(bookmark.url)} style={{ ...actionBtn('default'), display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="5.5" r="4.5" /><path d="M5.5 1C5.5 1 7 3 7 5.5S5.5 10 5.5 10M5.5 1C5.5 1 4 3 4 5.5S5.5 10 5.5 10M1 5.5h9" /></svg>
            Open
          </button>
        )}
        <button type="button"
          onClick={() => { void navigator.clipboard.writeText(bookmark.url); toast.success('URL copied.'); }}
          style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="6" height="6" /><path d="M1 7V1h6" /></svg>
          Copy URL
        </button>
        {onChangeThumbnail && (
          <button type="button" onClick={() => onChangeThumbnail(bookmark)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1" y="1" width="8" height="8" /><circle cx="3.5" cy="3.5" r="1" /><polyline points="1,7 3,5 5.5,6.5 7,5 9,7" /></svg>
            Thumbnail
          </button>
        )}
        <button type="button" onClick={() => onDelete(bookmark.id)} style={{ ...iconBtn(), borderColor: T.danger, color: T.danger }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="1.5,2.5 9.5,2.5" /><path d="M3 2.5V1.5h5v1" /><rect x="2" y="2.5" width="7" height="8" /></svg>
        </button>
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Info */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 10 }}>· Info ·</div>
        {fieldRow('URL', <a href="#" onClick={(e) => { e.preventDefault(); onOpenInBrowser?.(bookmark.url); }} style={{ color: T.accent, textDecoration: 'none', wordBreak: 'break-all' }}>{bookmark.url}</a>)}
        {fieldRow('Added', new Date(bookmark.createdAt).toLocaleDateString())}
        {fieldRow('Cipher', <span style={{ color: T.accent }}>aes-256-gcm</span>)}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Folder assignment */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Folder ·</div>
        <select
          value={bookmark.folderId ?? 'none'}
          onChange={(e) => onAssignFolder(bookmark.id, e.target.value === 'none' ? null : Number(e.target.value))}
          style={{ width: '100%', height: 28, background: '#0a0c0b', border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: 10, padding: '0 6px', outline: 'none', borderRadius: 0 }}
        >
          <option value="none">None (root)</option>
          {flatFolders(folders).map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Tags */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Tags ·</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((tag) => {
            const assigned = bookmark.tags.some((t) => t.id === tag.id);
            return (
              <button key={tag.id} type="button" onClick={() => onToggleTag(bookmark.id, tag.id, assigned)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px',
                  background: assigned ? T.accentGlow : 'none',
                  border: `1px solid ${assigned ? T.accent : T.line2}`,
                  cursor: 'pointer', color: assigned ? T.accent : T.mute,
                  fontFamily: MONO, fontSize: 10, borderRadius: 0,
                }}
              >
                {tag.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
                {tag.name}
                {assigned && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>}
              </button>
            );
          })}
          {tags.length === 0 && <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>No tags</p>}
        </div>
      </div>
    </div>
  );
};

// ── Thumbnail picker overlay ──────────────────────────────────────────
const ThumbnailPicker: React.FC<{
  bookmark: BookmarkSummary;
  onScrapeImages?: () => Promise<string[]>;
  onPick: (dataUrl: string, bookmarkId: string) => void;
  onClose: () => void;
}> = ({ bookmark, onScrapeImages, onPick, onClose }) => {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!onScrapeImages) { setLoading(false); return; }
    void onScrapeImages().then((imgs) => { setCandidates(imgs); setLoading(false); });
  }, [onScrapeImages]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
      <div style={{ background: '#14160f', border: `1px solid ${T.line2}`, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute }}>Choose thumbnail — {bookmark.title}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: T.mute }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={T.accent} strokeWidth="1.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M14 8A6 6 0 1 1 8 2" /></svg>
              <span style={{ fontFamily: MONO, fontSize: 10 }}>Scraping page images…</span>
            </div>
          ) : candidates.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, textAlign: 'center', padding: '32px 0' }}>No images found on the active tab.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 84px)', gap: 8 }}>
              {candidates.map((src, i) => (
                <div key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(src, bookmark.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPick(src, bookmark.id); }}
                  style={{ width: 84, height: 84, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${T.line}`, flexShrink: 0 }}
                >
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────
const parseFileUrlToPath = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'file:') return null;
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
    return pathname;
  } catch {
    return null;
  }
};

const extractDroppedFilePaths = (dataTransfer: DataTransfer): string[] => {
  const paths = new Set<string>();
  for (const file of Array.from(dataTransfer.files)) {
    const maybePath = window.electronAPI.getPathForFile(file) || (file as { path?: string }).path;
    if (maybePath) paths.add(maybePath);
  }
  for (const item of Array.from(dataTransfer.items)) {
    const maybeFile = item.getAsFile();
    const maybePath = maybeFile
      ? window.electronAPI.getPathForFile(maybeFile) || (maybeFile as { path?: string }).path
      : undefined;
    if (maybePath) paths.add(maybePath);
  }
  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parsed = parseFileUrlToPath(trimmed);
      if (parsed) paths.add(parsed);
    }
  }
  return [...paths];
};

const findFolderNameById = (nodes: FolderNode[], folderId: number): string | null => {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as FolderNode;
    if (node.id === folderId) return node.name;
    stack.push(...node.children);
  }
  return null;
};

// ── VaultPage ─────────────────────────────────────────────────────────
export const VaultPage = ({ onOpenUrlInBrowser, onScrapeImages }: VaultPageProps): React.JSX.Element => {
  const state = useGalleryState();
  const {
    allItems, filteredItems, isLoading, thumbnails, hydrateThumbnails,
    folders, tags, securitySettings, searchTerm, sort,
    selectedFolderId, selectedViewScope, selectedTagIds, selectedItem,
    selectedItemIds, secureDelete, importFolderId, showFavoritesOnly,
    setSearchTerm, setSelectedFolderId, setSelectedViewScope, setSelectedTagIds,
    toggleSelectedItem, setSelectedItems, clearSelection,
    setSecuritySettings, setSecureDelete, setImportFolderId, setShowFavoritesOnly,
    loadFirstPage, refresh, loadSupportingData,
  } = state;

  // Bookmark state
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [thumbPickerBookmark, setThumbPickerBookmark] = useState<BookmarkSummary | null>(null);
  // null = all bookmarks (no folder filter), number = filter by that folder
  const [bookmarkFolderId, setBookmarkFolderId] = useState<number | null>(null);

  // View scope includes 'bookmark' now
  type VaultScope = 'all' | 'video' | 'image' | 'root' | 'folder' | 'bookmark';
  const vaultScope = selectedViewScope as VaultScope;

  const selectedBookmark = bookmarks.find((b) => b.id === selectedBookmarkId) ?? null;

  // Derive sorted + filtered bookmark list
  const visibleBookmarks = (() => {
    let list = bookmarks.slice();

    // Folder filter
    if (bookmarkFolderId !== null) list = list.filter((b) => b.folderId === bookmarkFolderId);

    // Tag filter
    if (selectedTagIds.length > 0) {
      list = list.filter((b) => selectedTagIds.every((tid) => b.tags.some((t) => t.id === tid)));
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc': return a.title.localeCompare(b.title);
        case 'name_desc': return b.title.localeCompare(a.title);
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return list;
  })();

  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const result = await window.electronAPI.listBookmarks();
      if (result.ok) setBookmarks(result.data);
    } finally {
      setBookmarksLoading(false);
    }
  }, []);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const importToastIdRef = useRef<string | number | null>(null);
  const exportToastIdRef = useRef<string | number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogItemIds, setMoveDialogItemIds] = useState<string[]>([]);
  const [moveDialogSource, setMoveDialogSource] = useState<'single' | 'bulk'>('single');
  const [isMoveBusy, setIsMoveBusy] = useState(false);
  const [importSettingsOpen, setImportSettingsOpen] = useState(false);
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{ folderId: number; folderName: string } | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [conflictDialog, setConflictDialog] = useState<{
    conflicts: ConflictItem[];
    filePaths: string[];
    folderId: number | null;
    deleteOriginals: boolean;
  } | null>(null);

  const RENDER_PAGE = 100;
  const [renderCount, setRenderCount] = useState(RENDER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRenderCount(RENDER_PAGE); }, [filteredItems]);

  const handleSentinelIntersect = useCallback(async (entries: IntersectionObserverEntry[]) => {
    if (!entries[0]?.isIntersecting) return;
    if (renderCount >= filteredItems.length) return;
    setIsLoadingMore(true);
    const next = Math.min(renderCount + RENDER_PAGE, filteredItems.length);
    const newBatch = filteredItems.slice(renderCount, next);
    setRenderCount(next);
    await hydrateThumbnails(newBatch);
    setIsLoadingMore(false);
  }, [renderCount, filteredItems, hydrateThumbnails]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { void handleSentinelIntersect(entries); },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleSentinelIntersect]);

  useEffect(() => {
    if (filteredItems.length === 0) return;
    void hydrateThumbnails(filteredItems.slice(0, RENDER_PAGE));
  }, [filteredItems]);

  useEffect(() => {
    void loadFirstPage().then((result) => {
      if (!result.ok) toast.error(result.error);
    });
    void loadBookmarks();
  }, []);

  useEffect(() => {
    if (vaultScope === 'bookmark') void loadBookmarks();
  }, [vaultScope]);

  useEffect(() => {
    const unsubscribeImport = window.electronAPI.onImportProgress((progress) => {
      const description = progress.currentFile ? progress.currentFile : undefined;
      if (progress.processed < progress.total) {
        const id = importToastIdRef.current ?? toast('Importing files...', { duration: Infinity });
        importToastIdRef.current = id;
        toast(`Importing ${progress.processed}/${progress.total}`, { id, duration: Infinity, description });
      } else if (importToastIdRef.current !== null) {
        toast.dismiss(importToastIdRef.current);
        importToastIdRef.current = null;
      }
    });
    const unsubscribeExport = window.electronAPI.onExportProgress((progress) => {
      const description = progress.currentFile ? progress.currentFile : undefined;
      if (progress.processed < progress.total) {
        const id = exportToastIdRef.current ?? toast('Exporting files...', { duration: Infinity });
        exportToastIdRef.current = id;
        toast(`Exporting ${progress.processed}/${progress.total}`, { id, duration: Infinity, description });
      } else if (exportToastIdRef.current !== null) {
        toast.dismiss(exportToastIdRef.current);
        exportToastIdRef.current = null;
      }
    });
    return () => {
      if (importToastIdRef.current !== null) { toast.dismiss(importToastIdRef.current); importToastIdRef.current = null; }
      if (exportToastIdRef.current !== null) { toast.dismiss(exportToastIdRef.current); exportToastIdRef.current = null; }
      unsubscribeImport();
      unsubscribeExport();
    };
  }, []);

  useEffect(() => {
    if (!viewerItemId) return;
    const stillVisible = filteredItems.some((item) => item.id === viewerItemId);
    if (!stillVisible) {
      toast.info('Viewer closed — item no longer matches filters.');
      setViewerItemId(null);
    }
  }, [viewerItemId, filteredItems]);

  const handleToggleMultiSelect = (): void => {
    if (isMultiSelect) clearSelection();
    setIsMultiSelect((prev) => !prev);
  };

  const handleItemClick = (itemId: string, multiKey = false): void => {
    if (isMultiSelect || multiKey) {
      if (!isMultiSelect) setIsMultiSelect(true);
      toggleSelectedItem(itemId);
    } else {
      setSelectedItems([itemId]);
    }
  };

  const resolveContextTargetIds = (clickedItemId: string): string[] => {
    if (selectedItemIds.length > 1 && selectedItemIds.includes(clickedItemId)) return selectedItemIds;
    return [clickedItemId];
  };

  const handleItemContextMenu = (itemId: string): void => {
    if (!selectedItemIds.includes(itemId)) setSelectedItems([itemId]);
  };

  const handleEmptyBackgroundClick = (): void => {
    if (selectedItemIds.length === 0) return;
    clearSelection();
    setIsMultiSelect(false);
  };

  const clearBookmarkScopeState = (): void => { setSelectedBookmarkIds([]); setIsMultiSelect(false); };
  const handleSelectAllItemsScope = (): void => { setSelectedViewScope('all' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); clearBookmarkScopeState(); };
  const handleSelectVideoScope = (): void => { setSelectedViewScope('video' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); clearBookmarkScopeState(); };
  const handleSelectImageScope = (): void => { setSelectedViewScope('image' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); clearBookmarkScopeState(); };
  const handleSelectRootScope = (): void => { setSelectedViewScope('root' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); clearBookmarkScopeState(); };
  const handleSelectFolderScope = (folderId: number): void => {
    if ((selectedViewScope as string) === 'bookmark') {
      setBookmarkFolderId(folderId);
    } else {
      setSelectedViewScope('folder' as typeof selectedViewScope);
      setSelectedFolderId(folderId);
      setBookmarkFolderId(folderId);
    }
  };
  const handleSelectBookmarkScope = (): void => {
    setSelectedViewScope('bookmark' as typeof selectedViewScope);
    setSelectedFolderId(null);
    setBookmarkFolderId(null);
  };

  const handleSortChange = async (nextSort: VaultListSort): Promise<void> => {
    const wasMultiSelect = isMultiSelect;
    const result = await loadFirstPage(nextSort);
    if (!wasMultiSelect) setIsMultiSelect(false);
    if (!result.ok) toast.error(result.error);
  };

  const handleImport = async (): Promise<void> => {
    const selectedFiles = await window.electronAPI.pickFiles();
    if (selectedFiles.length === 0) return;
    await runImport(selectedFiles, importFolderId, secureDelete);
  };

  const runImport = async (
    filePaths: string[],
    folderId: number | null = importFolderId,
    deleteOriginals = false,
    conflictResolutions?: ConflictResolution[],
  ): Promise<void> => {
    if (!conflictResolutions) {
      const scanResult = await window.electronAPI.scanImportConflicts({ filePaths, folderId });
      if (!scanResult.ok) { toast.error(scanResult.error); return; }
      if (scanResult.data.conflicts.length > 0) {
        setConflictDialog({ conflicts: scanResult.data.conflicts, filePaths, folderId, deleteOriginals });
        return;
      }
    }
    const importResult = await window.electronAPI.importFiles({ filePaths, folderId, deleteOriginals: deleteOriginals || undefined, conflictResolutions });
    if (!importResult.ok) { toast.error(importResult.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) { toast.error(refreshed.error); return; }
    const { imported, skipped, failed } = importResult.data;
    const parts = [`Imported ${imported} file(s)`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (failed > 0) parts.push(`${failed} failed`);
    toast.success(parts.join(', '));
  };

  const handleConflictConfirm = (decisions: ConflictResolution[]): void => {
    if (!conflictDialog) return;
    const { filePaths, folderId, deleteOriginals } = conflictDialog;
    setConflictDialog(null);
    void runImport(filePaths, folderId, deleteOriginals, decisions);
  };

  const handleRefresh = async (): Promise<void> => {
    const result = await refresh();
    if (!result.ok) { toast.error(result.error); return; }
    if (vaultScope === 'bookmark') await loadBookmarks();
    toast.success(`Refreshed.`);
  };

  const handleCreateFolder = async (): Promise<void> => {
    const payload: CreateFolderInput = { name: newFolderName, parentId: newFolderParentId };
    const result = await window.electronAPI.createFolder(payload);
    if (!result.ok) { toast.error(result.error); return; }
    setNewFolderName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) { toast.error(supportResult.error); return; }
    toast.success('Folder created.');
  };

  const handleDeleteFolder = (folderId: number): void => {
    const findNode = (nodes: typeof folders, id: number): (typeof folders)[0] | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    };
    const collectIds = (nodes: typeof folders): Set<number> => {
      const ids = new Set<number>();
      const stack = [...nodes];
      while (stack.length > 0) {
        const node = stack.pop()!;
        ids.add(node.id);
        stack.push(...node.children);
      }
      return ids;
    };
    const node = findNode(folders, folderId);
    const folderName = node?.name ?? 'this folder';
    const subtreeIds = node ? collectIds([node]) : new Set([folderId]);
    const hasFiles = allItems.some((item) => item.folderId != null && subtreeIds.has(item.folderId));
    if (!hasFiles) { void confirmDeleteFolder(false, folderId); return; }
    setDeleteFolderDialog({ folderId, folderName });
  };

  const confirmDeleteFolder = async (deleteItems: boolean, folderIdOverride?: number): Promise<void> => {
    const folderId = folderIdOverride ?? deleteFolderDialog?.folderId;
    if (folderId == null) return;
    setIsDeletingFolder(true);
    try {
      const result = await window.electronAPI.deleteFolder(folderId, deleteItems);
      if (!result.ok) { toast.error(result.error); return; }
      setDeleteFolderDialog(null);
      const refreshed = await refresh();
      if (!refreshed.ok) toast.error(refreshed.error);
      else toast.success(deleteItems ? 'Folder and files deleted.' : 'Folder deleted.');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleCreateTag = async (color?: string): Promise<void> => {
    const result = await window.electronAPI.createTag({ name: newTagName, color });
    if (!result.ok) { toast.error(result.error); return; }
    setNewTagName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) toast.error(supportResult.error);
    else toast.success('Tag created.');
  };

  const handleDeleteTag = async (tagId: number): Promise<void> => {
    const result = await window.electronAPI.deleteTag(tagId);
    if (!result.ok) { toast.error(result.error); return; }
    if (selectedTagIds.includes(tagId)) setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Tag deleted.');
  };

  const handleDeleteByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) { toast.warning('Select items to delete.'); return; }
    const confirmed = window.confirm(
      itemIds.length === 1 ? 'Delete this item? This cannot be undone.' : `Delete ${itemIds.length} item(s)? This cannot be undone.`,
    );
    if (!confirmed) return;
    for (const itemId of itemIds) {
      const result = await window.electronAPI.deleteVaultItem({ itemId });
      if (!result.ok) { toast.error(result.error); return; }
      if (viewerItemId === itemId) setViewerItemId(null);
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success(itemIds.length === 1 ? 'Item deleted.' : 'Items deleted.');
  };

  const handleDeleteItem = async (itemId: string): Promise<void> => { await handleDeleteByIds([itemId]); };
  const handleToggleFavorite = async (itemId: string, isFavorite: boolean): Promise<void> => {
    const result = await window.electronAPI.toggleFavorite({ itemId, isFavorite });
    if (!result.ok) { toast.error(result.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleSetRating = async (itemId: string, rating: number | null): Promise<void> => {
    const result = await window.electronAPI.setRating({ itemId, rating });
    if (!result.ok) { toast.error(result.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleRenameItem = async (itemId: string, newName: string): Promise<void> => {
    const result = await window.electronAPI.renameVaultItem({ itemId, newName });
    if (!result.ok) { toast.error(result.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Item renamed.');
  };

  const handleExportByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) { toast.warning('Select items to export.'); return; }
    const result = await window.electronAPI.exportItems({ itemIds, targetDir: '' });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(itemIds.length === 1 ? 'Exported.' : `Exported ${result.data.exported} file(s).`);
  };

  const handleExportItem = async (itemId: string): Promise<void> => { await handleExportByIds([itemId]); };
  const handleExportSelected = async (): Promise<void> => { await handleExportByIds(selectedItemIds); };
  const handleDeleteSelected = async (): Promise<void> => { await handleDeleteByIds(selectedItemIds); clearSelection(); };

  const handleToggleFavoriteByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) return;
    const targetItems = filteredItems.filter((item) => itemIds.includes(item.id));
    const allFavorite = targetItems.length > 0 && targetItems.every((item) => item.isFavorite);
    for (const item of targetItems) {
      const result = await window.electronAPI.toggleFavorite({ itemId: item.id, isFavorite: !allFavorite });
      if (!result.ok) { toast.error(result.error); return; }
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleToggleFavoriteSelected = async (): Promise<void> => { await handleToggleFavoriteByIds(selectedItemIds); };

  const openMoveDialogForIds = (itemIds: string[]): void => {
    if (itemIds.length === 0) { toast.warning('Select items to move.'); return; }
    setMoveDialogSource(itemIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds(itemIds);
    setMoveDialogOpen(true);
  };

  const openSingleMoveDialog = (itemId: string): void => { openMoveDialogForIds([itemId]); };
  const openBulkMoveDialog = (): void => { openMoveDialogForIds(selectedItemIds); };

  const handleOpenViewerForIds = (itemIds: string[]): void => {
    if (itemIds.length !== 1) return;
    handleOpenViewer(itemIds[0]);
  };

  const handleConfirmMoveDialog = async (folderId: number | null, itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) return;
    setIsMoveBusy(true);
    const destinationLabel = folderId === null ? 'Root' : findFolderNameById(folders, folderId) ?? 'selected folder';
    try {
      if (isBookmarkScope) {
        await handleAssignFolderSelectedBookmarks(folderId);
        toast.success(`Moved ${selectedBookmarkIds.length} bookmark(s) to ${destinationLabel}.`);
        clearBookmarkSelection();
        return;
      }
      if (moveDialogSource === 'bulk') {
        const result = await window.electronAPI.assignItemsFolder({ itemIds, folderId });
        if (!result.ok) { toast.error(result.error); return; }
      } else {
        const result = await window.electronAPI.assignItemFolder({ itemId: itemIds[0], folderId });
        if (!result.ok) { toast.error(result.error); return; }
      }
      if (folderId !== null) { setSelectedViewScope('folder' as typeof selectedViewScope); setSelectedFolderId(folderId); }
      const refreshed = await refresh();
      if (!refreshed.ok) { toast.error(refreshed.error); return; }
      if (moveDialogSource === 'bulk') toast.success(`Moved ${itemIds.length} item(s) to ${destinationLabel}.`);
      else toast.success(`Moved to ${destinationLabel}.`);
      setMoveDialogOpen(false);
      setMoveDialogItemIds([]);
    } finally {
      setIsMoveBusy(false);
    }
  };

  const handleToggleTag = async (itemId: string, tagId: number, assigned: boolean): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignItemTag({ itemId, tagId })
      : await window.electronAPI.assignItemTag({ itemId, tagId });
    if (!response.ok) { toast.error(response.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleToggleTagFilter = (tagId: number): void => {
    setSelectedTagIds(selectedTagIds.includes(tagId) ? selectedTagIds.filter((id) => id !== tagId) : [...selectedTagIds, tagId]);
  };

  const handleOpenViewer = (itemId: string): void => {
    setSelectedItems([itemId]);
    setViewerItemId(itemId);
  };

  // Bookmark-specific handlers
  const handleDeleteBookmark = async (id: string): Promise<void> => {
    const confirmed = window.confirm('Delete this bookmark? This cannot be undone.');
    if (!confirmed) return;
    const result = await window.electronAPI.deleteBookmark({ id });
    if (!result.ok) { toast.error(result.error); return; }
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBookmarkId === id) setSelectedBookmarkId(null);
    toast.success('Bookmark deleted.');
  };

  const handleRenameBookmark = async (id: string, title: string): Promise<void> => {
    const result = await window.electronAPI.renameBookmark({ id, title });
    if (!result.ok) { toast.error(result.error); return; }
    setBookmarks((prev) => prev.map((b) => b.id === id ? result.data : b));
    toast.success('Bookmark renamed.');
  };

  const handleToggleBookmarkTag = async (bookmarkId: string, tagId: number, assigned: boolean): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignBookmarkTag({ bookmarkId, tagId })
      : await window.electronAPI.assignBookmarkTag({ bookmarkId, tagId });
    if (!response.ok) { toast.error(response.error); return; }
    await loadBookmarks();
  };

  const handleAssignBookmarkFolder = async (bookmarkId: string, folderId: number | null): Promise<void> => {
    const result = await window.electronAPI.assignBookmarkFolder({ bookmarkId, folderId });
    if (!result.ok) { toast.error(result.error); return; }
    await loadBookmarks();
    toast.success('Folder assigned.');
  };

  const handlePickThumb = async (dataUrl: string, bookmarkId: string): Promise<void> => {
    const result = await window.electronAPI.updateBookmarkThumbnail({ id: bookmarkId, thumbnailDataUrl: dataUrl });
    if (!result.ok) { toast.error(result.error); return; }
    setBookmarks((prev) => prev.map((b) => b.id === bookmarkId ? result.data : b));
    setThumbPickerBookmark(null);
    toast.success('Thumbnail updated.');
  };

  // Export bookmarks
  const handleExportBookmarks = async (): Promise<void> => {
    const ids = selectedBookmarkIds.length > 0 ? selectedBookmarkIds : undefined;
    const result = await window.electronAPI.exportBookmarks(ids ? { ids } : undefined);
    if (!result.ok) { toast.error(result.error); return; }
    const blob = new Blob([result.data], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanctum-bookmarks-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(ids ? `Exported ${ids.length} bookmark(s).` : 'Bookmarks exported.');
  };

  // Import bookmarks
  const handleImportBookmarks = async (): Promise<void> => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const html = await file.text();
      const result = await window.electronAPI.importBookmarks({ html });
      if (!result.ok) { toast.error(result.error); return; }
      await loadBookmarks();
      toast.success(`Imported ${result.data.added} bookmarks${result.data.skipped > 0 ? `, ${result.data.skipped} skipped` : ''}.`);
    };
    input.click();
  };

  // Bookmark bulk-select handlers
  const toggleSelectedBookmark = (id: string): void => {
    setSelectedBookmarkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const clearBookmarkSelection = (): void => { setSelectedBookmarkIds([]); };

  const handleDeleteSelectedBookmarks = async (): Promise<void> => {
    if (selectedBookmarkIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedBookmarkIds.length} bookmark(s)? This cannot be undone.`);
    if (!confirmed) return;
    for (const id of selectedBookmarkIds) {
      const result = await window.electronAPI.deleteBookmark({ id });
      if (!result.ok) { toast.error(result.error); return; }
    }
    setBookmarks((prev) => prev.filter((b) => !selectedBookmarkIds.includes(b.id)));
    if (selectedBookmarkId !== null && selectedBookmarkIds.includes(selectedBookmarkId)) setSelectedBookmarkId(null);
    clearBookmarkSelection();
    toast.success(`${selectedBookmarkIds.length} bookmark(s) deleted.`);
  };

  const handleAssignFolderSelectedBookmarks = async (folderId: number | null): Promise<void> => {
    if (selectedBookmarkIds.length === 0) return;
    const result = await window.electronAPI.assignBookmarksFolder({ bookmarkIds: selectedBookmarkIds, folderId });
    if (!result.ok) { toast.error(result.error); return; }
    await loadBookmarks();
    toast.success('Folder assigned.');
    setMoveDialogOpen(false);
  };

  const detailsPanelProps = {
    item: selectedItem,
    tags,
    securitySettings,
    onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void handleToggleTag(itemId, tagId, assigned),
    onOpenItem: handleOpenViewer,
    onDeleteItem: (itemId: string) => void handleDeleteItem(itemId),
    onToggleFavorite: (itemId: string, isFavorite: boolean) => void handleToggleFavorite(itemId, isFavorite),
    onRenameItem: (itemId: string, newName: string) => void handleRenameItem(itemId, newName),
    onSetRating: (itemId: string, rating: number | null) => void handleSetRating(itemId, rating),
    selectedCount: selectedItemIds.length,
    onUpdateSecureDeleteDefault: (enabled: boolean) =>
      void window.electronAPI
        .updateSecuritySettings({ secureDeleteOnImport: enabled })
        .then((result) => {
          if (!result.ok) { toast.error(result.error); return; }
          setSecuritySettings(result.data);
          toast.success(`Secure delete default: ${enabled ? 'on' : 'off'}`);
        }),
  };

  const sharedViewProps = {
    items: filteredItems.slice(0, renderCount),
    thumbnails,
    selectedItemIds,
    onToggleSelect: handleItemClick,
    onSetSelectedItems: setSelectedItems,
    onBeginMarqueeSelection: () => setIsMultiSelect(true),
    onEmptyBackgroundClick: handleEmptyBackgroundClick,
    onOpenItem: handleOpenViewer,
    onToggleFavorite: (itemId: string, isFavorite: boolean) => void handleToggleFavorite(itemId, isFavorite),
    onContextMenuOpen: handleItemContextMenu,
    contextTargetIdsForItem: resolveContextTargetIds,
    onOpenViewerForIds: handleOpenViewerForIds,
    onToggleFavoriteForIds: (itemIds: string[]) => void handleToggleFavoriteByIds(itemIds),
    onOpenMoveDialogForIds: openMoveDialogForIds,
    onExportForIds: (itemIds: string[]) => void handleExportByIds(itemIds),
    onDeleteForIds: (itemIds: string[]) => void handleDeleteByIds(itemIds),
    isOpenViewerDisabledForItem: (itemId: string) => resolveContextTargetIds(itemId).length > 1,
    onOpenMoveDialog: openSingleMoveDialog,
    onExportItem: (itemId: string) => void handleExportItem(itemId),
    onDeleteItem: (itemId: string) => void handleDeleteItem(itemId),
    onRenameItem: (itemId: string, newName: string) => void handleRenameItem(itemId, newName),
    hasMore: renderCount < filteredItems.length,
    isLoadingMore,
    sentinelRef,
    isMultiSelect,
  };

  const isBookmarkScope = vaultScope === 'bookmark';

  // Toolbar title for bookmark scope
  const bookmarkTitleLabel = bookmarkFolderId !== null
    ? (findFolderNameById(folders, bookmarkFolderId) ?? 'Bookmarks')
    : 'Bookmarks';

  // Bookmark multi-select — active in bookmark scope or mixed views
  const showBookmarksInMixedView = !isBookmarkScope && (vaultScope === 'all' || vaultScope === 'root' || vaultScope === 'folder');
  const isBookmarkMultiSelect = (isBookmarkScope || showBookmarksInMixedView) && isMultiSelect;
  const handleBookmarkCardClick = (id: string): void => {
    if (isMultiSelect) {
      toggleSelectedBookmark(id);
    } else {
      setSelectedBookmarkId(id);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        background: T.bg2,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => { e.preventDefault(); if (!isBookmarkScope) setIsDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isBookmarkScope) return;
        const files = extractDroppedFilePaths(e.dataTransfer);
        if (files.length === 0) {
          toast.error('No local file paths detected from drop. Please use Import button for this source.');
          return;
        }
        const dropFolderId = selectedViewScope === 'folder' && selectedFolderId !== null ? selectedFolderId : importFolderId;
        void runImport(files, dropFolderId, false);
      }}
    >
      {/* Drag overlay */}
      {isDragOver && !isBookmarkScope && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px dashed ${T.accent}`,
          background: T.accentGlow,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: T.accent }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Drop files to import
            </span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        <GalleryToolbar
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          sort={sort}
          onSortChange={(value) => void handleSortChange(value)}
          onOpenImportSettings={() => setImportSettingsOpen(true)}
          onExportSelected={isBookmarkScope ? () => void handleExportBookmarks() : () => void handleExportSelected()}
          onDeleteSelected={isBookmarkScope ? () => void handleDeleteSelectedBookmarks() : () => void handleDeleteSelected()}
          onToggleFavoriteSelected={() => void handleToggleFavoriteSelected()}
          onOpenBulkMoveDialog={isBookmarkScope ? () => { setMoveDialogSource('bulk'); setMoveDialogOpen(true); } : openBulkMoveDialog}
          onRefresh={() => void handleRefresh()}
          isBusy={isLoading || bookmarksLoading}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((prev) => !prev)}
          selectedCount={isBookmarkScope ? selectedBookmarkIds.length : selectedItemIds.length + selectedBookmarkIds.length}
          allSelectedFavorite={
            !isBookmarkScope &&
            selectedItemIds.length > 0 &&
            filteredItems.filter((item) => selectedItemIds.includes(item.id)).every((item) => item.isFavorite)
          }
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMultiSelect={isMultiSelect}
          onToggleMultiSelect={handleToggleMultiSelect}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar((p) => !p)}
          itemCount={isBookmarkScope ? visibleBookmarks.length : filteredItems.length + (showBookmarksInMixedView ? visibleBookmarks.length : 0)}
          selectedFolderName={
            isBookmarkScope
              ? bookmarkTitleLabel
              : selectedFolderId !== null
                ? (findFolderNameById(folders, selectedFolderId) ?? 'Folder')
                : null
          }
          selectedViewScope={selectedViewScope}
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTagFilter={handleToggleTagFilter}
          newTagName={newTagName}
          onNewTagNameChange={setNewTagName}
          onCreateTag={(color?: string) => void handleCreateTag(color)}
          onDeleteTag={(tagId: number) => void handleDeleteTag(tagId)}
          isBookmarkScope={isBookmarkScope}
          onExportBookmarks={() => void handleExportBookmarks()}
          onImportBookmarks={() => void handleImportBookmarks()}
        />
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Folder sidebar */}
        <div style={{
          width: showSidebar ? 220 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          borderRight: showSidebar ? `1px solid ${T.line}` : 'none',
          transition: 'width 200ms ease',
        }}>
          <FolderSidebar
            folders={folders}
            selectedViewScope={selectedViewScope}
            selectedFolderId={selectedFolderId}
            onSelectAllItems={handleSelectAllItemsScope}
            onSelectVideo={handleSelectVideoScope}
            onSelectImage={handleSelectImageScope}
            onSelectRoot={handleSelectRootScope}
            onSelectFolder={handleSelectFolderScope}
            onSelectBookmarks={handleSelectBookmarkScope}
            newFolderName={newFolderName}
            onNewFolderNameChange={setNewFolderName}
            newFolderParentId={newFolderParentId}
            onNewFolderParentIdChange={setNewFolderParentId}
            onCreateFolder={() => void handleCreateFolder()}
            onDeleteFolder={(folderId) => void handleDeleteFolder(folderId)}
          />
        </div>

        {/* Content area */}
        {isBookmarkScope ? (
          <div
            style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '16px 20px' : 0 }}
            onClick={(e) => { if (e.target === e.currentTarget && isMultiSelect) { clearBookmarkSelection(); setIsMultiSelect(false); } }}
          >
            {visibleBookmarks.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: T.mute }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.4}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: T.mute2 }}>
                  {bookmarkFolderId !== null ? 'No bookmarks in this folder' : 'No bookmarks saved yet'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {visibleBookmarks.map((b) => (
                  <BookmarkCard
                    key={b.id}
                    bookmark={b}
                    selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
                    isMultiSelect={isBookmarkMultiSelect}
                    onClick={() => handleBookmarkCardClick(b.id)}
                  />
                ))}
              </div>
            ) : (
              <div>
                {visibleBookmarks.map((b) => (
                  <BookmarkListRow
                    key={b.id}
                    bookmark={b}
                    selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
                    isMultiSelect={isBookmarkMultiSelect}
                    onClick={() => handleBookmarkCardClick(b.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {viewMode === 'grid' ? (
              <GalleryGrid {...sharedViewProps} />
            ) : (
              <GalleryListView {...sharedViewProps} />
            )}

            {/* Bookmark section in mixed views (All Objects, Root, Folder) */}
            {showBookmarksInMixedView && visibleBookmarks.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                  borderTop: `1px solid ${T.line}`, paddingTop: 16,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.5">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2 }}>
                    Bookmarks · {visibleBookmarks.length}
                  </span>
                </div>
                {viewMode === 'grid' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {visibleBookmarks.map((b) => (
                      <BookmarkCard
                        key={b.id}
                        bookmark={b}
                        selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
                        isMultiSelect={isBookmarkMultiSelect}
                        onClick={() => handleBookmarkCardClick(b.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div>
                    {visibleBookmarks.map((b) => (
                      <BookmarkListRow
                        key={b.id}
                        bookmark={b}
                        selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
                        isMultiSelect={isBookmarkMultiSelect}
                        onClick={() => handleBookmarkCardClick(b.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Inspector rail */}
        {showInspector ? (
          <div style={{
            width: 280,
            flexShrink: 0,
            borderLeft: `1px solid ${T.line}`,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `1px solid ${T.line}`,
              flexShrink: 0,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute }}>Inspector</span>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="8,3 5,6 8,9" />
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isBookmarkScope ? (
                selectedBookmark ? (
                  <BookmarkInspector
                    bookmark={selectedBookmark}
                    tags={tags}
                    folders={folders}
                    onDelete={(id) => void handleDeleteBookmark(id)}
                    onRename={(id, title) => void handleRenameBookmark(id, title)}
                    onToggleTag={(bookmarkId, tagId, assigned) => void handleToggleBookmarkTag(bookmarkId, tagId, assigned)}
                    onAssignFolder={(bookmarkId, folderId) => void handleAssignBookmarkFolder(bookmarkId, folderId)}
                    onOpenInBrowser={onOpenUrlInBrowser}
                    onChangeThumbnail={onScrapeImages ? (b) => setThumbPickerBookmark(b) : undefined}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: T.mute }}>
                    <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: T.mute2 }}>Select a bookmark to inspect</p>
                  </div>
                )
              ) : (
                <ItemDetailsSidebar {...detailsPanelProps} />
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInspector(true)}
            title="Show inspector"
            style={{
              width: 20, flexShrink: 0,
              background: T.accentGlow, border: 'none',
              borderLeft: `1px solid ${T.accent}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.accent, padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="4,3 7,6 4,9" />
            </svg>
          </button>
        )}
      </div>

      {/* Dialogs */}
      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        folders={folders}
        itemIds={moveDialogItemIds}
        onConfirm={handleConfirmMoveDialog}
        title={moveDialogSource === 'bulk' ? 'Move selected items' : 'Move item'}
        isBusy={isMoveBusy}
      />

      <DeleteFolderDialog
        open={deleteFolderDialog !== null}
        onOpenChange={(open) => { if (!open) setDeleteFolderDialog(null); }}
        folderName={deleteFolderDialog?.folderName ?? ''}
        onKeepFiles={() => void confirmDeleteFolder(false)}
        onDeleteFiles={() => void confirmDeleteFolder(true)}
        isBusy={isDeletingFolder}
      />

      <ImportSettingsDialog
        open={importSettingsOpen}
        onOpenChange={setImportSettingsOpen}
        folders={folders}
        importFolderId={importFolderId}
        onImportFolderChange={setImportFolderId}
        secureDelete={secureDelete}
        onSecureDeleteChange={setSecureDelete}
        onImport={() => void handleImport()}
      />

      <ImportConflictDialog
        open={conflictDialog !== null}
        onOpenChange={(open) => { if (!open) setConflictDialog(null); }}
        conflicts={conflictDialog?.conflicts ?? []}
        onConfirm={handleConflictConfirm}
      />

      {viewerItemId && (
        <MediaViewerOverlay
          items={filteredItems}
          currentItemId={viewerItemId}
          onClose={() => setViewerItemId(null)}
          onNavigate={(itemId) => { setSelectedItems([itemId]); setViewerItemId(itemId); }}
          onMessage={(msg) => toast.info(msg)}
        />
      )}

      {/* Thumbnail picker */}
      {thumbPickerBookmark && (
        <ThumbnailPicker
          bookmark={thumbPickerBookmark}
          onScrapeImages={onScrapeImages}
          onPick={(dataUrl, bookmarkId) => void handlePickThumb(dataUrl, bookmarkId)}
          onClose={() => setThumbPickerBookmark(null)}
        />
      )}
    </div>
  );
};

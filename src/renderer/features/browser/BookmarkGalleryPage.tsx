import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { BookmarkSummary } from '../../../shared/ipc';

// ─── Design tokens (Sanctum design system) ───────────────────────────────────
const T = {
  bg:          '#0a0c0b',
  bg2:         '#10110f',
  line:        'rgba(220,220,200,0.07)',
  line2:       'rgba(220,220,200,0.12)',
  text:        '#e8e6dc',
  mute:        '#79817a',
  mute2:       '#4d524d',
  accent:      '#7c9a92',
  accentGlow:  'rgba(124,154,146,0.15)',
  danger:      '#c36b5f',
  warn:        '#c08a5e',
} as const;

const SERIF  = "'Fraunces', Georgia, serif";
const MONO   = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS   = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Utilities ────────────────────────────────────────────────────────────────

const getDomain = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
};

const fmtDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000)   return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return iso; }
};

// Deterministic gradient from domain name
const domainGradient = (domain: string): { from: string; to: string } => {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = domain.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  const h2  = (hue + 48) % 360;
  return {
    from: `hsl(${hue},28%,20%)`,
    to:   `hsl(${h2},22%,14%)`,
  };
};

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const IconProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IconSearch    = () => <svg {...IconProps} width={12} height={12} viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20 L16 16"/></svg>;
const IconPlus      = () => <svg {...IconProps} width={11} height={11} viewBox="0 0 24 24"><path d="M12 5 L12 19 M5 12 L19 12"/></svg>;
const IconList      = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M3 6 L21 6 M3 12 L21 12 M3 18 L21 18"/></svg>;
const IconGrid      = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
const IconOpen      = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>;
const IconPencil    = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>;
const IconTrash     = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>;
const IconX         = () => <svg {...IconProps} width={14} height={14} viewBox="0 0 24 24"><path d="M18 6 L6 18 M6 6 L18 18"/></svg>;
const IconChev      = () => <svg {...IconProps} width={12} height={12} viewBox="0 0 24 24"><path d="M8 5 L15 12 L8 19"/></svg>;
const IconShelf     = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M3 6 Q3 5 4 5 L9 5 L11 7 L20 7 Q21 7 21 8 L21 18 Q21 19 20 19 L4 19 Q3 19 3 18 Z"/></svg>;
const IconShelfOpen = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><path d="M3 6 Q3 5 4 5 L9 5 L11 7 L20 7 Q21 7 21 8 L21 9 L4 9 L3 18 L20 18 Q21 18 21 17 L22 10 L3 10"/></svg>;

// ─── Thumbnail renderer ───────────────────────────────────────────────────────

const Thumb: React.FC<{ bookmark: BookmarkSummary; w?: number | string; h?: number | string }> = ({
  bookmark, w = '100%', h = '100%',
}) => {
  const domain = getDomain(bookmark.url);
  const grad   = domainGradient(domain);
  const initial = domain.charAt(0).toUpperCase();

  if (bookmark.thumbnailDataUrl) {
    return (
      <img
        src={bookmark.thumbnailDataUrl}
        alt={bookmark.title}
        loading="lazy"
        style={{ width: w, height: h, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  return (
    <div style={{
      width: w, height: h,
      background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.1), transparent 65%)' }}/>
      <span style={{ fontFamily: SANS, fontSize: 'clamp(18px, 26%, 42px)', fontWeight: 700, color: 'rgba(232,230,220,0.55)', userSelect: 'none', position: 'relative' }}>
        {initial}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(121,129,122,0.7)', textTransform: 'uppercase', marginTop: 4, position: 'relative', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {domain}
      </span>
    </div>
  );
};

// ─── Shelf rail ───────────────────────────────────────────────────────────────

type ShelfId = 'all' | 'recent' | 'domain';

interface Shelf { id: ShelfId | string; label: string; count: number }

const ShelfRail: React.FC<{
  shelves: Shelf[];
  activeShelf: string;
  onSelect: (id: string) => void;
  tags: string[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
}> = ({ shelves, activeShelf, onSelect, tags, activeTag, onSelectTag }) => (
  <aside style={{ width: 220, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.bg, flexShrink: 0 }}>
    <div style={{ padding: '20px 20px 12px' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute, marginBottom: 14 }}>· Shelves ·</div>
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
      {shelves.map((shelf) => {
        const active = activeShelf === shelf.id;
        const isRoot = shelf.id === 'all';
        return (
          <div
            key={shelf.id}
            onClick={() => onSelect(shelf.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              color: active ? T.text : T.mute,
              background: active ? T.accentGlow : 'transparent',
              borderLeft: active ? `1px solid ${T.accent}` : '1px solid transparent',
            }}
          >
            {active ? <IconShelfOpen /> : <IconShelf />}
            <span style={{
              fontSize: 13, flex: 1,
              fontFamily: isRoot ? SERIF : SANS,
              fontWeight: isRoot ? 400 : 500,
              fontStyle: isRoot ? 'italic' : 'normal',
            }}>{shelf.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>{shelf.count}</span>
          </div>
        );
      })}
    </div>
    {tags.length > 0 && (
      <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.line}` }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute, marginBottom: 10 }}>· Domains ·</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {tags.slice(0, 12).map((tag) => (
            <span
              key={tag}
              onClick={() => onSelectTag(activeTag === tag ? null : tag)}
              style={{
                fontSize: 11, padding: '2px 7px',
                border: `1px solid ${activeTag === tag ? T.accent : T.line2}`,
                color: activeTag === tag ? T.accent : T.mute,
                cursor: 'pointer',
                background: activeTag === tag ? T.accentGlow : 'transparent',
              }}
            >{tag}</span>
          ))}
        </div>
      </div>
    )}
  </aside>
);

// ─── Toolbar ──────────────────────────────────────────────────────────────────

const Toolbar: React.FC<{
  title: string;
  count: number;
  view: 'list' | 'grid';
  onView: (v: 'list' | 'grid') => void;
  query: string;
  onQuery: (q: string) => void;
  onNew: () => void;
}> = ({ title, count, view, onView, query, onQuery, onNew }) => (
  <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.line}`, background: T.bg, flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 26, fontWeight: 300, letterSpacing: '-0.02em', color: T.text }}>{title}</h1>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute, marginTop: 5 }}>
          {count} {count === 1 ? 'entry' : 'entries'} · encrypted · aes-256-gcm
        </div>
      </div>

      {/* Search */}
      <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: `1px solid ${T.line2}`, background: 'transparent' }}>
        <span style={{ color: T.mute, flexShrink: 0 }}><IconSearch /></span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Inscribe a query…"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontSize: 12, flex: 1, fontFamily: SANS, letterSpacing: '0.03em', minWidth: 0 }}
        />
        {query && (
          <button onClick={() => onQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0 }}>
            <IconX />
          </button>
        )}
      </div>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 0, border: `1px solid ${T.line2}`, flexShrink: 0 }}>
        <button
          onClick={() => onView('list')}
          title="List view"
          style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: view === 'list' ? T.text : T.mute, background: view === 'list' ? T.accentGlow : 'transparent', border: 'none' }}
        ><IconList /></button>
        <button
          onClick={() => onView('grid')}
          title="Grid view"
          style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: view === 'grid' ? T.text : T.mute, background: view === 'grid' ? T.accentGlow : 'transparent', border: 'none', borderLeft: `1px solid ${T.line}` }}
        ><IconGrid /></button>
      </div>

      {/* Inscribe */}
      <button
        onClick={onNew}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: T.accent, color: T.bg, border: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 600, fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        <IconPlus /> Inscribe
      </button>
    </div>
  </div>
);

// ─── List view ────────────────────────────────────────────────────────────────

const LIST_COLS = '32px 50px minmax(0,1.6fr) minmax(100px,.8fr) 80px 70px 28px';

const ListHeader: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: LIST_COLS, gap: 14, alignItems: 'center', padding: '9px 24px', borderBottom: `1px solid ${T.line}`, position: 'sticky', top: 0, background: T.bg2, zIndex: 1 }}>
    {['№', '', 'Title', 'Domain', 'Saved', 'URL', ''].map((h, i) => (
      <span key={i} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.mute }}>{h}</span>
    ))}
  </div>
);

const ListRow: React.FC<{
  bookmark: BookmarkSummary;
  idx: number;
  selected: boolean;
  onClick: () => void;
}> = ({ bookmark, idx, selected, onClick }) => {
  const domain = getDomain(bookmark.url);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: LIST_COLS, gap: 14, alignItems: 'center',
        padding: '10px 24px', borderBottom: `1px solid ${T.line}`,
        background: selected ? T.accentGlow : 'transparent',
        borderLeft: selected ? `2px solid ${T.accent}` : '2px solid transparent',
        paddingLeft: 22, cursor: 'pointer',
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2 }}>{String(idx + 1).padStart(3, '0')}</span>
      <div style={{ width: 44, height: 32, overflow: 'hidden', flexShrink: 0 }}>
        <Thumb bookmark={bookmark} w={44} h={32} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 400, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>
          {bookmark.title}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: T.mute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fmtDate(bookmark.createdAt)}
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute, whiteSpace: 'nowrap' }}>{fmtDate(bookmark.createdAt)}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
      <span style={{ color: T.mute, opacity: selected ? 1 : 0, transition: 'opacity 140ms' }}><IconChev /></span>
    </div>
  );
};

// ─── Grid view ────────────────────────────────────────────────────────────────

const GridCard: React.FC<{
  bookmark: BookmarkSummary;
  selected: boolean;
  onClick: () => void;
}> = ({ bookmark, selected, onClick }) => {
  const domain = getDomain(bookmark.url);
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 0, overflow: 'hidden', cursor: 'pointer',
        background: T.bg,
        border: selected ? `1px solid ${T.text}` : `1px solid ${T.line2}`,
        boxShadow: selected ? `0 0 0 1px ${T.text}` : 'none',
        transition: 'border-color 140ms, box-shadow 140ms',
      }}
    >
      <div style={{ aspectRatio: '4/3', overflow: 'hidden', borderBottom: `1px solid ${T.line}` }}>
        <Thumb bookmark={bookmark} />
      </div>
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 400, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>
          {bookmark.title}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {domain}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>
            {fmtDate(bookmark.createdAt)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.accent }}>
            enc
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Inspector ────────────────────────────────────────────────────────────────

const IconImage = () => <svg {...IconProps} width={13} height={13} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>;

const Inspector: React.FC<{
  bookmark: BookmarkSummary | null;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onRename: (b: BookmarkSummary) => void;
  onDelete: (b: BookmarkSummary) => void;
  onChangeThumbnail?: (b: BookmarkSummary) => void;
}> = ({ bookmark, onClose, onOpenUrl, onRename, onDelete, onChangeThumbnail }) => {
  if (!bookmark) return null;
  const domain = getDomain(bookmark.url);

  return (
    <aside style={{ width: 280, borderLeft: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onClose}
        title="Close inspector"
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, background: `rgba(10,12,11,0.8)`, backdropFilter: 'blur(8px)', border: `1px solid ${T.line2}`, color: T.text, cursor: 'pointer', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <IconX />
      </button>

      {/* Thumbnail */}
      <div style={{ aspectRatio: '4/3', borderBottom: `1px solid ${T.line}`, overflow: 'hidden' }}>
        <Thumb bookmark={bookmark} />
      </div>

      {/* Content */}
      <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>· Entry ·</div>
        <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 20, fontWeight: 300, letterSpacing: '-0.01em', lineHeight: 1.2, color: T.text }}>
          {bookmark.title}
        </h3>
        <p style={{ margin: '8px 0 0', fontFamily: MONO, fontSize: 10, color: T.mute, lineHeight: 1.5, wordBreak: 'break-all' }}>
          {bookmark.url}
        </p>

        <div style={{ marginTop: 20, borderTop: `1px solid ${T.line}` }} />

        {/* Fields */}
        {[
          { label: 'Domain',     value: domain,                  mono: true  },
          { label: 'Saved',      value: fmtDate(bookmark.createdAt), mono: true },
          { label: 'Encryption', value: 'aes-256-gcm',           mono: true, accent: true },
        ].map(({ label, value, mono, accent }) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, padding: '9px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute }}>{label}</span>
            <span style={{ fontFamily: mono ? MONO : SANS, fontSize: mono ? 10 : 12, color: accent ? T.accent : T.text, wordBreak: 'break-all' }}>{value}</span>
          </div>
        ))}

        {/* Actions */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => onOpenUrl(bookmark.url)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: T.accent, color: T.bg, border: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: SANS, fontWeight: 600 }}
          >
            <IconOpen /> Open in browser
          </button>
          {onChangeThumbnail && (
            <button
              onClick={() => onChangeThumbnail(bookmark)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'transparent', color: T.text, border: `1px solid ${T.line2}`, cursor: 'pointer', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS }}
            >
              <IconImage /> Change thumbnail
            </button>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onRename(bookmark)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', background: 'transparent', color: T.text, border: `1px solid ${T.line2}`, cursor: 'pointer', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS }}
            >
              <IconPencil /> Rename
            </button>
            <button
              onClick={() => onDelete(bookmark)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', background: 'transparent', color: T.danger, border: `1px solid rgba(195,107,95,0.35)`, cursor: 'pointer', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS }}
            >
              <IconTrash /> Delete
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── Inspector tab (collapsed) ────────────────────────────────────────────────

const InspectorTab: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    title="Show inspector"
    style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', padding: '14px 5px', background: T.bg, color: T.mute, border: `1px solid ${T.line2}`, borderRight: 'none', cursor: 'pointer', zIndex: 4 }}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5 L8 12 L15 19" />
    </svg>
  </button>
);

// ─── Rename dialog ────────────────────────────────────────────────────────────

const RenameDialog: React.FC<{
  bookmark: BookmarkSummary | null;
  onClose: () => void;
  onSave: (title: string) => void;
}> = ({ bookmark, onClose, onSave }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bookmark) {
      setValue(bookmark.title);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [bookmark]);

  if (!bookmark) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 360, background: T.bg2, border: `1px solid ${T.line2}`, padding: 24 }}
      >
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Rename Entry</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onSave(value.trim());
            if (e.key === 'Escape') onClose();
          }}
          style={{ width: '100%', padding: '8px 12px', background: 'transparent', border: `1px solid ${T.line2}`, color: T.text, fontSize: 14, fontFamily: SANS, outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS }}
          >Cancel</button>
          <button
            onClick={() => { if (value.trim()) onSave(value.trim()); }}
            disabled={!value.trim()}
            style={{ padding: '7px 16px', background: value.trim() ? T.accent : T.mute2, border: 'none', color: T.bg, cursor: value.trim() ? 'pointer' : 'default', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS, fontWeight: 600 }}
          >Save</button>
        </div>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type BookmarkGalleryPageProps = {
  onOpenUrl: (url: string) => void;
  onScrapeImages?: () => Promise<string[]>;
};

export const BookmarkGalleryPage = ({ onOpenUrl, onScrapeImages }: BookmarkGalleryPageProps): React.JSX.Element => {
  const [bookmarks, setBookmarks]       = useState<BookmarkSummary[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [query, setQuery]               = useState('');
  const [view, setView]                 = useState<'list' | 'grid'>('list');
  const [activeShelf, setActiveShelf]   = useState('all');
  const [activeTag, setActiveTag]       = useState<string | null>(null);
  const [selected, setSelected]         = useState<BookmarkSummary | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [renameTarget, setRenameTarget] = useState<BookmarkSummary | null>(null);
  const [thumbPickerTarget, setThumbPickerTarget] = useState<BookmarkSummary | null>(null);
  const [thumbPickerCandidates, setThumbPickerCandidates] = useState<string[]>([]);
  const [thumbPickerLoading, setThumbPickerLoading] = useState(false);

  const load = useCallback(async () => {
    const result = await window.browserAPI.listBookmarks();
    if (result.ok) setBookmarks(result.data);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Shelves derived from data
  const shelves = React.useMemo<Shelf[]>(() => {
    const now = Date.now();
    const recentCutoff = now - 7 * 86_400_000;
    return [
      { id: 'all',    label: 'Cabinet',    count: bookmarks.length },
      { id: 'recent', label: 'Recent',     count: bookmarks.filter(b => new Date(b.createdAt).getTime() > recentCutoff).length },
    ];
  }, [bookmarks]);

  // Unique domains for tag rail
  const allDomains = React.useMemo(() =>
    [...new Set(bookmarks.map(b => getDomain(b.url)))].sort(),
    [bookmarks]
  );

  // Filtered bookmarks
  const filtered = React.useMemo(() => {
    let list = bookmarks;
    if (activeShelf === 'recent') {
      const cut = Date.now() - 7 * 86_400_000;
      list = list.filter(b => new Date(b.createdAt).getTime() > cut);
    }
    if (activeTag) {
      list = list.filter(b => getDomain(b.url) === activeTag);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(b => b.title.toLowerCase().includes(q) || getDomain(b.url).toLowerCase().includes(q));
    }
    return list;
  }, [bookmarks, activeShelf, activeTag, query]);

  const activeShelfLabel = shelves.find(s => s.id === activeShelf)?.label ?? 'Bookmarks';

  // Actions
  const handleDelete = async (bookmark: BookmarkSummary): Promise<void> => {
    await window.browserAPI.deleteBookmark({ id: bookmark.id });
    setBookmarks(prev => prev.filter(b => b.id !== bookmark.id));
    if (selected?.id === bookmark.id) setSelected(null);
    toast.success('Entry deleted.');
  };

  const handleRename = async (newTitle: string): Promise<void> => {
    if (!renameTarget || !newTitle.trim() || newTitle.trim() === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    const created = await window.browserAPI.createBookmark({
      title: newTitle.trim(),
      url: renameTarget.url,
      thumbnailDataUrl: renameTarget.thumbnailDataUrl,
    });
    if (!created.ok) { toast.error(created.error); return; }
    await window.browserAPI.deleteBookmark({ id: renameTarget.id });
    setRenameTarget(null);
    toast.success('Entry renamed.');
    await load();
  };

  const handleSelect = (bookmark: BookmarkSummary) => {
    setSelected(bookmark);
    if (!showInspector) setShowInspector(true);
  };

  const handleChangeThumbnail = async (bookmark: BookmarkSummary): Promise<void> => {
    if (!onScrapeImages) return;
    setThumbPickerTarget(bookmark);
    setThumbPickerCandidates([]);
    setThumbPickerLoading(true);
    const imgs = await onScrapeImages();
    setThumbPickerCandidates(imgs);
    setThumbPickerLoading(false);
  };

  const handlePickThumb = async (dataUrl: string): Promise<void> => {
    if (!thumbPickerTarget) return;
    const r = await window.browserAPI.updateBookmarkThumbnail({ id: thumbPickerTarget.id, thumbnailDataUrl: dataUrl });
    if (!r.ok) { toast.error(r.error); return; }
    setBookmarks((prev) => prev.map((b) => b.id === r.data.id ? r.data : b));
    if (selected?.id === r.data.id) setSelected(r.data);
    toast.success('Thumbnail updated.');
    setThumbPickerTarget(null);
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, background: T.bg, color: T.text, fontFamily: SANS, position: 'relative' }}>

      {/* Left shelf rail */}
      <ShelfRail
        shelves={shelves}
        activeShelf={activeShelf}
        onSelect={(id) => { setActiveShelf(id); setSelected(null); }}
        tags={allDomains}
        activeTag={activeTag}
        onSelectTag={setActiveTag}
      />

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: T.bg2 }}>
        <Toolbar
          title={activeTag ? activeTag : activeShelfLabel}
          count={filtered.length}
          view={view}
          onView={setView}
          query={query}
          onQuery={setQuery}
          onNew={() => onOpenUrl('https://duckduckgo.com/')}
        />

        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mute, fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>
            loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: 18, fontWeight: 300, color: T.mute }}>
              {bookmarks.length === 0 ? 'Cabinet is empty.' : 'No entries match.'}
            </p>
            <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: T.mute2 }}>
              {bookmarks.length === 0 ? 'Inscribe a bookmark from the browser to begin.' : 'Refine your query or clear the filter.'}
            </p>
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ marginTop: 8, padding: '6px 14px', background: 'transparent', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: SANS }}
              >Clear query</button>
            )}
          </div>
        ) : view === 'list' ? (
          <>
            <ListHeader />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.map((bm, idx) => (
                <ListRow
                  key={bm.id}
                  bookmark={bm}
                  idx={idx}
                  selected={selected?.id === bm.id}
                  onClick={() => handleSelect(bm)}
                />
              ))}
              <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute2 }}>· end of shelf · {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} ·</span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute2 }}>silentium · sigillum</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 24, alignItems: 'start' }}>
              {filtered.map((bm) => (
                <GridCard
                  key={bm.id}
                  bookmark={bm}
                  selected={selected?.id === bm.id}
                  onClick={() => handleSelect(bm)}
                />
              ))}
            </div>
            <div style={{ padding: '18px 0 2px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute2 }}>· grid shelf · {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} ·</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.mute2 }}>silentium · sigillum</span>
            </div>
          </div>
        )}
      </main>

      {/* Right inspector */}
      {showInspector ? (
        <Inspector
          bookmark={selected}
          onClose={() => setShowInspector(false)}
          onOpenUrl={onOpenUrl}
          onRename={(b) => setRenameTarget(b)}
          onDelete={(b) => void handleDelete(b)}
          onChangeThumbnail={onScrapeImages ? (b) => void handleChangeThumbnail(b) : undefined}
        />
      ) : (
        <InspectorTab onClick={() => setShowInspector(true)} />
      )}

      {/* Rename dialog */}
      <RenameDialog
        bookmark={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={(title) => void handleRename(title)}
      />

      {/* Thumbnail picker overlay */}
      {thumbPickerTarget && (
        <div
          onClick={() => setThumbPickerTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 560, maxHeight: '80vh', background: T.bg2, border: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent }}>Choose thumbnail</span>
              <button onClick={() => setThumbPickerTarget(null)} style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 2 }}>
                <IconX />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
              {thumbPickerLoading ? (
                <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, margin: 0, textAlign: 'center', padding: '20px 0' }}>Scanning page for images…</p>
              ) : thumbPickerCandidates.length === 0 ? (
                <p style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, margin: 0, textAlign: 'center', padding: '20px 0' }}>
                  No images found. Navigate to the page in the browser tab first.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 84px)', gap: 8 }}>
                  {thumbPickerCandidates.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => void handlePickThumb(src)}
                      style={{ width: 84, height: 84, padding: 0, border: `1px solid ${T.line2}`, background: T.bg, cursor: 'pointer', overflow: 'hidden', flexShrink: 0 }}
                      title="Use this image"
                    >
                      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

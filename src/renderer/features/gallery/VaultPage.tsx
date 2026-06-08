import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  AppearanceSettings,
  BookmarkSummary,
  ConflictItem,
  ConflictResolution,
  CreateFolderInput,
  ExternalPrivateBrowserTarget,
  FolderNode,
  NoteFormat,
  NoteSummary,
  TagSummary,
  VaultItemSummary,
  VaultListSort,
} from '../../../shared/ipc';
import {
  getMimeTypeForFilename,
  getVaultFileKind,
  isPreviewableMimeType,
  isVideoMimeType,
} from '../../../shared/fileTypes';
import { FolderSidebar } from './components/FolderSidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryListView } from './components/GalleryListView';
import { GalleryToolbar } from './components/GalleryToolbar';
import { GalleryCard } from './components/GalleryCard';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../components/ui/ContextMenu';
import { SanctumConfirmDialog } from '../../components/ui';
import { StarRating } from '../../components/ui/StarRating';
import { ItemDetailsSidebar } from './components/ItemDetailsPanel';
import { MoveToFolderDialog } from './components/MoveToFolderDialog';
import { ImportSettingsDialog } from './components/ImportSettingsDialog';
import { DeleteFolderDialog } from './components/DeleteFolderDialog';
import { ImportConflictDialog } from './components/ImportConflictDialog';
import { useGalleryState } from './state/useGalleryState';
import { useMarqueeSelection } from './hooks/useMarqueeSelection';
import { MediaViewerOverlay } from '../viewer/MediaViewerOverlay';
import { fontSize } from '../../theme/typography';

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

const THUMBNAIL_GRID_MIN_WIDTH: Record<AppearanceSettings['thumbnailSize'], number> = {
  small: 160,
  medium: 200,
  large: 260,
};

type VaultConfirmRequest = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'warning' | 'danger';
};

const MIXED_LIST_STYLES = `
  .pv-mixed-list {
    container-type: inline-size;
    min-width: 0;
  }
  .pv-list-row {
    display: grid;
    grid-template-columns: 22px 50px minmax(0, 1fr) 72px minmax(90px, 160px) 34px 86px;
    align-items: center;
    column-gap: 10px;
    min-width: 0;
    padding: 7px 12px;
    border-bottom: 1px solid ${T.line};
  }
  .pv-list-header {
    min-height: 32px;
    padding-top: 0;
    padding-bottom: 0;
    background: rgba(10, 12, 11, 0.65);
    border-top: 1px solid ${T.line};
  }
  .pv-list-col-title,
  .pv-list-title,
  .pv-list-subtitle,
  .pv-list-col-tags,
  .pv-list-tag {
    min-width: 0;
    overflow: hidden;
  }
  .pv-list-title,
  .pv-list-subtitle,
  .pv-list-tag {
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pv-list-col-tags {
    display: flex;
    gap: 3px;
  }
  .pv-list-thumb {
    width: 40px;
    height: 28px;
  }
  @container (max-width: 760px) {
    .pv-list-row {
      grid-template-columns: 22px 50px minmax(0, 1fr) 72px minmax(80px, 130px) 34px;
    }
    .pv-list-col-date {
      display: none !important;
    }
  }
  @container (max-width: 640px) {
    .pv-list-row {
      grid-template-columns: 22px 50px minmax(0, 1fr) 72px minmax(76px, 110px);
    }
    .pv-list-col-fav {
      display: none !important;
    }
  }
  @container (max-width: 540px) {
    .pv-list-row {
      grid-template-columns: 22px 50px minmax(0, 1fr) 72px;
    }
    .pv-list-col-tags {
      display: none !important;
    }
  }
  @container (max-width: 430px) {
    .pv-list-row {
      grid-template-columns: 22px 46px minmax(0, 1fr);
      column-gap: 8px;
      padding-left: 10px;
      padding-right: 10px;
    }
    .pv-list-col-rating {
      display: none !important;
    }
    .pv-list-thumb {
      width: 38px;
      height: 26px;
    }
  }
`;

type VaultPageProps = {
  onMessage?: (message: string) => void;
  onOpenUrlInBrowser?: (url: string) => void;
};

const ListSelectionMark: React.FC<{ selected: boolean; visible: boolean }> = ({ selected, visible }) => (
  <div
    style={{
      width: 14,
      height: 14,
      border: visible ? `1px solid ${selected ? T.accent : T.line2}` : '1px solid transparent',
      background: visible && selected ? T.accent : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {visible && selected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#0a0c0b" strokeWidth="1.8"><path d="M1.5 4l2 2 3-3" /></svg>}
  </div>
);

type ObjectTypeLabel = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'FILE' | 'BOOKMARK' | 'NOTE';

const fileTypeLabel = (item: VaultItemSummary): ObjectTypeLabel => {
  const kind = getVaultFileKind(item.mimeType);
  if (kind === 'image') return 'IMAGE';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'document') return 'DOCUMENT';
  return 'FILE';
};

const TypeBadge: React.FC<{ label: ObjectTypeLabel; variant?: 'overlay' | 'inline' }> = ({ label, variant = 'inline' }) => (
  <span
    title={label.toLowerCase()}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      flexShrink: 0,
      padding: variant === 'overlay' ? '2px 6px' : '1px 5px',
      background: variant === 'overlay' ? 'rgba(0,0,0,0.75)' : T.accentGlow,
      border: variant === 'overlay' ? 'none' : `1px solid ${T.line2}`,
      fontFamily: MONO,
      fontSize: variant === 'overlay' ? 9 : 8,
      letterSpacing: variant === 'overlay' ? '0.08em' : '0.06em',
      color: variant === 'overlay' ? T.mute : T.accent,
      lineHeight: 1.3,
    }}
  >
    {label}
  </span>
);

const GridRating: React.FC<{ rating?: number }> = ({ rating }) => {
  const value = rating ?? 0;
  if (value <= 0) return null;
  return (
    <span title={`${value}/5 rating`} style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: fontSize(9), color: T.accent, flexShrink: 0 }}>
      {'·'.repeat(value)}
    </span>
  );
};

const ListRating: React.FC<{ rating?: number }> = ({ rating }) => (
  <span
    className="pv-list-col-rating"
    title={`${rating ?? 0}/5 rating`}
    style={{
      fontFamily: MONO,
      fontSize: fontSize(10),
      letterSpacing: '0.02em',
      color: rating && rating > 0 ? '#e3c94f' : T.mute2,
      whiteSpace: 'nowrap',
    }}
  >
    {rating && rating > 0 ? `${rating}/5` : '-'}
  </span>
);

const ListFavoriteButton: React.FC<{
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ active, onClick }) => (
  <button
    type="button"
    className="pv-list-col-fav"
    onClick={onClick}
    title={active ? 'Unfavourite' : 'Favourite'}
    style={{
      width: 26,
      height: 26,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: `1px solid ${active ? T.accent : 'transparent'}`,
      background: active ? T.accentGlow : 'transparent',
      color: active ? T.accent : T.mute2,
      cursor: 'pointer',
      padding: 0,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
      <path d="M6 1.2l1.45 2.94 3.25.47-2.35 2.29.56 3.23L6 8.6l-2.91 1.53.56-3.23L1.3 4.61l3.25-.47L6 1.2z" />
    </svg>
  </button>
);

const HeaderSelectBox: React.FC<{
  visible: boolean;
  checked: boolean;
  onToggle: () => void;
}> = ({ visible, checked, onToggle }) => (
  <button
    type="button"
    onClick={(event) => { event.stopPropagation(); onToggle(); }}
    title={checked ? 'Clear selection' : 'Select all visible'}
    aria-label={checked ? 'Clear selection' : 'Select all visible'}
    style={{
      width: 14,
      height: 14,
      border: visible ? `1px solid ${checked ? T.accent : T.line2}` : '1px solid transparent',
      background: visible && checked ? T.accent : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      cursor: visible ? 'pointer' : 'default',
    }}
  >
    {visible && checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#0a0c0b" strokeWidth="1.8"><path d="M1.5 4l2 2 3-3" /></svg>}
  </button>
);

const MixedListHeader: React.FC<{
  isMultiSelect: boolean;
  allVisibleSelected: boolean;
  onToggleSelectAllVisible: () => void;
}> = ({ isMultiSelect, allVisibleSelected, onToggleSelectAllVisible }) => (
  <div className="pv-list-row pv-list-header">
    <HeaderSelectBox visible={isMultiSelect} checked={allVisibleSelected} onToggle={onToggleSelectAllVisible} />
    <span />
    <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>Title</span>
    <span className="pv-list-col-rating" style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>Rating</span>
    <span className="pv-list-col-tags" style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>Tags</span>
    <span className="pv-list-col-fav" style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>Fav</span>
    <span className="pv-list-col-date" style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>Date</span>
  </div>
);

const ListTagChip: React.FC<{ tag: Pick<TagSummary, 'id' | 'name' | 'color'> }> = ({ tag }) => (
  <span className="pv-list-tag" style={{
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '1px 5px',
    background: T.accentGlow, border: `1px solid ${T.line2}`,
    fontFamily: MONO, fontSize: fontSize(8), color: T.accent,
  }}>
    {tag.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
    {tag.name}
  </span>
);

const EmptyVaultState: React.FC<{
  message: string;
  canImport?: boolean;
  canCreateFolder?: boolean;
  canClearFilters?: boolean;
  canCreateNote?: boolean;
  onImport?: () => void;
  onCreateFolder?: () => void;
  onClearFilters?: () => void;
  onCreateNote?: () => void;
}> = ({ message, canImport, canCreateFolder, canClearFilters, canCreateNote, onImport, onCreateFolder, onClearFilters, onCreateNote }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: '64px 0',
    border: `1px dashed ${T.line2}`,
  }}>
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={T.mute2} strokeWidth="1.2">
      <rect x="3" y="3" width="12" height="12" /><rect x="21" y="3" width="12" height="12" />
      <rect x="3" y="21" width="12" height="12" /><rect x="21" y="21" width="12" height="12" />
    </svg>
    <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.mute2, letterSpacing: '0.06em', margin: 0 }}>{message}</p>
    {(canImport || canCreateFolder || canClearFilters || canCreateNote) && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {canClearFilters && (
          <button type="button" onClick={onClearFilters} style={{ height: 28, padding: '0 12px', border: `1px solid ${T.line2}`, background: 'none', color: T.mute, fontFamily: MONO, fontSize: fontSize(10), cursor: 'pointer' }}>
            Clear Search/Filters
          </button>
        )}
        {canImport && (
          <button type="button" onClick={onImport} style={{ height: 28, padding: '0 12px', border: 'none', background: T.accent, color: '#0a0c0b', fontFamily: MONO, fontSize: fontSize(10), cursor: 'pointer' }}>
            Import Files
          </button>
        )}
        {canCreateFolder && (
          <button type="button" onClick={onCreateFolder} style={{ height: 28, padding: '0 12px', border: `1px solid ${T.line2}`, background: 'none', color: T.mute, fontFamily: MONO, fontSize: fontSize(10), cursor: 'pointer' }}>
            Create Folder
          </button>
        )}
        {canCreateNote && (
          <button type="button" onClick={onCreateNote} style={{ height: 28, padding: '0 12px', border: 'none', background: T.accent, color: '#0a0c0b', fontFamily: MONO, fontSize: fontSize(10), cursor: 'pointer' }}>
            Create Note
          </button>
        )}
      </div>
    )}
  </div>
);

const BulkInspectorSummary: React.FC<{ total: number; files: number; bookmarks: number; notes: number }> = ({ total, files, bookmarks, notes }) => (
  <div style={{ padding: '18px 14px' }}>
    <div style={{ border: `1px solid ${T.line2}`, background: T.accentGlow, padding: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 10 }}>· Selection ·</div>
      <p style={{ margin: 0, fontFamily: SERIF, fontSize: fontSize(20), color: T.text }}>{total} objects selected</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
        <div style={{ border: `1px solid ${T.line}`, padding: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: fontSize(18), color: T.text }}>{files}</div>
          <div style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Files</div>
        </div>
        <div style={{ border: `1px solid ${T.line}`, padding: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: fontSize(18), color: T.text }}>{bookmarks}</div>
          <div style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Bookmarks</div>
        </div>
        <div style={{ border: `1px solid ${T.line}`, padding: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: fontSize(18), color: T.text }}>{notes}</div>
          <div style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Notes</div>
        </div>
      </div>
      <p style={{ margin: '14px 0 0', fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, lineHeight: 1.6 }}>
        Use the toolbar actions for this selection.
      </p>
    </div>
  </div>
);

// ── Bookmark List Row ─────────────────────────────────────────────────
const BookmarkListRow: React.FC<{
  bookmark: BookmarkSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenuOpen?: (id: string) => void;
  contextTargetIds?: string[];
  tags: TagSummary[];
  onOpen: (bookmark: BookmarkSummary) => void;
  privateOpenTargets: ExternalPrivateBrowserTarget[];
  onOpenPrivate: (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget) => void;
  onToggleFavorite: (ids: string[], isFavorite: boolean) => void;
  onMove: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void;
  onGoToFolder?: (bookmark: BookmarkSummary) => void;
}> = ({
  bookmark,
  selected,
  isMultiSelect,
  onClick,
  onContextMenuOpen,
  contextTargetIds,
  tags,
  onOpen,
  privateOpenTargets,
  onOpenPrivate,
  onToggleFavorite,
  onMove,
  onExport,
  onDelete,
  onToggleTag,
  onGoToFolder,
}) => {
  const hostname = (() => { try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; } })();
  const getTargetIds = (): string[] => contextTargetIds && contextTargetIds.length > 0 ? contextTargetIds : [bookmark.id];
  const targetIds = getTargetIds();
  const tagAssigned = (tagId: number): boolean => bookmark.tags.some((tag) => tag.id === tagId);
  const row = (
    <div
      data-gallery-item-id={bookmark.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={() => onContextMenuOpen?.(bookmark.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      className="pv-list-row"
      style={{
        background: selected ? T.accentGlow : 'none',
        borderLeft: `2px solid ${selected ? T.accent : 'transparent'}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <ListSelectionMark selected={selected} visible={isMultiSelect} />
      {/* Thumbnail */}
      <div className="pv-list-thumb" style={{ background: '#0d0f0d', overflow: 'hidden', border: `1px solid ${T.line}` }}>
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
      <div className="pv-list-col-title">
        <p className="pv-list-title" style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(11), color: T.text }}>
          {bookmark.title}
        </p>
        <div className="pv-list-subtitle" style={{ margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: fontSize(9), color: T.mute }}>
          <TypeBadge label="BOOKMARK" />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostname}</span>
        </div>
      </div>
      <ListRating rating={bookmark.rating} />
      {/* Tags */}
      <div className="pv-list-col-tags">
        {bookmark.tags.slice(0, 3).map((t) => (
          <ListTagChip key={t.id} tag={t} />
        ))}
      </div>
      <ListFavoriteButton
        active={bookmark.isFavorite}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite([bookmark.id], !bookmark.isFavorite);
        }}
      />
      {/* Date */}
      <span className="pv-list-col-date" style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, whiteSpace: 'nowrap' }}>
        {new Date(bookmark.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={targetIds.length > 1} onClick={() => onOpen(bookmark)}>
          Open in Browser
        </ContextMenuItem>
        {privateOpenTargets.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={targetIds.length > 1}>Open Private In...</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {privateOpenTargets.map((target) => (
                <ContextMenuItem key={target.id} onClick={() => onOpenPrivate(bookmark, target)}>
                  {target.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuItem onClick={() => onToggleFavorite(getTargetIds(), !bookmark.isFavorite)}>
          {bookmark.isFavorite ? 'Unfavourite' : 'Favourite'}
        </ContextMenuItem>
        {tags.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {tags.map((tag) => {
                const assigned = tagAssigned(tag.id);
                return (
                  <ContextMenuCheckboxItem
                    key={tag.id}
                    checked={assigned}
                    onCheckedChange={() => onToggleTag(getTargetIds(), tag.id, assigned)}
                  >
                    {tag.name}
                  </ContextMenuCheckboxItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {bookmark.folderId != null && onGoToFolder && (
          <ContextMenuItem onClick={() => onGoToFolder(bookmark)}>
            Go to Folder
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onMove(getTargetIds())}>
          Move to Folder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport(getTargetIds())}>
          Export
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete(getTargetIds())} className="text-danger focus:text-danger">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const FileListRow: React.FC<{
  item: VaultItemSummary;
  thumbnailUrl?: string;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onContextMenuOpen?: (id: string) => void;
  contextTargetIds?: string[];
  onToggleFavorite: (ids: string[]) => void;
  onMove: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  tags: TagSummary[];
  onGoToFolder?: (item: VaultItemSummary) => void;
}> = ({
  item,
  thumbnailUrl,
  selected,
  isMultiSelect,
  onClick,
  onOpen,
  onContextMenuOpen,
  contextTargetIds,
  onToggleFavorite,
  onMove,
  onExport,
  onDelete,
  tags,
  onGoToFolder,
}) => {
  const typeLabel = fileTypeLabel(item);
  const targetIds = contextTargetIds && contextTargetIds.length > 0 ? contextTargetIds : [item.id];
  const itemTags = (item.tagIds ?? [])
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is TagSummary => Boolean(tag));
  const visibleTags = itemTags.length > 0
    ? itemTags
    : (item.tags ?? []).map((name, index) => ({ id: index * -1 - 1, name }));

  const row = (
    <div
      data-gallery-item-id={item.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onOpen}
      onContextMenu={() => onContextMenuOpen?.(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); }
      }}
      className="pv-list-row"
      style={{
        background: selected ? T.accentGlow : 'none',
        borderLeft: `2px solid ${selected ? T.accent : 'transparent'}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <ListSelectionMark selected={selected} visible={isMultiSelect} />
      <div className="pv-list-thumb" style={{ background: '#0d0f0d', overflow: 'hidden', border: `1px solid ${T.line}` }}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
              {typeLabel === 'VIDEO'
                ? <><rect x="3" y="4" width="12" height="16" /><polyline points="15,8 21,5 21,19 15,16" /></>
                : typeLabel === 'DOCUMENT'
                  ? <><path d="M6 3h7l5 5v13H6z" /><path d="M13 3v6h5" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="16" x2="15" y2="16" /></>
                : typeLabel === 'IMAGE'
                  ? <><rect x="3" y="3" width="18" height="18" /><circle cx="9" cy="9" r="2" /><polyline points="3,17 8,12 12,16 16,13 21,17" /></>
                  : <><path d="M6 3h7l5 5v13H6z" /><path d="M13 3v6h5" /></>}
            </svg>
          </div>
        )}
      </div>
      <div className="pv-list-col-title">
        <p className="pv-list-title" style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(11), color: T.text }}>
          {item.originalName}
        </p>
        <div className="pv-list-subtitle" style={{ margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
          <TypeBadge label={typeLabel} />
        </div>
      </div>
      <ListRating rating={item.rating} />
      <div className="pv-list-col-tags">
        {visibleTags.slice(0, 3).map((tag) => (
          <ListTagChip key={tag.id} tag={tag} />
        ))}
      </div>
      <ListFavoriteButton
        active={item.isFavorite}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite([item.id]);
        }}
      />
      <span className="pv-list-col-date" style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, whiteSpace: 'nowrap' }}>
        {new Date(item.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={targetIds.length > 1} onClick={onOpen}>
          {isPreviewableMimeType(item.mimeType) ? 'Open in Viewer' : 'Open Read-Only Copy'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite(targetIds)}>
          {item.isFavorite ? 'Unfavourite' : 'Favourite'}
        </ContextMenuItem>
        {item.folderId != null && onGoToFolder && (
          <ContextMenuItem onClick={() => onGoToFolder(item)}>
            Go to Folder
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onMove(targetIds)}>
          Move to Folder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport(targetIds)}>
          Export
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete(targetIds)} className="text-danger focus:text-danger">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ── Bookmark Card ─────────────────────────────────────────────────────
const BookmarkCard: React.FC<{
  bookmark: BookmarkSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenuOpen?: (id: string) => void;
  contextTargetIds?: string[];
  tags: TagSummary[];
  onOpen: (bookmark: BookmarkSummary) => void;
  privateOpenTargets: ExternalPrivateBrowserTarget[];
  onOpenPrivate: (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget) => void;
  onToggleFavorite: (ids: string[], isFavorite: boolean) => void;
  onMove: (ids: string[]) => void;
  onExport: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void;
  onGoToFolder?: (bookmark: BookmarkSummary) => void;
}> = ({
  bookmark,
  selected,
  isMultiSelect,
  onClick,
  onContextMenuOpen,
  contextTargetIds,
  tags,
  onOpen,
  privateOpenTargets,
  onOpenPrivate,
  onToggleFavorite,
  onMove,
  onExport,
  onDelete,
  onToggleTag,
  onGoToFolder,
}) => {
  const [hovered, setHovered] = useState(false);
  const hostname = (() => { try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; } })();
  const getTargetIds = (): string[] => contextTargetIds && contextTargetIds.length > 0 ? contextTargetIds : [bookmark.id];
  const targetIds = getTargetIds();
  const tagAssigned = (tagId: number): boolean => bookmark.tags.some((tag) => tag.id === tagId);
  const primaryTag = bookmark.tags[0];
  const card = (
    <div
      data-gallery-item-id={bookmark.id}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onContextMenu={() => onContextMenuOpen?.(bookmark.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        border: selected
          ? `1px solid ${T.text}`
          : hovered
            ? `1px solid ${T.line2}`
            : `1px solid ${T.line}`,
        boxShadow: selected ? `0 0 0 1px ${T.text}` : 'none',
        background: '#0e100e',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'border-color 0.15s',
        borderRadius: 0,
      }}
    >
      {/* Thumbnail / placeholder */}
      <div style={{ aspectRatio: '4/3', background: '#0d0f0d', overflow: 'hidden', position: 'relative' }}>
        {bookmark.thumbnailDataUrl ? (
          <img
            src={bookmark.thumbnailDataUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s',
              transform: hovered ? 'scale(1.03)' : 'scale(1)',
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
        )}
        {isMultiSelect && (
          <div
            onClick={(event) => { event.stopPropagation(); onClick(event); }}
            style={{
            position: 'absolute', top: 8, left: 8, zIndex: 10,
            width: 16, height: 16,
            border: `1px solid ${selected ? T.accent : 'rgba(220,220,200,0.4)'}`,
            background: selected ? T.accent : 'rgba(10,12,11,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: selected || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            cursor: 'pointer',
          }}>
            {selected && <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#0a0c0b" strokeWidth="2"><path d="M1.5 4.5l2 2 4-4" /></svg>}
          </div>
        )}
        <div style={{ position: 'absolute', top: isMultiSelect ? 30 : 7, left: 7, zIndex: 10 }}>
          <TypeBadge label="BOOKMARK" variant="overlay" />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite([bookmark.id], !bookmark.isFavorite);
          }}
          title={bookmark.isFavorite ? 'Unfavourite' : 'Favourite'}
          style={{
            position: 'absolute', top: 7, right: 7, zIndex: 10,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: bookmark.isFavorite ? T.accentGlow : 'rgba(10,12,11,0.6)',
            border: 'none',
            cursor: 'pointer',
            color: bookmark.isFavorite ? T.accent : T.mute,
            opacity: bookmark.isFavorite || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            padding: 0,
          }}
        >
            <svg width="12" height="12" viewBox="0 0 12 12" fill={bookmark.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
              <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
            </svg>
        </button>
        {primaryTag && (
          <div style={{
            position: 'absolute', bottom: 7, left: 7, zIndex: 10,
            maxWidth: 'calc(100% - 14px)',
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.75)',
            fontFamily: MONO,
            fontSize: fontSize(9),
            letterSpacing: '0.04em',
            color: T.mute,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {primaryTag.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: primaryTag.color, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryTag.name}</span>
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: hovered ? 'rgba(0,0,0,0.08)' : 'transparent',
          transition: 'background 0.2s',
          pointerEvents: 'none',
        }} />
      </div>
      {/* Footer */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.line}` }}>
        <p style={{ margin: 0, fontFamily: SERIF, fontSize: fontSize(13), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bookmark.title}
        </p>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hostname}
          </span>
          <GridRating rating={bookmark.rating} />
        </div>
      </div>
    </div>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={targetIds.length > 1} onClick={() => onOpen(bookmark)}>
          Open in Browser
        </ContextMenuItem>
        {privateOpenTargets.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={targetIds.length > 1}>Open Private In...</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {privateOpenTargets.map((target) => (
                <ContextMenuItem key={target.id} onClick={() => onOpenPrivate(bookmark, target)}>
                  {target.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuItem onClick={() => onToggleFavorite(getTargetIds(), !bookmark.isFavorite)}>
          {bookmark.isFavorite ? 'Unfavourite' : 'Favourite'}
        </ContextMenuItem>
        {tags.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {tags.map((tag) => {
                const assigned = tagAssigned(tag.id);
                return (
                  <ContextMenuCheckboxItem
                    key={tag.id}
                    checked={assigned}
                    onCheckedChange={() => onToggleTag(getTargetIds(), tag.id, assigned)}
                  >
                    {tag.name}
                  </ContextMenuCheckboxItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {bookmark.folderId != null && onGoToFolder && (
          <ContextMenuItem onClick={() => onGoToFolder(bookmark)}>
            Go to Folder
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onMove(getTargetIds())}>
          Move to Folder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport(getTargetIds())}>
          Export
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete(getTargetIds())} className="text-danger focus:text-danger">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ── Note Rows / Cards ─────────────────────────────────────────────────
const noteFormatLabel = (format: NoteFormat): string => format === 'markdown' ? 'Markdown' : 'Plain text';

const NoteGlyph: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
    <path d="M6 3h9l3 3v15H6z" />
    <path d="M15 3v4h4" />
    <line x1="9" y1="11" x2="16" y2="11" />
    <line x1="9" y1="14" x2="16" y2="14" />
    <line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);

const NoteListRow: React.FC<{
  note: NoteSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenuOpen?: (id: string) => void;
  tags: TagSummary[];
  onToggleFavorite: (ids: string[], isFavorite: boolean) => void;
  onEdit: (note: NoteSummary) => void;
  onMove: (ids: string[]) => void;
  onExport: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void;
  onGoToFolder?: (note: NoteSummary) => void;
}> = ({ note, selected, isMultiSelect, onClick, onContextMenuOpen, tags, onToggleFavorite, onEdit, onMove, onExport, onDelete, onToggleTag, onGoToFolder }) => {
  const tagAssigned = (tagId: number): boolean => note.tags.some((tag) => tag.id === tagId);
  const row = (
    <div
      data-gallery-item-id={note.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={() => onEdit(note)}
      onContextMenu={() => onContextMenuOpen?.(note.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      className="pv-list-row"
      style={{
        background: selected ? T.accentGlow : 'none',
        borderLeft: `2px solid ${selected ? T.accent : 'transparent'}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <ListSelectionMark selected={selected} visible={isMultiSelect} />
      <div className="pv-list-thumb" style={{ background: '#0d0f0d', overflow: 'hidden', border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NoteGlyph size={14} />
      </div>
      <div className="pv-list-col-title">
        <p className="pv-list-title" style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(11), color: T.text }}>{note.title}</p>
        <div className="pv-list-subtitle" style={{ margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: fontSize(9), color: T.mute }}>
          <TypeBadge label="NOTE" />
          <span>{noteFormatLabel(note.format)}</span>
        </div>
      </div>
      <ListRating />
      <div className="pv-list-col-tags">
        {note.tags.slice(0, 3).map((t) => <ListTagChip key={t.id} tag={t} />)}
      </div>
      <ListFavoriteButton
        active={note.isFavorite}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite([note.id], !note.isFavorite);
        }}
      />
      <span className="pv-list-col-date" style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, whiteSpace: 'nowrap' }}>
        {new Date(note.createdAt).toLocaleDateString()}
      </span>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onEdit(note)}>Edit Note</ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite([note.id], !note.isFavorite)}>
          {note.isFavorite ? 'Unfavourite' : 'Favourite'}
        </ContextMenuItem>
        {tags.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {tags.map((tag) => {
                const assigned = tagAssigned(tag.id);
                return (
                  <ContextMenuCheckboxItem key={tag.id} checked={assigned} onCheckedChange={() => onToggleTag([note.id], tag.id, assigned)}>
                    {tag.name}
                  </ContextMenuCheckboxItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {note.folderId != null && onGoToFolder && (
          <ContextMenuItem onClick={() => onGoToFolder(note)}>Go to Folder</ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onMove([note.id])}>Move to Folder</ContextMenuItem>
        <ContextMenuItem onClick={() => onExport(note.id)}>Export</ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete([note.id])} className="text-danger focus:text-danger">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const NoteCard: React.FC<{
  note: NoteSummary;
  selected: boolean;
  isMultiSelect: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenuOpen?: (id: string) => void;
  tags: TagSummary[];
  onToggleFavorite: (ids: string[], isFavorite: boolean) => void;
  onEdit: (note: NoteSummary) => void;
  onMove: (ids: string[]) => void;
  onExport: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void;
  onGoToFolder?: (note: NoteSummary) => void;
}> = ({ note, selected, isMultiSelect, onClick, onContextMenuOpen, tags, onToggleFavorite, onEdit, onMove, onExport, onDelete, onToggleTag, onGoToFolder }) => {
  const [hovered, setHovered] = useState(false);
  const primaryTag = note.tags[0];
  const tagAssigned = (tagId: number): boolean => note.tags.some((tag) => tag.id === tagId);
  const card = (
    <div
      data-gallery-item-id={note.id}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onDoubleClick={() => onEdit(note)}
      onContextMenu={() => onContextMenuOpen?.(note.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        border: selected ? `1px solid ${T.text}` : hovered ? `1px solid ${T.line2}` : `1px solid ${T.line}`,
        boxShadow: selected ? `0 0 0 1px ${T.text}` : 'none',
        background: '#0e100e',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'border-color 0.15s',
        borderRadius: 0,
      }}
    >
      <div style={{ aspectRatio: '4/3', background: '#0d0f0d', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NoteGlyph size={32} />
        {isMultiSelect && (
          <div onClick={(event) => { event.stopPropagation(); onClick(event); }} style={{
            position: 'absolute', top: 8, left: 8, zIndex: 10,
            width: 16, height: 16,
            border: `1px solid ${selected ? T.accent : 'rgba(220,220,200,0.4)'}`,
            background: selected ? T.accent : 'rgba(10,12,11,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: selected || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            cursor: 'pointer',
          }}>
            {selected && <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#0a0c0b" strokeWidth="2"><path d="M1.5 4.5l2 2 4-4" /></svg>}
          </div>
        )}
        <div style={{ position: 'absolute', top: isMultiSelect ? 30 : 7, left: 7, zIndex: 10 }}>
          <TypeBadge label="NOTE" variant="overlay" />
        </div>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleFavorite([note.id], !note.isFavorite); }}
          title={note.isFavorite ? 'Unfavourite' : 'Favourite'}
          style={{
            position: 'absolute', top: 7, right: 7, zIndex: 10,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: note.isFavorite ? T.accentGlow : 'rgba(10,12,11,0.6)',
            border: 'none',
            cursor: 'pointer',
            color: note.isFavorite ? T.accent : T.mute,
            opacity: note.isFavorite || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill={note.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
          </svg>
        </button>
        {primaryTag && (
          <div style={{
            position: 'absolute', top: 7, left: 56, zIndex: 10,
            maxWidth: 'calc(100% - 92px)',
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.75)',
            fontFamily: MONO,
            fontSize: fontSize(9),
            color: T.mute,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {primaryTag.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: primaryTag.color, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryTag.name}</span>
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.line}` }}>
        <p style={{ margin: 0, fontFamily: SERIF, fontSize: fontSize(13), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title}
        </p>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {noteFormatLabel(note.format)}
          </span>
        </div>
      </div>
    </div>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onEdit(note)}>Edit Note</ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite([note.id], !note.isFavorite)}>
          {note.isFavorite ? 'Unfavourite' : 'Favourite'}
        </ContextMenuItem>
        {tags.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Tags</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {tags.map((tag) => {
                const assigned = tagAssigned(tag.id);
                return (
                  <ContextMenuCheckboxItem key={tag.id} checked={assigned} onCheckedChange={() => onToggleTag([note.id], tag.id, assigned)}>
                    {tag.name}
                  </ContextMenuCheckboxItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {note.folderId != null && onGoToFolder && (
          <ContextMenuItem onClick={() => onGoToFolder(note)}>Go to Folder</ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onMove([note.id])}>Move to Folder</ContextMenuItem>
        <ContextMenuItem onClick={() => onExport(note.id)}>Export</ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete([note.id])} className="text-danger focus:text-danger">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const NoteInspector: React.FC<{
  note: NoteSummary;
  tags: TagSummary[];
  onEdit: (note: NoteSummary) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onToggleTag: (noteId: string, tagId: number, assigned: boolean) => void;
  onExport: (id: string) => void;
  onGoToFolder?: (note: NoteSummary) => void;
}> = ({ note, tags, onEdit, onDelete, onToggleFavorite, onToggleTag, onExport, onGoToFolder }) => {
  const iconBtn = (): React.CSSProperties => ({
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: `1px solid ${T.line2}`,
    cursor: 'pointer', color: T.mute, padding: 0, borderRadius: 0, flexShrink: 0,
  });
  const actionBtn = (variant: 'default' | 'ghost'): React.CSSProperties => ({
    height: 28, padding: '0 12px',
    background: variant === 'default' ? T.accent : 'none',
    border: variant === 'ghost' ? `1px solid ${T.line2}` : 'none',
    cursor: 'pointer',
    color: variant === 'ghost' ? T.mute : '#0a0c0b',
    fontFamily: MONO, fontSize: fontSize(10),
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    borderRadius: 0,
  });

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, fontFamily: SERIF, fontSize: fontSize(18), color: T.text, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {note.title}
        </p>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: fontSize(9), color: T.mute }}>
          <TypeBadge label="NOTE" />
          <span>{noteFormatLabel(note.format)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button type="button" onClick={() => onEdit(note)} style={{ ...actionBtn('default'), flex: 1 }}>
          Edit Note
        </button>
        <button type="button" onClick={() => onToggleFavorite(note.id, !note.isFavorite)} title={note.isFavorite ? 'Unfavourite' : 'Favourite'} style={{ ...iconBtn(), background: note.isFavorite ? T.accentGlow : 'none', borderColor: note.isFavorite ? T.accent : T.line2, color: note.isFavorite ? T.accent : T.mute }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill={note.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
          </svg>
        </button>
        <button type="button" onClick={() => onDelete(note.id)} style={{ ...iconBtn(), borderColor: T.danger, color: T.danger }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="1.5,2.5 9.5,2.5" /><path d="M3 2.5V1.5h5v1" /><rect x="2" y="2.5" width="7" height="8" /></svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(note.body); toast.success('Note body copied.'); }} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="6" height="6" /><path d="M1 7V1h6" /></svg>
          Copy Body
        </button>
        <button type="button" onClick={() => onExport(note.id)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="5,1 5,7" /><polyline points="2,4 5,7 8,4" /><line x1="1" y1="9" x2="9" y2="9" /></svg>
          Export
        </button>
        {note.folderId != null && onGoToFolder && (
          <button type="button" onClick={() => onGoToFolder(note)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 8V3a1 1 0 0 1 1-1h2l1 1h3a1 1 0 0 1 1 1v4z" /></svg>
            Go to Folder
          </button>
        )}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, margin: '14px 0' }} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Preview ·</div>
        {note.body.trim() ? (
          <p
            style={{
              margin: 0,
              fontFamily: MONO,
              fontSize: fontSize(10),
              lineHeight: 1.45,
              color: T.mute,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {note.body.replace(/\n{3,}/g, '\n\n')}
          </p>
        ) : (
          <p style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>No preview available.</p>
        )}
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, margin: '14px 0' }} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 10 }}>· Info ·</div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, textTransform: 'uppercase' }}>Type</span>
          <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text }}>{noteFormatLabel(note.format)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, textTransform: 'uppercase' }}>Updated</span>
          <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text }}>{new Date(note.updatedAt).toLocaleDateString()}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, textTransform: 'uppercase' }}>Cipher</span>
          <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.accent }}>aes-256-gcm</span>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />
      <div>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Tags ·</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((tag) => {
            const assigned = note.tags.some((t) => t.id === tag.id);
            return (
              <button key={tag.id} type="button" onClick={() => onToggleTag(note.id, tag.id, assigned)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 8px',
                background: assigned ? T.accentGlow : 'none',
                border: `1px solid ${assigned ? T.accent : T.line2}`,
                cursor: 'pointer', color: assigned ? T.accent : T.mute,
                fontFamily: MONO, fontSize: fontSize(10), borderRadius: 0,
              }}>
                {tag.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
                {tag.name}
              </button>
            );
          })}
          {tags.length === 0 && <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>No tags</p>}
        </div>
      </div>
    </div>
  );
};

const NoteEditorModal: React.FC<{
  note: NoteSummary | null;
  onSave: (input: { id: string; title: string; body: string; format: NoteFormat }) => Promise<boolean>;
  onClose: () => void;
}> = ({ note, onSave, onClose }) => {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [format, setFormat] = useState<NoteFormat>(note?.format ?? 'plain');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setFormat(note?.format ?? 'plain');
    setIsSaving(false);
    setConfirmDiscard(false);
  }, [note?.id, note?.title, note?.body, note?.format]);

  useEffect(() => {
    if (!note) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!note) return null;

  const currentNote = note;
  const dirty = title !== note.title || body !== note.body || format !== note.format;
  const canSave = title.trim().length > 0 && dirty && !isSaving;

  function requestClose(): void {
    if (isSaving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  async function save(): Promise<void> {
    if (!canSave) return;
    setIsSaving(true);
    const ok = await onSave({ id: currentNote.id, title: title.trim(), body, format });
    setIsSaving(false);
    if (ok) onClose();
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 24 }}
        onClick={requestClose}
      >
        <div
          style={{ width: 'min(920px, calc(100vw - 48px))', height: 'min(760px, calc(100vh - 48px))', background: T.bg2, border: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column' }}
          onClick={(event) => event.stopPropagation()}
        >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2 }}>· Secure Note ·</div>
            <div style={{ marginTop: 4, fontFamily: SERIF, fontSize: fontSize(20), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title.trim() || 'Untitled note'}</div>
          </div>
          <button type="button" onClick={requestClose} title="Close" style={{ width: 28, height: 28, background: 'none', border: `1px solid ${T.line2}`, color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, padding: 16, borderBottom: `1px solid ${T.line}` }}>
          <div>
            <label style={{ display: 'block', fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 6 }}>Title</label>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled note"
              style={{ width: '100%', height: 34, boxSizing: 'border-box', background: '#0d0f0d', border: `1px solid ${title.trim() ? T.line2 : T.danger}`, color: T.text, fontFamily: SERIF, fontSize: fontSize(17), padding: '0 10px', outline: 'none', borderRadius: 0 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 6 }}>Format</label>
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as NoteFormat)}
              style={{ width: '100%', height: 34, background: '#0d0f0d', border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(11), padding: '0 8px', outline: 'none', boxSizing: 'border-box', borderRadius: 0 }}
            >
              <option value="plain">Plain text</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a secure note..."
            style={{ width: '100%', height: '100%', resize: 'none', boxSizing: 'border-box', background: '#0d0f0d', border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(12), lineHeight: 1.7, padding: 12, outline: 'none', borderRadius: 0 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: dirty ? T.accent : T.mute2, letterSpacing: '0.06em' }}>
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={requestClose} disabled={isSaving} style={{ height: 30, padding: '0 12px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), cursor: isSaving ? 'default' : 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={!canSave} style={{ height: 30, padding: '0 14px', background: T.accent, border: 'none', color: '#0a0c0b', fontFamily: MONO, fontSize: fontSize(10), cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.5 }}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        </div>
      </div>
      <SanctumConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard Unsaved Changes?"
        description="Your note changes have not been saved."
        variant="warning"
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        zIndex={11000}
      />
    </>
  );
};

// ── Bookmark Inspector ────────────────────────────────────────────────
const BookmarkInspector: React.FC<{
  bookmark: BookmarkSummary;
  tags: TagSummary[];
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleTag: (bookmarkId: string, tagId: number, assigned: boolean) => void;
  onToggleFavorite: (bookmarkId: string, isFavorite: boolean) => void;
  onSetRating: (bookmarkId: string, rating: number | null) => void;
  onOpenInBrowser?: (url: string) => void;
  privateOpenTargets: ExternalPrivateBrowserTarget[];
  onOpenPrivate: (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget) => void;
  onChangeThumbnail?: (bookmark: BookmarkSummary) => void;
  onGoToFolder?: (bookmark: BookmarkSummary) => void;
}> = ({ bookmark, tags, onDelete, onRename, onToggleTag, onToggleFavorite, onSetRating, onOpenInBrowser, privateOpenTargets, onOpenPrivate, onChangeThumbnail, onGoToFolder }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(bookmark.title);
  const [privateMenuOpen, setPrivateMenuOpen] = useState(false);

  useEffect(() => {
    setTitleDraft(bookmark.title);
    setIsRenaming(false);
    setPrivateMenuOpen(false);
  }, [bookmark.id, bookmark.title]);

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
    fontFamily: MONO, fontSize: fontSize(10),
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    borderRadius: 0,
  });

  const fieldRow = (label: string, value: React.ReactNode): React.ReactNode => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, marginBottom: 6, alignItems: 'start' }}>
      <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, paddingTop: 1 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding: '16px 14px' }}>
      {/* Thumbnail */}
      <div style={{ aspectRatio: '4/3', marginBottom: 14, overflow: 'hidden', background: '#0d0f0d', border: `1px solid ${T.line}` }}>
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
              style={{ flex: 1, height: 26, background: 'transparent', border: `1px solid ${T.accent}`, color: T.text, fontFamily: MONO, fontSize: fontSize(11), padding: '0 6px', outline: 'none', borderRadius: 0 }}
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
            <p style={{ flex: 1, minWidth: 0, fontFamily: SERIF, fontSize: fontSize(15), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
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
          <button type="button" onClick={() => onOpenInBrowser(bookmark.url)} style={{ ...actionBtn('default'), flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="5.5" r="4.5" /><path d="M5.5 1C5.5 1 7 3 7 5.5S5.5 10 5.5 10M5.5 1C5.5 1 4 3 4 5.5S5.5 10 5.5 10M1 5.5h9" /></svg>
            Open
          </button>
        )}
        {privateOpenTargets.length > 0 && (
          <div style={{ position: 'relative', width: 28, height: 28, flex: '0 0 28px' }}>
            <button
              type="button"
              onClick={() => setPrivateMenuOpen((open) => !open)}
              title="Open outside Sanctum in private browsing"
              style={{ ...iconBtn(), borderColor: privateMenuOpen ? T.accent : T.line2, color: privateMenuOpen ? T.accent : T.mute }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4.7h8" />
                <path d="M4.1 4.7 5 2.5h4l.9 2.2" />
                <path d="M2.2 8.2c.8-.8 2.1-.8 2.9 0" />
                <path d="M8.9 8.2c.8-.8 2.1-.8 2.9 0" />
                <circle cx="3.65" cy="8.9" r="1.45" />
                <circle cx="10.35" cy="8.9" r="1.45" />
                <path d="M5.1 8.9h3.8" />
              </svg>
            </button>
            {privateMenuOpen && (
              <div style={{ position: 'absolute', top: 32, right: 0, zIndex: 20, minWidth: 150, border: `1px solid ${T.line2}`, background: T.bg2, boxShadow: '0 12px 30px rgba(0,0,0,0.35)', padding: 4 }}>
                {privateOpenTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => { setPrivateMenuOpen(false); onOpenPrivate(bookmark, target); }}
                    style={{ width: '100%', height: 28, padding: '0 10px', background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontFamily: MONO, fontSize: fontSize(10), textAlign: 'left' }}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button"
          onClick={() => onToggleFavorite(bookmark.id, !bookmark.isFavorite)}
          title={bookmark.isFavorite ? 'Unfavourite' : 'Favourite'}
          style={{ ...iconBtn(), background: bookmark.isFavorite ? T.accentGlow : 'none', borderColor: bookmark.isFavorite ? T.accent : T.line2, color: bookmark.isFavorite ? T.accent : T.mute }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill={bookmark.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
          </svg>
        </button>
        <button type="button" onClick={() => onDelete(bookmark.id)} style={{ ...iconBtn(), borderColor: T.danger, color: T.danger }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3"><polyline points="1.5,2.5 9.5,2.5" /><path d="M3 2.5V1.5h5v1" /><rect x="2" y="2.5" width="7" height="8" /></svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
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
        {bookmark.folderId != null && onGoToFolder && (
          <button type="button" onClick={() => onGoToFolder(bookmark)} style={{ ...actionBtn('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 8V3a1 1 0 0 1 1-1h2l1 1h3a1 1 0 0 1 1 1v4z" /></svg>
            Go to Folder
          </button>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Info */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 10 }}>· Info ·</div>
        {fieldRow('URL', <a href="#" onClick={(e) => { e.preventDefault(); onOpenInBrowser?.(bookmark.url); }} style={{ color: T.accent, textDecoration: 'none', wordBreak: 'break-all' }}>{bookmark.url}</a>)}
        {fieldRow('Added', new Date(bookmark.createdAt).toLocaleDateString())}
        {fieldRow('Cipher', <span style={{ color: T.accent }}>aes-256-gcm</span>)}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Rating */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Rating ·</div>
        <StarRating value={bookmark.rating} onChange={(rating) => onSetRating(bookmark.id, rating)} />
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, marginBottom: 14 }} />

      {/* Tags */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2, marginBottom: 8 }}>· Tags ·</div>
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
                  fontFamily: MONO, fontSize: fontSize(10), borderRadius: 0,
                }}
              >
                {tag.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
                {tag.name}
                {assigned && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" /></svg>}
              </button>
            );
          })}
          {tags.length === 0 && <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>No tags</p>}
        </div>
      </div>
    </div>
  );
};

// ── Thumbnail picker overlay ──────────────────────────────────────────
const ThumbnailPicker: React.FC<{
  bookmark: BookmarkSummary;
  onPick: (dataUrl: string, bookmarkId: string) => void;
  onClose: () => void;
}> = ({ bookmark, onPick, onClose }) => {
  const [candidates, setCandidates] = useState<Array<{ item: VaultItemSummary; dataUrl: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter(({ item }) => item.originalName.toLowerCase().includes(query));
  }, [candidates, search]);

  useEffect(() => {
    let cancelled = false;
    const loadVaultImages = async (): Promise<void> => {
      setLoading(true);
      const result = await window.electronAPI.listItemsQuery({ limit: 5000, offset: 0, sort: 'newest' });
      if (!result.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const imageItems = result.data.items.filter((item) =>
        item.mimeType.startsWith('image/') && item.hasThumbnail,
      );
      const loaded = await Promise.all(
        imageItems.map(async (item) => {
          const thumbnail = await window.electronAPI.getItemThumbnail(item.id);
          if (!thumbnail.ok) return null;
          return {
            item,
            dataUrl: `data:${thumbnail.data.mimeType};base64,${thumbnail.data.base64Data}`,
          };
        }),
      );
      if (cancelled) return;
      setCandidates(loaded.filter((entry): entry is { item: VaultItemSummary; dataUrl: string } => Boolean(entry)));
      setLoading(false);
    };
    void loadVaultImages();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
      <div style={{ background: '#14160f', border: `1px solid ${T.line2}`, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute }}>Choose thumbnail — {bookmark.title}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" /></svg>
          </button>
        </div>
        <div style={{ position: 'relative', padding: '10px 16px', borderBottom: `1px solid ${T.line}` }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search images..."
            style={{
              width: '100%',
              height: 30,
              padding: search ? '0 30px 0 10px' : '0 10px',
              background: T.bg,
              border: `1px solid ${T.line2}`,
              color: T.text,
              fontFamily: MONO,
              fontSize: fontSize(10),
              outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear search"
              style={{
                position: 'absolute',
                right: 24,
                top: 16,
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                color: T.mute,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: T.mute }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={T.accent} strokeWidth="1.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M14 8A6 6 0 1 1 8 2" /></svg>
              <span style={{ fontFamily: MONO, fontSize: fontSize(10) }}>Loading Vault images…</span>
            </div>
          ) : candidates.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, textAlign: 'center', padding: '32px 0' }}>No Vault images available. Capture or import an image first.</p>
          ) : filteredCandidates.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, textAlign: 'center', padding: '32px 0' }}>No images match this search.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
              {filteredCandidates.map(({ item, dataUrl }) => (
                <div key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(dataUrl, bookmark.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPick(dataUrl, bookmark.id); }}
                  title={item.originalName}
                  style={{ minWidth: 0, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${T.line}`, flexShrink: 0 }}
                >
                  <div style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: T.bg }}>
                    <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ padding: '5px 6px', fontFamily: MONO, fontSize: fontSize(9), color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.originalName}
                  </div>
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

const findFolderPathById = (nodes: FolderNode[], folderId: number): string | null => {
  const visit = (items: FolderNode[], path: string[]): string[] | null => {
    for (const node of items) {
      const next = [...path, node.name];
      if (node.id === folderId) return next;
      const found = visit(node.children, next);
      if (found) return found;
    }
    return null;
  };
  const path = visit(nodes, ['Root']);
  return path ? path.join(' / ') : null;
};

const collectFolderDescendantIds = (nodes: FolderNode[], folderId: number): Set<number> => {
  const byId = new Map<number, FolderNode>();
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as FolderNode;
    byId.set(node.id, node);
    stack.push(...node.children);
  }

  const result = new Set<number>();
  const queue = [folderId];
  while (queue.length > 0) {
    const id = queue.shift() as number;
    if (result.has(id)) continue;
    result.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const child of node.children) queue.push(child.id);
  }
  return result;
};

type MixedObject =
  | {
      kind: 'file';
      id: string;
      createdAt: string;
      name: string;
      folderId: number | null;
      isFavorite: boolean;
      rating?: number;
      tags: TagSummary[];
      typeLabel: ObjectTypeLabel;
      item: VaultItemSummary;
    }
  | {
      kind: 'bookmark';
      id: string;
      createdAt: string;
      name: string;
      folderId: number | null;
      isFavorite: boolean;
      rating?: number;
      tags: TagSummary[];
      typeLabel: ObjectTypeLabel;
      bookmark: BookmarkSummary;
    }
  | {
      kind: 'note';
      id: string;
      createdAt: string;
      name: string;
      folderId: number | null;
      isFavorite: boolean;
      tags: TagSummary[];
      typeLabel: ObjectTypeLabel;
      note: NoteSummary;
    };

const mixedObjectSize = (object: MixedObject): number =>
  object.kind === 'file' ? object.item.size : object.kind === 'note' ? object.note.body.length : 0;

const mixedObjectRating = (object: MixedObject): number =>
  object.kind === 'file' ? object.item.rating ?? 0 : object.kind === 'bookmark' ? object.bookmark.rating ?? 0 : 0;

const compareCreatedNewest = (a: { createdAt: string }, b: { createdAt: string }): number =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const compareCreatedOldest = (a: { createdAt: string }, b: { createdAt: string }): number =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

// ── VaultPage ─────────────────────────────────────────────────────────
export const VaultPage = ({ onOpenUrlInBrowser }: VaultPageProps): React.JSX.Element => {
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
  const [privateOpenTargets, setPrivateOpenTargets] = useState<ExternalPrivateBrowserTarget[]>([]);
  // null = all bookmarks (no folder filter), number = filter by that folder
  const [bookmarkFolderId, setBookmarkFolderId] = useState<number | null>(null);

  // View scope includes non-file object scopes.
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [noteFolderId, setNoteFolderId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<VaultConfirmRequest | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const closeVaultConfirm = useCallback((confirmed: boolean): void => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmRequest(null);
    resolve?.(confirmed);
  }, []);

  const requestVaultConfirm = useCallback((request: VaultConfirmRequest): Promise<boolean> => {
    confirmResolveRef.current?.(false);
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmRequest(request);
    });
  }, []);

  type VaultScope = 'all' | 'video' | 'image' | 'document' | 'root' | 'folder' | 'bookmark' | 'note';
  const vaultScope = selectedViewScope as VaultScope;
  const isBookmarkScope = vaultScope === 'bookmark';
  const isNoteScope = vaultScope === 'note';

  useEffect(() => {
    let cancelled = false;
    const loadTargets = async (): Promise<void> => {
      const result = await window.electronAPI.listPrivateOpenTargets();
      if (!cancelled && result.ok) {
        setPrivateOpenTargets(result.data.filter((target) => target.available));
      }
    };
    void loadTargets();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBookmark = selectedItemIds.length === 0
    ? bookmarks.find((b) => b.id === selectedBookmarkId) ?? null
    : null;
  const selectedNote = selectedItemIds.length === 0 && selectedBookmarkId === null
    ? notes.find((note) => note.id === selectedNoteId) ?? null
    : null;
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;

  const mixedFolderIds = useMemo(() => {
    if (vaultScope !== 'folder' || selectedFolderId === null) return null;
    return collectFolderDescendantIds(folders, selectedFolderId);
  }, [folders, selectedFolderId, vaultScope]);

  // Derive sorted + filtered bookmark list.
  const visibleBookmarks = useMemo(() => {
    let list = bookmarks.slice();

    // Folder filter. Bookmark scope can show all bookmarks; mixed root/folder
    // scopes mirror the file gallery's root/descendant behavior.
    if (vaultScope === 'bookmark') {
      if (bookmarkFolderId !== null) list = list.filter((b) => b.folderId === bookmarkFolderId);
    } else if (vaultScope === 'root') {
      list = list.filter((b) => b.folderId === null || b.folderId === undefined);
    } else if (vaultScope === 'folder') {
      list = list.filter((b) => b.folderId != null && Boolean(mixedFolderIds?.has(b.folderId)));
    }

    // Tag filter
    if (selectedTagIds.length > 0) {
      list = list.filter((b) => selectedTagIds.every((tid) => b.tags.some((t) => t.id === tid)));
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((b) => {
        const haystack = [
          b.title,
          b.url,
          ...b.tags.map((tag) => tag.name),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    if (showFavoritesOnly) {
      list = list.filter((b) => b.isFavorite);
    }

    // Sort
    list.sort((a, b) => {
      switch (sort) {
        case 'newest': return compareCreatedNewest(a, b);
        case 'oldest': return compareCreatedOldest(a, b);
        case 'name_asc': return a.title.localeCompare(b.title);
        case 'name_desc': return b.title.localeCompare(a.title);
        case 'rating_desc': return (b.rating ?? 0) - (a.rating ?? 0) || compareCreatedNewest(a, b);
        case 'rating_asc': return (a.rating ?? 0) - (b.rating ?? 0) || compareCreatedOldest(a, b);
        case 'size_desc':
        case 'size_asc':
        default: return compareCreatedNewest(a, b);
      }
    });

    return list;
  }, [bookmarkFolderId, bookmarks, mixedFolderIds, searchTerm, selectedTagIds, showFavoritesOnly, sort, vaultScope]);

  const showBookmarksInMixedView = !isBookmarkScope && (vaultScope === 'all' || vaultScope === 'root' || vaultScope === 'folder');
  const visibleNotes = useMemo(() => {
    let list = notes.slice();

    if (vaultScope === 'note') {
      if (noteFolderId !== null) list = list.filter((note) => note.folderId === noteFolderId);
    } else if (vaultScope === 'root') {
      list = list.filter((note) => note.folderId === null || note.folderId === undefined);
    } else if (vaultScope === 'folder') {
      list = list.filter((note) => note.folderId != null && Boolean(mixedFolderIds?.has(note.folderId)));
    }

    if (selectedTagIds.length > 0) {
      list = list.filter((note) => selectedTagIds.every((tid) => note.tags.some((tag) => tag.id === tid)));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((note) => {
        const haystack = [note.title, note.body, ...note.tags.map((tag) => tag.name)].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    if (showFavoritesOnly) {
      list = list.filter((note) => note.isFavorite);
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'oldest': return compareCreatedOldest(a, b);
        case 'name_asc': return a.title.localeCompare(b.title);
        case 'name_desc': return b.title.localeCompare(a.title);
        case 'size_desc': return b.body.length - a.body.length || compareCreatedNewest(a, b);
        case 'size_asc': return a.body.length - b.body.length || compareCreatedOldest(a, b);
        case 'newest':
        case 'rating_desc':
        case 'rating_asc':
        default: return compareCreatedNewest(a, b);
      }
    });

    return list;
  }, [mixedFolderIds, noteFolderId, notes, searchTerm, selectedTagIds, showFavoritesOnly, sort, vaultScope]);
  const showNotesInMixedView = !isBookmarkScope && !isNoteScope && (vaultScope === 'all' || vaultScope === 'root' || vaultScope === 'folder');

  const mixedObjects = useMemo<MixedObject[]>(() => {
    const tagById = new Map(tags.map((tag) => [tag.id, tag]));
    const objects: MixedObject[] = filteredItems.map((item) => ({
      kind: 'file',
      id: item.id,
      createdAt: item.createdAt,
      name: item.originalName,
      folderId: item.folderId ?? null,
      isFavorite: item.isFavorite,
      rating: item.rating,
      tags: (item.tagIds ?? [])
        .map((tagId) => tagById.get(tagId))
        .filter((tag): tag is TagSummary => Boolean(tag)),
      typeLabel: fileTypeLabel(item),
      item,
    }));

    if (showBookmarksInMixedView) {
      objects.push(...visibleBookmarks.map((bookmark) => ({
        kind: 'bookmark' as const,
        id: bookmark.id,
        createdAt: bookmark.createdAt,
        name: bookmark.title,
        folderId: bookmark.folderId ?? null,
        isFavorite: bookmark.isFavorite,
        rating: bookmark.rating,
        tags: bookmark.tags,
        typeLabel: 'BOOKMARK' as ObjectTypeLabel,
        bookmark,
      })));
    }

    if (showNotesInMixedView) {
      objects.push(...visibleNotes.map((note) => ({
        kind: 'note' as const,
        id: note.id,
        createdAt: note.createdAt,
        name: note.title,
        folderId: note.folderId ?? null,
        isFavorite: note.isFavorite,
        tags: note.tags,
        typeLabel: 'NOTE' as ObjectTypeLabel,
        note,
      })));
    }

    return objects.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'size_desc':
          return mixedObjectSize(b) - mixedObjectSize(a) || compareCreatedNewest(a, b);
        case 'size_asc':
          return mixedObjectSize(a) - mixedObjectSize(b) || compareCreatedOldest(a, b);
        case 'rating_desc':
          return mixedObjectRating(b) - mixedObjectRating(a) || compareCreatedNewest(a, b);
        case 'rating_asc':
          return mixedObjectRating(a) - mixedObjectRating(b) || compareCreatedOldest(a, b);
        case 'newest':
        default:
          return compareCreatedNewest(a, b);
      }
    });
  }, [filteredItems, showBookmarksInMixedView, showNotesInMixedView, sort, tags, visibleBookmarks, visibleNotes]);
  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const result = await window.electronAPI.listBookmarks();
      if (result.ok) setBookmarks(result.data);
    } finally {
      setBookmarksLoading(false);
    }
  }, []);
  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const result = await window.electronAPI.listNotes();
      if (result.ok) setNotes(result.data);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [thumbnailSize, setThumbnailSize] = useState<AppearanceSettings['thumbnailSize']>('medium');
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const importToastIdRef = useRef<string | number | null>(null);
  const exportToastIdRef = useRef<string | number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogItemIds, setMoveDialogItemIds] = useState<string[]>([]);
  const [moveDialogBookmarkIds, setMoveDialogBookmarkIds] = useState<string[]>([]);
  const [moveDialogNoteIds, setMoveDialogNoteIds] = useState<string[]>([]);
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

  useEffect(() => {
    let active = true;
    void window.electronAPI.getAppearanceSettings().then((result) => {
      if (!active || !result.ok) return;
      setViewMode(result.data.defaultView);
      setThumbnailSize(result.data.thumbnailSize);
    });
    return () => { active = false; };
  }, []);

  const gridMinCardWidth = THUMBNAIL_GRID_MIN_WIDTH[thumbnailSize];

  const RENDER_PAGE = 100;
  const [renderCount, setRenderCount] = useState(RENDER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const renderedMixedObjects = useMemo(
    () => mixedObjects.slice(0, renderCount),
    [mixedObjects, renderCount],
  );
  const renderedMixedFiles = useMemo(
    () => renderedMixedObjects
      .filter((object): object is Extract<MixedObject, { kind: 'file' }> => object.kind === 'file')
      .map((object) => object.item),
    [renderedMixedObjects],
  );

  useEffect(() => { setRenderCount(RENDER_PAGE); }, [filteredItems, mixedObjects]);

  const handleSentinelIntersect = useCallback(async (entries: IntersectionObserverEntry[]) => {
    if (!entries[0]?.isIntersecting) return;
    const totalRenderable = showBookmarksInMixedView ? mixedObjects.length : filteredItems.length;
    if (renderCount >= totalRenderable) return;
    setIsLoadingMore(true);
    const next = Math.min(renderCount + RENDER_PAGE, totalRenderable);
    const newBatch = showBookmarksInMixedView
      ? mixedObjects
        .slice(renderCount, next)
        .filter((object): object is Extract<MixedObject, { kind: 'file' }> => object.kind === 'file')
        .map((object) => object.item)
      : filteredItems.slice(renderCount, next);
    setRenderCount(next);
    await hydrateThumbnails(newBatch);
    setIsLoadingMore(false);
  }, [filteredItems, hydrateThumbnails, mixedObjects, renderCount, showBookmarksInMixedView]);

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
    if (!showBookmarksInMixedView || renderedMixedFiles.length === 0) return;
    void hydrateThumbnails(renderedMixedFiles);
  }, [hydrateThumbnails, renderedMixedFiles, showBookmarksInMixedView]);

  useEffect(() => {
    if (!selectedItem || !selectedItem.hasThumbnail || thumbnails[selectedItem.id]) return;
    void hydrateThumbnails([selectedItem]);
  }, [hydrateThumbnails, selectedItem, thumbnails]);

  useEffect(() => {
    void loadFirstPage().then((result) => {
      if (!result.ok) toast.error(result.error);
    });
    void loadBookmarks();
    void loadNotes();
  }, []);

  useEffect(() => {
    if (vaultScope === 'bookmark') void loadBookmarks();
    if (vaultScope === 'note') void loadNotes();
  }, [loadBookmarks, loadNotes, vaultScope]);

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
    if (isMultiSelect) {
      clearSelection();
      clearBookmarkSelection();
      clearNoteSelection();
    }
    setIsMultiSelect((prev) => !prev);
  };

  const handleItemClick = (itemId: string, multiKey = false): void => {
    setShowInspector(true);
    if (isMultiSelect || multiKey) {
      if (!isMultiSelect) setIsMultiSelect(true);
      toggleSelectedItem(itemId);
    } else {
      setSelectedBookmarkId(null);
      setSelectedNoteId(null);
      clearBookmarkSelection();
      clearNoteSelection();
      setSelectedItems([itemId]);
    }
  };

  const resolveContextTargetIds = (clickedItemId: string): string[] => {
    return [clickedItemId];
  };

  const handleItemContextMenu = (itemId: string): void => {
    clearBookmarkSelection();
    clearNoteSelection();
    setSelectedBookmarkId(null);
    setSelectedNoteId(null);
    setSelectedItems([itemId]);
    setIsMultiSelect(false);
  };

  const handleEmptyBackgroundClick = (): void => {
    if (selectedItemIds.length === 0 && selectedBookmarkIds.length === 0 && selectedNoteIds.length === 0) return;
    clearSelection();
    clearBookmarkSelection();
    clearNoteSelection();
    setIsMultiSelect(false);
  };

  const clearObjectScopeState = (): void => { setSelectedBookmarkIds([]); setSelectedNoteIds([]); setIsMultiSelect(false); };
  const handleSelectAllItemsScope = (): void => { setSelectedViewScope('all' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); setNoteFolderId(null); clearObjectScopeState(); };
  const handleSelectVideoScope = (): void => { setSelectedViewScope('video' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); setNoteFolderId(null); clearObjectScopeState(); };
  const handleSelectImageScope = (): void => { setSelectedViewScope('image' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); setNoteFolderId(null); clearObjectScopeState(); };
  const handleSelectDocumentScope = (): void => { setSelectedViewScope('document' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); setNoteFolderId(null); clearObjectScopeState(); };
  const handleSelectRootScope = (): void => { setSelectedViewScope('root' as typeof selectedViewScope); setSelectedFolderId(null); setBookmarkFolderId(null); setNoteFolderId(null); clearObjectScopeState(); };
  const handleSelectFolderScope = (folderId: number): void => {
    if ((selectedViewScope as string) === 'bookmark') {
      setBookmarkFolderId(folderId);
    } else if ((selectedViewScope as string) === 'note') {
      setNoteFolderId(folderId);
    } else {
      setSelectedViewScope('folder' as typeof selectedViewScope);
      setSelectedFolderId(folderId);
      setBookmarkFolderId(folderId);
      setNoteFolderId(folderId);
    }
  };
  const handleSelectBookmarkScope = (): void => {
    setSelectedViewScope('bookmark' as typeof selectedViewScope);
    setSelectedFolderId(null);
    setBookmarkFolderId(null);
  };
  const handleSelectNoteScope = (): void => {
    setSelectedViewScope('note' as typeof selectedViewScope);
    setSelectedFolderId(null);
    setNoteFolderId(null);
  };

  const handleClearFilters = (): void => {
    setSearchTerm('');
    setSelectedTagIds([]);
    setShowFavoritesOnly(false);
  };

  const handleGoToItemFolder = (itemId: string): void => {
    const item = allItems.find((entry) => entry.id === itemId) ?? filteredItems.find((entry) => entry.id === itemId);
    if (!item || item.folderId == null) return;
    setSelectedViewScope('folder' as typeof selectedViewScope);
    setSelectedFolderId(item.folderId);
    setBookmarkFolderId(item.folderId);
    setNoteFolderId(item.folderId);
    setSelectedBookmarkId(null);
    setSelectedNoteId(null);
    clearBookmarkSelection();
    clearNoteSelection();
    setSelectedItems([item.id]);
    setIsMultiSelect(false);
    setShowInspector(true);
  };

  const handleGoToBookmarkFolder = (bookmark: BookmarkSummary): void => {
    if (bookmark.folderId == null) return;
    setSelectedViewScope('folder' as typeof selectedViewScope);
    setSelectedFolderId(bookmark.folderId);
    setBookmarkFolderId(bookmark.folderId);
    setNoteFolderId(bookmark.folderId);
    clearSelection();
    setSelectedBookmarkIds([]);
    setSelectedNoteIds([]);
    setSelectedBookmarkId(bookmark.id);
    setSelectedNoteId(null);
    setIsMultiSelect(false);
    setShowInspector(true);
  };

  const handleGoToNoteFolder = (note: NoteSummary): void => {
    if (note.folderId == null) return;
    setSelectedViewScope('folder' as typeof selectedViewScope);
    setSelectedFolderId(note.folderId);
    setBookmarkFolderId(note.folderId);
    setNoteFolderId(note.folderId);
    clearSelection();
    setSelectedBookmarkIds([]);
    setSelectedNoteIds([]);
    setSelectedBookmarkId(null);
    setSelectedNoteId(note.id);
    setIsMultiSelect(false);
    setShowInspector(true);
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
    const includesVideo = filePaths.some((filePath) =>
      isVideoMimeType(getMimeTypeForFilename(filePath)),
    );
    const dismissImportToast = (): void => {
      if (importToastIdRef.current === null) return;
      toast.dismiss(importToastIdRef.current);
      importToastIdRef.current = null;
    };
    if (includesVideo && importToastIdRef.current === null) {
      importToastIdRef.current = toast('Importing video...', { duration: Infinity });
    }

    if (!conflictResolutions) {
      const scanResult = await window.electronAPI.scanImportConflicts({ filePaths, folderId });
      if (!scanResult.ok) { dismissImportToast(); toast.error(scanResult.error); return; }
      if (scanResult.data.conflicts.length > 0) {
        dismissImportToast();
        setConflictDialog({ conflicts: scanResult.data.conflicts, filePaths, folderId, deleteOriginals });
        return;
      }
    }
    const importResult = await window.electronAPI.importFiles({ filePaths, folderId, deleteOriginals: deleteOriginals || undefined, conflictResolutions });
    if (!importResult.ok) { dismissImportToast(); toast.error(importResult.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) { dismissImportToast(); toast.error(refreshed.error); return; }
    const { imported, skipped, failed } = importResult.data;
    const parts = [`Imported ${imported} file(s)`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (failed > 0) parts.push(`${failed} failed`);
    dismissImportToast();
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
    if (vaultScope === 'note') await loadNotes();
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
    const hasObjects =
      allItems.some((item) => item.folderId != null && subtreeIds.has(item.folderId)) ||
      bookmarks.some((bookmark) => bookmark.folderId != null && subtreeIds.has(bookmark.folderId)) ||
      notes.some((note) => note.folderId != null && subtreeIds.has(note.folderId));
    if (!hasObjects) { void confirmDeleteFolder(false, folderId); return; }
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
      const [refreshed] = await Promise.all([refresh(), loadBookmarks(), loadNotes()]);
      if (!refreshed.ok) toast.error(refreshed.error);
      else toast.success(deleteItems ? 'Folder and files deleted.' : 'Folder deleted.');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleRenameFolder = async (folderId: number, name: string): Promise<boolean> => {
    const result = await window.electronAPI.renameFolder({ folderId, name });
    if (!result.ok) { toast.error(result.error); return false; }
    const refreshed = await refresh();
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    toast.success('Folder renamed.');
    return true;
  };

  const handleMoveFolder = async (folderId: number, parentId: number | null): Promise<boolean> => {
    const result = await window.electronAPI.moveFolder({ folderId, parentId });
    if (!result.ok) { toast.error(result.error); return false; }
    const refreshed = await refresh();
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    toast.success('Folder moved.');
    return true;
  };

  const handleCreateTag = async (color?: string): Promise<void> => {
    const result = await window.electronAPI.createTag({ name: newTagName, color });
    if (!result.ok) { toast.error(result.error); return; }
    setNewTagName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) toast.error(supportResult.error);
    else toast.success('Tag created.');
  };

  const handleRenameTag = async (tagId: number, name: string): Promise<boolean> => {
    const result = await window.electronAPI.renameTag({ tagId, name });
    if (!result.ok) { toast.error(result.error); return false; }
    const [supportResult, refreshed] = await Promise.all([loadSupportingData(), refresh(), loadBookmarks(), loadNotes()]);
    if (!supportResult.ok) { toast.error(supportResult.error); return false; }
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    toast.success('Tag renamed.');
    return true;
  };

  const handleUpdateTagColor = async (tagId: number, color?: string): Promise<boolean> => {
    const result = await window.electronAPI.updateTagColor({ tagId, color: color ?? null });
    if (!result.ok) { toast.error(result.error); return false; }
    const [supportResult, refreshed] = await Promise.all([loadSupportingData(), refresh(), loadBookmarks(), loadNotes()]);
    if (!supportResult.ok) { toast.error(supportResult.error); return false; }
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    toast.success('Tag updated.');
    return true;
  };

  const handleDeleteTag = async (tagId: number): Promise<boolean> => {
    const result = await window.electronAPI.deleteTag(tagId);
    if (!result.ok) { toast.error(result.error); return false; }
    if (selectedTagIds.includes(tagId)) setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    const [supportResult, refreshed] = await Promise.all([loadSupportingData(), refresh(), loadBookmarks(), loadNotes()]);
    if (!supportResult.ok) { toast.error(supportResult.error); return false; }
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    else toast.success('Tag deleted.');
    return true;
  };

  const handleDeleteByIds = async (itemIds: string[], confirm = true): Promise<boolean> => {
    if (itemIds.length === 0) { toast.warning('Select items to delete.'); return false; }
    if (confirm) {
      const confirmed = await requestVaultConfirm({
        title: itemIds.length === 1 ? 'Delete Item' : 'Delete Items',
        description: itemIds.length === 1 ? 'Delete this item? This cannot be undone.' : `Delete ${itemIds.length} item(s)? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return false;
    }
    for (const itemId of itemIds) {
      const result = await window.electronAPI.deleteVaultItem({ itemId });
      if (!result.ok) { toast.error(result.error); return false; }
      if (viewerItemId === itemId) setViewerItemId(null);
    }
    const refreshed = await refresh();
    if (!refreshed.ok) { toast.error(refreshed.error); return false; }
    else toast.success(itemIds.length === 1 ? 'Item deleted.' : 'Items deleted.');
    return true;
  };

  const handleDeleteItem = async (itemId: string): Promise<void> => { await handleDeleteByIds([itemId]); };
  const handleToggleFavorite = async (itemId: string, isFavorite: boolean): Promise<void> => {
    const result = await window.electronAPI.toggleFavorite({ itemId, isFavorite });
    if (!result.ok) { toast.error(result.error); return; }
    const [refreshed] = await Promise.all([refresh(), loadBookmarks(), loadNotes()]);
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleSetRating = async (itemId: string, rating: number | null): Promise<void> => {
    const result = await window.electronAPI.setRating({ itemId, rating });
    if (!result.ok) { toast.error(result.error); return; }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleSetBookmarkRating = async (bookmarkId: string, rating: number | null): Promise<void> => {
    const result = await window.electronAPI.setRating({ itemId: bookmarkId, rating });
    if (!result.ok) { toast.error(result.error); return; }
    setBookmarks((prev) => prev.map((bookmark) => (
      bookmark.id === bookmarkId ? { ...bookmark, rating: rating ?? undefined } : bookmark
    )));
    await loadBookmarks();
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
  const handleOpenTemporaryFile = async (itemId: string): Promise<void> => {
    const result = await window.electronAPI.openTemporaryFile({ itemId });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success('Opened read-only decrypted copy.', {
      description: 'External edits are not saved back to Sanctum. Temp copies are cleared on lock or quit.',
      duration: 7000,
    });
  };
  const handleExportSelected = async (): Promise<void> => {
    const hasFiles = selectedItemIds.length > 0;
    const hasBookmarks = selectedBookmarkIds.length > 0;
    const hasNotes = selectedNoteIds.length > 0;
    if (!hasFiles && !hasBookmarks && !hasNotes) { toast.warning('Select objects to export.'); return; }
    if (hasNotes) {
      if (selectedNoteIds.length === 1 && !hasFiles && !hasBookmarks) {
        await handleExportNote(selectedNoteIds[0]);
      } else {
        toast.warning('Bulk note export is not available yet. Select one note to export.');
      }
      return;
    }
    if (hasFiles) await handleExportByIds(selectedItemIds);
    if (hasBookmarks) await handleExportBookmarks(selectedBookmarkIds);
  };
  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedItemIds.length === 0 && selectedBookmarkIds.length === 0 && selectedNoteIds.length === 0) { toast.warning('Select objects to delete.'); return; }
    const total = selectedItemIds.length + selectedBookmarkIds.length + selectedNoteIds.length;
    const confirmed = await requestVaultConfirm({
      title: total === 1 ? 'Delete Object' : 'Delete Objects',
      description: total === 1 ? 'Delete this object? This cannot be undone.' : `Delete ${total} object(s)? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    if (selectedItemIds.length > 0) {
      const deleted = await handleDeleteByIds(selectedItemIds, false);
      if (!deleted) return;
    }
    if (selectedBookmarkIds.length > 0) await handleDeleteSelectedBookmarks(false);
    if (selectedNoteIds.length > 0) await handleDeleteNotesByIds(selectedNoteIds, false);
    clearSelection();
    clearBookmarkSelection();
    clearNoteSelection();
  };

  const handleToggleFavoriteByIds = async (itemIds: string[], isFavorite?: boolean): Promise<void> => {
    if (itemIds.length === 0) return;
    const targetItems = filteredItems.filter((item) => itemIds.includes(item.id));
    const nextFavorite = isFavorite ?? !(targetItems.length > 0 && targetItems.every((item) => item.isFavorite));
    for (const item of targetItems) {
      const result = await window.electronAPI.toggleFavorite({ itemId: item.id, isFavorite: nextFavorite });
      if (!result.ok) { toast.error(result.error); return; }
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleToggleBookmarkFavoriteByIds = async (bookmarkIds: string[], isFavorite?: boolean): Promise<void> => {
    if (bookmarkIds.length === 0) return;
    const targetBookmarks = bookmarks.filter((bookmark) => bookmarkIds.includes(bookmark.id));
    const nextFavorite = isFavorite ?? !(targetBookmarks.length > 0 && targetBookmarks.every((bookmark) => bookmark.isFavorite));
    for (const bookmark of targetBookmarks) {
      const result = await window.electronAPI.toggleFavorite({ itemId: bookmark.id, isFavorite: nextFavorite });
      if (!result.ok) { toast.error(result.error); return; }
    }
    setBookmarks((prev) => prev.map((bookmark) => (
      bookmarkIds.includes(bookmark.id) ? { ...bookmark, isFavorite: nextFavorite } : bookmark
    )));
    await loadBookmarks();
  };

  const handleToggleNoteFavoriteByIds = async (noteIds: string[], isFavorite?: boolean): Promise<void> => {
    if (noteIds.length === 0) return;
    const targetNotes = notes.filter((note) => noteIds.includes(note.id));
    const nextFavorite = isFavorite ?? !(targetNotes.length > 0 && targetNotes.every((note) => note.isFavorite));
    for (const note of targetNotes) {
      const result = await window.electronAPI.toggleFavorite({ itemId: note.id, isFavorite: nextFavorite });
      if (!result.ok) { toast.error(result.error); return; }
    }
    setNotes((prev) => prev.map((note) => (
      noteIds.includes(note.id) ? { ...note, isFavorite: nextFavorite } : note
    )));
    await loadNotes();
  };

  const handleToggleFavoriteSelected = async (): Promise<void> => {
    const selectedBookmarks = bookmarks.filter((bookmark) => selectedBookmarkIds.includes(bookmark.id));
    const selectedFiles = filteredItems.filter((item) => selectedItemIds.includes(item.id));
    const selectedNotes = notes.filter((note) => selectedNoteIds.includes(note.id));
    const allFavorite =
      selectedFiles.length + selectedBookmarks.length + selectedNotes.length > 0 &&
      selectedFiles.every((item) => item.isFavorite) &&
      selectedBookmarks.every((bookmark) => bookmark.isFavorite) &&
      selectedNotes.every((note) => note.isFavorite);
    await handleToggleFavoriteByIds(selectedItemIds, !allFavorite);
    await handleToggleBookmarkFavoriteByIds(selectedBookmarkIds, !allFavorite);
    await handleToggleNoteFavoriteByIds(selectedNoteIds, !allFavorite);
  };

  const openMoveDialogForIds = (itemIds: string[]): void => {
    if (itemIds.length === 0 && selectedBookmarkIds.length === 0 && selectedNoteIds.length === 0) { toast.warning('Select objects to move.'); return; }
    setMoveDialogSource(itemIds.length + selectedBookmarkIds.length + selectedNoteIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds(itemIds);
    setMoveDialogBookmarkIds(selectedBookmarkIds);
    setMoveDialogNoteIds(selectedNoteIds);
    setMoveDialogOpen(true);
  };

  const openSingleMoveDialog = (itemId: string): void => { openMoveDialogForIds([itemId]); };
  const openBulkMoveDialog = (): void => { openMoveDialogForIds(selectedItemIds); };
  const openBookmarkBulkMoveDialog = (): void => {
    if (selectedBookmarkIds.length === 0) { toast.warning('Select bookmarks to move.'); return; }
    setMoveDialogSource(selectedBookmarkIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds([]);
    setMoveDialogBookmarkIds(selectedBookmarkIds);
    setMoveDialogNoteIds([]);
    setMoveDialogOpen(true);
  };
  const openNoteBulkMoveDialog = (): void => {
    if (selectedNoteIds.length === 0) { toast.warning('Select notes to move.'); return; }
    setMoveDialogSource(selectedNoteIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds([]);
    setMoveDialogBookmarkIds([]);
    setMoveDialogNoteIds(selectedNoteIds);
    setMoveDialogOpen(true);
  };

  const handleOpenViewerForIds = (itemIds: string[]): void => {
    if (itemIds.length !== 1) return;
    handleOpenViewer(itemIds[0]);
  };

  const handleConfirmMoveDialog = async (folderId: number | null, itemIds: string[]): Promise<void> => {
    const bookmarkIdsToMove = moveDialogBookmarkIds;
    const noteIdsToMove = moveDialogNoteIds;
    if (itemIds.length === 0 && bookmarkIdsToMove.length === 0 && noteIdsToMove.length === 0) return;
    setIsMoveBusy(true);
    const destinationLabel = folderId === null ? 'Root' : findFolderNameById(folders, folderId) ?? 'selected folder';
    try {
      if (itemIds.length > 0 && moveDialogSource === 'bulk') {
        const result = await window.electronAPI.assignItemsFolder({ itemIds, folderId });
        if (!result.ok) { toast.error(result.error); return; }
      } else if (itemIds.length > 0) {
        const result = await window.electronAPI.assignItemFolder({ itemId: itemIds[0], folderId });
        if (!result.ok) { toast.error(result.error); return; }
      }
      if (bookmarkIdsToMove.length > 0) {
        const result = await window.electronAPI.assignBookmarksFolder({ bookmarkIds: bookmarkIdsToMove, folderId });
        if (!result.ok) { toast.error(result.error); return; }
        await loadBookmarks();
      }
      if (noteIdsToMove.length > 0) {
        const result = await window.electronAPI.assignNotesFolder({ noteIds: noteIdsToMove, folderId });
        if (!result.ok) { toast.error(result.error); return; }
        await loadNotes();
      }
      if (folderId !== null) { setSelectedViewScope('folder' as typeof selectedViewScope); setSelectedFolderId(folderId); }
      const refreshed = await refresh();
      if (!refreshed.ok) { toast.error(refreshed.error); return; }
      const movedCount = itemIds.length + bookmarkIdsToMove.length + noteIdsToMove.length;
      if (moveDialogSource === 'bulk' || movedCount > 1) toast.success(`Moved ${movedCount} object(s) to ${destinationLabel}.`);
      else toast.success(`Moved to ${destinationLabel}.`);
      setMoveDialogOpen(false);
      setMoveDialogItemIds([]);
      setMoveDialogBookmarkIds([]);
      setMoveDialogNoteIds([]);
      clearSelection();
      clearBookmarkSelection();
      clearNoteSelection();
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
    const item = allItems.find((entry) => entry.id === itemId) ?? filteredItems.find((entry) => entry.id === itemId);
    if (item && !isPreviewableMimeType(item.mimeType)) {
      void handleOpenTemporaryFile(itemId);
      return;
    }
    setSelectedItems([itemId]);
    setViewerItemId(itemId);
  };

  // Bookmark-specific handlers
  const handleDeleteBookmark = async (id: string): Promise<void> => {
    const confirmed = await requestVaultConfirm({
      title: 'Delete Bookmark',
      description: 'Delete this bookmark? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
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

  const handleToggleBookmarkTagByIds = async (bookmarkIds: string[], tagId: number, assigned: boolean): Promise<void> => {
    if (bookmarkIds.length === 0) return;
    const response = assigned
      ? await window.electronAPI.unassignBookmarksTag({ bookmarkIds, tagId })
      : await window.electronAPI.assignBookmarksTag({ bookmarkIds, tagId });
    if (!response.ok) { toast.error(response.error); return; }
    await loadBookmarks();
  };

  const handlePickThumb = async (dataUrl: string, bookmarkId: string): Promise<void> => {
    const result = await window.electronAPI.updateBookmarkThumbnail({ id: bookmarkId, thumbnailDataUrl: dataUrl });
    if (!result.ok) { toast.error('Failed to update thumbnail.'); return; }
    setBookmarks((prev) => prev.map((b) => b.id === bookmarkId ? result.data : b));
    setThumbPickerBookmark(null);
    toast.success('Thumbnail updated.');
  };

  // Export bookmarks
  const handleExportBookmarks = async (bookmarkIds = selectedBookmarkIds): Promise<void> => {
    const ids = bookmarkIds.length > 0 ? bookmarkIds : undefined;
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

  const handleDeleteBookmarksByIds = async (bookmarkIds: string[], confirm = true): Promise<boolean> => {
    if (bookmarkIds.length === 0) return false;
    if (confirm) {
      const confirmed = await requestVaultConfirm({
        title: bookmarkIds.length === 1 ? 'Delete Bookmark' : 'Delete Bookmarks',
        description: bookmarkIds.length === 1 ? 'Delete this bookmark? This cannot be undone.' : `Delete ${bookmarkIds.length} bookmark(s)? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return false;
    }
    for (const id of bookmarkIds) {
      const result = await window.electronAPI.deleteBookmark({ id });
      if (!result.ok) { toast.error(result.error); return false; }
    }
    setBookmarks((prev) => prev.filter((b) => !bookmarkIds.includes(b.id)));
    if (selectedBookmarkId !== null && bookmarkIds.includes(selectedBookmarkId)) setSelectedBookmarkId(null);
    toast.success(bookmarkIds.length === 1 ? 'Bookmark deleted.' : `${bookmarkIds.length} bookmark(s) deleted.`);
    return true;
  };

  const handleDeleteSelectedBookmarks = async (confirm = true): Promise<void> => {
    const deleted = await handleDeleteBookmarksByIds(selectedBookmarkIds, confirm);
    if (deleted) clearBookmarkSelection();
  };

  const toggleSelectedNote = (id: string): void => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const clearNoteSelection = (): void => { setSelectedNoteIds([]); };

  const handleCreateNote = async (): Promise<void> => {
    const folderId = vaultScope === 'folder' ? selectedFolderId : isNoteScope ? noteFolderId : null;
    const result = await window.electronAPI.createNote({
      title: 'Untitled note',
      body: '',
      format: 'plain',
      folderId,
    });
    if (!result.ok) { toast.error(result.error); return; }
    await loadNotes();
    clearSelection();
    clearBookmarkSelection();
    setSelectedBookmarkId(null);
    setSelectedNoteId(result.data.id);
    setSelectedNoteIds([]);
    setEditingNoteId(result.data.id);
    setShowInspector(true);
    toast.success('Note created.');
  };

  const handleUpdateNote = async (input: { id: string; title: string; body: string; format: NoteFormat }): Promise<boolean> => {
    const result = await window.electronAPI.updateNote(input);
    if (!result.ok) { toast.error(result.error); return false; }
    setNotes((prev) => prev.map((note) => note.id === input.id ? result.data : note));
    toast.success('Note saved.');
    return true;
  };

  const handleDeleteNotesByIds = async (noteIds: string[], confirm = true): Promise<boolean> => {
    if (noteIds.length === 0) return false;
    if (confirm) {
      const confirmed = await requestVaultConfirm({
        title: noteIds.length === 1 ? 'Delete Note' : 'Delete Notes',
        description: noteIds.length === 1 ? 'Delete this note? This cannot be undone.' : `Delete ${noteIds.length} note(s)? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return false;
    }
    for (const id of noteIds) {
      const result = await window.electronAPI.deleteNote({ id });
      if (!result.ok) { toast.error(result.error); return false; }
    }
    setNotes((prev) => prev.filter((note) => !noteIds.includes(note.id)));
    if (selectedNoteId !== null && noteIds.includes(selectedNoteId)) setSelectedNoteId(null);
    toast.success(noteIds.length === 1 ? 'Note deleted.' : `${noteIds.length} note(s) deleted.`);
    return true;
  };

  const handleExportNote = async (id: string): Promise<void> => {
    const result = await window.electronAPI.exportNote({ id });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success('Note exported.');
  };

  const handleToggleNoteTag = async (noteId: string, tagId: number, assigned: boolean): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignNoteTag({ noteId, tagId })
      : await window.electronAPI.assignNoteTag({ noteId, tagId });
    if (!response.ok) { toast.error(response.error); return; }
    await loadNotes();
  };

  const handleToggleNoteTagByIds = async (noteIds: string[], tagId: number, assigned: boolean): Promise<void> => {
    if (noteIds.length === 0) return;
    const response = assigned
      ? await window.electronAPI.unassignNotesTag({ noteIds, tagId })
      : await window.electronAPI.assignNotesTag({ noteIds, tagId });
    if (!response.ok) { toast.error(response.error); return; }
    await loadNotes();
  };

  const handleNoteContextMenu = (noteId: string): void => {
    clearSelection();
    clearBookmarkSelection();
    setSelectedBookmarkId(null);
    setSelectedNoteIds([noteId]);
    setSelectedNoteId(noteId);
    setIsMultiSelect(false);
  };

  const openNoteEditor = (note: NoteSummary): void => {
    clearSelection();
    clearBookmarkSelection();
    setSelectedBookmarkId(null);
    setSelectedNoteId(note.id);
    setSelectedNoteIds([]);
    setIsMultiSelect(false);
    setShowInspector(true);
    setEditingNoteId(note.id);
  };

  const openMoveDialogForNoteIds = (noteIds: string[]): void => {
    if (noteIds.length === 0) { toast.warning('Select notes to move.'); return; }
    setSelectedNoteIds(noteIds);
    setMoveDialogSource(noteIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds([]);
    setMoveDialogBookmarkIds([]);
    setMoveDialogNoteIds(noteIds);
    setMoveDialogOpen(true);
  };

  const handleNoteCardClick = (id: string): void => {
    setShowInspector(true);
    if (isMultiSelect) {
      toggleSelectedNote(id);
    } else {
      clearSelection();
      clearBookmarkSelection();
      setSelectedBookmarkId(null);
      setSelectedNoteId(id);
    }
  };

  const showGoToFolderActions = selectedViewScope === 'all' || searchTerm.trim().length > 0;
  const visibleFileCount = filteredItems.length;
  const visibleBookmarkCount = isBookmarkScope || showBookmarksInMixedView ? visibleBookmarks.length : 0;
  const visibleNoteCount = isNoteScope || showNotesInMixedView ? visibleNotes.length : 0;
  const visibleObjectCount = visibleFileCount + visibleBookmarkCount + visibleNoteCount;
  const mixedCountParts = [
    visibleFileCount > 0 ? `${visibleFileCount} ${visibleFileCount === 1 ? 'file' : 'files'}` : null,
    visibleBookmarkCount > 0 ? `${visibleBookmarkCount} ${visibleBookmarkCount === 1 ? 'bookmark' : 'bookmarks'}` : null,
    visibleNoteCount > 0 ? `${visibleNoteCount} ${visibleNoteCount === 1 ? 'note' : 'notes'}` : null,
  ].filter((part): part is string => Boolean(part));
  const countAwareSubtitle = isBookmarkScope
    ? `${visibleBookmarkCount} ${visibleBookmarkCount === 1 ? 'bookmark' : 'bookmarks'} · encrypted`
    : isNoteScope
      ? `${visibleNoteCount} ${visibleNoteCount === 1 ? 'note' : 'notes'} · encrypted`
      : showBookmarksInMixedView || showNotesInMixedView
        ? `${visibleObjectCount} ${visibleObjectCount === 1 ? 'object' : 'objects'}${mixedCountParts.length > 0 ? ` · ${mixedCountParts.join(' · ')}` : ''}`
        : undefined;
  const toolbarBreadcrumb = selectedFolderId !== null && (selectedViewScope === 'folder' || isBookmarkScope || isNoteScope)
    ? findFolderPathById(folders, selectedFolderId) ?? null
    : bookmarkFolderId !== null
      ? findFolderPathById(folders, bookmarkFolderId) ?? null
      : noteFolderId !== null
        ? findFolderPathById(folders, noteFolderId) ?? null
      : null;
  const filtersActive = searchTerm.trim().length > 0 || selectedTagIds.length > 0 || showFavoritesOnly;
  const bulkSummaryTotal = selectedItemIds.length + selectedBookmarkIds.length + selectedNoteIds.length;
  const visibleFileIdsForSelection = showBookmarksInMixedView
    ? mixedObjects.filter((object): object is Extract<MixedObject, { kind: 'file' }> => object.kind === 'file').map((object) => object.id)
    : isBookmarkScope
      ? []
      : filteredItems.map((item) => item.id);
  const visibleBookmarkIdsForSelection = isBookmarkScope || showBookmarksInMixedView
    ? visibleBookmarks.map((bookmark) => bookmark.id)
    : [];
  const visibleNoteIdsForSelection = isNoteScope || showNotesInMixedView
    ? visibleNotes.map((note) => note.id)
    : [];
  const visibleSelectionCount = visibleFileIdsForSelection.length + visibleBookmarkIdsForSelection.length + visibleNoteIdsForSelection.length;
  const allVisibleSelected = visibleSelectionCount > 0 &&
    visibleFileIdsForSelection.every((id) => selectedItemIds.includes(id)) &&
    visibleBookmarkIdsForSelection.every((id) => selectedBookmarkIds.includes(id)) &&
    visibleNoteIdsForSelection.every((id) => selectedNoteIds.includes(id));
  const handleSelectAllVisible = (): void => {
    setIsMultiSelect(true);
    setSelectedItems(visibleFileIdsForSelection);
    setSelectedBookmarkIds(visibleBookmarkIdsForSelection);
    setSelectedNoteIds(visibleNoteIdsForSelection);
    setSelectedBookmarkId(null);
    setSelectedNoteId(null);
    if (visibleSelectionCount > 0) setShowInspector(true);
  };
  const handleClearBulkSelection = (): void => {
    clearSelection();
    clearBookmarkSelection();
    clearNoteSelection();
    setSelectedBookmarkId(null);
    setSelectedNoteId(null);
  };
  const handleToggleSelectAllVisible = (): void => {
    if (allVisibleSelected) {
      handleClearBulkSelection();
      return;
    }
    handleSelectAllVisible();
  };

  const detailsPanelProps = {
    item: selectedItem,
    thumbnailUrl: selectedItem ? thumbnails[selectedItem.id] : undefined,
    tags,
    securitySettings,
    onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void handleToggleTag(itemId, tagId, assigned),
    onOpenItem: handleOpenViewer,
    onDeleteItem: (itemId: string) => void handleDeleteItem(itemId),
    onExportItem: (itemId: string) => void handleExportItem(itemId),
    onToggleFavorite: (itemId: string, isFavorite: boolean) => void handleToggleFavorite(itemId, isFavorite),
    onRenameItem: (itemId: string, newName: string) => void handleRenameItem(itemId, newName),
    onSetRating: (itemId: string, rating: number | null) => void handleSetRating(itemId, rating),
    onGoToFolder: showGoToFolderActions ? handleGoToItemFolder : undefined,
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
    onGoToFolder: showGoToFolderActions ? handleGoToItemFolder : undefined,
    allVisibleSelected,
    onToggleSelectAllVisible: handleToggleSelectAllVisible,
    hasMore: renderCount < filteredItems.length,
    isLoadingMore,
    sentinelRef,
    isMultiSelect,
    listLayoutVariant: selectedViewScope === 'video' || selectedViewScope === 'image' || selectedViewScope === 'document'
      ? 'object-type' as const
      : 'default' as const,
    tags,
    gridMinCardWidth,
  };

  // Toolbar title for bookmark scope
  const bookmarkTitleLabel = bookmarkFolderId !== null
    ? (findFolderNameById(folders, bookmarkFolderId) ?? 'Bookmarks')
    : 'Bookmarks';
  const noteTitleLabel = noteFolderId !== null
    ? (findFolderNameById(folders, noteFolderId) ?? 'Notes')
    : 'Notes';

  // Bookmark multi-select — active in bookmark scope or mixed views
  const isBookmarkMultiSelect = (isBookmarkScope || showBookmarksInMixedView) && isMultiSelect;
  const isNoteMultiSelect = (isNoteScope || showNotesInMixedView) && isMultiSelect;
  const resolveBookmarkContextTargetIds = (clickedBookmarkId: string): string[] => {
    return [clickedBookmarkId];
  };
  const handleBookmarkContextMenu = (bookmarkId: string): void => {
    clearSelection();
    setSelectedBookmarkIds([bookmarkId]);
    setSelectedBookmarkId(bookmarkId);
    setIsMultiSelect(false);
  };
  const openMoveDialogForBookmarkIds = (bookmarkIds: string[]): void => {
    if (bookmarkIds.length === 0) { toast.warning('Select bookmarks to move.'); return; }
    setSelectedBookmarkIds(bookmarkIds);
    setMoveDialogSource(bookmarkIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds([]);
    setMoveDialogBookmarkIds(bookmarkIds);
    setMoveDialogNoteIds([]);
    setMoveDialogOpen(true);
  };
  const handleOpenBookmarkPrivate = async (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget): Promise<void> => {
    const result = await window.electronAPI.openExternalPrivate({ url: bookmark.url, browser: target.id });
    if (!result.ok) {
      toast.error('Could not open private browser.');
      return;
    }
    toast.success('Opened in private browser.');
  };
  const bookmarkActionProps = {
    tags,
    onOpen: (bookmark: BookmarkSummary) => onOpenUrlInBrowser?.(bookmark.url),
    privateOpenTargets,
    onOpenPrivate: (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget) => void handleOpenBookmarkPrivate(bookmark, target),
    onToggleFavorite: (ids: string[], isFavorite: boolean) => void handleToggleBookmarkFavoriteByIds(ids, isFavorite),
    onMove: openMoveDialogForBookmarkIds,
    onExport: (ids: string[]) => void handleExportBookmarks(ids),
    onDelete: (ids: string[]) => void handleDeleteBookmarksByIds(ids),
    onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void handleToggleBookmarkTagByIds(ids, tagId, assigned),
    onGoToFolder: showGoToFolderActions ? handleGoToBookmarkFolder : undefined,
  };
  const handleBookmarkCardClick = (id: string): void => {
    setShowInspector(true);
    if (isMultiSelect) {
      toggleSelectedBookmark(id);
    } else {
      clearSelection();
      setSelectedBookmarkId(id);
      setSelectedNoteId(null);
    }
  };

  const noteActionProps = {
    tags,
    onToggleFavorite: (ids: string[], isFavorite: boolean) => void handleToggleNoteFavoriteByIds(ids, isFavorite),
    onEdit: openNoteEditor,
    onMove: openMoveDialogForNoteIds,
    onExport: (id: string) => void handleExportNote(id),
    onDelete: (ids: string[]) => void handleDeleteNotesByIds(ids),
    onToggleTag: (ids: string[], tagId: number, assigned: boolean) => void handleToggleNoteTagByIds(ids, tagId, assigned),
    onGoToFolder: showGoToFolderActions ? handleGoToNoteFolder : undefined,
  };

  const vaultMarqueeContainerRef = useRef<HTMLDivElement>(null);
  const selectedVaultObjectIds = useMemo(
    () => [...selectedItemIds, ...selectedBookmarkIds, ...selectedNoteIds],
    [selectedBookmarkIds, selectedItemIds, selectedNoteIds],
  );
  const handleSetVaultMarqueeSelection = useCallback((objectIds: string[]): void => {
    const fileIds = new Set(filteredItems.map((item) => item.id));
    const bookmarkIds = new Set(visibleBookmarks.map((bookmark) => bookmark.id));
    const noteIds = new Set(visibleNotes.map((note) => note.id));
    const nextItemIds = objectIds.filter((id) => fileIds.has(id));
    const nextBookmarkIds = objectIds.filter((id) => bookmarkIds.has(id));
    const nextNoteIds = objectIds.filter((id) => noteIds.has(id));

    setSelectedItems(nextItemIds);
    setSelectedBookmarkIds(nextBookmarkIds);
    setSelectedNoteIds(nextNoteIds);
    setSelectedBookmarkId(nextItemIds.length === 0 && nextNoteIds.length === 0 && nextBookmarkIds.length === 1 ? nextBookmarkIds[0] : null);
    setSelectedNoteId(nextItemIds.length === 0 && nextBookmarkIds.length === 0 && nextNoteIds.length === 1 ? nextNoteIds[0] : null);
    if (objectIds.length > 0) setShowInspector(true);
  }, [filteredItems, setSelectedItems, visibleBookmarks, visibleNotes]);
  const {
    isSelecting: isVaultMarqueeSelecting,
    overlayStyle: vaultMarqueeOverlayStyle,
    onMouseDown: handleVaultMarqueeMouseDown,
  } = useMarqueeSelection({
    containerRef: vaultMarqueeContainerRef,
    selectedItemIds: selectedVaultObjectIds,
    onSetSelectedItems: handleSetVaultMarqueeSelection,
    onBeginSelection: () => setIsMultiSelect(true),
    onEmptyBackgroundClick: handleEmptyBackgroundClick,
  });

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
      onDragEnter={(e) => { e.preventDefault(); if (!isBookmarkScope && !isNoteScope) setIsDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isBookmarkScope || isNoteScope) return;
        const files = extractDroppedFilePaths(e.dataTransfer);
        if (files.length === 0) {
          toast.error('No local file paths detected from drop. Please use Import button for this source.');
          return;
        }
        const dropFolderId = selectedViewScope === 'folder' && selectedFolderId !== null ? selectedFolderId : importFolderId;
        void runImport(files, dropFolderId, false);
      }}
    >
      <style>{MIXED_LIST_STYLES}</style>
      {/* Drag overlay */}
      {isDragOver && !isBookmarkScope && !isNoteScope && (
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
            <span style={{ fontFamily: MONO, fontSize: fontSize(11), letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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
          onExportSelected={isBookmarkScope ? () => void handleExportBookmarks() : isNoteScope ? () => void handleExportSelected() : () => void handleExportSelected()}
          onDeleteSelected={isBookmarkScope ? () => void handleDeleteSelectedBookmarks() : isNoteScope ? () => void handleDeleteSelected() : () => void handleDeleteSelected()}
          onToggleFavoriteSelected={() => void handleToggleFavoriteSelected()}
          onOpenBulkMoveDialog={isBookmarkScope ? openBookmarkBulkMoveDialog : isNoteScope ? openNoteBulkMoveDialog : openBulkMoveDialog}
          onRefresh={() => void handleRefresh()}
          isBusy={isLoading || bookmarksLoading || notesLoading}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((prev) => !prev)}
          selectedCount={isBookmarkScope ? selectedBookmarkIds.length : isNoteScope ? selectedNoteIds.length : selectedItemIds.length + selectedBookmarkIds.length + selectedNoteIds.length}
          allSelectedFavorite={
            selectedItemIds.length + selectedBookmarkIds.length + selectedNoteIds.length > 0 &&
            filteredItems.filter((item) => selectedItemIds.includes(item.id)).every((item) => item.isFavorite) &&
            bookmarks.filter((bookmark) => selectedBookmarkIds.includes(bookmark.id)).every((bookmark) => bookmark.isFavorite) &&
            notes.filter((note) => selectedNoteIds.includes(note.id)).every((note) => note.isFavorite)
          }
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMultiSelect={isMultiSelect}
          onToggleMultiSelect={handleToggleMultiSelect}
          onSelectAllVisible={handleSelectAllVisible}
          onClearSelection={handleClearBulkSelection}
          allVisibleSelected={allVisibleSelected}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar((p) => !p)}
          itemCount={isBookmarkScope ? visibleBookmarks.length : isNoteScope ? visibleNotes.length : filteredItems.length + (showBookmarksInMixedView ? visibleBookmarks.length : 0) + (showNotesInMixedView ? visibleNotes.length : 0)}
          subtitle={countAwareSubtitle}
          breadcrumb={toolbarBreadcrumb}
          selectedFolderName={
            isBookmarkScope
              ? bookmarkTitleLabel
              : isNoteScope
                ? noteTitleLabel
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
          onRenameTag={handleRenameTag}
          onUpdateTagColor={handleUpdateTagColor}
          onDeleteTag={handleDeleteTag}
          isBookmarkScope={isBookmarkScope}
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
            onSelectDocuments={handleSelectDocumentScope}
            onSelectRoot={handleSelectRootScope}
            onSelectFolder={handleSelectFolderScope}
            onSelectBookmarks={handleSelectBookmarkScope}
            onSelectNotes={handleSelectNoteScope}
            newFolderName={newFolderName}
            onNewFolderNameChange={setNewFolderName}
            newFolderParentId={newFolderParentId}
            onNewFolderParentIdChange={setNewFolderParentId}
            onCreateFolder={() => void handleCreateFolder()}
            createDialogOpen={showNewFolderDialog}
            onCreateDialogOpenChange={setShowNewFolderDialog}
            onDeleteFolder={(folderId) => void handleDeleteFolder(folderId)}
            onRenameFolder={handleRenameFolder}
            onMoveFolder={handleMoveFolder}
          />
        </div>

        {/* Content area */}
        {isNoteScope ? (
          <div
            ref={vaultMarqueeContainerRef}
            onMouseDown={handleVaultMarqueeMouseDown}
            style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '16px 20px' : 0, position: 'relative', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: viewMode === 'grid' ? '0 0 12px' : '8px 12px', borderBottom: viewMode === 'list' ? `1px solid ${T.line}` : 'none' }}>
              <button type="button" onClick={() => void handleCreateNote()} style={{ height: 26, padding: '0 10px', border: 'none', background: T.accent, color: '#0a0c0b', fontFamily: MONO, fontSize: fontSize(10), cursor: 'pointer' }}>
                New Note
              </button>
            </div>
            {visibleNotes.length === 0 ? (
              <EmptyVaultState
                message={filtersActive ? 'No notes match current filters' : noteFolderId !== null ? 'No notes in this folder' : 'No notes saved yet'}
                canClearFilters={filtersActive}
                canCreateNote={!filtersActive}
                onClearFilters={handleClearFilters}
                onCreateNote={() => void handleCreateNote()}
              />
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinCardWidth}px, 1fr))`, gap: 12 }}>
                {visibleNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    selected={isNoteMultiSelect ? selectedNoteIds.includes(note.id) : selectedNoteId === note.id}
                    isMultiSelect={isNoteMultiSelect}
                    onClick={() => handleNoteCardClick(note.id)}
                    onContextMenuOpen={handleNoteContextMenu}
                    {...noteActionProps}
                  />
                ))}
              </div>
            ) : (
              <div className="pv-mixed-list">
                <MixedListHeader
                  isMultiSelect={isNoteMultiSelect}
                  allVisibleSelected={allVisibleSelected}
                  onToggleSelectAllVisible={handleToggleSelectAllVisible}
                />
                {visibleNotes.map((note) => (
                  <NoteListRow
                    key={note.id}
                    note={note}
                    selected={isNoteMultiSelect ? selectedNoteIds.includes(note.id) : selectedNoteId === note.id}
                    isMultiSelect={isNoteMultiSelect}
                    onClick={() => handleNoteCardClick(note.id)}
                    onContextMenuOpen={handleNoteContextMenu}
                    {...noteActionProps}
                  />
                ))}
              </div>
            )}
            {isVaultMarqueeSelecting && vaultMarqueeOverlayStyle && (
              <div
                style={{
                  ...vaultMarqueeOverlayStyle,
                  position: 'absolute',
                  zIndex: 20,
                  pointerEvents: 'none',
                  border: `1px solid ${T.accent}`,
                  background: T.accentGlow,
                }}
              />
            )}
          </div>
        ) : isBookmarkScope ? (
          <div
            ref={vaultMarqueeContainerRef}
            onMouseDown={handleVaultMarqueeMouseDown}
            style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '16px 20px' : 0, position: 'relative', userSelect: 'none' }}
          >
            {visibleBookmarks.length === 0 ? (
              <EmptyVaultState
                message={filtersActive ? 'No bookmarks match current filters' : bookmarkFolderId !== null ? 'No bookmarks in this folder' : 'No bookmarks saved yet'}
                canClearFilters={filtersActive}
                onClearFilters={handleClearFilters}
              />
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinCardWidth}px, 1fr))`, gap: 12 }}>
                {visibleBookmarks.map((b) => (
                  <BookmarkCard
                    key={b.id}
                    bookmark={b}
	                    selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
	                    isMultiSelect={isBookmarkMultiSelect}
	                    onClick={() => handleBookmarkCardClick(b.id)}
	                    onContextMenuOpen={handleBookmarkContextMenu}
	                    contextTargetIds={resolveBookmarkContextTargetIds(b.id)}
	                    {...bookmarkActionProps}
	                  />
                ))}
              </div>
            ) : (
              <div className="pv-mixed-list">
                <MixedListHeader
                  isMultiSelect={isBookmarkMultiSelect}
                  allVisibleSelected={allVisibleSelected}
                  onToggleSelectAllVisible={handleToggleSelectAllVisible}
                />
                {visibleBookmarks.map((b) => (
                  <BookmarkListRow
                    key={b.id}
                    bookmark={b}
	                    selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(b.id) : selectedBookmarkId === b.id}
	                    isMultiSelect={isBookmarkMultiSelect}
	                    onClick={() => handleBookmarkCardClick(b.id)}
	                    onContextMenuOpen={handleBookmarkContextMenu}
	                    contextTargetIds={resolveBookmarkContextTargetIds(b.id)}
	                    {...bookmarkActionProps}
	                  />
                ))}
              </div>
            )}
            {isVaultMarqueeSelecting && vaultMarqueeOverlayStyle && (
              <div
                style={{
                  ...vaultMarqueeOverlayStyle,
                  position: 'absolute',
                  zIndex: 20,
                  pointerEvents: 'none',
                  border: `1px solid ${T.accent}`,
                  background: T.accentGlow,
                }}
              />
            )}
          </div>
        ) : showBookmarksInMixedView ? (
          <div
            ref={vaultMarqueeContainerRef}
            onMouseDown={handleVaultMarqueeMouseDown}
            style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? '16px 20px' : 0, position: 'relative', userSelect: 'none' }}
          >
            {mixedObjects.length === 0 ? (
              <EmptyVaultState
                message={filtersActive ? 'No objects match current filters' : 'No objects in this scope'}
                canClearFilters={filtersActive}
                canImport={!filtersActive}
                canCreateFolder={!filtersActive}
                onClearFilters={handleClearFilters}
                onImport={() => setImportSettingsOpen(true)}
                onCreateFolder={() => setShowNewFolderDialog(true)}
              />
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinCardWidth}px, 1fr))`, gap: 20 }}>
                {renderedMixedObjects.map((object) => (
                  object.kind === 'file' ? (
                    <GalleryCard
                      key={object.id}
                      item={object.item}
                      thumbnailUrl={thumbnails[object.id]}
                      isSelected={selectedItemIds.includes(object.id)}
                      onToggleSelect={handleItemClick}
                      onOpen={handleOpenViewer}
                      onToggleFavorite={(itemId, isFavorite) => void handleToggleFavorite(itemId, isFavorite)}
                      onContextMenuOpen={handleItemContextMenu}
                      contextTargetIdsForItem={resolveContextTargetIds}
                      onOpenViewerForIds={handleOpenViewerForIds}
                      onToggleFavoriteForIds={(itemIds) => void handleToggleFavoriteByIds(itemIds)}
                      onOpenMoveDialogForIds={openMoveDialogForIds}
                      onExportForIds={(itemIds) => void handleExportByIds(itemIds)}
                      onDeleteForIds={(itemIds) => void handleDeleteByIds(itemIds)}
                      isOpenViewerDisabledForItem={(itemId) => resolveContextTargetIds(itemId).length > 1}
                      onOpenMoveDialog={openSingleMoveDialog}
                      onExport={(itemId) => void handleExportItem(itemId)}
                      onDelete={(itemId) => void handleDeleteItem(itemId)}
                      onRename={(itemId, newName) => void handleRenameItem(itemId, newName)}
                      onGoToFolder={showGoToFolderActions ? handleGoToItemFolder : undefined}
                      isMultiSelect={isMultiSelect}
                      tags={tags}
                    />
                  ) : object.kind === 'bookmark' ? (
                    <BookmarkCard
                      key={object.id}
                      bookmark={object.bookmark}
	                      selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(object.id) : selectedBookmarkId === object.id}
	                      isMultiSelect={isBookmarkMultiSelect}
	                      onClick={() => handleBookmarkCardClick(object.id)}
	                      onContextMenuOpen={handleBookmarkContextMenu}
	                      contextTargetIds={resolveBookmarkContextTargetIds(object.id)}
	                      {...bookmarkActionProps}
	                    />
                  ) : (
                    <NoteCard
                      key={object.id}
                      note={object.note}
                      selected={isNoteMultiSelect ? selectedNoteIds.includes(object.id) : selectedNoteId === object.id}
                      isMultiSelect={isNoteMultiSelect}
                      onClick={() => handleNoteCardClick(object.id)}
                      onContextMenuOpen={handleNoteContextMenu}
                      {...noteActionProps}
                    />
                  )
                ))}
              </div>
            ) : (
              <div className="pv-mixed-list">
                <MixedListHeader
                  isMultiSelect={isMultiSelect}
                  allVisibleSelected={allVisibleSelected}
                  onToggleSelectAllVisible={handleToggleSelectAllVisible}
                />
                {renderedMixedObjects.map((object) => (
                  object.kind === 'file' ? (
                    <FileListRow
                      key={object.id}
                      item={object.item}
                      thumbnailUrl={thumbnails[object.id]}
                      selected={selectedItemIds.includes(object.id)}
	                      isMultiSelect={isMultiSelect}
	                      onClick={(event) => handleItemClick(object.id, event.metaKey || event.ctrlKey)}
	                      onOpen={() => handleOpenViewer(object.id)}
	                      onContextMenuOpen={handleItemContextMenu}
	                      contextTargetIds={resolveContextTargetIds(object.id)}
	                      onToggleFavorite={(itemIds) => void handleToggleFavoriteByIds(itemIds)}
                      onMove={openMoveDialogForIds}
                      onExport={(itemIds) => void handleExportByIds(itemIds)}
                      onDelete={(itemIds) => void handleDeleteByIds(itemIds)}
                      onGoToFolder={showGoToFolderActions ? (item) => handleGoToItemFolder(item.id) : undefined}
                      tags={tags}
                    />
                  ) : object.kind === 'bookmark' ? (
                    <BookmarkListRow
                      key={object.id}
                      bookmark={object.bookmark}
	                      selected={isBookmarkMultiSelect ? selectedBookmarkIds.includes(object.id) : selectedBookmarkId === object.id}
	                      isMultiSelect={isBookmarkMultiSelect}
	                      onClick={() => handleBookmarkCardClick(object.id)}
	                      onContextMenuOpen={handleBookmarkContextMenu}
	                      contextTargetIds={resolveBookmarkContextTargetIds(object.id)}
	                      {...bookmarkActionProps}
	                    />
                  ) : (
                    <NoteListRow
                      key={object.id}
                      note={object.note}
                      selected={isNoteMultiSelect ? selectedNoteIds.includes(object.id) : selectedNoteId === object.id}
                      isMultiSelect={isNoteMultiSelect}
                      onClick={() => handleNoteCardClick(object.id)}
                      onContextMenuOpen={handleNoteContextMenu}
                      {...noteActionProps}
                    />
                  )
                ))}
              </div>
            )}
            {isVaultMarqueeSelecting && vaultMarqueeOverlayStyle && (
              <div
                style={{
                  ...vaultMarqueeOverlayStyle,
                  position: 'absolute',
                  zIndex: 20,
                  pointerEvents: 'none',
                  border: `1px solid ${T.accent}`,
                  background: T.accentGlow,
                }}
              />
            )}
            {renderCount < mixedObjects.length && (
              <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                {isLoadingMore && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={T.mute2} strokeWidth="1.5" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M14 8A6 6 0 1 1 8 2" />
                  </svg>
                )}
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
              <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute }}>Inspector</span>
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
              {isMultiSelect && bulkSummaryTotal > 1 ? (
                <BulkInspectorSummary total={bulkSummaryTotal} files={selectedItemIds.length} bookmarks={selectedBookmarkIds.length} notes={selectedNoteIds.length} />
              ) : selectedBookmark ? (
                  <BookmarkInspector
                    bookmark={selectedBookmark}
                    tags={tags}
                    onDelete={(id) => void handleDeleteBookmark(id)}
                    onRename={(id, title) => void handleRenameBookmark(id, title)}
                    onToggleTag={(bookmarkId, tagId, assigned) => void handleToggleBookmarkTag(bookmarkId, tagId, assigned)}
                    onToggleFavorite={(bookmarkId, isFavorite) => void handleToggleBookmarkFavoriteByIds([bookmarkId], isFavorite)}
                    onSetRating={(bookmarkId, rating) => void handleSetBookmarkRating(bookmarkId, rating)}
                    onOpenInBrowser={onOpenUrlInBrowser}
                    privateOpenTargets={privateOpenTargets}
                    onOpenPrivate={(bookmark, target) => void handleOpenBookmarkPrivate(bookmark, target)}
                    onChangeThumbnail={(b) => setThumbPickerBookmark(b)}
                    onGoToFolder={showGoToFolderActions ? handleGoToBookmarkFolder : undefined}
                  />
              ) : selectedNote ? (
                  <NoteInspector
                    note={selectedNote}
                    tags={tags}
                    onEdit={openNoteEditor}
                    onDelete={(id) => void handleDeleteNotesByIds([id])}
                    onToggleFavorite={(noteId, isFavorite) => void handleToggleNoteFavoriteByIds([noteId], isFavorite)}
                    onToggleTag={(noteId, tagId, assigned) => void handleToggleNoteTag(noteId, tagId, assigned)}
                    onExport={(id) => void handleExportNote(id)}
                    onGoToFolder={showGoToFolderActions ? handleGoToNoteFolder : undefined}
                  />
              ) : isBookmarkScope ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: T.mute }}>
                    <p style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', color: T.mute2 }}>Select a bookmark to inspect</p>
                  </div>
              ) : isNoteScope ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: T.mute }}>
                    <p style={{ fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', color: T.mute2 }}>Select a note to inspect</p>
                  </div>
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
        objectCount={moveDialogItemIds.length + moveDialogBookmarkIds.length + moveDialogNoteIds.length}
        onConfirm={handleConfirmMoveDialog}
        title={moveDialogSource === 'bulk' ? 'Move selected objects' : 'Move object'}
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

      <NoteEditorModal
        note={editingNote}
        onSave={handleUpdateNote}
        onClose={() => setEditingNoteId(null)}
      />

      <SanctumConfirmDialog
        open={confirmRequest !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) closeVaultConfirm(false); }}
        title={confirmRequest?.title ?? ''}
        description={confirmRequest?.description}
        variant={confirmRequest?.variant ?? 'danger'}
        confirmLabel={confirmRequest?.confirmLabel ?? 'Confirm'}
        onConfirm={() => closeVaultConfirm(true)}
        zIndex={11000}
      />

      {viewerItemId && (
        <MediaViewerOverlay
          items={filteredItems}
          currentItemId={viewerItemId}
          onClose={() => setViewerItemId(null)}
          onNavigate={(itemId) => { setSelectedItems([itemId]); setViewerItemId(itemId); }}
          onMessage={(msg) => toast.info(msg)}
          onOpenReadOnlyCopy={(itemId) => void handleOpenTemporaryFile(itemId)}
        />
      )}

      {/* Thumbnail picker */}
      {thumbPickerBookmark && (
        <ThumbnailPicker
          bookmark={thumbPickerBookmark}
          onPick={(dataUrl, bookmarkId) => void handlePickThumb(dataUrl, bookmarkId)}
          onClose={() => setThumbPickerBookmark(null)}
        />
      )}
    </div>
  );
};

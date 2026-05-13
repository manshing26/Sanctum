import React, { useState } from 'react';
import type { TagSummary, VaultListSort } from '../../../../shared/ipc';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';

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
const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const SORT_OPTIONS: { value: VaultListSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'rating_asc', label: 'Lowest rated' },
];

const TAG_COLOR_PRESETS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

type GalleryToolbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  sort: VaultListSort;
  onSortChange: (value: VaultListSort) => void;
  onOpenImportSettings: () => void;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
  onToggleFavoriteSelected: () => void;
  onOpenBulkMoveDialog: () => void;
  onRefresh: () => void;
  isBusy: boolean;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  selectedCount: number;
  allSelectedFavorite: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isMultiSelect: boolean;
  onToggleMultiSelect: () => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  allVisibleSelected: boolean;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  itemCount: number;
  selectedFolderName: string | null;
  subtitle?: string;
  breadcrumb?: string | null;
  selectedViewScope: 'all' | 'video' | 'image' | 'document' | 'root' | 'folder' | 'bookmark';
  isBookmarkScope?: boolean;
  // Tag filter bar props (inlined)
  tags: TagSummary[];
  selectedTagIds: number[];
  onToggleTagFilter: (tagId: number) => void;
  newTagName: string;
  onNewTagNameChange: (value: string) => void;
  onCreateTag: (color?: string) => void;
  onDeleteTag: (tagId: number) => void;
};

const iconBtn = (active = false): React.CSSProperties => ({
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: active ? T.accent : 'none',
  border: 'none',
  cursor: 'pointer',
  color: active ? '#0a0c0b' : T.mute,
  padding: 0,
  flexShrink: 0,
});

export const GalleryToolbar = ({
  searchTerm,
  onSearchTermChange,
  sort,
  onSortChange,
  onOpenImportSettings,
  onExportSelected,
  onDeleteSelected,
  onToggleFavoriteSelected,
  onOpenBulkMoveDialog,
  onRefresh,
  isBusy,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  selectedCount,
  allSelectedFavorite,
  viewMode,
  onViewModeChange,
  isMultiSelect,
  onToggleMultiSelect,
  onSelectAllVisible,
  onClearSelection,
  allVisibleSelected,
  showSidebar,
  onToggleSidebar,
  itemCount,
  selectedFolderName,
  subtitle,
  breadcrumb,
  selectedViewScope,
  isBookmarkScope,
  tags,
  selectedTagIds,
  onToggleTagFilter,
  newTagName,
  onNewTagNameChange,
  onCreateTag,
  onDeleteTag,
}: GalleryToolbarProps): React.JSX.Element => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  const titleLabel =
    selectedFolderName ??
    (selectedViewScope === 'video' ? 'Video' :
     selectedViewScope === 'image' ? 'Images' :
     selectedViewScope === 'document' ? 'Documents' :
     selectedViewScope === 'root' ? 'Root' :
     selectedViewScope === 'bookmark' ? 'Bookmarks' : 'Gallery');

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Sort';

  const handleTagSubmit = (): void => {
    if (newTagName.trim()) {
      onCreateTag(selectedColor);
      setShowTagInput(false);
      setSelectedColor(undefined);
    }
  };

  return (
    <div>
      {/* Main toolbar row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderBottom: `1px solid ${T.line}`,
      }}>
        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          title={showSidebar ? 'Hide folios' : 'Show folios'}
          style={iconBtn(!showSidebar)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1" y="2" width="12" height="10" rx="0" />
            <line x1="5" y1="2" x2="5" y2="12" />
          </svg>
        </button>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {breadcrumb && (
            <div style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.08em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
              {breadcrumb}
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {titleLabel}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: T.mute, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3 }}>
            {subtitle ?? `${itemCount} ${itemCount === 1 ? 'object' : 'objects'} · encrypted · aes-256-gcm`}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 200 }}>
          <svg
            width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={T.mute} strokeWidth="1.5"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            style={{
              width: '100%',
              height: 28,
              background: 'transparent',
              border: `1px solid ${T.line2}`,
              outline: 'none',
              color: T.text,
              fontFamily: MONO,
              fontSize: 11,
              paddingLeft: 26,
              paddingRight: searchTerm ? 24 : 8,
              borderRadius: 0,
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchTermChange('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
              </svg>
            </button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', border: `1px solid ${T.line2}`, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            title="List view"
            style={{ ...iconBtn(viewMode === 'list'), borderRight: `1px solid ${T.line2}` }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
              <line x1="1" y1="3" x2="12" y2="3" /><line x1="1" y1="6.5" x2="12" y2="6.5" /><line x1="1" y1="10" x2="12" y2="10" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
            style={iconBtn(viewMode === 'grid')}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="1" y="1" width="4" height="4" /><rect x="8" y="1" width="4" height="4" />
              <rect x="1" y="8" width="4" height="4" /><rect x="8" y="8" width="4" height="4" />
            </svg>
          </button>
        </div>

        {/* Sort */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowSortMenu((p) => !p)}
            style={{
              height: 28, padding: '0 10px',
              background: 'none',
              border: `1px solid ${T.line2}`,
              cursor: 'pointer',
              color: T.mute,
              fontFamily: MONO, fontSize: 10,
              letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: 5,
              borderRadius: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
              <line x1="1" y1="3" x2="10" y2="3" /><line x1="3" y1="6" x2="10" y2="6" /><line x1="5" y1="9" x2="10" y2="9" />
            </svg>
            {currentSortLabel}
          </button>
          {showSortMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 100,
              background: '#14160f',
              border: `1px solid ${T.line2}`,
              minWidth: 140,
              marginTop: 2,
            }}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onSortChange(opt.value); setShowSortMenu(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px',
                    background: sort === opt.value ? T.accentGlow : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em',
                    color: sort === opt.value ? T.accent : T.mute,
                  }}
                >
                  {opt.value === sort ? '· ' : '  '}{opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Favorites filter */}
        <button
          type="button"
          onClick={onToggleFavoritesOnly}
          title={showFavoritesOnly ? 'Show all' : 'Favourites only'}
          style={iconBtn(showFavoritesOnly)}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
            <path d="M6.5 1.5l1.4 2.8 3.1.45-2.25 2.2.53 3.1L6.5 8.5l-2.78 1.55.53-3.1L2 4.75l3.1-.45z" />
          </svg>
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isBusy}
          title="Refresh"
          style={{ ...iconBtn(), opacity: isBusy ? 0.5 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4"
            style={{ animation: isBusy ? 'spin 1s linear infinite' : 'none' }}
          >
            <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2" /><polyline points="9.5,2 11,2 11,3.5" />
          </svg>
        </button>

        {/* Import files — always visible */}
        <button
          type="button"
          onClick={onOpenImportSettings}
          disabled={isBusy}
          style={{
            height: 28, padding: '0 12px',
            background: T.accent,
            border: 'none',
            cursor: 'pointer',
            color: '#0a0c0b',
            fontFamily: MONO, fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
            flexShrink: 0,
            opacity: isBusy ? 0.6 : 1,
            borderRadius: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="5.5,1 5.5,8" /><polyline points="2,5 5.5,8.5 9,5" /><line x1="1" y1="10" x2="10" y2="10" />
          </svg>
          Import
        </button>
      </div>

      {/* Action row — only when multi-select is active */}
      {isMultiSelect && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 20px',
          borderBottom: `1px solid ${T.line}`,
          background: T.accentGlow,
        }}>
          <button
            type="button"
            onClick={onToggleMultiSelect}
            style={{
              height: 22, padding: '0 8px',
              background: 'none',
              border: `1px solid ${T.line2}`,
              cursor: 'pointer',
              color: T.mute2,
              fontFamily: MONO, fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flexShrink: 0,
              borderRadius: 0,
            }}
          >
            Done
          </button>

          <div style={{ width: 1, height: 14, background: T.line2, flexShrink: 0 }} />

          <span style={{ fontFamily: MONO, fontSize: 10, color: T.accent, letterSpacing: '0.06em' }}>
            {selectedCount > 0 ? `${selectedCount} selected` : 'Select items'}
          </span>

          <button
            type="button"
            onClick={onSelectAllVisible}
            disabled={itemCount === 0 || allVisibleSelected}
            style={{
              height: 22,
              padding: '0 8px',
              background: 'none',
              border: `1px solid ${T.line2}`,
              cursor: itemCount === 0 || allVisibleSelected ? 'default' : 'pointer',
              color: itemCount === 0 || allVisibleSelected ? T.mute2 : T.mute,
              opacity: itemCount === 0 || allVisibleSelected ? 0.5 : 1,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flexShrink: 0,
              borderRadius: 0,
            }}
          >
            Select all visible
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            style={{
              height: 22,
              padding: '0 8px',
              background: 'none',
              border: `1px solid ${T.line2}`,
              cursor: selectedCount === 0 ? 'default' : 'pointer',
              color: selectedCount === 0 ? T.mute2 : T.mute,
              opacity: selectedCount === 0 ? 0.5 : 1,
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flexShrink: 0,
              borderRadius: 0,
            }}
          >
            Clear
          </button>

          {selectedCount > 0 && (
            <>
              <div style={{ width: 1, height: 14, background: T.line2, margin: '0 4px' }} />

              <button type="button" onClick={onOpenBulkMoveDialog} title="Move selected" style={iconBtn()}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M1 10V4a1 1 0 0 1 1-1h2.5L6 4.5h5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" />
                </svg>
              </button>

              <button type="button" onClick={onToggleFavoriteSelected} title={allSelectedFavorite ? 'Unfavourite' : 'Favourite'} style={iconBtn(allSelectedFavorite)}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill={allSelectedFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
                  <path d="M6.5 1.5l1.4 2.8 3.1.45-2.25 2.2.53 3.1L6.5 8.5l-2.78 1.55.53-3.1L2 4.75l3.1-.45z" />
                </svg>
              </button>

              <button type="button" onClick={onExportSelected} title="Export selected" style={iconBtn()}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <polyline points="6.5,1 6.5,8" /><polyline points="3,4.5 6.5,8 10,4.5" /><line x1="1" y1="12" x2="12" y2="12" />
                </svg>
              </button>

              <button type="button" onClick={onDeleteSelected} title="Delete selected" style={{ ...iconBtn(), color: T.danger }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <polyline points="2,3 11,3" /><path d="M4 3V2h5v1" /><rect x="3" y="3" width="7" height="9" />
                </svg>
              </button>
            </>
          )}

        </div>
      )}

      {/* Tag filter row */}
      {!isMultiSelect && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px',
        borderBottom: `1px solid ${T.line}`,
        minHeight: 36,
        overflowX: 'auto',
      }}>
        {/* Multi-select toggle when not active */}
        <button
          type="button"
          onClick={onToggleMultiSelect}
          title="Bulk edit"
          style={{
            height: 22, padding: '0 8px',
            background: 'none', border: `1px solid ${T.line2}`,
            cursor: 'pointer', color: T.mute2,
            fontFamily: MONO, fontSize: 9,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            flexShrink: 0, borderRadius: 0,
          }}
        >
          Select
        </button>

        <div style={{ width: 1, height: 14, background: T.line2, flexShrink: 0 }} />

        {/* Tags */}
        {tags.map((tag) => {
          const active = selectedTagIds.includes(tag.id);
          return (
            <ContextMenu key={tag.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggleTagFilter(tag.id)}
                  style={{
                    height: 22, padding: '0 8px',
                    background: active ? T.accentGlow : 'none',
                    border: `1px solid ${active ? T.accent : T.line2}`,
                    cursor: 'pointer',
                    color: active ? T.accent : T.mute,
                    fontFamily: MONO, fontSize: 10,
                    letterSpacing: '0.04em',
                    display: 'flex', alignItems: 'center', gap: 5,
                    flexShrink: 0, borderRadius: 0,
                  }}
                >
                  {tag.color && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                  )}
                  {tag.name}
                  {active && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => onDeleteTag(tag.id)}
                  className="text-danger focus:text-danger"
                >
                  Delete tag
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {/* Add tag */}
        {showTagInput ? (
          <form
            onSubmit={(e) => { e.preventDefault(); handleTagSubmit(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <input
              autoFocus
              value={newTagName}
              onChange={(e) => onNewTagNameChange(e.target.value)}
              placeholder="Tag name"
              style={{
                width: 90, height: 22,
                background: 'transparent', border: `1px solid ${T.accent}`,
                color: T.text, fontFamily: MONO, fontSize: 10,
                padding: '0 6px', outline: 'none', borderRadius: 0,
              }}
            />
            <div style={{ display: 'flex', gap: 3 }}>
              {TAG_COLOR_PRESETS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(selectedColor === color.value ? undefined : color.value)}
                  title={color.name}
                  style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: color.value,
                    border: selectedColor === color.value ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                    transform: selectedColor === color.value ? 'scale(1.25)' : 'scale(1)',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <button type="submit" disabled={!newTagName.trim()} style={{ ...iconBtn(), width: 22, height: 22 }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
              </svg>
            </button>
            <button type="button" onClick={() => { setShowTagInput(false); onNewTagNameChange(''); setSelectedColor(undefined); }} style={{ ...iconBtn(), width: 22, height: 22 }}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="1" x2="8" y2="8" /><line x1="8" y1="1" x2="1" y2="8" />
              </svg>
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowTagInput(true)}
            title="New tag"
            style={{
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: `1px dashed ${T.line2}`, cursor: 'pointer',
              color: T.mute2, flexShrink: 0, borderRadius: 0, padding: 0,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="4.5" y1="1" x2="4.5" y2="8" /><line x1="1" y1="4.5" x2="8" y2="4.5" />
            </svg>
          </button>
        )}
      </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

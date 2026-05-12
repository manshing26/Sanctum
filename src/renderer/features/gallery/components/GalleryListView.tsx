import React, { useState } from 'react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { RenameItemDialog } from './RenameItemDialog';
import { useMarqueeSelection } from '../hooks/useMarqueeSelection';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';

const T = {
  bg: '#0a0c0b',
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

type GalleryListViewProps = {
  items: VaultItemSummary[];
  thumbnails: Record<string, string>;
  selectedItemIds: string[];
  onToggleSelect: (itemId: string, multiKey?: boolean) => void;
  onSetSelectedItems: (itemIds: string[]) => void;
  onBeginMarqueeSelection?: () => void;
  onEmptyBackgroundClick?: () => void;
  onOpenItem: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onContextMenuOpen?: (itemId: string) => void;
  contextTargetIdsForItem?: (itemId: string) => string[];
  onOpenViewerForIds?: (itemIds: string[]) => void;
  onToggleFavoriteForIds?: (itemIds: string[]) => void;
  onOpenMoveDialogForIds?: (itemIds: string[]) => void;
  onExportForIds?: (itemIds: string[]) => void;
  onDeleteForIds?: (itemIds: string[]) => void;
  isOpenViewerDisabledForItem?: (itemId: string) => boolean;
  onOpenMoveDialog: (itemId: string) => void;
  onExportItem?: (itemId: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onRenameItem?: (itemId: string, newName: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isMultiSelect: boolean;
};

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const isVideo = (mimeType: string): boolean => mimeType.startsWith('video/');

// ── Single list row ──────────────────────────────────────────────────
const ListRow: React.FC<{
  index: number;
  item: VaultItemSummary;
  thumbnailUrl?: string;
  isSelected: boolean;
  onToggleSelect: (itemId: string, multiKey?: boolean) => void;
  onOpen: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onContextMenuOpen?: (itemId: string) => void;
  contextTargetIdsForItem?: (itemId: string) => string[];
  onOpenViewerForIds?: (itemIds: string[]) => void;
  onToggleFavoriteForIds?: (itemIds: string[]) => void;
  onOpenMoveDialogForIds?: (itemIds: string[]) => void;
  onExportForIds?: (itemIds: string[]) => void;
  onDeleteForIds?: (itemIds: string[]) => void;
  isOpenViewerDisabledForItem?: (itemId: string) => boolean;
  onOpenMoveDialog: (itemId: string) => void;
  onExport?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  onRename?: (itemId: string, newName: string) => void;
  isMultiSelect: boolean;
}> = ({
  index,
  item,
  thumbnailUrl,
  isSelected,
  onToggleSelect,
  onOpen,
  onToggleFavorite,
  onContextMenuOpen,
  contextTargetIdsForItem,
  onOpenViewerForIds,
  onToggleFavoriteForIds,
  onOpenMoveDialogForIds,
  onExportForIds,
  onDeleteForIds,
  isOpenViewerDisabledForItem,
  onOpenMoveDialog,
  onExport,
  onDelete,
  onRename,
  isMultiSelect,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const getContextTargetIds = (): string[] => contextTargetIdsForItem?.(item.id) ?? [item.id];
  const contextTargetIds = getContextTargetIds();
  const isOpenViewerDisabled = (): boolean => isOpenViewerDisabledForItem?.(item.id) ?? getContextTargetIds().length > 1;
  const openViewerDisabled = isOpenViewerDisabled();

  const typeLabel = isVideo(item.mimeType)
    ? 'video'
    : (item.mimeType.split('/')[1] ?? 'file').toLowerCase();

  const infoLabel = isVideo(item.mimeType) && item.durationSeconds && item.durationSeconds > 0
    ? formatDuration(item.durationSeconds)
    : item.width && item.height
      ? `${item.width}×${item.height}`
      : '—';

  const rowContent = (
    <div
      data-gallery-item-id={item.id}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={() => onContextMenuOpen?.(item.id)}
      onClick={(e) => onToggleSelect(item.id, e.metaKey || e.ctrlKey)}
      onDoubleClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect(item.id); }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: isMultiSelect
          ? '20px 32px 50px minmax(0,1.6fr) minmax(80px,.7fr) 70px 60px 24px'
          : '32px 50px minmax(0,1.6fr) minmax(80px,.7fr) 70px 60px 24px',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        height: 40,
        background: isSelected ? T.accentGlow : hovered ? 'rgba(220,220,200,0.03)' : 'transparent',
        borderLeft: isSelected ? `2px solid ${T.accent}` : '2px solid transparent',
        borderBottom: `1px solid ${T.line}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Checkbox */}
      {isMultiSelect && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
          style={{
            width: 14, height: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${isSelected ? T.accent : T.mute2}`,
            background: isSelected ? T.accent : 'transparent',
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 4.5l2 2 4-4" stroke="#0a0c0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Index */}
      <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, textAlign: 'right', paddingRight: 4 }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Thumbnail */}
      <div style={{ width: 44, height: 32, flexShrink: 0, overflow: 'hidden', background: '#0e100e', position: 'relative' }}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={item.originalName}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imageLoaded ? 1 : 0, transition: 'opacity 0.2s' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isVideo(item.mimeType) ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={T.mute2} strokeWidth="1.3">
                <rect x="1" y="2" width="8" height="10" /><polyline points="9,4.5 13,3 13,11 9,9.5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={T.mute2} strokeWidth="1.3">
                <rect x="1" y="1" width="12" height="12" /><circle cx="5" cy="5" r="1.5" />
                <polyline points="1,10 4,7 7,9 10,7 13,9 13,13 1,13" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Name + type */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.originalName}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: T.mute, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>
          {typeLabel}
        </div>
      </div>

      {/* Folder */}
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.folderId != null ? '—' : 'root'}
      </span>

      {/* Size */}
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute, textAlign: 'right' }}>
        {formatFileSize(item.size)}
      </span>

      {/* Info */}
      <span style={{ fontFamily: MONO, fontSize: 10, color: T.mute2, textAlign: 'right' }}>
        {infoLabel}
      </span>

      {/* Favorite */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id, !item.isFavorite); }}
        title={item.isFavorite ? 'Unfavourite' : 'Favourite'}
        style={{
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: item.isFavorite ? T.accent : T.mute2,
          opacity: item.isFavorite || hovered ? 1 : 0,
          transition: 'opacity 0.15s',
          padding: 0, flexShrink: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill={item.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
          <path d="M5.5 1.2l1.2 2.4 2.65.39-1.92 1.87.45 2.64L5.5 7.2 3.12 8.5l.45-2.64L1.65 3.99l2.65-.39z" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={openViewerDisabled}
            onClick={() => {
              const targetIds = getContextTargetIds();
              if (isOpenViewerDisabled()) return;
              if (onOpenViewerForIds) { onOpenViewerForIds(targetIds); return; }
              onOpen(item.id);
            }}
          >
            Open in Viewer
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const targetIds = getContextTargetIds();
              if (onToggleFavoriteForIds) { onToggleFavoriteForIds(targetIds); return; }
              onToggleFavorite(item.id, !item.isFavorite);
            }}
          >
            {contextTargetIds.length > 1 ? 'Toggle Favourites' : item.isFavorite ? 'Remove Favourite' : 'Add to Favourites'}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const targetIds = getContextTargetIds();
              if (onOpenMoveDialogForIds) { onOpenMoveDialogForIds(targetIds); return; }
              onOpenMoveDialog(item.id);
            }}
          >
            {contextTargetIds.length > 1 ? 'Move Selected…' : 'Move to Folder…'}
          </ContextMenuItem>
          {(onExport || onExportForIds) && (
            <ContextMenuItem
              onClick={() => {
                const targetIds = getContextTargetIds();
                if (onExportForIds) { onExportForIds(targetIds); return; }
                onExport?.(item.id);
              }}
            >
              {contextTargetIds.length > 1 ? 'Export Selected' : 'Export'}
            </ContextMenuItem>
          )}
          {onRename && contextTargetIds.length === 1 && (
            <ContextMenuItem onClick={() => setRenameOpen(true)}>Rename</ContextMenuItem>
          )}
          {(onDelete || onDeleteForIds) && (
            <ContextMenuItem
              onClick={() => {
                const targetIds = getContextTargetIds();
                if (onDeleteForIds) { onDeleteForIds(targetIds); return; }
                onDelete?.(item.id);
              }}
              className="text-danger focus:text-danger"
            >
              {contextTargetIds.length > 1 ? 'Delete Selected' : 'Delete'}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {onRename && (
        <RenameItemDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          currentName={item.originalName}
          onConfirm={(newName) => onRename(item.id, newName)}
        />
      )}
    </>
  );
};

// ── Column header ────────────────────────────────────────────────────
const ListHeader: React.FC<{ isMultiSelect: boolean }> = ({ isMultiSelect }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: isMultiSelect
      ? '20px 32px 50px minmax(0,1.6fr) minmax(80px,.7fr) 70px 60px 24px'
      : '32px 50px minmax(0,1.6fr) minmax(80px,.7fr) 70px 60px 24px',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    height: 28,
    borderBottom: `1px solid ${T.line2}`,
    marginBottom: 0,
  }}>
    {isMultiSelect && <span />}
    <span style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'right' }}>№</span>
    <span />
    <span style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</span>
    <span style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Folder</span>
    <span style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'right' }}>Size</span>
    <span style={{ fontFamily: MONO, fontSize: 8, color: T.mute2, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'right' }}>Info</span>
    <span />
  </div>
);

// ── Main list view ───────────────────────────────────────────────────
export const GalleryListView = ({
  items,
  thumbnails,
  selectedItemIds,
  onToggleSelect,
  onSetSelectedItems,
  onBeginMarqueeSelection,
  onEmptyBackgroundClick,
  onOpenItem,
  onToggleFavorite,
  onContextMenuOpen,
  contextTargetIdsForItem,
  onOpenViewerForIds,
  onToggleFavoriteForIds,
  onOpenMoveDialogForIds,
  onExportForIds,
  onDeleteForIds,
  isOpenViewerDisabledForItem,
  onOpenMoveDialog,
  onExportItem,
  onDeleteItem,
  onRenameItem,
  hasMore,
  isLoadingMore,
  sentinelRef,
  isMultiSelect,
}: GalleryListViewProps): React.JSX.Element => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { isSelecting, overlayStyle, onMouseDown } = useMarqueeSelection({
    containerRef,
    selectedItemIds,
    onSetSelectedItems,
    onBeginSelection: onBeginMarqueeSelection,
    onEmptyBackgroundClick,
  });

  if (items.length === 0 && !isLoadingMore) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '64px 0',
        border: `1px dashed ${T.line2}`,
      }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={T.mute2} strokeWidth="1.2">
          <rect x="3" y="3" width="30" height="30" /><line x1="3" y1="12" x2="33" y2="12" />
          <line x1="12" y1="12" x2="12" y2="33" /><line x1="16" y1="20" x2="26" y2="20" /><line x1="16" y1="25" x2="23" y2="25" />
        </svg>
        <p style={{ fontFamily: MONO, fontSize: 11, color: T.mute, letterSpacing: '0.06em' }}>No objects match current filters</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{ position: 'relative', minHeight: '100%', userSelect: 'none' }}
    >
      <ListHeader isMultiSelect={isMultiSelect} />

      {items.map((item, idx) => (
        <ListRow
          key={item.id}
          index={idx}
          item={item}
          thumbnailUrl={thumbnails[item.id]}
          isSelected={selectedItemIds.includes(item.id)}
          onToggleSelect={onToggleSelect}
          onOpen={onOpenItem}
          onToggleFavorite={onToggleFavorite}
          onContextMenuOpen={onContextMenuOpen}
          contextTargetIdsForItem={contextTargetIdsForItem}
          onOpenViewerForIds={onOpenViewerForIds}
          onToggleFavoriteForIds={onToggleFavoriteForIds}
          onOpenMoveDialogForIds={onOpenMoveDialogForIds}
          onExportForIds={onExportForIds}
          onDeleteForIds={onDeleteForIds}
          isOpenViewerDisabledForItem={isOpenViewerDisabledForItem}
          onOpenMoveDialog={onOpenMoveDialog}
          onExport={onExportItem}
          onDelete={onDeleteItem}
          onRename={onRenameItem}
          isMultiSelect={isMultiSelect}
        />
      ))}

      {hasMore && (
        <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          {isLoadingMore && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={T.mute2} strokeWidth="1.5"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path d="M14 8A6 6 0 1 1 8 2" />
            </svg>
          )}
        </div>
      )}

      {/* Footer */}
      {!hasMore && items.length > 0 && (
        <div style={{ padding: '20px 12px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, letterSpacing: '0.1em' }}>
            · end of cabinet · {items.length} {items.length === 1 ? 'object' : 'objects'} ·
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute2, letterSpacing: '0.1em', fontStyle: 'italic' }}>
            silentium · sigillum
          </span>
        </div>
      )}

      {isSelecting && overlayStyle && (
        <div
          style={{
            ...overlayStyle,
            position: 'absolute', zIndex: 20, pointerEvents: 'none',
            border: `1px solid ${T.accent}`,
            background: T.accentGlow,
          }}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

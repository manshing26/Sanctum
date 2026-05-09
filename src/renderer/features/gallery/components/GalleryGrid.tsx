import React from 'react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { GalleryCard } from './GalleryCard';
import { useMarqueeSelection } from '../hooks/useMarqueeSelection';

const T = {
  line2: 'rgba(220,220,200,0.12)',
  mute2: '#4d524d',
  accent: '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.15)',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

type GalleryGridProps = {
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
  onOpenMoveDialog?: (itemId: string) => void;
  onExportItem?: (itemId: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onRenameItem?: (itemId: string, newName: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isMultiSelect: boolean;
};

export const GalleryGrid = ({
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
}: GalleryGridProps): React.JSX.Element => {
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
          <rect x="3" y="3" width="12" height="12" /><rect x="21" y="3" width="12" height="12" />
          <rect x="3" y="21" width="12" height="12" /><rect x="21" y="21" width="12" height="12" />
        </svg>
        <p style={{ fontFamily: MONO, fontSize: 11, color: T.mute2, letterSpacing: '0.06em' }}>No objects match current filters</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{ position: 'relative', minHeight: '100%', userSelect: 'none' }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 20,
      }}>
        {items.map((item) => (
          <GalleryCard
            key={item.id}
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
      </div>

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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

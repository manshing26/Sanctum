import React from 'react';
import { ImageOff } from 'lucide-react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { GalleryCard } from './GalleryCard';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { useMarqueeSelection } from '../hooks/useMarqueeSelection';

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
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
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
  hasMore,
  isLoading,
  onLoadMore,
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

  if (items.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16">
        <ImageOff className="h-10 w-10 text-text-muted opacity-40" />
        <p className="text-sm text-text-muted">No items match current filters</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className="relative min-h-full select-none space-y-4"
    >
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
              isMultiSelect={isMultiSelect}
            />
          ))}
        </div>
        {isSelecting && overlayStyle && (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-accent/80 bg-accent/20"
            style={overlayStyle}
          />
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center py-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={onLoadMore}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Spinner size="sm" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

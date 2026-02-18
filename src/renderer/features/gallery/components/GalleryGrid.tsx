import React from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { GalleryCard } from './GalleryCard';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';

type GalleryGridProps = {
  items: VaultItemSummary[];
  thumbnails: Record<string, string>;
  selectedItemIds: string[];
  onToggleSelect: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
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
  onOpenItem,
  onToggleFavorite,
  onExportItem,
  onDeleteItem,
  hasMore,
  isLoading,
  onLoadMore,
  isMultiSelect,
}: GalleryGridProps): React.JSX.Element => {
  if (items.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16">
        <ImageOff className="h-10 w-10 text-text-muted opacity-40" />
        <p className="text-sm text-text-muted">No items match current filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            onExport={onExportItem}
            onDelete={onDeleteItem}
            isMultiSelect={isMultiSelect}
          />
        ))}
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

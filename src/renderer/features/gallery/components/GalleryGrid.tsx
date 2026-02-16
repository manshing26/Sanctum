import React from 'react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { GalleryCard } from './GalleryCard';

type GalleryGridProps = {
  items: VaultItemSummary[];
  thumbnails: Record<string, string>;
  selectedItemIds: string[];
  onToggleSelect: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
};

export const GalleryGrid = ({
  items,
  thumbnails,
  selectedItemIds,
  onToggleSelect,
  onOpenItem,
  onToggleFavorite,
  hasMore,
  isLoading,
  onLoadMore,
}: GalleryGridProps): React.JSX.Element => {
  return (
    <section className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted">
          No items match current filters.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              thumbnailUrl={thumbnails[item.id]}
              isSelected={selectedItemIds.includes(item.id)}
              onToggleSelect={onToggleSelect}
              onOpen={onOpenItem}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={onLoadMore}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary disabled:opacity-60"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      ) : null}
    </section>
  );
};

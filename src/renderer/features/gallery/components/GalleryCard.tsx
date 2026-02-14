import React from 'react';
import type { VaultItemSummary } from '../../../../shared/ipc';

type GalleryCardProps = {
  item: VaultItemSummary;
  thumbnailUrl?: string;
  isSelected: boolean;
  onSelect: (itemId: string) => void;
};

export const GalleryCard = ({
  item,
  thumbnailUrl,
  isSelected,
  onSelect,
}: GalleryCardProps): React.JSX.Element => {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`group w-full overflow-hidden rounded-xl border bg-surface text-left transition ${
        isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/50'
      }`}
    >
      <div className="aspect-[4/3] w-full bg-bg">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={item.originalName} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">No preview</div>
        )}
      </div>
      <div className="space-y-1 px-3 py-3">
        <p className="truncate text-sm font-medium text-text-primary">{item.originalName}</p>
        <p className="truncate text-xs text-text-muted">{item.folderPath ?? 'Unfiled'}</p>
        <p className="truncate text-xs text-text-muted">
          {item.tags && item.tags.length > 0 ? item.tags.join(', ') : 'No tags'}
        </p>
      </div>
    </button>
  );
};

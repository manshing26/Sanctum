import React from 'react';
import type { VaultItemSummary } from '../../../../shared/ipc';

type GalleryCardProps = {
  item: VaultItemSummary;
  thumbnailUrl?: string;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
};

export const GalleryCard = ({
  item,
  thumbnailUrl,
  isSelected,
  onToggleSelect,
  onOpen,
  onToggleFavorite,
}: GalleryCardProps): React.JSX.Element => {
  return (
    <button
      type="button"
      onClick={() => onToggleSelect(item.id)}
      onDoubleClick={() => onOpen(item.id)}
      className={`group w-full overflow-hidden rounded-xl border bg-surface text-left transition ${
        isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-accent/50'
      }`}
    >
      <div className="relative aspect-[4/3] w-full bg-bg">
        <label className="absolute left-2 top-2 flex items-center gap-1 rounded bg-bg/80 px-1.5 py-1 text-[10px] text-text-muted">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelect(item.id);
            }}
          />
          Select
        </label>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={item.originalName} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">No preview</div>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(item.id, !item.isFavorite);
          }}
          className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-xs ${
            item.isFavorite
              ? 'border-accent bg-accent/20 text-accent'
              : 'border-border bg-bg/80 text-text-muted'
          }`}
          aria-label={item.isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          Fav
        </button>
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

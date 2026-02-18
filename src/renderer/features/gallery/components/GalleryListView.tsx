import React, { useState } from 'react';
import { Heart, Image, Film, Eye, Star, ImageOff } from 'lucide-react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '../../../components/ui/ContextMenu';
import { cn } from '../../../lib/utils';

type GalleryListViewProps = {
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
  item: VaultItemSummary;
  thumbnailUrl?: string;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onExport?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
}> = ({ item, thumbnailUrl, isSelected, onToggleSelect, onOpen, onToggleFavorite, onExport, onDelete }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const rowContent = (
    <button
      type="button"
      onClick={() => onToggleSelect(item.id)}
      onDoubleClick={() => onOpen(item.id)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
        isSelected
          ? 'bg-accent/10 ring-1 ring-accent/30'
          : 'hover:bg-surface-hover',
      )}
    >
      {/* Checkbox */}
      <div
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          isSelected
            ? 'border-accent bg-accent'
            : 'border-border group-hover:border-text-muted',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.id);
        }}
      >
        {isSelected && (
          <svg className="h-2.5 w-2.5 text-accent-foreground" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Thumbnail */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-bg">
        {thumbnailUrl ? (
          <>
            {!imageLoaded && <Skeleton className="absolute inset-0 rounded-none" />}
            <img
              src={thumbnailUrl}
              alt={item.originalName}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              className={cn('h-full w-full object-cover', !imageLoaded && 'invisible')}
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            {isVideo(item.mimeType) ? (
              <Film className="h-4 w-4 opacity-40" />
            ) : (
              <Image className="h-4 w-4 opacity-40" />
            )}
          </div>
        )}
      </div>

      {/* Filename */}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
        {item.originalName}
      </span>

      {/* Type */}
      <span className="hidden w-20 shrink-0 truncate text-[11px] text-text-muted sm:block">
        {isVideo(item.mimeType) ? 'Video' : item.mimeType.split('/')[1]?.toUpperCase() ?? 'File'}
      </span>

      {/* Size */}
      <span className="w-16 shrink-0 text-right text-[11px] text-text-muted">
        {formatFileSize(item.size)}
      </span>

      {/* Dimensions / Duration */}
      <span className="hidden w-20 shrink-0 text-right text-[11px] text-text-muted md:block">
        {item.durationSeconds !== undefined && item.durationSeconds > 0
          ? formatDuration(item.durationSeconds)
          : item.width && item.height
            ? `${item.width}×${item.height}`
            : '—'}
      </span>

      {/* Rating */}
      <span className="hidden w-16 shrink-0 lg:flex items-center justify-end gap-px">
        {item.rating !== undefined && item.rating > 0 ? (
          Array.from({ length: item.rating }, (_, i) => (
            <Star key={i} className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
          ))
        ) : (
          <span className="text-[11px] text-text-muted">—</span>
        )}
      </span>

      {/* Favorite */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item.id, !item.isFavorite);
        }}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
          item.isFavorite
            ? 'text-accent'
            : 'text-text-muted opacity-0 hover:text-accent group-hover:opacity-100',
        )}
        aria-label={item.isFavorite ? 'Unfavorite' : 'Favorite'}
      >
        <Heart className={cn('h-3.5 w-3.5', item.isFavorite && 'fill-accent')} />
      </button>
    </button>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onOpen(item.id)}>
          <Eye className="mr-2 h-4 w-4" />
          Open in Viewer
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite(item.id, !item.isFavorite)}>
          <Heart className={cn('mr-2 h-4 w-4', item.isFavorite && 'fill-accent text-accent')} />
          {item.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {onExport && (
          <ContextMenuItem onClick={() => onExport(item.id)}>Export</ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(item.id)}
              className="text-danger focus:text-danger"
            >
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ── Main list view ───────────────────────────────────────────────────
export const GalleryListView = ({
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
}: GalleryListViewProps): React.JSX.Element => {
  if (items.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16">
        <ImageOff className="h-10 w-10 text-text-muted opacity-40" />
        <p className="text-sm text-text-muted">No items match current filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center gap-3 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
        <span className="w-4 shrink-0" />
        <span className="w-10 shrink-0" />
        <span className="min-w-0 flex-1">Name</span>
        <span className="hidden w-20 shrink-0 sm:block">Type</span>
        <span className="w-16 shrink-0 text-right">Size</span>
        <span className="hidden w-20 shrink-0 text-right md:block">Info</span>
        <span className="hidden w-16 shrink-0 text-right lg:block">Rating</span>
        <span className="w-6 shrink-0" />
      </div>

      {/* Rows */}
      {items.map((item) => (
        <ListRow
          key={item.id}
          item={item}
          thumbnailUrl={thumbnails[item.id]}
          isSelected={selectedItemIds.includes(item.id)}
          onToggleSelect={onToggleSelect}
          onOpen={onOpenItem}
          onToggleFavorite={onToggleFavorite}
          onExport={onExportItem}
          onDelete={onDeleteItem}
        />
      ))}

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

import React, { useState } from 'react';
import { Heart, Image, Film, Play, Eye, Star, Download, Trash2, FolderOpen } from 'lucide-react';
import type { VaultItemSummary } from '../../../../shared/ipc';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';
import { cn } from '../../../lib/utils';

type GalleryCardProps = {
  item: VaultItemSummary;
  thumbnailUrl?: string;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onOpenMoveDialog?: (itemId: string) => void;
  onExport?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
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
const isGif = (mimeType: string): boolean => mimeType === 'image/gif';

export const GalleryCard = ({
  item,
  thumbnailUrl,
  isSelected,
  onToggleSelect,
  onOpen,
  onToggleFavorite,
  onOpenMoveDialog,
  onExport,
  onDelete,
  isMultiSelect,
}: GalleryCardProps): React.JSX.Element => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const showSkeleton = item.hasThumbnail && thumbnailUrl && !imageLoaded;

  const mediaType = isVideo(item.mimeType) ? 'video' : isGif(item.mimeType) ? 'gif' : 'image';

  const cardContent = (
    <div
      data-gallery-item-id={item.id}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          onToggleSelect(item.id);
        } else {
          onToggleSelect(item.id);
        }
      }}
      onDoubleClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelect(item.id);
        }
      }}
      className={cn(
        'group relative w-full overflow-hidden rounded-lg border bg-surface text-left transition-all duration-200',
        isSelected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-border hover:border-accent/40 hover:shadow-md',
      )}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg">
        {/* Checkbox overlay - only in multi-select mode */}
        {isMultiSelect && (
          <div
            className={cn(
              'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity',
              isSelected
                ? 'border-accent bg-accent opacity-100'
                : 'border-text-muted/40 bg-bg/70 opacity-0 group-hover:opacity-100',
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(item.id);
            }}
          >
            {isSelected && (
              <svg className="h-3 w-3 text-accent-foreground" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}

        {/* Favorite button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item.id, !item.isFavorite);
          }}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all',
            item.isFavorite
              ? 'bg-accent/20 text-accent opacity-100'
              : 'bg-bg/60 text-text-muted opacity-0 hover:text-accent group-hover:opacity-100',
          )}
          aria-label={item.isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <Heart
            className={cn('h-4 w-4', item.isFavorite && 'fill-accent')}
          />
        </button>

        {/* Media type badge */}
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1">
          {mediaType === 'video' && (
            <Badge variant="default" className="gap-1 bg-black/70 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              <Film className="h-3 w-3" />
              VIDEO
            </Badge>
          )}
          {mediaType === 'gif' && (
            <Badge variant="default" className="bg-black/70 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              GIF
            </Badge>
          )}
        </div>

        {/* Duration overlay for videos */}
        {item.durationSeconds !== undefined && item.durationSeconds > 0 && (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Play className="h-2.5 w-2.5 fill-current" />
            {formatDuration(item.durationSeconds)}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 z-[5] bg-black/0 transition-colors duration-200 group-hover:bg-black/10" />

        {/* Thumbnail image */}
        {thumbnailUrl ? (
          <>
            {showSkeleton && (
              <Skeleton className="absolute inset-0 rounded-none" />
            )}
            <img
              src={thumbnailUrl}
              alt={item.originalName}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              className={cn(
                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                showSkeleton && 'invisible',
              )}
            />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-text-muted">
            {mediaType === 'video' ? (
              <Film className="h-8 w-8 opacity-40" />
            ) : (
              <Image className="h-8 w-8 opacity-40" />
            )}
            <span className="text-[10px]">No preview</span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-medium text-text-primary" title={item.originalName}>
          {item.originalName}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[11px] text-text-muted">
            {formatFileSize(item.size)}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
          </span>
          {item.rating !== undefined && item.rating > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-px">
              {Array.from({ length: item.rating }, (_, i) => (
                <Star key={i} className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {cardContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onOpen(item.id)}>
          <Eye className="mr-2 h-4 w-4" />
          Open in Viewer
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleFavorite(item.id, !item.isFavorite)}>
          <Heart className={cn('mr-2 h-4 w-4', item.isFavorite && 'fill-accent text-accent')} />
          {item.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
        </ContextMenuItem>
        {onOpenMoveDialog && (
          <ContextMenuItem onClick={() => onOpenMoveDialog(item.id)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Move to Folder...
          </ContextMenuItem>
        )}
        {onExport && (
          <ContextMenuItem onClick={() => onExport(item.id)}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(item.id)}
            className="text-danger focus:text-danger"
          >
            <Trash2 className="mr-2 h-4 w-4 text-danger" />
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

import React, { useState } from 'react';
import type { TagSummary, VaultItemSummary } from '../../../../shared/ipc';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';
import { RenameItemDialog } from './RenameItemDialog';

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

type GalleryCardProps = {
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
  onOpenMoveDialog?: (itemId: string) => void;
  onExport?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  onRename?: (itemId: string, newName: string) => void;
  isMultiSelect: boolean;
  tags?: TagSummary[];
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
  tags = [],
}: GalleryCardProps): React.JSX.Element => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const getContextTargetIds = (): string[] => contextTargetIdsForItem?.(item.id) ?? [item.id];
  const contextTargetIds = getContextTargetIds();
  const isOpenViewerDisabled = (): boolean => isOpenViewerDisabledForItem?.(item.id) ?? getContextTargetIds().length > 1;
  const openViewerDisabled = isOpenViewerDisabled();
  const mediaType = isVideo(item.mimeType) ? 'video' : isGif(item.mimeType) ? 'gif' : 'image';
  const itemTags = (item.tagIds ?? [])
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is TagSummary => Boolean(tag));
  const primaryTag = itemTags[0] ?? (item.tags?.[0] ? { id: -1, name: item.tags[0] } : undefined);

  const cardContent = (
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
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        border: isSelected
          ? `1px solid ${T.text}`
          : hovered
            ? `1px solid ${T.line2}`
            : `1px solid ${T.line}`,
        boxShadow: isSelected ? `0 0 0 1px ${T.text}` : 'none',
        background: '#0e100e',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'border-color 0.15s',
        borderRadius: 0,
      }}
    >
      {/* Thumbnail — 4:3 */}
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: '#0d0f0d' }}>
        {/* Multi-select checkbox */}
        {isMultiSelect && (
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            style={{
              position: 'absolute', top: 8, left: 8, zIndex: 10,
              width: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${isSelected ? T.accent : 'rgba(220,220,200,0.4)'}`,
              background: isSelected ? T.accent : 'rgba(10,12,11,0.7)',
              opacity: isSelected || hovered ? 1 : 0,
              transition: 'opacity 0.15s',
              cursor: 'pointer',
            }}
          >
            {isSelected && (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 4.5l2 2 4-4" stroke="#0a0c0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}

        {/* Favorite button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id, !item.isFavorite); }}
          title={item.isFavorite ? 'Unfavourite' : 'Favourite'}
          style={{
            position: 'absolute', top: 7, right: 7, zIndex: 10,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: item.isFavorite ? T.accentGlow : 'rgba(10,12,11,0.6)',
            border: 'none', cursor: 'pointer',
            color: item.isFavorite ? T.accent : T.mute,
            opacity: item.isFavorite || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill={item.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1.2l1.35 2.74 3.02.44-2.19 2.13.52 3.01L6 8.1 3.3 9.52l.52-3.01L1.63 4.38l3.02-.44z" />
          </svg>
        </button>

        {/* Type badge */}
        {(mediaType === 'video' || mediaType === 'gif') && (
          <div style={{
            position: 'absolute', top: isMultiSelect ? 30 : 7, left: 7, zIndex: 10,
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.75)',
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em',
            color: T.mute,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {mediaType === 'video' && (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="0.5" y="1" width="5" height="7" /><polyline points="5.5,2.5 8.5,1 8.5,8 5.5,6.5" />
              </svg>
            )}
            {mediaType === 'video' ? 'VIDEO' : 'GIF'}
          </div>
        )}

        {primaryTag && (
          <div style={{
            position: 'absolute', bottom: 7, left: 7, zIndex: 10,
            maxWidth: item.durationSeconds !== undefined && item.durationSeconds > 0 ? 'calc(100% - 78px)' : 'calc(100% - 14px)',
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.75)',
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.04em',
            color: T.mute,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {primaryTag.color && <span style={{ width: 5, height: 5, borderRadius: '50%', background: primaryTag.color, flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryTag.name}</span>
          </div>
        )}

        {/* Duration */}
        {item.durationSeconds !== undefined && item.durationSeconds > 0 && (
          <div style={{
            position: 'absolute', bottom: 7, right: 7, zIndex: 10,
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.75)',
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.04em',
            color: T.mute,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <polygon points="1,0.5 7,4 1,7.5" />
            </svg>
            {formatDuration(item.durationSeconds)}
          </div>
        )}

        {/* Thumbnail image */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={item.originalName}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.2s, transform 0.3s',
              transform: hovered ? 'scale(1.03)' : 'scale(1)',
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {mediaType === 'video' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <rect x="2" y="3" width="13" height="18" /><polyline points="15,7 22,4 22,20 15,17" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.mute2} strokeWidth="1.2">
                <rect x="2" y="2" width="20" height="20" /><circle cx="8" cy="8" r="2" />
                <polyline points="2,17 8,11 12,15 16,12 22,17 22,22 2,22" />
              </svg>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: hovered ? 'rgba(0,0,0,0.08)' : 'transparent',
          transition: 'background 0.2s',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Info footer */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.line}` }}>
        <p style={{
          fontFamily: SERIF, fontSize: 13, color: T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          margin: 0,
        }} title={item.originalName}>
          {item.originalName}
        </p>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.mute, letterSpacing: '0.04em' }}>
            {formatFileSize(item.size)}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
          </span>
          {item.rating !== undefined && item.rating > 0 && (
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 9, color: T.accent }}>
              {'·'.repeat(item.rating)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
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
          {(onOpenMoveDialog || onOpenMoveDialogForIds) && (
            <ContextMenuItem
              onClick={() => {
                const targetIds = getContextTargetIds();
                if (onOpenMoveDialogForIds) { onOpenMoveDialogForIds(targetIds); return; }
                onOpenMoveDialog?.(item.id);
              }}
            >
              {contextTargetIds.length > 1 ? 'Move Selected…' : 'Move to Folder…'}
            </ContextMenuItem>
          )}
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

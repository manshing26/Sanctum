import React, { useEffect, useState } from 'react';
import {
  Eye,
  Trash2,
  Heart,
  Pencil,
  Check,
  X,
  Hash,
  FileType,
  HardDrive,
  Maximize2,
  Clock,
  Info,
} from 'lucide-react';
import type { SecuritySettings, TagSummary, VaultItemSummary } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Separator } from '../../../components/ui/Separator';
import { ScrollArea } from '../../../components/ui/ScrollArea';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/Sheet';
import { StarRating } from '../../../components/ui/StarRating';
import { cn } from '../../../lib/utils';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

type ItemDetailsPanelProps = {
  item: VaultItemSummary | null;
  tags: TagSummary[];
  securitySettings: SecuritySettings;
  onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void;
  onUpdateSecureDeleteDefault: (enabled: boolean) => void;
  onOpenItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onToggleFavorite: (itemId: string, isFavorite: boolean) => void;
  onRenameItem: (itemId: string, newName: string) => void;
  onSetRating: (itemId: string, rating: number | null) => void;
  selectedCount: number;
};

// ── Inline details content (used both in sidebar and sheet) ──────────
const DetailsContent: React.FC<
  Omit<ItemDetailsPanelProps, 'selectedCount'> & { selectedCount: number }
> = ({
  item,
  tags,
  onToggleTag,
  onOpenItem,
  onDeleteItem,
  onToggleFavorite,
  onRenameItem,
  onSetRating,
  selectedCount,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    setNameDraft(item?.originalName ?? '');
    setIsRenaming(false);
  }, [item?.id, item?.originalName]);

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-muted">
        <Info className="h-8 w-8 opacity-40" />
        <p className="text-sm">Select an item to see details</p>
      </div>
    );
  }

  if (selectedCount > 1) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-muted">
        <Info className="h-8 w-8 opacity-40" />
        <p className="text-sm">{selectedCount} items selected</p>
        <p className="text-xs">Select a single item for details</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Name + rename */}
      <div>
        {isRenaming ? (
          <div className="flex items-center gap-1">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDraft.trim() && nameDraft.trim() !== item.originalName) {
                  onRenameItem(item.id, nameDraft.trim());
                  setIsRenaming(false);
                }
                if (e.key === 'Escape') {
                  setNameDraft(item.originalName);
                  setIsRenaming(false);
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (nameDraft.trim() && nameDraft.trim() !== item.originalName) {
                  onRenameItem(item.id, nameDraft.trim());
                }
                setIsRenaming(false);
              }}
              disabled={!nameDraft.trim() || nameDraft.trim() === item.originalName}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setNameDraft(item.originalName);
                setIsRenaming(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{item.originalName}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => setIsRenaming(true)}
              aria-label="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_2.25rem] items-center gap-2">
        <Button size="sm" onClick={() => onOpenItem(item.id)} className="min-w-0 flex-1 gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          Open
        </Button>
        <Button
          variant={item.isFavorite ? 'default' : 'secondary'}
          size="icon"
          className="shrink-0"
          onClick={() => onToggleFavorite(item.id, !item.isFavorite)}
          aria-label={item.isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <Heart className={cn('h-4 w-4', item.isFavorite && 'fill-current')} />
        </Button>
        <Button
          variant="danger"
          size="icon"
          className="shrink-0"
          onClick={() => onDeleteItem(item.id)}
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Metadata */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Info</h3>
        <div className="space-y-1.5">
          <MetadataRow icon={FileType} label="Type" value={item.mimeType} />
          <MetadataRow icon={HardDrive} label="Size" value={formatFileSize(item.size)} />
          {item.width && item.height && (
            <MetadataRow icon={Maximize2} label="Dimensions" value={`${item.width} × ${item.height}`} />
          )}
          {item.durationSeconds !== undefined && item.durationSeconds > 0 && (
            <MetadataRow icon={Clock} label="Duration" value={`${item.durationSeconds.toFixed(1)}s`} />
          )}
        </div>
      </div>

      <Separator />

      {/* Rating */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Rating</h3>
        <StarRating
          value={item.rating}
          onChange={(rating) => onSetRating(item.id, rating)}
        />
      </div>

      <Separator />

      {/* Tags */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Tags</h3>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const assigned = Boolean(item.tagIds?.includes(tag.id));
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(item.id, tag.id, assigned)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                  assigned
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border text-text-muted hover:border-accent/40',
                )}
              >
                {tag.color ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                ) : (
                  <Hash className="h-3 w-3" />
                )}
                {tag.name}
                {assigned && <X className="h-3 w-3 opacity-60" />}
              </button>
            );
          })}
          {tags.length === 0 && (
            <p className="text-xs text-text-muted">No tags available</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Metadata row helper ──────────────────────────────────────────────
const MetadataRow: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 text-xs">
    <Icon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
    <span className="shrink-0 text-text-muted">{label}</span>
    <span className="ml-auto truncate text-text-primary">{value}</span>
  </div>
);

// ── Inline panel (for wide screens) ─────────────────────────────────
export const ItemDetailsSidebar: React.FC<ItemDetailsPanelProps> = (props) => (
  <aside className="flex h-full flex-col rounded-lg border border-border bg-surface">
    <div className="border-b border-border px-3 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Details</h2>
    </div>
    <ScrollArea className="flex-1 px-3 py-3">
      <DetailsContent {...props} />
    </ScrollArea>
  </aside>
);

// ── Sheet panel (for smaller screens) ────────────────────────────────
export const ItemDetailsSheet: React.FC<
  ItemDetailsPanelProps & { open: boolean; onOpenChange: (open: boolean) => void }
> = ({ open, onOpenChange, ...props }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-80 p-0">
      <div className="border-b border-border px-4 py-3">
        <SheetTitle className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Details
        </SheetTitle>
      </div>
      <ScrollArea className="h-[calc(100vh-52px)] px-4 py-3">
        <DetailsContent {...props} />
      </ScrollArea>
    </SheetContent>
  </Sheet>
);

// ── Legacy export for backward compatibility ─────────────────────────
export const ItemDetailsPanel = ItemDetailsSidebar;

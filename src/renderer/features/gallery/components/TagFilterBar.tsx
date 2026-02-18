import React, { useState } from 'react';
import { Hash, Plus, X, Tag } from 'lucide-react';
import type { TagSummary } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';
import { cn } from '../../../lib/utils';

const TAG_COLOR_PRESETS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

type TagFilterBarProps = {
  tags: TagSummary[];
  selectedTagIds: number[];
  onToggleTagFilter: (tagId: number) => void;
  newTagName: string;
  onNewTagNameChange: (value: string) => void;
  onCreateTag: (color?: string) => void;
  onDeleteTag: (tagId: number) => void;
};

export const TagFilterBar = ({
  tags,
  selectedTagIds,
  onToggleTagFilter,
  newTagName,
  onNewTagNameChange,
  onCreateTag,
  onDeleteTag,
}: TagFilterBarProps): React.JSX.Element => {
  const [showInput, setShowInput] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  const handleSubmit = (): void => {
    if (newTagName.trim()) {
      onCreateTag(selectedColor);
      setShowInput(false);
      setSelectedColor(undefined);
    }
  };

  if (tags.length === 0 && !showInput) {
    return (
      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-xs text-text-muted">No tags yet</span>
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
          aria-label="Add tag"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
      {tags.map((tag) => {
        const active = selectedTagIds.includes(tag.id);
        return (
          <ContextMenu key={tag.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => onToggleTagFilter(tag.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-accent/60 bg-accent/20 text-accent'
                    : 'border-border bg-surface text-text-secondary hover:border-text-muted/40 hover:text-text-primary',
                )}
              >
                {tag.color ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                ) : (
                  <Hash className="h-3 w-3 opacity-70" />
                )}
                {tag.name}
                {active && (
                  <X className="ml-0.5 h-3 w-3 opacity-60 hover:opacity-100" />
                )}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => onDeleteTag(tag.id)}
                className="text-danger focus:text-danger"
              >
                Delete tag
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      {/* Inline add tag */}
      {showInput ? (
        <form
          className="flex shrink-0 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            value={newTagName}
            onChange={(e) => onNewTagNameChange(e.target.value)}
            placeholder="Tag name"
            className="h-7 w-24 text-xs"
            autoFocus
          />

          {/* Color swatches */}
          <div className="flex items-center gap-0.5">
            {TAG_COLOR_PRESETS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() =>
                  setSelectedColor(selectedColor === color.value ? undefined : color.value)
                }
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full border-2 transition-transform',
                  selectedColor === color.value
                    ? 'scale-125 border-white'
                    : 'border-transparent hover:scale-110',
                )}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>

          <Button type="submit" variant="ghost" size="icon-sm" disabled={!newTagName.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setShowInput(false);
              onNewTagNameChange('');
              setSelectedColor(undefined);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
          aria-label="Add tag"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

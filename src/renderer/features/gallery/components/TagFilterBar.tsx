import React from 'react';
import type { TagSummary } from '../../../../shared/ipc';

type TagFilterBarProps = {
  tags: TagSummary[];
  selectedTagIds: number[];
  onToggleTagFilter: (tagId: number) => void;
  newTagName: string;
  onNewTagNameChange: (value: string) => void;
  onCreateTag: () => void;
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
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <p className="text-xs text-text-muted">No tags yet.</p>
        ) : (
          tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTagFilter(tag.id)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-muted'
                }`}
              >
                #{tag.name}
              </button>
            );
          })
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-text-muted">Manage Tags</summary>
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(event) => onNewTagNameChange(event.target.value)}
              placeholder="New tag name"
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
            />
            <button
              type="button"
              onClick={onCreateTag}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Create
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onDeleteTag(tag.id)}
                className="rounded-md border border-danger px-2 py-1 text-xs text-danger"
              >
                Delete #{tag.name}
              </button>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
};

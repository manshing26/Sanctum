import React from 'react';
import type { FolderNode, SecuritySettings, TagSummary, VaultItemSummary } from '../../../../shared/ipc';

const flattenFolders = (folders: FolderNode[], depth = 0): Array<{ id: number; label: string }> => {
  const options: Array<{ id: number; label: string }> = [];
  for (const folder of folders) {
    options.push({
      id: folder.id,
      label: `${depth > 0 ? `${'  '.repeat(depth)}- ` : ''}${folder.name}`,
    });
    options.push(...flattenFolders(folder.children, depth + 1));
  }
  return options;
};

type ItemDetailsPanelProps = {
  item: VaultItemSummary | null;
  folders: FolderNode[];
  tags: TagSummary[];
  securitySettings: SecuritySettings;
  onAssignFolder: (itemId: string, folderId: number | null) => void;
  onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void;
  onUpdateSecureDeleteDefault: (enabled: boolean) => void;
  onOpenItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
};

export const ItemDetailsPanel = ({
  item,
  folders,
  tags,
  securitySettings,
  onAssignFolder,
  onToggleTag,
  onUpdateSecureDeleteDefault,
  onOpenItem,
  onDeleteItem,
}: ItemDetailsPanelProps): React.JSX.Element => {
  const folderOptions = flattenFolders(folders);

  return (
    <aside className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text-primary">Details</h2>
      {!item ? (
        <p className="text-sm text-text-muted">Select an item to inspect metadata and quick actions.</p>
      ) : (
        <>
          <p className="truncate text-sm font-medium text-text-primary">{item.originalName}</p>
          <p className="text-xs text-text-muted">{item.mimeType}</p>
          <p className="text-xs text-text-muted">{item.size} bytes</p>
          <p className="text-xs text-text-muted">
            {item.width ?? '-'} x {item.height ?? '-'}
          </p>
          <p className="text-xs text-text-muted">
            Duration: {item.durationSeconds !== undefined ? `${item.durationSeconds.toFixed(2)}s` : '-'}
          </p>
          <p className="text-xs text-text-muted">Folder: {item.folderPath ?? 'Unfiled'}</p>

          <button
            type="button"
            onClick={() => onOpenItem(item.id)}
            className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
          >
            Open Viewer
          </button>
          <button
            type="button"
            onClick={() => onDeleteItem(item.id)}
            className="rounded-md border border-danger/60 bg-danger/10 px-2 py-1 text-xs text-danger"
          >
            Delete
          </button>

          <label className="block text-xs text-text-muted">
            Assign folder
            <select
              value={item.folderId ?? 'unfiled'}
              onChange={(event) =>
                onAssignFolder(item.id, event.target.value === 'unfiled' ? null : Number(event.target.value))
              }
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
            >
              <option value="unfiled">Unfiled</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const assigned = Boolean(item.tagIds?.includes(tag.id));
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onToggleTag(item.id, tag.id, assigned)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    assigned ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-muted'
                  }`}
                >
                  {assigned ? `#${tag.name} x` : `+ #${tag.name}`}
                </button>
              );
            })}
          </div>
        </>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-text-muted">Security (secondary)</summary>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onUpdateSecureDeleteDefault(true)}
            className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
          >
            Set Default On
          </button>
          <button
            type="button"
            onClick={() => onUpdateSecureDeleteDefault(false)}
            className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
          >
            Set Default Off
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Default secure delete: {securitySettings.secureDeleteOnImport ? 'On' : 'Off'}
        </p>
      </details>
    </aside>
  );
};

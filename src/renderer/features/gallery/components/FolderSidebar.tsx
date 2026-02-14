import React from 'react';
import type { FolderNode } from '../../../../shared/ipc';

type FolderSidebarProps = {
  folders: FolderNode[];
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number | null) => void;
  newFolderName: string;
  onNewFolderNameChange: (value: string) => void;
  newFolderParentId: number | null;
  onNewFolderParentIdChange: (value: number | null) => void;
  onCreateFolder: () => void;
  onDeleteFolder: (folderId: number) => void;
};

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

const FolderTree = ({
  folders,
  selectedFolderId,
  onSelectFolder,
}: {
  folders: FolderNode[];
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number | null) => void;
}): React.JSX.Element => {
  return (
    <ul className="space-y-1 text-sm">
      {folders.map((folder) => (
        <li key={folder.id}>
          <button
            type="button"
            onClick={() => onSelectFolder(folder.id)}
            className={`w-full rounded px-2 py-1 text-left ${
              selectedFolderId === folder.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg'
            }`}
          >
            {folder.name}
          </button>
          {folder.children.length > 0 ? (
            <div className="ml-3 border-l border-border pl-2">
              <FolderTree
                folders={folder.children}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

export const FolderSidebar = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  newFolderName,
  onNewFolderNameChange,
  newFolderParentId,
  onNewFolderParentIdChange,
  onCreateFolder,
  onDeleteFolder,
}: FolderSidebarProps): React.JSX.Element => {
  const options = flattenFolders(folders);

  return (
    <aside className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Folders</h2>
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          className="rounded border border-border px-2 py-1 text-xs text-text-muted"
        >
          All
        </button>
      </div>

      {folders.length === 0 ? (
        <p className="text-xs text-text-muted">No folders yet.</p>
      ) : (
        <FolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
        />
      )}

      <details>
        <summary className="cursor-pointer text-xs text-text-muted">Manage Folders</summary>
        <div className="mt-3 space-y-2">
          <div className="space-y-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(event) => onNewFolderNameChange(event.target.value)}
              placeholder="New folder name"
              className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
            />
            <select
              value={newFolderParentId ?? 'root'}
              onChange={(event) =>
                onNewFolderParentIdChange(
                  event.target.value === 'root' ? null : Number(event.target.value),
                )
              }
              className="w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
            >
              <option value="root">Root</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onCreateFolder}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Create Folder
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onDeleteFolder(option.id)}
                className="rounded-md border border-danger px-2 py-1 text-xs text-danger"
              >
                Delete {option.label}
              </button>
            ))}
          </div>
        </div>
      </details>
    </aside>
  );
};

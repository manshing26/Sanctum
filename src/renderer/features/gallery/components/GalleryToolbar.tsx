import React from 'react';
import type { FolderNode, VaultListSort } from '../../../../shared/ipc';

type FolderOption = {
  id: number;
  label: string;
};

const flattenFolderOptions = (folders: FolderNode[], depth = 0): FolderOption[] => {
  const result: FolderOption[] = [];
  for (const folder of folders) {
    result.push({
      id: folder.id,
      label: `${depth > 0 ? `${'  '.repeat(depth)}- ` : ''}${folder.name}`,
    });
    result.push(...flattenFolderOptions(folder.children, depth + 1));
  }
  return result;
};

type GalleryToolbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  sort: VaultListSort;
  onSortChange: (value: VaultListSort) => void;
  folders: FolderNode[];
  importFolderId: number | null;
  onImportFolderChange: (folderId: number | null) => void;
  deleteOriginalsOverride: 'default' | 'true' | 'false';
  onDeleteOriginalsOverrideChange: (value: 'default' | 'true' | 'false') => void;
  onImport: () => void;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
  onToggleFavoriteSelected: () => void;
  onRefresh: () => void;
  onLock: () => void;
  isBusy: boolean;
  totalItems: number;
  filteredCount: number;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  selectedCount: number;
  allSelectedFavorite: boolean;
};

export const GalleryToolbar = ({
  searchTerm,
  onSearchTermChange,
  sort,
  onSortChange,
  folders,
  importFolderId,
  onImportFolderChange,
  deleteOriginalsOverride,
  onDeleteOriginalsOverrideChange,
  onImport,
  onExportSelected,
  onDeleteSelected,
  onToggleFavoriteSelected,
  onRefresh,
  onLock,
  isBusy,
  totalItems,
  filteredCount,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  selectedCount,
  allSelectedFavorite,
}: GalleryToolbarProps): React.JSX.Element => {
  const folderOptions = flattenFolderOptions(folders);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search filename, tag, folder path"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary"
        />
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as VaultListSort)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
          <option value="size_desc">Size High-Low</option>
          <option value="size_asc">Size Low-High</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showFavoritesOnly} onChange={onToggleFavoritesOnly} />
          Favorites only
        </label>

        <label>
          Import folder:
          <select
            value={importFolderId ?? 'unfiled'}
            onChange={(event) =>
              onImportFolderChange(event.target.value === 'unfiled' ? null : Number(event.target.value))
            }
            className="ml-2 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
          >
            <option value="unfiled">Unfiled</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Secure delete override:
          <select
            value={deleteOriginalsOverride}
            onChange={(event) =>
              onDeleteOriginalsOverrideChange(event.target.value as 'default' | 'true' | 'false')
            }
            className="ml-2 rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
          >
            <option value="default">Use Default</option>
            <option value="true">Force On</option>
            <option value="false">Force Off</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span>
            Showing {filteredCount} / {totalItems}
          </span>
          <button
            type="button"
            onClick={onImport}
            disabled={isBusy}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
          >
            Import
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onLock}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary"
          >
            Lock
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>Selected: {selectedCount}</span>
        <button
          type="button"
          onClick={onExportSelected}
          disabled={selectedCount === 0 || isBusy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary disabled:opacity-60"
        >
          Export Selected
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0 || isBusy}
          className="rounded-lg border border-danger/60 bg-danger/10 px-3 py-1.5 text-xs text-danger disabled:opacity-60"
        >
          Delete Selected
        </button>
        <button
          type="button"
          onClick={onToggleFavoriteSelected}
          disabled={selectedCount === 0 || isBusy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary disabled:opacity-60"
        >
          {allSelectedFavorite ? 'Unfavorite Selected' : 'Favorite Selected'}
        </button>
      </div>
    </section>
  );
};

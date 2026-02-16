import React, { useEffect, useMemo, useState } from 'react';
import type { CreateFolderInput, VaultListSort } from '../../../shared/ipc';
import { FolderSidebar } from './components/FolderSidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryToolbar } from './components/GalleryToolbar';
import { ItemDetailsPanel } from './components/ItemDetailsPanel';
import { TagFilterBar } from './components/TagFilterBar';
import { useGalleryState } from './state/useGalleryState';
import { MediaViewerOverlay } from '../viewer/MediaViewerOverlay';

type GalleryPageProps = {
  onLockVault: () => Promise<void>;
  onMessage: (message: string) => void;
};

export const GalleryPage = ({ onLockVault, onMessage }: GalleryPageProps): React.JSX.Element => {
  const state = useGalleryState();
  const {
    allItems,
    filteredItems,
    totalItems,
    hasMore,
    isLoading,
    thumbnails,
    folders,
    tags,
    securitySettings,
    searchTerm,
    sort,
    selectedFolderId,
    selectedTagIds,
    selectedItem,
    deleteOriginalsOverride,
    importFolderId,
    setSearchTerm,
    setSelectedFolderId,
    setSelectedTagIds,
    setSelectedItemId,
    setSecuritySettings,
    setDeleteOriginalsOverride,
    setImportFolderId,
    loadFirstPage,
    loadMore,
    refresh,
    loadSupportingData,
  } = state;
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);

  useEffect(() => {
    void loadFirstPage().then((result) => {
      if (!result.ok) {
        onMessage(result.error);
      }
    });
  }, []);

  useEffect(() => {
    if (!viewerItemId) {
      return;
    }

    const stillVisible = filteredItems.some((item) => item.id === viewerItemId);
    if (!stillVisible) {
      console.warn('[gallery] viewer auto-closed because item is no longer visible in filteredItems', {
        viewerItemId,
        filteredCount: filteredItems.length,
      });
      onMessage('Viewer auto-closed because selected item is no longer in current filters.');
      setViewerItemId(null);
    }
  }, [viewerItemId, filteredItems]);

  useEffect(() => {
    console.info('[gallery] viewerItemId changed', { viewerItemId });
  }, [viewerItemId]);

  const handleSortChange = async (nextSort: VaultListSort): Promise<void> => {
    const result = await loadFirstPage(nextSort);
    if (!result.ok) {
      onMessage(result.error);
    }
  };

  const handleImport = async (): Promise<void> => {
    const selectedFiles = await window.electronAPI.pickFiles();
    if (selectedFiles.length === 0) {
      onMessage('No files selected.');
      return;
    }

    const importResult = await window.electronAPI.importFiles({
      filePaths: selectedFiles,
      folderId: importFolderId,
      deleteOriginals:
        deleteOriginalsOverride === 'default'
          ? undefined
          : deleteOriginalsOverride === 'true',
    });

    if (!importResult.ok) {
      onMessage(importResult.error);
      return;
    }

    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
      return;
    }

    onMessage(
      `Import complete: ${importResult.data.imported} imported, ${importResult.data.failed} failed.`,
    );
  };

  const handleRefresh = async (): Promise<void> => {
    const result = await refresh();
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    onMessage(`Refreshed. Loaded ${allItems.length} item(s).`);
  };

  const handleCreateFolder = async (): Promise<void> => {
    const payload: CreateFolderInput = {
      name: newFolderName,
      parentId: newFolderParentId,
    };
    const result = await window.electronAPI.createFolder(payload);
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    setNewFolderName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) {
      onMessage(supportResult.error);
      return;
    }
    onMessage('Folder created.');
  };

  const handleDeleteFolder = async (folderId: number): Promise<void> => {
    const result = await window.electronAPI.deleteFolder(folderId);
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
      return;
    }
    onMessage('Folder deleted.');
  };

  const handleCreateTag = async (): Promise<void> => {
    const result = await window.electronAPI.createTag({ name: newTagName });
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    setNewTagName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) {
      onMessage(supportResult.error);
      return;
    }
    onMessage('Tag created.');
  };

  const handleDeleteTag = async (tagId: number): Promise<void> => {
    const result = await window.electronAPI.deleteTag(tagId);
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
      return;
    }
    onMessage('Tag deleted.');
  };

  const handleAssignFolder = async (itemId: string, folderId: number | null): Promise<void> => {
    const result = await window.electronAPI.assignItemFolder({ itemId, folderId });
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
    }
  };

  const handleDeleteItem = async (itemId: string): Promise<void> => {
    const confirmed = window.confirm('Delete this item? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    const result = await window.electronAPI.deleteVaultItem({ itemId });
    if (!result.ok) {
      onMessage(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
      return;
    }
    if (viewerItemId === itemId) {
      setViewerItemId(null);
    }
    onMessage('Item deleted.');
  };

  const handleToggleTag = async (itemId: string, tagId: number, assigned: boolean): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignItemTag({ itemId, tagId })
      : await window.electronAPI.assignItemTag({ itemId, tagId });
    if (!response.ok) {
      onMessage(response.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) {
      onMessage(refreshed.error);
    }
  };

  const handleLoadMore = async (): Promise<void> => {
    const result = await loadMore();
    if (!result.ok) {
      onMessage(result.error);
    }
  };

  const handleToggleTagFilter = (tagId: number): void => {
    setSelectedTagIds(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    );
  };

  const filteredCount = useMemo(() => filteredItems.length, [filteredItems.length]);

  const handleOpenViewer = (itemId: string): void => {
    console.info('[gallery] open viewer requested', { itemId });
    setSelectedItemId(itemId);
    setViewerItemId(itemId);
    onMessage('Opening viewer...');
  };

  return (
    <div className="space-y-4">
      <GalleryToolbar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        sort={sort}
        onSortChange={(value) => void handleSortChange(value)}
        folders={folders}
        importFolderId={importFolderId}
        onImportFolderChange={setImportFolderId}
        deleteOriginalsOverride={deleteOriginalsOverride}
        onDeleteOriginalsOverrideChange={setDeleteOriginalsOverride}
        onImport={() => void handleImport()}
        onRefresh={() => void handleRefresh()}
        onLock={() => void onLockVault()}
        isBusy={isLoading}
        totalItems={totalItems}
        filteredCount={filteredCount}
      />

      <TagFilterBar
        tags={tags}
        selectedTagIds={selectedTagIds}
        onToggleTagFilter={handleToggleTagFilter}
        newTagName={newTagName}
        onNewTagNameChange={setNewTagName}
        onCreateTag={() => void handleCreateTag()}
        onDeleteTag={(tagId) => void handleDeleteTag(tagId)}
      />

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setShowSidebar((prev) => !prev)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          {showSidebar ? 'Hide Folders' : 'Show Folders'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className={`${showSidebar ? 'block' : 'hidden'} lg:block`}>
          <FolderSidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            newFolderName={newFolderName}
            onNewFolderNameChange={setNewFolderName}
            newFolderParentId={newFolderParentId}
            onNewFolderParentIdChange={setNewFolderParentId}
            onCreateFolder={() => void handleCreateFolder()}
            onDeleteFolder={(folderId) => void handleDeleteFolder(folderId)}
          />
        </div>

        <GalleryGrid
          items={filteredItems}
          thumbnails={thumbnails}
          selectedItemId={selectedItem?.id ?? null}
          onSelectItem={setSelectedItemId}
          onOpenItem={handleOpenViewer}
          hasMore={hasMore}
          isLoading={isLoading}
          onLoadMore={() => void handleLoadMore()}
        />

        <div className="2xl:hidden">
          <ItemDetailsPanel
            item={selectedItem}
            folders={folders}
            tags={tags}
            securitySettings={securitySettings}
            onAssignFolder={(itemId, folderId) => void handleAssignFolder(itemId, folderId)}
            onToggleTag={(itemId, tagId, assigned) => void handleToggleTag(itemId, tagId, assigned)}
            onOpenItem={handleOpenViewer}
            onDeleteItem={(itemId) => void handleDeleteItem(itemId)}
            onUpdateSecureDeleteDefault={(enabled) =>
              void window.electronAPI
                .updateSecuritySettings({ secureDeleteOnImport: enabled })
                .then((result) => {
                  if (!result.ok) {
                    onMessage(result.error);
                    return;
                  }
                  setSecuritySettings(result.data);
                  onMessage(`Default secure delete is now ${enabled ? 'enabled' : 'disabled'}.`);
                })
            }
          />
        </div>

        <div className="hidden 2xl:block">
          <ItemDetailsPanel
            item={selectedItem}
            folders={folders}
            tags={tags}
            securitySettings={securitySettings}
            onAssignFolder={(itemId, folderId) => void handleAssignFolder(itemId, folderId)}
            onToggleTag={(itemId, tagId, assigned) => void handleToggleTag(itemId, tagId, assigned)}
            onOpenItem={handleOpenViewer}
            onDeleteItem={(itemId) => void handleDeleteItem(itemId)}
            onUpdateSecureDeleteDefault={(enabled) =>
              void window.electronAPI
                .updateSecuritySettings({ secureDeleteOnImport: enabled })
                .then((result) => {
                  if (!result.ok) {
                    onMessage(result.error);
                    return;
                  }
                  setSecuritySettings(result.data);
                  onMessage(`Default secure delete is now ${enabled ? 'enabled' : 'disabled'}.`);
                })
            }
          />
        </div>
      </div>

      {viewerItemId ? (
        <MediaViewerOverlay
          items={filteredItems}
          currentItemId={viewerItemId}
          onClose={() => setViewerItemId(null)}
          onNavigate={(itemId) => {
            setSelectedItemId(itemId);
            setViewerItemId(itemId);
          }}
          onMessage={onMessage}
        />
      ) : null}
    </div>
  );
};

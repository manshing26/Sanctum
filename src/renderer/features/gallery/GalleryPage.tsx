import React, { useEffect, useMemo, useState } from 'react';
import { Upload, PanelRight } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateFolderInput, VaultListSort } from '../../../shared/ipc';
import { Button } from '../../components/ui/Button';
import { Progress } from '../../components/ui/Progress';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/Tooltip';
import { FolderSidebar } from './components/FolderSidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryListView } from './components/GalleryListView';
import { GalleryToolbar } from './components/GalleryToolbar';
import { ItemDetailsSidebar, ItemDetailsSheet } from './components/ItemDetailsPanel';
import { TagFilterBar } from './components/TagFilterBar';
import { useGalleryState } from './state/useGalleryState';
import { MediaViewerOverlay } from '../viewer/MediaViewerOverlay';
import { cn } from '../../lib/utils';

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
    selectedItemIds,
    deleteOriginalsOverride,
    importFolderId,
    showFavoritesOnly,
    setSearchTerm,
    setSelectedFolderId,
    setSelectedTagIds,
    toggleSelectedItem,
    setSelectedItems,
    clearSelection,
    setSecuritySettings,
    setDeleteOriginalsOverride,
    setImportFolderId,
    setShowFavoritesOnly,
    loadFirstPage,
    loadMore,
    refresh,
    loadSupportingData,
  } = state;

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    processed: number;
    failed: number;
    currentFile?: string;
  } | null>(null);
  const [exportProgress, setExportProgress] = useState<{
    total: number;
    processed: number;
    failed: number;
    currentFile?: string;
  } | null>(null);

  useEffect(() => {
    void loadFirstPage().then((result) => {
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribeImport = window.electronAPI.onImportProgress((progress) => {
      setImportProgress(progress);
      if (progress.processed >= progress.total) {
        window.setTimeout(() => setImportProgress(null), 2500);
      }
    });
    const unsubscribeExport = window.electronAPI.onExportProgress((progress) => {
      setExportProgress(progress);
      if (progress.processed >= progress.total) {
        window.setTimeout(() => setExportProgress(null), 2500);
      }
    });
    return () => {
      unsubscribeImport();
      unsubscribeExport();
    };
  }, []);

  useEffect(() => {
    if (!viewerItemId) return;
    const stillVisible = filteredItems.some((item) => item.id === viewerItemId);
    if (!stillVisible) {
      toast.info('Viewer closed — item no longer matches filters.');
      setViewerItemId(null);
    }
  }, [viewerItemId, filteredItems]);

  const handleToggleMultiSelect = (): void => {
    if (isMultiSelect) clearSelection();
    setIsMultiSelect((prev) => !prev);
  };

  const handleItemClick = (itemId: string): void => {
    if (isMultiSelect) {
      toggleSelectedItem(itemId);
    } else {
      setSelectedItems([itemId]);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSortChange = async (nextSort: VaultListSort): Promise<void> => {
    const result = await loadFirstPage(nextSort);
    if (!result.ok) toast.error(result.error);
  };

  const handleImport = async (): Promise<void> => {
    const selectedFiles = await window.electronAPI.pickFiles();
    if (selectedFiles.length === 0) return;
    await runImport(selectedFiles);
  };

  const runImport = async (filePaths: string[]): Promise<void> => {
    const importResult = await window.electronAPI.importFiles({
      filePaths,
      folderId: importFolderId,
      deleteOriginals:
        deleteOriginalsOverride === 'default'
          ? undefined
          : deleteOriginalsOverride === 'true',
    });

    if (!importResult.ok) {
      toast.error(importResult.error);
      return;
    }

    const refreshed = await refresh();
    if (!refreshed.ok) {
      toast.error(refreshed.error);
      return;
    }

    toast.success(
      `Imported ${importResult.data.imported} file(s)${importResult.data.failed > 0 ? `, ${importResult.data.failed} failed` : ''}`,
    );
  };

  const handleRefresh = async (): Promise<void> => {
    const result = await refresh();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Refreshed — ${allItems.length} items loaded.`);
  };

  const handleCreateFolder = async (): Promise<void> => {
    const payload: CreateFolderInput = { name: newFolderName, parentId: newFolderParentId };
    const result = await window.electronAPI.createFolder(payload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewFolderName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) {
      toast.error(supportResult.error);
      return;
    }
    toast.success('Folder created.');
  };

  const handleDeleteFolder = async (folderId: number): Promise<void> => {
    const result = await window.electronAPI.deleteFolder(folderId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Folder deleted.');
  };

  const handleCreateTag = async (color?: string): Promise<void> => {
    const result = await window.electronAPI.createTag({ name: newTagName, color });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewTagName('');
    const supportResult = await loadSupportingData();
    if (!supportResult.ok) toast.error(supportResult.error);
    else toast.success('Tag created.');
  };

  const handleDeleteTag = async (tagId: number): Promise<void> => {
    const result = await window.electronAPI.deleteTag(tagId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // Remove from active tag filters so stale filter doesn't hide items
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Tag deleted.');
  };

  const handleAssignFolder = async (itemId: string, folderId: number | null): Promise<void> => {
    const result = await window.electronAPI.assignItemFolder({ itemId, folderId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleDeleteItem = async (itemId: string): Promise<void> => {
    const confirmed = window.confirm('Delete this item? This cannot be undone.');
    if (!confirmed) return;

    const result = await window.electronAPI.deleteVaultItem({ itemId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    if (viewerItemId === itemId) setViewerItemId(null);
    toast.success('Item deleted.');
  };

  const handleToggleFavorite = async (itemId: string, isFavorite: boolean): Promise<void> => {
    const result = await window.electronAPI.toggleFavorite({ itemId, isFavorite });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleSetRating = async (itemId: string, rating: number | null): Promise<void> => {
    const result = await window.electronAPI.setRating({ itemId, rating });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleRenameItem = async (itemId: string, newName: string): Promise<void> => {
    const result = await window.electronAPI.renameVaultItem({ itemId, newName });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Item renamed.');
  };

  const handleExportItem = async (itemId: string): Promise<void> => {
    const result = await window.electronAPI.exportItems({ itemIds: [itemId], targetDir: '' });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Exported.');
  };

  const handleExportSelected = async (): Promise<void> => {
    if (selectedItemIds.length === 0) {
      toast.warning('Select items to export.');
      return;
    }
    const result = await window.electronAPI.exportItems({
      itemIds: selectedItemIds,
      targetDir: '',
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Exported ${result.data.exported} file(s).`);
  };

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedItemIds.length === 0) {
      toast.warning('Select items to delete.');
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedItemIds.length} item(s)? This cannot be undone.`);
    if (!confirmed) return;

    for (const itemId of selectedItemIds) {
      const result = await window.electronAPI.deleteVaultItem({ itemId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    clearSelection();
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success('Items deleted.');
  };

  const handleToggleFavoriteSelected = async (): Promise<void> => {
    if (selectedItemIds.length === 0) return;
    const selectedItems = filteredItems.filter((item) => selectedItemIds.includes(item.id));
    const allFavorite = selectedItems.length > 0 && selectedItems.every((item) => item.isFavorite);
    for (const item of selectedItems) {
      const result = await window.electronAPI.toggleFavorite({ itemId: item.id, isFavorite: !allFavorite });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleToggleTag = async (itemId: string, tagId: number, assigned: boolean): Promise<void> => {
    const response = assigned
      ? await window.electronAPI.unassignItemTag({ itemId, tagId })
      : await window.electronAPI.assignItemTag({ itemId, tagId });
    if (!response.ok) {
      toast.error(response.error);
      return;
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleLoadMore = async (): Promise<void> => {
    const result = await loadMore();
    if (!result.ok) toast.error(result.error);
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
    setSelectedItems([itemId]);
    setViewerItemId(itemId);
  };

  const detailsPanelProps = {
    item: selectedItem,
    folders,
    tags,
    securitySettings,
    onAssignFolder: (itemId: string, folderId: number | null) => void handleAssignFolder(itemId, folderId),
    onToggleTag: (itemId: string, tagId: number, assigned: boolean) => void handleToggleTag(itemId, tagId, assigned),
    onOpenItem: handleOpenViewer,
    onDeleteItem: (itemId: string) => void handleDeleteItem(itemId),
    onToggleFavorite: (itemId: string, isFavorite: boolean) => void handleToggleFavorite(itemId, isFavorite),
    onRenameItem: (itemId: string, newName: string) => void handleRenameItem(itemId, newName),
    onSetRating: (itemId: string, rating: number | null) => void handleSetRating(itemId, rating),
    selectedCount: selectedItemIds.length,
    onUpdateSecureDeleteDefault: (enabled: boolean) =>
      void window.electronAPI
        .updateSecuritySettings({ secureDeleteOnImport: enabled })
        .then((result) => {
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          setSecuritySettings(result.data);
          toast.success(`Secure delete default: ${enabled ? 'on' : 'off'}`);
        }),
  };

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files)
          .map((file) => (file as { path?: string }).path)
          .filter((path): path is string => Boolean(path));
        if (files.length === 0) return;
        void runImport(files);
      }}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="h-10 w-10" />
            <span className="text-sm font-medium">Drop files to import</span>
          </div>
        </div>
      )}

      {/* Progress bars */}
      {(importProgress || exportProgress) && (
        <div className="border-b border-border bg-surface px-4 py-2 space-y-1.5">
          {importProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  Importing {importProgress.processed}/{importProgress.total}
                  {importProgress.failed > 0 ? ` (${importProgress.failed} failed)` : ''}
                </span>
                {importProgress.currentFile && (
                  <span className="truncate ml-2 max-w-[200px]">{importProgress.currentFile}</span>
                )}
              </div>
              <Progress
                value={importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0}
                className="h-1.5"
              />
            </div>
          )}
          {exportProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  Exporting {exportProgress.processed}/{exportProgress.total}
                  {exportProgress.failed > 0 ? ` (${exportProgress.failed} failed)` : ''}
                </span>
              </div>
              <Progress
                value={exportProgress.total > 0 ? (exportProgress.processed / exportProgress.total) * 100 : 0}
                className="h-1.5"
              />
            </div>
          )}
        </div>
      )}

      {/* Toolbar area */}
      <div className="space-y-2 border-b border-border px-4 py-3">
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
          onExportSelected={() => void handleExportSelected()}
          onDeleteSelected={() => void handleDeleteSelected()}
          onToggleFavoriteSelected={() => void handleToggleFavoriteSelected()}
          onRefresh={() => void handleRefresh()}
          onLock={() => void onLockVault()}
          isBusy={isLoading}
          totalItems={totalItems}
          filteredCount={filteredCount}
          showFavoritesOnly={showFavoritesOnly}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((prev) => !prev)}
          selectedCount={selectedItemIds.length}
          allSelectedFavorite={
            selectedItemIds.length > 0 &&
            filteredItems
              .filter((item) => selectedItemIds.includes(item.id))
              .every((item) => item.isFavorite)
          }
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMultiSelect={isMultiSelect}
          onToggleMultiSelect={handleToggleMultiSelect}
        />

        {/* Tag filter bar */}
        <TagFilterBar
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTagFilter={handleToggleTagFilter}
          newTagName={newTagName}
          onNewTagNameChange={setNewTagName}
          onCreateTag={(color) => void handleCreateTag(color)}
          onDeleteTag={(tagId) => void handleDeleteTag(tagId)}
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Folder sidebar */}
        <div
          className={cn(
            'shrink-0 border-r border-border transition-all duration-200',
            showSidebar ? 'w-56' : 'w-0 overflow-hidden border-r-0',
          )}
        >
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

        {/* Gallery content */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === 'grid' ? (
            <GalleryGrid
              items={filteredItems}
              thumbnails={thumbnails}
              selectedItemIds={selectedItemIds}
              onToggleSelect={handleItemClick}
              onOpenItem={handleOpenViewer}
              onToggleFavorite={(itemId, isFavorite) => void handleToggleFavorite(itemId, isFavorite)}
              onExportItem={(itemId) => void handleExportItem(itemId)}
              onDeleteItem={(itemId) => void handleDeleteItem(itemId)}
              hasMore={hasMore}
              isLoading={isLoading}
              onLoadMore={() => void handleLoadMore()}
              isMultiSelect={isMultiSelect}
            />
          ) : (
            <GalleryListView
              items={filteredItems}
              thumbnails={thumbnails}
              selectedItemIds={selectedItemIds}
              onToggleSelect={handleItemClick}
              onOpenItem={handleOpenViewer}
              onToggleFavorite={(itemId, isFavorite) => void handleToggleFavorite(itemId, isFavorite)}
              onExportItem={(itemId) => void handleExportItem(itemId)}
              onDeleteItem={(itemId) => void handleDeleteItem(itemId)}
              hasMore={hasMore}
              isLoading={isLoading}
              onLoadMore={() => void handleLoadMore()}
              isMultiSelect={isMultiSelect}
            />
          )}
        </div>

        {/* Details sidebar — visible on wide screens */}
        <div className="hidden w-72 shrink-0 border-l border-border 2xl:block">
          <ItemDetailsSidebar {...detailsPanelProps} />
        </div>
      </div>

      {/* Details sheet — for smaller screens, toggled by button */}
      <ItemDetailsSheet
        open={showDetailsSheet}
        onOpenChange={setShowDetailsSheet}
        {...detailsPanelProps}
      />

      {/* Floating detail toggle button (visible below 2xl) */}
      <div className="absolute bottom-4 right-4 2xl:hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="icon"
              onClick={() => setShowDetailsSheet(true)}
              className="h-10 w-10 rounded-full shadow-lg"
              aria-label="Show details"
            >
              <PanelRight className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Item Details</TooltipContent>
        </Tooltip>
      </div>

      {/* Media viewer overlay */}
      {viewerItemId && (
        <MediaViewerOverlay
          items={filteredItems}
          currentItemId={viewerItemId}
          onClose={() => setViewerItemId(null)}
          onNavigate={(itemId) => {
            setSelectedItems([itemId]);
            setViewerItemId(itemId);
          }}
          onMessage={(msg) => toast.info(msg)}
        />
      )}
    </div>
  );
};

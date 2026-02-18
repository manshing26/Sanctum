import React, { useEffect, useRef, useState } from 'react';
import { Upload, PanelRight } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateFolderInput, FolderNode, VaultListSort } from '../../../shared/ipc';
import { Button } from '../../components/ui/Button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/Tooltip';
import { FolderSidebar } from './components/FolderSidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryListView } from './components/GalleryListView';
import { GalleryToolbar } from './components/GalleryToolbar';
import { ItemDetailsSidebar, ItemDetailsSheet } from './components/ItemDetailsPanel';
import { TagFilterBar } from './components/TagFilterBar';
import { MoveToFolderDialog } from './components/MoveToFolderDialog';
import { useGalleryState } from './state/useGalleryState';
import { MediaViewerOverlay } from '../viewer/MediaViewerOverlay';
import { cn } from '../../lib/utils';

type GalleryPageProps = {
  onMessage: (message: string) => void;
};

const parseFileUrlToPath = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'file:') {
      return null;
    }

    let pathname = decodeURIComponent(url.pathname);
    // Normalize Windows file URLs such as /C:/path...
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  } catch {
    return null;
  }
};

const extractDroppedFilePaths = (dataTransfer: DataTransfer): string[] => {
  const paths = new Set<string>();

  for (const file of Array.from(dataTransfer.files)) {
    const maybePath = window.electronAPI.getPathForFile(file) || (file as { path?: string }).path;
    if (maybePath) {
      paths.add(maybePath);
    }
  }

  for (const item of Array.from(dataTransfer.items)) {
    const maybeFile = item.getAsFile();
    const maybePath = maybeFile
      ? window.electronAPI.getPathForFile(maybeFile) || (maybeFile as { path?: string }).path
      : undefined;
    if (maybePath) {
      paths.add(maybePath);
    }
  }

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const parsed = parseFileUrlToPath(trimmed);
      if (parsed) {
        paths.add(parsed);
      }
    }
  }

  const plainText = dataTransfer.getData('text/plain');
  if (plainText) {
    for (const token of plainText.split(/\s+/)) {
      if (!token.startsWith('file://')) {
        continue;
      }
      const parsed = parseFileUrlToPath(token);
      if (parsed) {
        paths.add(parsed);
      }
    }
  }

  return [...paths];
};

const findFolderNameById = (nodes: FolderNode[], folderId: number): string | null => {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as FolderNode;
    if (node.id === folderId) {
      return node.name;
    }
    stack.push(...node.children);
  }
  return null;
};

export const GalleryPage = ({ onMessage }: GalleryPageProps): React.JSX.Element => {
  const state = useGalleryState();
  const {
    allItems,
    filteredItems,
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
  const importToastIdRef = useRef<string | number | null>(null);
  const exportToastIdRef = useRef<string | number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogItemIds, setMoveDialogItemIds] = useState<string[]>([]);
  const [moveDialogSource, setMoveDialogSource] = useState<'single' | 'bulk'>('single');
  const [isMoveBusy, setIsMoveBusy] = useState(false);

  useEffect(() => {
    void loadFirstPage().then((result) => {
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribeImport = window.electronAPI.onImportProgress((progress) => {
      const description = progress.currentFile
        ? progress.currentFile
        : undefined;
      if (progress.processed < progress.total) {
        const id = importToastIdRef.current ?? toast('Importing files...', {
          duration: Infinity,
        });
        importToastIdRef.current = id;
        toast(`Importing ${progress.processed}/${progress.total}`, {
          id,
          duration: Infinity,
          description,
        });
      } else if (importToastIdRef.current !== null) {
        toast.dismiss(importToastIdRef.current);
        importToastIdRef.current = null;
      }
    });
    const unsubscribeExport = window.electronAPI.onExportProgress((progress) => {
      const description = progress.currentFile
        ? progress.currentFile
        : undefined;
      if (progress.processed < progress.total) {
        const id = exportToastIdRef.current ?? toast('Exporting files...', {
          duration: Infinity,
        });
        exportToastIdRef.current = id;
        toast(`Exporting ${progress.processed}/${progress.total}`, {
          id,
          duration: Infinity,
          description,
        });
      } else if (exportToastIdRef.current !== null) {
        toast.dismiss(exportToastIdRef.current);
        exportToastIdRef.current = null;
      }
    });
    return () => {
      if (importToastIdRef.current !== null) {
        toast.dismiss(importToastIdRef.current);
        importToastIdRef.current = null;
      }
      if (exportToastIdRef.current !== null) {
        toast.dismiss(exportToastIdRef.current);
        exportToastIdRef.current = null;
      }
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

  const resolveContextTargetIds = (clickedItemId: string): string[] => {
    if (!isMultiSelect || selectedItemIds.length <= 1) {
      return [clickedItemId];
    }
    if (selectedItemIds.includes(clickedItemId)) {
      return selectedItemIds;
    }
    return [clickedItemId];
  };

  const handleItemContextMenu = (itemId: string): void => {
    setSelectedItems(resolveContextTargetIds(itemId));
  };

  const handleEmptyBackgroundClick = (): void => {
    if (selectedItemIds.length === 0) {
      return;
    }
    clearSelection();
    setIsMultiSelect(false);
  };

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSortChange = async (nextSort: VaultListSort): Promise<void> => {
    const wasMultiSelect = isMultiSelect;
    const result = await loadFirstPage(nextSort);
    if (!wasMultiSelect) {
      // Guard against accidental click-through toggling multi-select during sort changes.
      setIsMultiSelect(false);
    }
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

  const handleDeleteByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) {
      toast.warning('Select items to delete.');
      return;
    }
    const confirmed = window.confirm(
      itemIds.length === 1
        ? 'Delete this item? This cannot be undone.'
        : `Delete ${itemIds.length} item(s)? This cannot be undone.`,
    );
    if (!confirmed) return;

    for (const itemId of itemIds) {
      const result = await window.electronAPI.deleteVaultItem({ itemId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (viewerItemId === itemId) {
        setViewerItemId(null);
      }
    }

    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
    else toast.success(itemIds.length === 1 ? 'Item deleted.' : 'Items deleted.');
  };

  const handleDeleteItem = async (itemId: string): Promise<void> => {
    await handleDeleteByIds([itemId]);
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

  const handleExportByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) {
      toast.warning('Select items to export.');
      return;
    }
    const result = await window.electronAPI.exportItems({ itemIds, targetDir: '' });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(itemIds.length === 1 ? 'Exported.' : `Exported ${result.data.exported} file(s).`);
  };

  const handleExportItem = async (itemId: string): Promise<void> => {
    await handleExportByIds([itemId]);
  };

  const handleExportSelected = async (): Promise<void> => {
    await handleExportByIds(selectedItemIds);
  };

  const handleDeleteSelected = async (): Promise<void> => {
    await handleDeleteByIds(selectedItemIds);
    clearSelection();
  };

  const handleToggleFavoriteByIds = async (itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) return;
    const targetItems = filteredItems.filter((item) => itemIds.includes(item.id));
    const allFavorite = targetItems.length > 0 && targetItems.every((item) => item.isFavorite);
    for (const item of targetItems) {
      const result = await window.electronAPI.toggleFavorite({ itemId: item.id, isFavorite: !allFavorite });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
    }
    const refreshed = await refresh();
    if (!refreshed.ok) toast.error(refreshed.error);
  };

  const handleToggleFavoriteSelected = async (): Promise<void> => {
    await handleToggleFavoriteByIds(selectedItemIds);
  };

  const openMoveDialogForIds = (itemIds: string[]): void => {
    if (itemIds.length === 0) {
      toast.warning('Select items to move.');
      return;
    }
    setMoveDialogSource(itemIds.length > 1 ? 'bulk' : 'single');
    setMoveDialogItemIds(itemIds);
    setMoveDialogOpen(true);
  };

  const openSingleMoveDialog = (itemId: string): void => {
    openMoveDialogForIds([itemId]);
  };

  const openBulkMoveDialog = (): void => {
    openMoveDialogForIds(selectedItemIds);
  };

  const handleOpenViewerForIds = (itemIds: string[]): void => {
    if (itemIds.length !== 1) {
      return;
    }
    handleOpenViewer(itemIds[0]);
  };

  const handleConfirmMoveDialog = async (folderId: number | null, itemIds: string[]): Promise<void> => {
    if (itemIds.length === 0) {
      return;
    }

    setIsMoveBusy(true);
    try {
      if (moveDialogSource === 'bulk') {
        const result = await window.electronAPI.assignItemsFolder({ itemIds, folderId });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      } else {
        const result = await window.electronAPI.assignItemFolder({ itemId: itemIds[0], folderId });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }

      if (folderId !== null) {
        setSelectedFolderId(folderId);
      }

      const refreshed = await refresh();
      if (!refreshed.ok) {
        toast.error(refreshed.error);
        return;
      }

      const destinationLabel =
        folderId === null ? 'Unfiled' : findFolderNameById(folders, folderId) ?? 'selected folder';

      if (moveDialogSource === 'bulk') {
        toast.success(`Moved ${itemIds.length} item(s) to ${destinationLabel}.`);
      } else {
        toast.success(`Moved to ${destinationLabel}.`);
      }
      setMoveDialogOpen(false);
      setMoveDialogItemIds([]);
    } finally {
      setIsMoveBusy(false);
    }
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

  const handleOpenViewer = (itemId: string): void => {
    setSelectedItems([itemId]);
    setViewerItemId(itemId);
  };

  const detailsPanelProps = {
    item: selectedItem,
    tags,
    securitySettings,
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
        const files = extractDroppedFilePaths(e.dataTransfer);
        if (files.length === 0) {
          toast.error('No local file paths detected from drop. Please use Import button for this source.');
          return;
        }
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

      {/* Search section */}
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
          onOpenBulkMoveDialog={openBulkMoveDialog}
          onRefresh={() => void handleRefresh()}
          isBusy={isLoading}
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
          showSearchRow
          showActionRow={false}
        />

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

      {/* Functional section */}
      <div className="border-b border-border px-4 py-2">
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
          onOpenBulkMoveDialog={openBulkMoveDialog}
          onRefresh={() => void handleRefresh()}
          isBusy={isLoading}
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
          showSearchRow={false}
          showActionRow
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
              onSetSelectedItems={setSelectedItems}
              onBeginMarqueeSelection={() => setIsMultiSelect(true)}
              onEmptyBackgroundClick={handleEmptyBackgroundClick}
              onOpenItem={handleOpenViewer}
              onToggleFavorite={(itemId, isFavorite) => void handleToggleFavorite(itemId, isFavorite)}
              onContextMenuOpen={handleItemContextMenu}
              contextTargetIdsForItem={resolveContextTargetIds}
              onOpenViewerForIds={handleOpenViewerForIds}
              onToggleFavoriteForIds={(itemIds) => void handleToggleFavoriteByIds(itemIds)}
              onOpenMoveDialogForIds={openMoveDialogForIds}
              onExportForIds={(itemIds) => void handleExportByIds(itemIds)}
              onDeleteForIds={(itemIds) => void handleDeleteByIds(itemIds)}
              isOpenViewerDisabledForItem={(itemId) => resolveContextTargetIds(itemId).length > 1}
              onOpenMoveDialog={openSingleMoveDialog}
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
              onSetSelectedItems={setSelectedItems}
              onBeginMarqueeSelection={() => setIsMultiSelect(true)}
              onEmptyBackgroundClick={handleEmptyBackgroundClick}
              onOpenItem={handleOpenViewer}
              onToggleFavorite={(itemId, isFavorite) => void handleToggleFavorite(itemId, isFavorite)}
              onContextMenuOpen={handleItemContextMenu}
              contextTargetIdsForItem={resolveContextTargetIds}
              onOpenViewerForIds={handleOpenViewerForIds}
              onToggleFavoriteForIds={(itemIds) => void handleToggleFavoriteByIds(itemIds)}
              onOpenMoveDialogForIds={openMoveDialogForIds}
              onExportForIds={(itemIds) => void handleExportByIds(itemIds)}
              onDeleteForIds={(itemIds) => void handleDeleteByIds(itemIds)}
              isOpenViewerDisabledForItem={(itemId) => resolveContextTargetIds(itemId).length > 1}
              onOpenMoveDialog={openSingleMoveDialog}
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

      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        folders={folders}
        itemIds={moveDialogItemIds}
        onConfirm={handleConfirmMoveDialog}
        title={moveDialogSource === 'bulk' ? 'Move selected items' : 'Move item'}
        isBusy={isMoveBusy}
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

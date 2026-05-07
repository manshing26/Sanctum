import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FolderNode,
  SecuritySettings,
  TagSummary,
  VaultItemSummary,
  VaultListSort,
} from '../../../../shared/ipc';

const ALL_ITEMS_LIMIT = 5000;
const THUMBNAIL_BATCH_SIZE = 20;

const collectDescendantIds = (nodes: FolderNode[], rootId: number): Set<number> => {
  const map = new Map<number, FolderNode>();
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as FolderNode;
    map.set(node.id, node);
    stack.push(...node.children);
  }

  const result = new Set<number>();
  const queue: number[] = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift() as number;
    if (result.has(currentId)) {
      continue;
    }

    result.add(currentId);
    const current = map.get(currentId);
    if (!current) {
      continue;
    }

    for (const child of current.children) {
      queue.push(child.id);
    }
  }

  return result;
};

export const useGalleryState = () => {
  const [allItems, setAllItems] = useState<VaultItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    secureDeleteOnImport: false,
    autoLockMinutes: 10,
    lockOnMinimize: true,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<VaultListSort>('newest');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedViewScope, setSelectedViewScope] = useState<'all' | 'video' | 'image' | 'root' | 'folder'>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [secureDelete, setSecureDelete] = useState(false);
  const [importFolderId, setImportFolderId] = useState<number | null>(null);

  const hydrateThumbnails = useCallback(async (items: VaultItemSummary[]): Promise<void> => {
    const missing = items.filter((item) => item.hasThumbnail && !thumbnails[item.id]);
    if (missing.length === 0) return;

    for (let i = 0; i < missing.length; i += THUMBNAIL_BATCH_SIZE) {
      const batch = missing.slice(i, i + THUMBNAIL_BATCH_SIZE);
      const entries = await Promise.all(
        batch.map(async (item) => {
          const result = await window.electronAPI.getItemThumbnail(item.id);
          if (!result.ok) return null;
          return [
            item.id,
            `data:${result.data.mimeType};base64,${result.data.base64Data}`,
          ] as const;
        }),
      );
      setThumbnails((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    }
  }, [thumbnails]);

  const loadSupportingData = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const [foldersResult, tagsResult, securityResult] = await Promise.all([
      window.electronAPI.listFoldersTree(),
      window.electronAPI.listTags(),
      window.electronAPI.getSecuritySettings(),
    ]);

    if (!foldersResult.ok) {
      return { ok: false, error: foldersResult.error };
    }
    if (!tagsResult.ok) {
      return { ok: false, error: tagsResult.error };
    }
    if (!securityResult.ok) {
      return { ok: false, error: securityResult.error };
    }

    setFolders(foldersResult.data);
    setTags(tagsResult.data);
    setSecuritySettings(securityResult.data);
    return { ok: true };
  }, []);

  const loadFirstPage = useCallback(async (
    sortOverride?: VaultListSort,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    setIsLoading(true);
    try {
      const effectiveSort = sortOverride ?? sort;
      if (sortOverride && sortOverride !== sort) {
        setSort(sortOverride);
      }

      const [itemsResult, supportResult] = await Promise.all([
        window.electronAPI.listItemsQuery({
          limit: ALL_ITEMS_LIMIT,
          offset: 0,
          sort: effectiveSort,
        }),
        loadSupportingData(),
      ]);

      if (!itemsResult.ok) {
        return { ok: false, error: itemsResult.error };
      }
      if (!supportResult.ok) {
        return supportResult;
      }

      setAllItems(itemsResult.data.items);
      setSelectedItemIds((prev) => {
        const visible = new Set(itemsResult.data.items.map((item) => item.id));
        const kept = prev.filter((id) => visible.has(id));
        if (kept.length > 0) return kept;
        const fallback = itemsResult.data.items[0]?.id;
        return fallback ? [fallback] : [];
      });
      setPrimarySelectedId((prev) => {
        if (!prev) return itemsResult.data.items[0]?.id ?? null;
        return itemsResult.data.items.some((item) => item.id === prev)
          ? prev
          : itemsResult.data.items[0]?.id ?? null;
      });

      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [sort, loadSupportingData]);

  const refresh = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    return loadFirstPage();
  }, [loadFirstPage]);

  const descendantSet = useMemo(() => {
    if (selectedViewScope !== 'folder' || selectedFolderId === null) {
      return null;
    }
    return collectDescendantIds(folders, selectedFolderId);
  }, [folders, selectedFolderId, selectedViewScope]);

  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return allItems.filter((item) => {
      if (selectedViewScope === 'folder') {
        if (descendantSet && !descendantSet.has(item.folderId ?? -1)) {
          return false;
        }
      } else if (selectedViewScope === 'root') {
        if (item.folderId !== undefined && item.folderId !== null) {
          return false;
        }
      } else if (selectedViewScope === 'video') {
        if (!item.mimeType.startsWith('video/')) {
          return false;
        }
      } else if (selectedViewScope === 'image') {
        if (!item.mimeType.startsWith('image/')) {
          return false;
        }
      }

      if (
        selectedTagIds.length > 0 &&
        !selectedTagIds.every((tagId) => item.tagIds?.includes(tagId))
      ) {
        return false;
      }

      if (search) {
        const haystack = [
          item.originalName,
          ...(item.tags ?? []),
          item.folderPath ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }

      if (showFavoritesOnly && !item.isFavorite) {
        return false;
      }

      return true;
    });
  }, [allItems, descendantSet, selectedTagIds, searchTerm, showFavoritesOnly, selectedViewScope]);

  const selectedItem = useMemo(() => {
    if (primarySelectedId) {
      const primary = filteredItems.find((item) => item.id === primarySelectedId);
      if (primary) {
        return primary;
      }
    }
    const firstSelected = selectedItemIds
      .map((id) => filteredItems.find((item) => item.id === id))
      .find((item): item is VaultItemSummary => Boolean(item));
    return firstSelected ?? filteredItems[0] ?? null;
  }, [filteredItems, primarySelectedId, selectedItemIds]);

  useEffect(() => {
    if (selectedItemIds.length === 0) {
      if (primarySelectedId !== null) {
        setPrimarySelectedId(null);
      }
      return;
    }

    const visibleIds = new Set(filteredItems.map((item) => item.id));
    const nextSelected = selectedItemIds.filter((id) => visibleIds.has(id));
    if (nextSelected.length !== selectedItemIds.length) {
      setSelectedItemIds(nextSelected);
    }
    if (primarySelectedId && !visibleIds.has(primarySelectedId)) {
      setPrimarySelectedId(nextSelected[0] ?? null);
    }
  }, [filteredItems, selectedItemIds, primarySelectedId]);

  const toggleSelectedItem = useCallback((itemId: string): void => {
    setSelectedItemIds((prev) => {
      if (prev.includes(itemId)) {
        const next = prev.filter((id) => id !== itemId);
        setPrimarySelectedId((current) => (current === itemId ? next[0] ?? null : current));
        return next;
      }
      setPrimarySelectedId(itemId);
      return [...prev, itemId];
    });
  }, []);

  const setSelectedItems = useCallback((itemIds: string[]): void => {
    const unique = Array.from(new Set(itemIds));
    setSelectedItemIds(unique);
    setPrimarySelectedId(unique[unique.length - 1] ?? null);
  }, []);

  const clearSelection = useCallback((): void => {
    setSelectedItemIds([]);
    setPrimarySelectedId(null);
  }, []);

  return {
    allItems,
    filteredItems,
    isLoading,
    thumbnails,
    hydrateThumbnails,
    folders,
    tags,
    securitySettings,
    searchTerm,
    sort,
    selectedFolderId,
    selectedViewScope,
    selectedTagIds,
    selectedItem,
    selectedItemIds,
    primarySelectedId,
    showFavoritesOnly,
    secureDelete,
    importFolderId,
    setSearchTerm,
    setSort,
    setSelectedFolderId,
    setSelectedViewScope,
    setSelectedTagIds,
    toggleSelectedItem,
    setSelectedItems,
    clearSelection,
    setShowFavoritesOnly,
    setSecuritySettings,
    setSecureDelete,
    setImportFolderId,
    setFolders,
    setTags,
    loadFirstPage,
    refresh,
    loadSupportingData,
  };
};

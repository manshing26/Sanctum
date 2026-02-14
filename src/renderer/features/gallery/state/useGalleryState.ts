import { useCallback, useMemo, useState } from 'react';
import type {
  FolderNode,
  SecuritySettings,
  TagSummary,
  VaultItemSummary,
  VaultListSort,
} from '../../../../shared/ipc';

const PAGE_SIZE = 100;

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
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    secureDeleteOnImport: false,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<VaultListSort>('newest');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [deleteOriginalsOverride, setDeleteOriginalsOverride] = useState<
    'default' | 'true' | 'false'
  >('default');
  const [importFolderId, setImportFolderId] = useState<number | null>(null);

  const hydrateThumbnails = useCallback(async (items: VaultItemSummary[]): Promise<void> => {
    const missing = items.filter((item) => item.hasThumbnail && !thumbnails[item.id]);
    if (missing.length === 0) {
      return;
    }

    const entries = await Promise.all(
      missing.map(async (item) => {
        const thumbnailResult = await window.electronAPI.getItemThumbnail(item.id);
        if (!thumbnailResult.ok) {
          return null;
        }
        return [
          item.id,
          `data:${thumbnailResult.data.mimeType};base64,${thumbnailResult.data.base64Data}`,
        ] as const;
      }),
    );

    setThumbnails((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        if (!entry) {
          continue;
        }
        next[entry[0]] = entry[1];
      }
      return next;
    });
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
          limit: PAGE_SIZE,
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
      setTotalItems(itemsResult.data.total);
      setHasMore(itemsResult.data.hasMore);
      setSelectedItemId((prev) => {
        if (!prev) {
          return itemsResult.data.items[0]?.id ?? null;
        }
        return itemsResult.data.items.some((item) => item.id === prev)
          ? prev
          : itemsResult.data.items[0]?.id ?? null;
      });

      await hydrateThumbnails(itemsResult.data.items);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [sort, loadSupportingData, hydrateThumbnails]);

  const loadMore = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!hasMore || isLoading) {
      return { ok: true };
    }

    setIsLoading(true);
    try {
      const offset = allItems.length;
      const itemsResult = await window.electronAPI.listItemsQuery({
        limit: PAGE_SIZE,
        offset,
        sort,
      });

      if (!itemsResult.ok) {
        return { ok: false, error: itemsResult.error };
      }

      const existing = new Set(allItems.map((item) => item.id));
      const appended = itemsResult.data.items.filter((item) => !existing.has(item.id));
      const nextItems = [...allItems, ...appended];

      setAllItems(nextItems);
      setTotalItems(itemsResult.data.total);
      setHasMore(itemsResult.data.hasMore);
      await hydrateThumbnails(appended);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [allItems, hasMore, isLoading, sort, hydrateThumbnails]);

  const refresh = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    return loadFirstPage();
  }, [loadFirstPage]);

  const descendantSet = useMemo(() => {
    if (selectedFolderId === null) {
      return null;
    }
    return collectDescendantIds(folders, selectedFolderId);
  }, [folders, selectedFolderId]);

  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return allItems.filter((item) => {
      if (descendantSet && !descendantSet.has(item.folderId ?? -1)) {
        return false;
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

      return true;
    });
  }, [allItems, descendantSet, selectedTagIds, searchTerm]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedItemId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedItemId],
  );

  return {
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
    selectedItemId,
    deleteOriginalsOverride,
    importFolderId,
    setSearchTerm,
    setSort,
    setSelectedFolderId,
    setSelectedTagIds,
    setSelectedItemId,
    setSecuritySettings,
    setDeleteOriginalsOverride,
    setImportFolderId,
    setFolders,
    setTags,
    loadFirstPage,
    loadMore,
    refresh,
    loadSupportingData,
  };
};

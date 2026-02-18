import React from 'react';
import {
  Search,
  X,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Lock,
  Heart,
  Star,
  ArrowUpDown,
  ChevronDown,
  LayoutGrid,
  List,
} from 'lucide-react';
import type { FolderNode, VaultListSort } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Separator } from '../../../components/ui/Separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../components/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/utils';

type FolderOption = {
  id: number;
  label: string;
};

const flattenFolderOptions = (folders: FolderNode[], depth = 0): FolderOption[] => {
  const result: FolderOption[] = [];
  for (const folder of folders) {
    result.push({
      id: folder.id,
      label: `${'  '.repeat(depth)}${folder.name}`,
    });
    result.push(...flattenFolderOptions(folder.children, depth + 1));
  }
  return result;
};

const SORT_OPTIONS: { value: VaultListSort; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'size_desc', label: 'Largest First' },
  { value: 'size_asc', label: 'Smallest First' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'rating_asc', label: 'Lowest Rated' },
];

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
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
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
  viewMode,
  onViewModeChange,
}: GalleryToolbarProps): React.JSX.Element => {
  const folderOptions = flattenFolderOptions(folders);
  const currentSort = SORT_OPTIONS.find((o) => o.value === sort);

  return (
    <div className="space-y-2">
      {/* Row 1: Search bar (full width) */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search files, tags, folders..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchTermChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-muted hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Row 2: Action buttons */}
      <div className="flex items-center gap-1.5">
        {/* Item count */}
        <span className="mr-auto text-xs text-text-muted">
          {filteredCount === totalItems
            ? `${totalItems} items`
            : `${filteredCount} of ${totalItems}`}
        </span>

        {/* View mode toggle */}
        <div className="flex rounded-md border border-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => onViewModeChange('grid')}
                aria-label="Grid view"
                className="rounded-r-none border-0"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => onViewModeChange('list')}
                aria-label="List view"
                className="rounded-l-none border-0"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </div>

        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Sort">
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={sort === option.value}
                onCheckedChange={() => onSortChange(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Favorites filter */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showFavoritesOnly ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={onToggleFavoritesOnly}
              aria-label="Favorites only"
            >
              <Star className={cn('h-4 w-4', showFavoritesOnly && 'fill-current')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showFavoritesOnly ? 'Show all' : 'Favorites only'}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Import */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={isBusy} className="h-7 gap-1 px-2.5 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Import Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>
              <Upload className="mr-2 h-4 w-4" />
              Select files...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px]">Target folder</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={importFolderId === null}
              onCheckedChange={() => onImportFolderChange(null)}
            >
              Unfiled
            </DropdownMenuCheckboxItem>
            {folderOptions.map((folder) => (
              <DropdownMenuCheckboxItem
                key={folder.id}
                checked={importFolderId === folder.id}
                onCheckedChange={() => onImportFolderChange(folder.id)}
              >
                {folder.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px]">Secure delete</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={deleteOriginalsOverride === 'default'}
              onCheckedChange={() => onDeleteOriginalsOverrideChange('default')}
            >
              Use default
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={deleteOriginalsOverride === 'true'}
              onCheckedChange={() => onDeleteOriginalsOverrideChange('true')}
            >
              Force on
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={deleteOriginalsOverride === 'false'}
              onCheckedChange={() => onDeleteOriginalsOverrideChange('false')}
            >
              Force off
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh">
              <RefreshCw className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>

        {/* Lock */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onLock} aria-label="Lock vault">
              <Lock className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lock Vault</TooltipContent>
        </Tooltip>
      </div>

      {/* Row 3: Selection actions (only when items selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[11px]">
            {selectedCount} selected
          </Badge>

          <Separator orientation="vertical" className="h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleFavoriteSelected}
                disabled={isBusy}
                aria-label={allSelectedFavorite ? 'Unfavorite selected' : 'Favorite selected'}
              >
                <Heart className={cn('h-3.5 w-3.5', allSelectedFavorite && 'fill-accent text-accent')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allSelectedFavorite ? 'Unfavorite' : 'Favorite'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onExportSelected}
                disabled={isBusy}
                aria-label="Export selected"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export selected</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="danger"
                size="icon-sm"
                onClick={onDeleteSelected}
                disabled={isBusy}
                aria-label="Delete selected"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete selected</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

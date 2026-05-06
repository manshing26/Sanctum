import React from 'react';
import {
  Search,
  X,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  FolderOpen,
  Heart,
  Star,
  ArrowUpDown,
  LayoutGrid,
  List,
  CheckSquare,
} from 'lucide-react';
import type { VaultListSort } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Separator } from '../../../components/ui/Separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../components/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/utils';

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
  onOpenImportSettings: () => void;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
  onToggleFavoriteSelected: () => void;
  onOpenBulkMoveDialog: () => void;
  onRefresh: () => void;
  isBusy: boolean;
  showFavoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  selectedCount: number;
  allSelectedFavorite: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isMultiSelect: boolean;
  onToggleMultiSelect: () => void;
  showSearchRow?: boolean;
  showActionRow?: boolean;
};

export const GalleryToolbar = ({
  searchTerm,
  onSearchTermChange,
  sort,
  onSortChange,
  onOpenImportSettings,
  onExportSelected,
  onDeleteSelected,
  onToggleFavoriteSelected,
  onOpenBulkMoveDialog,
  onRefresh,
  isBusy,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  selectedCount,
  allSelectedFavorite,
  viewMode,
  onViewModeChange,
  isMultiSelect,
  onToggleMultiSelect,
  showSearchRow = true,
  showActionRow = true,
}: GalleryToolbarProps): React.JSX.Element => {
  return (
    <div className={cn(showSearchRow && showActionRow && 'space-y-2')}>
      {/* Row 1: Search + view/sort/favorites */}
      {showSearchRow && (
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
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

        {/* View mode toggle */}
        <div className="flex shrink-0 rounded-md border border-border">
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
            <Button variant="ghost" size="icon-sm" aria-label="Sort" className="shrink-0">
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
                onSelect={(event) => event.stopPropagation()}
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
              className="shrink-0"
            >
              <Star className={cn('h-4 w-4', showFavoritesOnly && 'fill-current')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showFavoritesOnly ? 'Show all' : 'Favorites only'}</TooltipContent>
        </Tooltip>
      </div>
      )}

      {/* Row 2: Action buttons */}
      {showActionRow && (
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Multi-select toggle */}
          <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isMultiSelect ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={onToggleMultiSelect}
              aria-label={isMultiSelect ? 'Exit Bulk Edit' : 'Bulk Edit'}
              className="shrink-0"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMultiSelect ? 'Exit Bulk Edit' : 'Bulk Edit'}</TooltipContent>
        </Tooltip>

          {isMultiSelect && selectedCount > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-5" />

              <Badge variant="secondary" className="text-[11px]">
                {selectedCount} selected
              </Badge>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={isBusy}
                    aria-label="Move selected"
                    className="shrink-0"
                    onClick={onOpenBulkMoveDialog}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move selected</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggleFavoriteSelected}
                    disabled={isBusy}
                    aria-label={allSelectedFavorite ? 'Unfavorite selected' : 'Favorite selected'}
                    className="shrink-0"
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
                    className="shrink-0"
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
                    className="shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete selected</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={isBusy}
            onClick={onOpenImportSettings}
            className="h-7 shrink-0 gap-1 px-2.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Refresh" className="shrink-0">
                <RefreshCw className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  Library,
  Image as ImageIcon,
  Film,
  Home,
} from 'lucide-react';
import type { FolderNode } from '../../../../shared/ipc';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ScrollArea } from '../../../components/ui/ScrollArea';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/Dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/utils';

type FolderSidebarProps = {
  folders: FolderNode[];
  selectedViewScope: 'all' | 'video' | 'image' | 'root' | 'folder';
  selectedFolderId: number | null;
  onSelectAllItems: () => void;
  onSelectVideo: () => void;
  onSelectImage: () => void;
  onSelectRoot: () => void;
  onSelectFolder: (folderId: number) => void;
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
      label: `${'  '.repeat(depth)}${folder.name}`,
    });
    options.push(...flattenFolders(folder.children, depth + 1));
  }
  return options;
};

// ── Folder tree node ─────────────────────────────────────────────────
const FolderTreeNode: React.FC<{
  folder: FolderNode;
  selectedViewScope: 'all' | 'video' | 'image' | 'root' | 'folder';
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  depth: number;
}> = ({ folder, selectedViewScope, selectedFolderId, onSelectFolder, onDeleteFolder, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = folder.children.length > 0;
  const isActive = selectedViewScope === 'folder' && selectedFolderId === folder.id;

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectFolder(folder.id);
              }
            }}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((prev) => !prev);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-surface-hover"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <Folder className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-text-muted')} />
            <span className="truncate">{folder.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => onDeleteFolder(folder.id)}
            className="text-danger focus:text-danger"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {hasChildren && expanded && (
        <ul className="space-y-0.5">
          {folder.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              selectedViewScope={selectedViewScope}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onDeleteFolder={onDeleteFolder}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

// ── Main Sidebar ─────────────────────────────────────────────────────
export const FolderSidebar = ({
  folders,
  selectedViewScope,
  selectedFolderId,
  onSelectAllItems,
  onSelectVideo,
  onSelectImage,
  onSelectRoot,
  onSelectFolder,
  newFolderName,
  onNewFolderNameChange,
  newFolderParentId,
  onNewFolderParentIdChange,
  onCreateFolder,
  onDeleteFolder,
}: FolderSidebarProps): React.JSX.Element => {
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const parentOptions = flattenFolders(folders);

  const handleCreate = (): void => {
    if (!newFolderName.trim()) return;
    onCreateFolder();
    setShowNewFolderDialog(false);
  };

  return (
    <aside className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="px-2 pt-2 pb-2">
          {/* Library shortcuts */}
          <button
            type="button"
            onClick={onSelectAllItems}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              selectedViewScope === 'all'
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <Library className="h-4 w-4 shrink-0" />
            <span>All Items</span>
          </button>
          <button
            type="button"
            onClick={onSelectVideo}
            className={cn(
              'mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              selectedViewScope === 'video'
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <Film className="h-4 w-4 shrink-0" />
            <span>Video</span>
          </button>
          <button
            type="button"
            onClick={onSelectImage}
            className={cn(
              'mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              selectedViewScope === 'image'
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span>Image</span>
          </button>

          {/* Folder tree */}
          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Folders</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowNewFolderDialog(true)}
                    aria-label="New folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New folder</TooltipContent>
              </Tooltip>
            </div>
            <button
              type="button"
              onClick={onSelectRoot}
              className={cn(
                'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                selectedViewScope === 'root'
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              <Home className="h-4 w-4 shrink-0" />
              <span>Root</span>
            </button>
            {folders.length > 0 ? (
              <ul className="space-y-0.5">
                {folders.map((folder) => (
                  <FolderTreeNode
                    key={folder.id}
                    folder={folder}
                    selectedViewScope={selectedViewScope}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    onDeleteFolder={onDeleteFolder}
                    depth={0}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-4 text-xs text-text-muted/60">No folders yet</p>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Create a new folder to organize your vault items.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Folder name</label>
              <Input
                value={newFolderName}
                onChange={(e) => onNewFolderNameChange(e.target.value)}
                placeholder="My folder"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Parent folder</label>
              <select
                value={newFolderParentId ?? 'root'}
                onChange={(e) =>
                  onNewFolderParentIdChange(e.target.value === 'root' ? null : Number(e.target.value))
                }
                className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                <option value="root">Root (no parent)</option>
                {parentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewFolderDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newFolderName.trim()}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Search } from 'lucide-react';
import type { FolderNode } from '../../../../shared/ipc';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/Dialog';
import { ScrollArea } from '../../../components/ui/ScrollArea';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';

type MoveToFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderNode[];
  itemIds: string[];
  onConfirm: (folderId: number | null, itemIds: string[]) => Promise<void>;
  title?: string;
  isBusy?: boolean;
};

const filterFolderTree = (nodes: FolderNode[], searchLower: string): FolderNode[] => {
  if (!searchLower) {
    return nodes;
  }

  const result: FolderNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterFolderTree(node.children, searchLower);
    const selfMatches = node.name.toLowerCase().includes(searchLower);
    if (selfMatches || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren,
      });
    }
  }
  return result;
};

const collectAllFolderIds = (nodes: FolderNode[]): Set<number> => {
  const ids = new Set<number>();
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as FolderNode;
    ids.add(node.id);
    stack.push(...node.children);
  }
  return ids;
};

export const MoveToFolderDialog = ({
  open,
  onOpenChange,
  folders,
  itemIds,
  onConfirm,
  title,
  isBusy = false,
}: MoveToFolderDialogProps): React.JSX.Element => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<number | null | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      return;
    }
    setSearchTerm('');
    setSelectedDestination(undefined);
    setExpandedIds(collectAllFolderIds(folders));
  }, [open, folders]);

  const searchLower = searchTerm.trim().toLowerCase();
  const visibleFolders = useMemo(
    () => filterFolderTree(folders, searchLower),
    [folders, searchLower],
  );

  useEffect(() => {
    if (!searchLower) {
      return;
    }
    setExpandedIds(collectAllFolderIds(visibleFolders));
  }, [searchLower, visibleFolders]);

  const toggleExpanded = (folderId: number): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleConfirm = async (): Promise<void> => {
    if (selectedDestination === undefined || itemIds.length === 0 || isBusy) {
      return;
    }
    await onConfirm(selectedDestination, itemIds);
  };

  const FolderTreeNode: React.FC<{ node: FolderNode; depth: number }> = ({ node, depth }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedDestination === node.id;

    return (
      <li>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-primary',
            isSelected ? 'bg-accent/15 text-accent' : 'hover:bg-surface-hover',
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            onClick={() => (hasChildren ? toggleExpanded(node.id) : undefined)}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded',
              hasChildren ? 'hover:bg-surface-hover' : 'opacity-0 pointer-events-none',
            )}
            aria-label={hasChildren ? (isExpanded ? 'Collapse folder' : 'Expand folder') : undefined}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDestination(node.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <FolderOpen className={cn('h-4 w-4 shrink-0', isSelected ? 'text-accent' : 'text-text-muted')} />
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <ul className="space-y-0.5">
            {node.children.map((child) => (
              <FolderTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!isBusy ? onOpenChange(nextOpen) : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? 'Move to Folder'}</DialogTitle>
          <DialogDescription>
            Choose destination folder for {itemIds.length} item{itemIds.length === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search folders..."
              className="h-9 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          <div className="rounded-md border border-border">
            <ScrollArea className="max-h-72 p-2">
              <button
                type="button"
                onClick={() => setSelectedDestination(null)}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  selectedDestination === null
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-primary hover:bg-surface-hover',
                )}
              >
                <FolderOpen className={cn('h-4 w-4', selectedDestination === null ? 'text-accent' : 'text-text-muted')} />
                <span>Root</span>
              </button>

              {visibleFolders.length > 0 ? (
                <ul className="space-y-0.5">
                  {visibleFolders.map((folder) => (
                    <FolderTreeNode key={folder.id} node={folder} depth={0} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-4 text-xs text-text-muted">No folders match your search.</p>
              )}
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={selectedDestination === undefined || itemIds.length === 0 || isBusy}
          >
            {isBusy ? 'Moving...' : 'Move'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

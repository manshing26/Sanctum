import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Search, Upload } from 'lucide-react';
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
import { Label } from '../../../components/ui/Label';
import { Switch } from '../../../components/ui/Switch';
import { Separator } from '../../../components/ui/Separator';
import { cn } from '../../../lib/utils';

type ImportSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderNode[];
  importFolderId: number | null;
  onImportFolderChange: (folderId: number | null) => void;
  secureDelete: boolean;
  onSecureDeleteChange: (value: boolean) => void;
  onImport: () => void;
};

const filterFolderTree = (nodes: FolderNode[], searchLower: string): FolderNode[] => {
  if (!searchLower) return nodes;
  const result: FolderNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterFolderTree(node.children, searchLower);
    if (node.name.toLowerCase().includes(searchLower) || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
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

export const ImportSettingsDialog = ({
  open,
  onOpenChange,
  folders,
  importFolderId,
  onImportFolderChange,
  secureDelete,
  onSecureDeleteChange,
  onImport,
}: ImportSettingsDialogProps): React.JSX.Element => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSearchTerm('');
    setExpandedIds(collectAllFolderIds(folders));
  }, [open, folders]);

  const searchLower = searchTerm.trim().toLowerCase();
  const visibleFolders = useMemo(
    () => filterFolderTree(folders, searchLower),
    [folders, searchLower],
  );

  useEffect(() => {
    if (!searchLower) return;
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

  const selectedFolderName =
    importFolderId === null
      ? 'Root'
      : (function findName(nodes: FolderNode[]): string | null {
          for (const node of nodes) {
            if (node.id === importFolderId) return node.name;
            const found = findName(node.children);
            if (found) return found;
          }
          return null;
        })(folders) ?? 'Root';

  const FolderTreeNode: React.FC<{ node: FolderNode; depth: number }> = ({ node, depth }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = importFolderId === node.id;

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
              hasChildren ? 'hover:bg-surface-hover' : 'pointer-events-none opacity-0',
            )}
          >
            {hasChildren
              ? isExpanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />
              : null}
          </button>
          <button
            type="button"
            onClick={() => onImportFolderChange(node.id)}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Settings</DialogTitle>
          <DialogDescription>
            Choose a target folder and secure-delete option before selecting files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Folder picker */}
          <div className="space-y-2">
            <Label className="text-xs text-text-muted">Target folder</Label>
            <div className="space-y-1.5">
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
                <div className="h-56">
                  <ScrollArea className="h-full p-2">
                    <button
                      type="button"
                      onClick={() => onImportFolderChange(null)}
                      className={cn(
                        'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                        importFolderId === null
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-primary hover:bg-surface-hover',
                      )}
                    >
                      <FolderOpen className={cn('h-4 w-4', importFolderId === null ? 'text-accent' : 'text-text-muted')} />
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
              <p className="text-xs text-text-muted">
                Selected: <span className="font-medium text-text-primary">{selectedFolderName}</span>
              </p>
            </div>
          </div>

          {/* Secure delete */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Secure delete originals</Label>
              <p className="text-xs text-text-muted">
                Overwrite source files with 3-pass erase after importing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex min-w-[46px] justify-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                  secureDelete
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-border bg-bg text-text-muted',
                )}
              >
                {secureDelete ? 'On' : 'Off'}
              </span>
              <Switch checked={secureDelete} onCheckedChange={onSecureDeleteChange} />
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onImport();
            }}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            Select files…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

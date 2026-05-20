import React, { useEffect, useMemo, useState } from 'react';
import type { FolderNode } from '../../../../shared/ipc';
import { fontSize } from '../../../theme/typography';

const T = {
  bg:         '#0a0c0b',
  bg2:        '#10110f',
  line:       'rgba(220,220,200,0.07)',
  line2:      'rgba(220,220,200,0.12)',
  text:       '#e8e6dc',
  mute:       '#79817a',
  mute2:      '#4d524d',
  accent:     '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.12)',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type MoveToFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderNode[];
  itemIds: string[];
  objectCount?: number;
  onConfirm: (folderId: number | null, itemIds: string[]) => Promise<void>;
  title?: string;
  isBusy?: boolean;
};

const filterFolderTree = (nodes: FolderNode[], searchLower: string): FolderNode[] => {
  if (!searchLower) return nodes;
  const result: FolderNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterFolderTree(node.children, searchLower);
    if (node.name.toLowerCase().includes(searchLower) || filteredChildren.length > 0)
      result.push({ ...node, children: filteredChildren });
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
  objectCount,
  onConfirm,
  title,
  isBusy = false,
}: MoveToFolderDialogProps): React.JSX.Element => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<number | null | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSearchTerm('');
    setSelectedDestination(undefined);
    setExpandedIds(collectAllFolderIds(folders));
  }, [open, folders]);

  const searchLower = searchTerm.trim().toLowerCase();
  const visibleFolders = useMemo(() => filterFolderTree(folders, searchLower), [folders, searchLower]);

  useEffect(() => {
    if (!searchLower) return;
    setExpandedIds(collectAllFolderIds(visibleFolders));
  }, [searchLower, visibleFolders]);

  const toggleExpanded = (id: number): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async (): Promise<void> => {
    if (selectedDestination === undefined || (objectCount ?? itemIds.length) === 0 || isBusy) return;
    await onConfirm(selectedDestination, itemIds);
  };

  const FolderTreeNode: React.FC<{ node: FolderNode; depth: number }> = ({ node, depth }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedDestination === node.id;

    return (
      <li style={{ listStyle: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: 8 + depth * 14,
          paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          background: isSelected ? T.accentGlow : 'none',
          borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`,
          cursor: 'pointer',
        }}>
          <button
            type="button"
            onClick={() => hasChildren && toggleExpanded(node.id)}
            style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: T.mute2, padding: 0, flexShrink: 0, opacity: hasChildren ? 1 : 0 }}
            aria-label={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : undefined}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {isExpanded
                ? <polyline points="1,2.5 4,5.5 7,2.5"/>
                : <polyline points="2.5,1 5.5,4 2.5,7"/>
              }
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setSelectedDestination(node.id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0, padding: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={isSelected ? T.accent : T.mute2} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 3.5h5l1.5 1.5H13v7H1z"/>
            </svg>
            <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: isSelected ? T.accent : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <ul style={{ margin: 0, padding: 0 }}>
            {node.children.map((child) => (
              <FolderTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  if (!open) return <></>;

  const visibleCount = objectCount ?? itemIds.length;
  const canConfirm = selectedDestination !== undefined && visibleCount > 0 && !isBusy;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
      onClick={() => { if (!isBusy) onOpenChange(false); }}
    >
      <div
        style={{ width: 480, background: T.bg2, border: `1px solid ${T.line2}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(20), color: T.text, margin: '0 0 4px' }}>{title ?? 'Move to Folder'}</p>
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>
            Choose destination for {visibleCount} item{visibleCount === 1 ? '' : 's'}.
          </p>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px 0', position: 'relative' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={T.mute2} strokeWidth="1.4" strokeLinecap="round" style={{ position: 'absolute', left: 34, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', marginTop: 6 }}>
            <circle cx="5" cy="5" r="3.5"/><line x1="8" y1="8" x2="11" y2="11"/>
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search folders…"
            style={{ width: '100%', height: 30, paddingLeft: 28, paddingRight: 10, background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Folder tree */}
        <div style={{ margin: '10px 24px 0', border: `1px solid ${T.line}`, height: 240, overflowY: 'auto', background: T.bg }}>
          {/* Root option */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px 5px 22px',
              background: selectedDestination === null ? T.accentGlow : 'none',
              borderLeft: `2px solid ${selectedDestination === null ? T.accent : 'transparent'}`,
              borderBottom: `1px solid ${T.line}`,
              cursor: 'pointer',
            }}
            onClick={() => setSelectedDestination(null)}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={selectedDestination === null ? T.accent : T.mute2} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 3.5h5l1.5 1.5H13v7H1z"/>
            </svg>
            <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: selectedDestination === null ? T.accent : T.text }}>Root</span>
          </div>
          {visibleFolders.length > 0 ? (
            <ul style={{ margin: 0, padding: 0 }}>
              {visibleFolders.map((f) => <FolderTreeNode key={f.id} node={f} depth={0} />)}
            </ul>
          ) : (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, padding: '12px 16px', margin: 0 }}>No folders match your search.</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px 18px' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
            style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isBusy ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            style={{ height: 32, padding: '0 14px', background: canConfirm ? T.accent : T.accentGlow, border: `1px solid ${T.accent}`, color: canConfirm ? T.bg : T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: canConfirm ? 'pointer' : 'default' }}
          >
            {isBusy ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
};

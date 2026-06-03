import React, { useEffect, useMemo, useState } from 'react';
import type { FolderNode } from '../../../../shared/ipc';
import { SanctumConfirmDialog } from '../../../components/ui';
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
  danger:     '#c36b5f',
  dangerGlow: 'rgba(195,107,95,0.10)',
};
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

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

const findFolderName = (nodes: FolderNode[], id: number): string | null => {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const found = findFolderName(node.children, id);
    if (found) return found;
  }
  return null;
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
  const [confirmSecureDelete, setConfirmSecureDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearchTerm('');
    setExpandedIds(collectAllFolderIds(folders));
    setConfirmSecureDelete(false);
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

  const selectedFolderName = importFolderId === null ? 'Root' : (findFolderName(folders, importFolderId) ?? 'Root');

  const FolderTreeNode: React.FC<{ node: FolderNode; depth: number }> = ({ node, depth }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = importFolderId === node.id;

    return (
      <li style={{ listStyle: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: 8 + depth * 14, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          background: isSelected ? T.accentGlow : 'none',
          borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`,
        }}>
          <button
            type="button"
            onClick={() => hasChildren && toggleExpanded(node.id)}
            style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: T.mute2, padding: 0, flexShrink: 0, opacity: hasChildren ? 1 : 0 }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {isExpanded ? <polyline points="1,2.5 4,5.5 7,2.5"/> : <polyline points="2.5,1 5.5,4 2.5,7"/>}
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onImportFolderChange(node.id)}
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
            {node.children.map((child) => <FolderTreeNode key={child.id} node={child} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  if (!open) return <></>;

  const requestImport = (): void => {
    if (secureDelete) {
      setConfirmSecureDelete(true);
      return;
    }

    onOpenChange(false);
    onImport();
  };

  const continueSecureDeleteImport = (): void => {
    setConfirmSecureDelete(false);
    onOpenChange(false);
    onImport();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{ width: 500, background: T.bg2, border: `1px solid ${T.line2}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(20), color: T.text, margin: '0 0 4px' }}>Import Settings</p>
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>Choose a target folder and secure-delete option before selecting files.</p>
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Folder picker */}
          <div>
            <p style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, margin: '0 0 8px' }}>Target folder</p>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={T.mute2} strokeWidth="1.4" strokeLinecap="round" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
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

            {/* Tree */}
            <div style={{ border: `1px solid ${T.line}`, height: 200, overflowY: 'auto', background: T.bg }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px 5px 22px',
                  background: importFolderId === null ? T.accentGlow : 'none',
                  borderLeft: `2px solid ${importFolderId === null ? T.accent : 'transparent'}`,
                  borderBottom: `1px solid ${T.line}`,
                  cursor: 'pointer',
                }}
                onClick={() => onImportFolderChange(null)}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={importFolderId === null ? T.accent : T.mute2} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3.5h5l1.5 1.5H13v7H1z"/>
                </svg>
                <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: importFolderId === null ? T.accent : T.text }}>Root</span>
              </div>
              {visibleFolders.length > 0 ? (
                <ul style={{ margin: 0, padding: 0 }}>
                  {visibleFolders.map((f) => <FolderTreeNode key={f.id} node={f} depth={0} />)}
                </ul>
              ) : (
                <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, padding: '10px 16px', margin: 0 }}>No folders match your search.</p>
              )}
            </div>
            <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, margin: '5px 0 0' }}>
              Selected: <span style={{ color: T.text }}>{selectedFolderName}</span>
            </p>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: T.line }} />

          {/* Secure delete */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.text, margin: '0 0 3px' }}>Secure delete originals</p>
              <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0 }}>Overwrite source files with 3-pass erase after importing.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{
                fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '2px 8px',
                border: `1px solid ${secureDelete ? T.danger : T.line2}`,
                background: secureDelete ? T.dangerGlow : 'none',
                color: secureDelete ? T.danger : T.mute,
              }}>
                {secureDelete ? 'On' : 'Off'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={secureDelete}
                onClick={() => onSecureDeleteChange(!secureDelete)}
                style={{
                  width: 36, height: 20, position: 'relative',
                  background: secureDelete ? T.danger : T.line2,
                  border: `1px solid ${secureDelete ? T.danger : T.line2}`,
                  cursor: 'pointer', padding: 0, transition: 'background 0.15s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: secureDelete ? 17 : 2,
                  width: 14, height: 14,
                  background: secureDelete ? T.bg : T.mute,
                  transition: 'left 0.15s',
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 24px 18px', borderTop: `1px solid ${T.line}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{ height: 32, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={requestImport}
            style={{ height: 32, padding: '0 14px', background: T.accent, border: `1px solid ${T.accent}`, color: T.bg, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,6.5 7,3.5 10,6.5"/><line x1="7" y1="3.5" x2="7" y2="11"/><line x1="2" y1="12.5" x2="12" y2="12.5"/>
            </svg>
            Select files…
          </button>
        </div>
      </div>

      <SanctumConfirmDialog
        open={confirmSecureDelete}
        onOpenChange={setConfirmSecureDelete}
        title="Secure Delete Originals"
        description="Source files will be overwritten and deleted after successful import. This cannot be undone."
        variant="danger"
        confirmLabel="Continue"
        onConfirm={continueSecureDeleteImport}
        zIndex={10000}
      />
    </div>
  );
};

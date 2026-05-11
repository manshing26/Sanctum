import React, { useState } from 'react';
import type { FolderNode } from '../../../../shared/ipc';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../../components/ui/ContextMenu';

const T = {
  bg: '#0a0c0b',
  line: 'rgba(220,220,200,0.07)',
  line2: 'rgba(220,220,200,0.12)',
  text: '#e8e6dc',
  mute: '#79817a',
  mute2: '#4d524d',
  accent: '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.15)',
  danger: '#c36b5f',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

type FolderSidebarProps = {
  folders: FolderNode[];
  selectedViewScope: 'all' | 'video' | 'image' | 'root' | 'folder' | 'bookmark';
  selectedFolderId: number | null;
  onSelectAllItems: () => void;
  onSelectVideo: () => void;
  onSelectImage: () => void;
  onSelectRoot: () => void;
  onSelectFolder: (folderId: number) => void;
  onSelectBookmarks?: () => void;
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
    options.push({ id: folder.id, label: `${'  '.repeat(depth)}${folder.name}` });
    options.push(...flattenFolders(folder.children, depth + 1));
  }
  return options;
};

const scopeRow = (
  label: string,
  active: boolean,
  onClick: () => void,
  icon: React.ReactNode,
): React.ReactNode => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      gap: 8,
      padding: '6px 16px',
      background: active ? T.accentGlow : 'none',
      border: 'none',
      borderLeft: active ? `2px solid ${T.accent}` : '2px solid transparent',
      cursor: 'pointer',
      color: active ? T.accent : T.mute,
      fontFamily: MONO,
      fontSize: 11,
      letterSpacing: '0.04em',
      textAlign: 'left',
    }}
  >
    <span style={{ flexShrink: 0, opacity: 0.8 }}>{icon}</span>
    {label}
  </button>
);

const FolderTreeNode: React.FC<{
  folder: FolderNode;
  selectedViewScope: 'all' | 'video' | 'image' | 'root' | 'folder' | 'bookmark';
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  depth: number;
}> = ({ folder, selectedViewScope, selectedFolderId, onSelectFolder, onDeleteFolder, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = folder.children.length > 0;
  const isActive = selectedViewScope === 'folder' && selectedFolderId === folder.id;

  return (
    <li style={{ listStyle: 'none' }}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder(folder.id); }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingLeft: 16 + depth * 14,
              paddingRight: 12,
              paddingTop: 5,
              paddingBottom: 5,
              background: isActive ? T.accentGlow : 'none',
              borderLeft: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
              cursor: 'pointer',
              color: isActive ? T.accent : T.mute,
              fontFamily: MONO,
              fontSize: 11,
              userSelect: 'none',
            }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
                style={{
                  width: 14, height: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.mute2, padding: 0,
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4">
                  {expanded
                    ? <polyline points="1,2 4,6 7,2" />
                    : <polyline points="2,1 6,4 2,7" />}
                </svg>
              </button>
            ) : (
              <span style={{ width: 14, flexShrink: 0 }} />
            )}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ flexShrink: 0, opacity: 0.7 }}>
              <path d="M1 9V4a1 1 0 0 1 1-1h2.5L6 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" />
            </svg>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => onDeleteFolder(folder.id)}
            className="text-danger focus:text-danger"
          >
            Delete Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {hasChildren && expanded && (
        <ul style={{ margin: 0, padding: 0 }}>
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

export const FolderSidebar = ({
  folders,
  selectedViewScope,
  selectedFolderId,
  onSelectAllItems,
  onSelectVideo,
  onSelectImage,
  onSelectRoot,
  onSelectFolder,
  onSelectBookmarks,
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

  const iconAllItems = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="4" height="4" /><rect x="7" y="1" width="4" height="4" />
      <rect x="1" y="7" width="4" height="4" /><rect x="7" y="7" width="4" height="4" />
    </svg>
  );
  const iconVideo = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="2" width="7" height="8" /><polyline points="8,4.5 11,3 11,9 8,7.5" />
    </svg>
  );
  const iconImage = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="10" height="10" /><circle cx="4" cy="4" r="1" />
      <polyline points="1,8 4,5 7,7 9,5.5 11,8 11,11 1,11" />
    </svg>
  );
  const iconRoot = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M6 1L11 4v7H1V4z" />
    </svg>
  );
  const iconBookmarks = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M2 1h8v10L6 8.5 2 11V1z" />
    </svg>
  );

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${T.line}`,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: T.mute2,
        flexShrink: 0,
      }}>
        · Folios ·
      </div>

      {/* Library shortcuts */}
      <div style={{ paddingTop: 6, flexShrink: 0 }}>
        {scopeRow('All Objects', selectedViewScope === 'all', onSelectAllItems, iconAllItems)}
        {scopeRow('Video', selectedViewScope === 'video', onSelectVideo, iconVideo)}
        {scopeRow('Images', selectedViewScope === 'image', onSelectImage, iconImage)}
        {onSelectBookmarks && scopeRow('Bookmarks', selectedViewScope === 'bookmark', onSelectBookmarks, iconBookmarks)}
      </div>

      {/* Folders section */}
      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 8, paddingTop: 6, flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px 6px 16px',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2 }}>
            Folders
          </span>
          <button
            type="button"
            onClick={() => setShowNewFolderDialog(true)}
            title="New folder"
            style={{
              width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: T.mute2, padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
            </svg>
          </button>
        </div>

        {scopeRow('Root', selectedViewScope === 'root', onSelectRoot, iconRoot)}

        {folders.length > 0 ? (
          <ul style={{ margin: 0, padding: 0 }}>
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
          <p style={{ padding: '8px 16px', fontFamily: MONO, fontSize: 10, color: T.mute2 }}>No folders yet</p>
        )}
      </div>

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
        }}
          onClick={() => setShowNewFolderDialog(false)}
        >
          <div
            style={{
              background: '#14160f',
              border: `1px solid ${T.line2}`,
              padding: 24, width: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontFamily: SERIF, fontSize: 18, color: T.text, marginBottom: 4 }}>New Folder</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: T.mute, marginBottom: 20 }}>Create a folder to organise vault objects.</div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: T.mute, letterSpacing: '0.08em', marginBottom: 5 }}>FOLDER NAME</label>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => onNewFolderNameChange(e.target.value)}
                  placeholder="My folder"
                  style={{
                    width: '100%', height: 30,
                    background: 'transparent',
                    border: `1px solid ${T.line2}`,
                    color: T.text, fontFamily: MONO, fontSize: 12,
                    padding: '0 8px', outline: 'none', boxSizing: 'border-box',
                    borderRadius: 0,
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: T.mute, letterSpacing: '0.08em', marginBottom: 5 }}>PARENT FOLDER</label>
                <select
                  value={newFolderParentId ?? 'root'}
                  onChange={(e) => onNewFolderParentIdChange(e.target.value === 'root' ? null : Number(e.target.value))}
                  style={{
                    width: '100%', height: 30,
                    background: '#0a0c0b',
                    border: `1px solid ${T.line2}`,
                    color: T.text, fontFamily: MONO, fontSize: 11,
                    padding: '0 8px', outline: 'none', boxSizing: 'border-box',
                    borderRadius: 0,
                  }}
                >
                  <option value="root">Root (no parent)</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowNewFolderDialog(false)}
                  style={{
                    height: 28, padding: '0 14px',
                    background: 'none', border: `1px solid ${T.line2}`,
                    cursor: 'pointer', color: T.mute,
                    fontFamily: MONO, fontSize: 10, borderRadius: 0,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  style={{
                    height: 28, padding: '0 14px',
                    background: T.accent, border: 'none',
                    cursor: 'pointer', color: '#0a0c0b',
                    fontFamily: MONO, fontSize: 10,
                    fontWeight: 500, letterSpacing: '0.06em',
                    opacity: !newFolderName.trim() ? 0.5 : 1,
                    borderRadius: 0,
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};

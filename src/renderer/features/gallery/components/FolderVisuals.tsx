import React from 'react';
import { Edit3, Folder, FolderOpen, Trash2 } from 'lucide-react';
import type { FolderNode } from '../../../../shared/ipc';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../../components/ui/ContextMenu';
import { fontSize } from '../../../theme/typography';

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

type FolderActions = {
  folder: FolderNode;
  previewUrls: string[];
  selected: boolean;
  onSelect: (folder: FolderNode) => void;
  onOpen: (folder: FolderNode) => void;
  onEdit: (folder: FolderNode) => void;
  onDelete: (folderId: number) => void;
};

const FolderPreview = ({
  previewUrls,
  compact = false,
}: {
  previewUrls: string[];
  compact?: boolean;
}): React.JSX.Element => {
  if (previewUrls.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#0d100f', color: T.mute2 }}>
        <Folder className={compact ? 'h-5 w-5' : 'h-12 w-12'} strokeWidth={1.2} />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'grid', gridTemplateColumns: previewUrls.length === 1 ? '1fr' : '1fr 1fr', gridTemplateRows: previewUrls.length <= 2 ? '1fr' : '1fr 1fr', gap: 1, background: T.line2 }}>
      {previewUrls.map((url) => (
        <img key={url} src={url} alt="" style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, objectFit: 'cover' }} />
      ))}
      <div style={{ position: 'absolute', left: 7, top: 7, display: 'grid', placeItems: 'center', width: compact ? 18 : 24, height: compact ? 18 : 24, border: `1px solid ${T.line2}`, background: 'rgba(5,7,6,0.78)', color: T.accent }}>
        <Folder className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
      </div>
    </div>
  );
};

const FolderMenu = ({
  children,
  folder,
  onOpen,
  onEdit,
  onDelete,
}: Pick<FolderActions, 'folder' | 'onOpen' | 'onEdit' | 'onDelete'> & { children: React.ReactNode }): React.JSX.Element => (
  <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onOpen(folder)}>Open</ContextMenuItem>
      <ContextMenuItem onClick={() => onEdit(folder)}>Edit Folder</ContextMenuItem>
      <ContextMenuItem onClick={() => onDelete(folder.id)} className="text-danger focus:text-danger">Delete Folder</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);

export const FolderCard = (props: FolderActions): React.JSX.Element => {
  const { folder, previewUrls, selected, onSelect, onOpen, onEdit, onDelete } = props;
  return (
    <FolderMenu folder={folder} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete}>
      <div
        data-folder-item-id={folder.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(folder)}
        onDoubleClick={() => onOpen(folder)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); onOpen(folder); }
          if (event.key === ' ') { event.preventDefault(); onSelect(folder); }
        }}
        style={{ minWidth: 0, cursor: 'pointer', border: `1px solid ${selected ? T.accent : T.line2}`, background: selected ? T.accentGlow : T.bg, boxShadow: selected ? `0 0 0 1px ${T.accent}` : 'none' }}
      >
        <div style={{ aspectRatio: '16 / 10', overflow: 'hidden' }}>
          <FolderPreview previewUrls={previewUrls} />
        </div>
        <div style={{ minWidth: 0, borderTop: `1px solid ${T.line}`, padding: '10px 11px 11px' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, fontSize: fontSize(15), color: T.text }}>{folder.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 5, fontFamily: MONO, fontSize: fontSize(9), color: T.mute, textTransform: 'uppercase' }}>
            <span style={{ border: `1px solid ${T.line2}`, padding: '1px 4px', color: T.accent }}>Folder</span>
            <span>{folder.recursiveObjectCount} objects</span>
            {folder.recursiveFolderCount > 0 && <span>{folder.recursiveFolderCount} folders</span>}
          </div>
        </div>
      </div>
    </FolderMenu>
  );
};

export const FolderListRow = (props: FolderActions): React.JSX.Element => {
  const { folder, previewUrls, selected, onSelect, onOpen, onEdit, onDelete } = props;
  return (
    <FolderMenu folder={folder} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete}>
      <div
        data-folder-item-id={folder.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(folder)}
        onDoubleClick={() => onOpen(folder)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); onOpen(folder); }
          if (event.key === ' ') { event.preventDefault(); onSelect(folder); }
        }}
        style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1fr) minmax(120px,180px)', alignItems: 'center', minHeight: 54, borderBottom: `1px solid ${T.line}`, background: selected ? T.accentGlow : 'transparent', borderLeft: selected ? `2px solid ${T.accent}` : '2px solid transparent', cursor: 'pointer' }}
      >
        <div style={{ width: 38, height: 34, marginLeft: 6, overflow: 'hidden', border: `1px solid ${T.line2}` }}>
          <FolderPreview previewUrls={previewUrls} compact />
        </div>
        <div style={{ minWidth: 0, padding: '7px 10px' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, fontSize: fontSize(14), color: T.text }}>{folder.name}</div>
          <span style={{ display: 'inline-block', marginTop: 3, border: `1px solid ${T.line2}`, padding: '1px 4px', fontFamily: MONO, fontSize: fontSize(8), color: T.accent }}>FOLDER</span>
        </div>
        <div style={{ paddingRight: 12, textAlign: 'right', fontFamily: MONO, fontSize: fontSize(9), color: T.mute }}>
          {folder.recursiveObjectCount} objects
          {folder.recursiveFolderCount > 0 ? ` · ${folder.recursiveFolderCount} folders` : ''}
        </div>
      </div>
    </FolderMenu>
  );
};

export const FolderInspector = ({
  folder,
  previewUrls,
  path,
  onOpen,
  onEdit,
  onDelete,
}: {
  folder: FolderNode;
  previewUrls: string[];
  path: string;
  onOpen: (folder: FolderNode) => void;
  onEdit: (folder: FolderNode) => void;
  onDelete: (folderId: number) => void;
}): React.JSX.Element => (
  <div style={{ padding: 14 }}>
    <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', border: `1px solid ${T.line2}` }}>
      <FolderPreview previewUrls={previewUrls} />
    </div>
    <h3 style={{ margin: '14px 0 4px', overflowWrap: 'anywhere', fontFamily: SERIF, fontSize: fontSize(18), fontWeight: 400, color: T.text }}>{folder.name}</h3>
    <p style={{ margin: 0, overflowWrap: 'anywhere', fontFamily: MONO, fontSize: fontSize(9), color: T.mute }}>{path}</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, marginTop: 14 }}>
      <button type="button" onClick={() => onOpen(folder)} style={{ height: 32, border: 'none', background: T.accent, color: T.bg, fontFamily: MONO, fontSize: fontSize(10), textTransform: 'uppercase', cursor: 'pointer' }}>
        <FolderOpen className="mr-1 inline h-3.5 w-3.5" /> Open
      </button>
      <button type="button" onClick={() => onEdit(folder)} title="Edit folder" style={{ width: 32, border: `1px solid ${T.line2}`, background: 'transparent', color: T.mute, cursor: 'pointer' }}><Edit3 className="mx-auto h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => onDelete(folder.id)} title="Delete folder" style={{ width: 32, border: `1px solid ${T.danger}`, background: 'transparent', color: T.danger, cursor: 'pointer' }}><Trash2 className="mx-auto h-3.5 w-3.5" /></button>
    </div>
    <div style={{ marginTop: 18, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
      <p style={{ margin: '0 0 8px', fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, textTransform: 'uppercase' }}>Contents</p>
      <p style={{ margin: '0 0 5px', fontFamily: MONO, fontSize: fontSize(10), color: T.text }}>{folder.recursiveObjectCount} objects</p>
      <p style={{ margin: 0, fontFamily: MONO, fontSize: fontSize(10), color: T.text }}>{folder.recursiveFolderCount} subfolders</p>
    </div>
  </div>
);

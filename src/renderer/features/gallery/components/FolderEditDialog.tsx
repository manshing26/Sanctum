import React, { useEffect, useMemo, useState } from 'react';
import type { FolderNode } from '../../../../shared/ipc';
import { SanctumDialog } from '../../../components/ui';
import { fontSize } from '../../../theme/typography';

const T = {
  bg: '#0a0c0b',
  line2: 'rgba(220,220,200,0.12)',
  text: '#e8e6dc',
  mute: '#79817a',
  accent: '#7c9a92',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const flattenFolders = (
  folders: FolderNode[],
  depth = 0,
): Array<{ id: number; label: string }> => folders.flatMap((folder) => [
  { id: folder.id, label: `${'  '.repeat(depth)}${folder.name}` },
  ...flattenFolders(folder.children, depth + 1),
]);

const collectFolderIds = (folder: FolderNode): Set<number> => {
  const ids = new Set<number>();
  const stack = [folder];
  while (stack.length > 0) {
    const current = stack.pop() as FolderNode;
    ids.add(current.id);
    stack.push(...current.children);
  }
  return ids;
};

type FolderEditDialogProps = {
  folder: FolderNode | null;
  folders: FolderNode[];
  onOpenChange: (open: boolean) => void;
  onRename: (folderId: number, name: string) => Promise<boolean>;
  onMove: (folderId: number, parentId: number | null) => Promise<boolean>;
};

export const FolderEditDialog = ({
  folder,
  folders,
  onOpenChange,
  onRename,
  onMove,
}: FolderEditDialogProps): React.JSX.Element => {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(folder?.name ?? '');
    setParentId(folder?.parentId ?? null);
  }, [folder]);

  const blockedIds = useMemo(
    () => folder ? collectFolderIds(folder) : new Set<number>(),
    [folder],
  );
  const parentOptions = useMemo(
    () => flattenFolders(folders).filter((option) => !blockedIds.has(option.id)),
    [blockedIds, folders],
  );

  const submit = async (): Promise<void> => {
    if (!folder || !name.trim() || busy) return;
    setBusy(true);
    try {
      let ok = true;
      if (name.trim() !== folder.name) {
        ok = await onRename(folder.id, name.trim());
      }
      if (ok && parentId !== folder.parentId) {
        ok = await onMove(folder.id, parentId);
      }
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SanctumDialog
      open={folder !== null}
      onOpenChange={(open) => { if (!busy) onOpenChange(open); }}
      title="Edit Folder"
      description="Rename this folder or move it under another folder."
      size="sm"
      busy={busy}
      footer={(
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-8 border border-white/15 px-3 font-mono text-[10px] uppercase text-white/55 hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim() || busy}
            className="h-8 px-3 font-mono text-[10px] uppercase text-black disabled:opacity-50"
            style={{ background: T.accent }}
          >
            Save
          </button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          <span style={{ display: 'block', marginBottom: 5, fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>FOLDER NAME</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            style={{ width: '100%', height: 32, boxSizing: 'border-box', border: `1px solid ${T.line2}`, background: 'transparent', color: T.text, padding: '0 8px', fontFamily: MONO, fontSize: fontSize(12), outline: 'none' }}
          />
        </label>
        <label>
          <span style={{ display: 'block', marginBottom: 5, fontFamily: MONO, fontSize: fontSize(10), color: T.mute }}>PARENT FOLDER</span>
          <select
            value={parentId ?? 'root'}
            onChange={(event) => setParentId(event.currentTarget.value === 'root' ? null : Number(event.currentTarget.value))}
            style={{ width: '100%', height: 32, border: `1px solid ${T.line2}`, background: T.bg, color: T.text, padding: '0 8px', fontFamily: MONO, fontSize: fontSize(11), outline: 'none' }}
          >
            <option value="root">Root (no parent)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
    </SanctumDialog>
  );
};

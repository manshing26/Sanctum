import fs from 'node:fs/promises';
import path from 'node:path';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AssignItemFolderInput,
  AssignItemsFolderInput,
  CreateFolderInput,
  FolderNode,
  MoveFolderInput,
  RenameFolderInput,
} from '../../../shared/ipc';
import { SessionStore } from '../../state/SessionStore';
import type { VaultPaths } from '../vault/VaultPaths';

type FolderRow = {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
};

export class FolderService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths: VaultPaths,
  ) {}

  private ensureUnlocked(): void {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault is locked.');
    }
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new Error('Folder name cannot be empty.');
    }
    return normalized;
  }

  private getFolderById(folderId: number): FolderRow {
    const folder = this.db
      .prepare('SELECT id, name, parent_id, created_at FROM folders WHERE id = ?')
      .get(folderId) as FolderRow | undefined;

    if (!folder) {
      throw new Error('Folder not found.');
    }

    return folder;
  }

  private ensureFolderExists(folderId: number): void {
    this.getFolderById(folderId);
  }

  private toTree(rows: FolderRow[]): FolderNode[] {
    const childrenMap = new Map<number | null, FolderRow[]>();
    for (const row of rows) {
      const siblings = childrenMap.get(row.parent_id) ?? [];
      siblings.push(row);
      childrenMap.set(row.parent_id, siblings);
    }

    const buildNode = (row: FolderRow): FolderNode => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      createdAt: row.created_at,
      children: (childrenMap.get(row.id) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(buildNode),
    });

    return (childrenMap.get(null) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(buildNode);
  }

  private assertNoCycle(folderId: number, parentId: number | null): void {
    if (parentId === null) {
      return;
    }

    if (folderId === parentId) {
      throw new Error('Folder cannot be moved into itself.');
    }

    let cursor: number | null = parentId;
    while (cursor !== null) {
      if (cursor === folderId) {
        throw new Error('Folder cannot be moved into its descendant.');
      }

      const row = this.db
        .prepare('SELECT parent_id FROM folders WHERE id = ?')
        .get(cursor) as { parent_id: number | null } | undefined;

      if (!row) {
        throw new Error('Target parent folder not found.');
      }

      cursor = row.parent_id;
    }
  }

  listFoldersTree(): FolderNode[] {
    this.ensureUnlocked();
    const rows = this.db
      .prepare('SELECT id, name, parent_id, created_at FROM folders ORDER BY name COLLATE NOCASE')
      .all() as FolderRow[];
    return this.toTree(rows);
  }

  createFolder(input: CreateFolderInput): FolderNode {
    this.ensureUnlocked();
    const name = this.normalizeName(input.name);
    const parentId = input.parentId ?? null;

    if (parentId !== null) {
      this.ensureFolderExists(parentId);
    }

    try {
      const result = this.db
        .prepare(
          `INSERT INTO folders (name, parent_id, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)`
        )
        .run(name, parentId);

      return this.getFolderNodeById(Number(result.lastInsertRowid));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { code?: string };
      if (nodeError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A folder with this name already exists at this level.');
      }

      throw error;
    }
  }

  renameFolder(input: RenameFolderInput): FolderNode {
    this.ensureUnlocked();
    const name = this.normalizeName(input.name);
    const folder = this.getFolderById(input.folderId);

    try {
      const result = this.db
        .prepare(
          `UPDATE folders
           SET name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(name, folder.id);

      if (result.changes === 0) {
        throw new Error('Folder not found.');
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { code?: string };
      if (nodeError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A folder with this name already exists at this level.');
      }

      throw error;
    }

    return this.getFolderNodeById(folder.id);
  }

  moveFolder(input: MoveFolderInput): FolderNode {
    this.ensureUnlocked();
    this.getFolderById(input.folderId);

    if (input.parentId !== null) {
      this.ensureFolderExists(input.parentId);
    }

    this.assertNoCycle(input.folderId, input.parentId);

    try {
      this.db
        .prepare(
          `UPDATE folders
           SET parent_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(input.parentId, input.folderId);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { code?: string };
      if (nodeError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('A folder with this name already exists at the target level.');
      }

      throw error;
    }

    return this.getFolderNodeById(input.folderId);
  }

  async deleteFolder(folderId: number, deleteItems: boolean): Promise<void> {
    this.ensureUnlocked();
    this.getFolderById(folderId);

    const subtreeIds = this.db
      .prepare(
        `WITH RECURSIVE folder_tree(id) AS (
           SELECT id FROM folders WHERE id = ?
           UNION ALL
           SELECT f.id
           FROM folders f
           INNER JOIN folder_tree ft ON f.parent_id = ft.id
         )
         SELECT id FROM folder_tree`
      )
      .all(folderId) as Array<{ id: number }>;

    const folderIds = subtreeIds.map((row) => row.id);
    if (folderIds.length === 0) {
      return;
    }

    const placeholders = folderIds.map(() => '?').join(', ');

    if (deleteItems) {
      // Collect encrypted filenames for all file items in the subtree.
      const itemRows = this.db
        .prepare(
          `SELECT vi.vault_object_id, vi.encrypted_filename
           FROM vault_items vi
           INNER JOIN vault_objects vo ON vo.id = vi.vault_object_id
           WHERE vo.folder_id IN (${placeholders})`,
        )
        .all(...folderIds) as Array<{ vault_object_id: string; encrypted_filename: string }>;

      // Delete encrypted files from disk (best-effort).
      await Promise.all(
        itemRows.map(async (row) => {
          try {
            await fs.unlink(path.join(this.vaultPaths.filesDir, row.encrypted_filename));
          } catch (err) {
            const nodeErr = err as NodeJS.ErrnoException;
            if (nodeErr.code !== 'ENOENT') throw err;
          }
        }),
      );

      // Deleting vault_objects cascades to file/bookmark/note children and object_tags.
      this.db.prepare(`DELETE FROM vault_objects WHERE folder_id IN (${placeholders})`).run(...folderIds);
    } else {
      // Move all objects in the subtree back to root (NULL folder).
      this.db
        .prepare(`UPDATE vault_objects SET folder_id = NULL WHERE folder_id IN (${placeholders})`)
        .run(...folderIds);
    }

    this.db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
  }

  assignItemFolder(input: AssignItemFolderInput): void {
    this.ensureUnlocked();

    if (input.folderId !== null) {
      this.ensureFolderExists(input.folderId);
    }

    const result = this.db
      .prepare(`UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = 'file'`)
      .run(input.folderId, input.itemId);

    if (result.changes === 0) {
      throw new Error('Item not found.');
    }
  }

  bulkAssignItemsFolder(input: AssignItemsFolderInput): void {
    this.ensureUnlocked();

    if (input.folderId !== null) {
      this.ensureFolderExists(input.folderId);
    }

    if (input.itemIds.length === 0) return;

    const placeholders = input.itemIds.map(() => '?').join(', ');
    this.db
      .prepare(`UPDATE vault_objects SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND type = 'file'`)
      .run(input.folderId, ...input.itemIds);
  }

  private getFolderNodeById(folderId: number): FolderNode {
    const rows = this.db
      .prepare('SELECT id, name, parent_id, created_at FROM folders')
      .all() as FolderRow[];
    const tree = this.toTree(rows);

    const stack: FolderNode[] = [...tree];
    while (stack.length > 0) {
      const node = stack.pop() as FolderNode;
      if (node.id === folderId) {
        return node;
      }

      stack.push(...node.children);
    }

    throw new Error('Folder not found.');
  }
}

import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AssignItemTagInput,
  AssignItemsTagInput,
  CreateTagInput,
  RenameTagInput,
  TagSummary,
  UnassignItemTagInput,
  UnassignItemsTagInput,
} from '../../../shared/ipc';
import { SessionStore } from '../../state/SessionStore';

type TagRow = {
  id: number;
  name: string;
  created_at: string;
};

export class TagService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly sessionStore: SessionStore,
  ) {}

  private ensureUnlocked(): void {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault is locked.');
    }
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new Error('Tag name cannot be empty.');
    }
    return normalized;
  }

  private getTag(tagId: number): TagRow {
    const row = this.db
      .prepare('SELECT id, name, created_at FROM tags WHERE id = ?')
      .get(tagId) as TagRow | undefined;
    if (!row) {
      throw new Error('Tag not found.');
    }
    return row;
  }

  private toSummary(row: TagRow): TagSummary {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  createTag(input: CreateTagInput): TagSummary {
    this.ensureUnlocked();
    const name = this.normalizeName(input.name);

    try {
      const result = this.db
        .prepare('INSERT INTO tags (name, updated_at) VALUES (?, CURRENT_TIMESTAMP)')
        .run(name);
      return this.toSummary(this.getTag(Number(result.lastInsertRowid)));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { code?: string };
      if (nodeError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Tag already exists.');
      }
      throw error;
    }
  }

  listTags(): TagSummary[] {
    this.ensureUnlocked();
    const rows = this.db
      .prepare('SELECT id, name, created_at FROM tags ORDER BY name COLLATE NOCASE')
      .all() as TagRow[];
    return rows.map((row) => this.toSummary(row));
  }

  renameTag(input: RenameTagInput): TagSummary {
    this.ensureUnlocked();
    const name = this.normalizeName(input.name);
    this.getTag(input.tagId);

    try {
      this.db
        .prepare('UPDATE tags SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, input.tagId);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException & { code?: string };
      if (nodeError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Tag already exists.');
      }
      throw error;
    }

    return this.toSummary(this.getTag(input.tagId));
  }

  deleteTag(tagId: number): void {
    this.ensureUnlocked();
    this.getTag(tagId);
    this.db.prepare('DELETE FROM item_tags WHERE tag_id = ?').run(tagId);
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
  }

  assignItemTag(input: AssignItemTagInput): void {
    this.ensureUnlocked();
    this.getTag(input.tagId);

    const itemExists = this.db
      .prepare('SELECT 1 FROM vault_items WHERE id = ?')
      .get(input.itemId) as { 1: number } | undefined;
    if (!itemExists) {
      throw new Error('Item not found.');
    }

    this.db
      .prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)')
      .run(input.itemId, input.tagId);
  }

  unassignItemTag(input: UnassignItemTagInput): void {
    this.ensureUnlocked();
    this.db.prepare('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?').run(input.itemId, input.tagId);
  }

  assignItemsTag(input: AssignItemsTagInput): void {
    this.ensureUnlocked();
    this.getTag(input.tagId);
    if (input.itemIds.length === 0) {
      return;
    }

    const statement = this.db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
    const transaction = this.db.transaction((itemIds: string[]) => {
      for (const itemId of itemIds) {
        statement.run(itemId, input.tagId);
      }
    });
    transaction(input.itemIds);
  }

  unassignItemsTag(input: UnassignItemsTagInput): void {
    this.ensureUnlocked();
    if (input.itemIds.length === 0) {
      return;
    }

    const placeholders = input.itemIds.map(() => '?').join(', ');
    this.db
      .prepare(`DELETE FROM item_tags WHERE tag_id = ? AND item_id IN (${placeholders})`)
      .run(input.tagId, ...input.itemIds);
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import { VaultPaths } from './VaultPaths';
import type { VaultItemSummary } from '../../../shared/ipc';

const getMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    default:
      return 'application/octet-stream';
  }
};

export class VaultService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths: VaultPaths,
  ) {}

  async addEncryptedFile(sourcePath: string): Promise<VaultItemSummary> {
    const key = this.sessionStore.getMasterKey();
    const fileBuffer = await fs.readFile(sourcePath);

    const itemId = randomUUID();
    const encryptedFilename = `${itemId}.enc`;
    const outputPath = path.join(this.vaultPaths.filesDir, encryptedFilename);

    const encryptedFile = this.cryptoService.encryptBuffer(fileBuffer, key);
    await fs.writeFile(outputPath, encryptedFile.encrypted);

    const originalNamePayload = this.cryptoService.encryptBuffer(
      Buffer.from(path.basename(sourcePath), 'utf8'),
      key,
    );

    const originalFilenameEnc = Buffer.from(
      JSON.stringify({
        iv: originalNamePayload.iv.toString('base64'),
        authTag: originalNamePayload.authTag.toString('base64'),
        data: originalNamePayload.encrypted.toString('base64'),
      }),
      'utf8',
    );

    const mimeType = getMimeType(sourcePath);

    this.db
      .prepare(
        `INSERT INTO vault_items (
           id,
           encrypted_filename,
           original_filename_enc,
           mime_type,
           file_size,
           iv,
           auth_tag
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        itemId,
        encryptedFilename,
        originalFilenameEnc,
        mimeType,
        fileBuffer.byteLength,
        encryptedFile.iv,
        encryptedFile.authTag,
      );

    const created = this.db
      .prepare('SELECT created_at FROM vault_items WHERE id = ?')
      .get(itemId) as { created_at: string };

    return {
      id: itemId,
      createdAt: created.created_at,
      size: fileBuffer.byteLength,
      mimeType,
    };
  }

  listItems(limit = 50): VaultItemSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, created_at, file_size, mime_type
         FROM vault_items
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
      id: string;
      created_at: string;
      file_size: number;
      mime_type: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      size: row.file_size,
      mimeType: row.mime_type,
    }));
  }
}

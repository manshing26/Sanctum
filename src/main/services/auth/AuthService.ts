import fs from 'node:fs/promises';
import path from 'node:path';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import {
  CryptoService,
  DEFAULT_ARGON2_PARAMS,
  type Argon2KdfParams,
} from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type { VaultPaths } from '../vault/VaultPaths';

type AuthStateRow = {
  password_verifier: string;
  failed_attempts: number | null;
  lockout_until: string | null;
};

type VaultConfigRow = {
  salt: Buffer;
  kdf_params: string;
};

type VaultItemRow = {
  id: string;
  encrypted_filename: string;
  original_filename_enc: Buffer;
  thumbnail_enc: Buffer | null;
  thumbnail_iv: Buffer | null;
  thumbnail_auth_tag: Buffer | null;
  iv: Buffer;
  auth_tag: Buffer;
};

type BookmarkRow = {
  vault_object_id: string;
  title_enc: Buffer;
  url_enc: Buffer;
};

type NoteRow = {
  vault_object_id: string;
  title_enc: Buffer;
  body_enc: Buffer;
};

type EncryptedPayload = {
  iv: string;
  authTag: string;
  data: string;
};

export class AuthService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 15;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
    private readonly vaultPaths?: VaultPaths,
  ) {
    this.refreshVaultPresence();
  }

  refreshVaultPresence(): void {
    const row = this.db.prepare('SELECT id FROM auth_state WHERE id = 1').get();
    this.sessionStore.setHasVault(Boolean(row));
  }

  async createVaultPassword(password: string): Promise<void> {
    const existing = this.db.prepare('SELECT id FROM auth_state WHERE id = 1').get();
    if (existing) {
      throw new Error('Vault password is already set.');
    }

    const passwordVerifier = await this.cryptoService.createPasswordVerifier(password);
    const salt = this.cryptoService.generateVaultSalt();
    const kdfParams = JSON.stringify(DEFAULT_ARGON2_PARAMS);

    this.db
      .prepare(
        `INSERT INTO auth_state (id, password_verifier)
         VALUES (1, ?)`
      )
      .run(passwordVerifier);

    this.db
      .prepare(
        `INSERT INTO vault_config (id, salt, kdf_params)
         VALUES (1, ?, ?)`
      )
      .run(salt, kdfParams);

    const masterKey = await this.cryptoService.deriveMasterKey(
      password,
      salt,
      DEFAULT_ARGON2_PARAMS,
    );

    this.sessionStore.unlock(masterKey);
  }

  async unlockVault(password: string): Promise<void> {
    const authState = this.db
      .prepare('SELECT password_verifier, failed_attempts, lockout_until FROM auth_state WHERE id = 1')
      .get() as AuthStateRow | undefined;

    if (!authState) {
      throw new Error('Vault password has not been configured yet.');
    }

    const lockoutUntilMs = this.parseLockoutTimestamp(authState.lockout_until);
    if (lockoutUntilMs !== null && lockoutUntilMs > Date.now()) {
      const remainingMinutes = Math.max(1, Math.ceil((lockoutUntilMs - Date.now()) / 60000));
      throw new Error(`Too many failed attempts. Try again in ${remainingMinutes} minute(s).`);
    }

    const isValid = await this.cryptoService.verifyPassword(password, authState.password_verifier);
    if (!isValid) {
      const nextAttempts = (authState.failed_attempts ?? 0) + 1;
      if (nextAttempts >= AuthService.MAX_FAILED_ATTEMPTS) {
        this.db
          .prepare(
            `UPDATE auth_state
             SET failed_attempts = 0,
                 lockout_until = datetime('now', ?),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`,
          )
          .run(`+${AuthService.LOCKOUT_MINUTES} minutes`);
      } else {
        this.db
          .prepare(
            `UPDATE auth_state
             SET failed_attempts = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`,
          )
          .run(nextAttempts);
      }
      throw new Error('Invalid password.');
    }

    const vaultConfig = this.db
      .prepare('SELECT salt, kdf_params FROM vault_config WHERE id = 1')
      .get() as VaultConfigRow | undefined;

    if (!vaultConfig) {
      throw new Error('Vault configuration missing.');
    }

    const params = JSON.parse(vaultConfig.kdf_params) as Argon2KdfParams;
    const masterKey = await this.cryptoService.deriveMasterKey(
      password,
      vaultConfig.salt,
      params,
    );

    this.sessionStore.unlock(masterKey);
    this.db
      .prepare(
        `UPDATE auth_state
         SET failed_attempts = 0,
             lockout_until = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
      )
      .run();
  }

  async verifyCurrentPassword(password: string): Promise<boolean> {
    const authState = this.db
      .prepare('SELECT password_verifier FROM auth_state WHERE id = 1')
      .get() as Pick<AuthStateRow, 'password_verifier'> | undefined;
    if (!authState) {
      throw new Error('Vault not configured.');
    }
    return this.cryptoService.verifyPassword(password, authState.password_verifier);
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<void> {
    if (this.sessionStore.getState().status !== 'unlocked') {
      throw new Error('Vault must be unlocked to change password.');
    }
    if (!this.vaultPaths) {
      throw new Error('VaultPaths not available.');
    }

    // Verify current password.
    const isValid = await this.verifyCurrentPassword(currentPassword);
    if (!isValid) {
      throw new Error('Current password is incorrect.');
    }

    // Derive new master key from a fresh salt.
    const oldKey = this.sessionStore.getMasterKey();
    const newSalt = this.cryptoService.generateVaultSalt();
    const newKey = await this.cryptoService.deriveMasterKey(newPassword, newSalt, DEFAULT_ARGON2_PARAMS);
    const newVerifier = await this.cryptoService.createPasswordVerifier(newPassword);

    // Re-encrypt all vault item files on disk and collect new DB values.
    const itemRows = this.db
      .prepare(
        `SELECT vault_object_id AS id, encrypted_filename, original_filename_enc,
                thumbnail_enc, thumbnail_iv, thumbnail_auth_tag,
                iv, auth_tag
         FROM vault_items`,
      )
      .all() as VaultItemRow[];

    type ItemUpdate = {
      id: string;
      originalFilenameEnc: Buffer;
      thumbnailEnc: Buffer | null;
      thumbnailIv: Buffer | null;
      thumbnailAuthTag: Buffer | null;
      iv: Buffer;
      authTag: Buffer;
      newFilePath: string;
      newFileData: Buffer;
    };

    const total = itemRows.length;
    const itemUpdates: ItemUpdate[] = [];
    for (const row of itemRows) {
      // Re-encrypt file content.
      const encPath = path.join(this.vaultPaths.filesDir, row.encrypted_filename);
      const encData = await fs.readFile(encPath);
      const decrypted = this.cryptoService.decryptBuffer(
        { iv: row.iv, authTag: row.auth_tag, encrypted: encData },
        oldKey,
      );
      const reEncrypted = this.cryptoService.encryptBuffer(decrypted, newKey);

      // Re-encrypt original filename.
      const namePayload = JSON.parse(row.original_filename_enc.toString('utf8')) as EncryptedPayload;
      const decryptedName = this.cryptoService.decryptBuffer(
        {
          iv: Buffer.from(namePayload.iv, 'base64'),
          authTag: Buffer.from(namePayload.authTag, 'base64'),
          encrypted: Buffer.from(namePayload.data, 'base64'),
        },
        oldKey,
      );
      const reEncName = this.cryptoService.encryptBuffer(decryptedName, newKey);
      const newNameEnc = Buffer.from(
        JSON.stringify({
          iv: reEncName.iv.toString('base64'),
          authTag: reEncName.authTag.toString('base64'),
          data: reEncName.encrypted.toString('base64'),
        }),
        'utf8',
      );

      // Re-encrypt thumbnail if present.
      let newThumbEnc: Buffer | null = null;
      let newThumbIv: Buffer | null = null;
      let newThumbAuthTag: Buffer | null = null;
      if (row.thumbnail_enc && row.thumbnail_iv && row.thumbnail_auth_tag) {
        const decThumb = this.cryptoService.decryptBuffer(
          { iv: row.thumbnail_iv, authTag: row.thumbnail_auth_tag, encrypted: row.thumbnail_enc },
          oldKey,
        );
        const reEncThumb = this.cryptoService.encryptBuffer(decThumb, newKey);
        newThumbEnc = reEncThumb.encrypted;
        newThumbIv = reEncThumb.iv;
        newThumbAuthTag = reEncThumb.authTag;
      }

      itemUpdates.push({
        id: row.id,
        originalFilenameEnc: newNameEnc,
        thumbnailEnc: newThumbEnc,
        thumbnailIv: newThumbIv,
        thumbnailAuthTag: newThumbAuthTag,
        iv: reEncrypted.iv,
        authTag: reEncrypted.authTag,
        newFilePath: encPath,
        newFileData: reEncrypted.encrypted,
      });
      onProgress?.(itemUpdates.length, total);
    }

    const reEncField = (enc: Buffer): Buffer => {
      const p = JSON.parse(enc.toString('utf8')) as EncryptedPayload;
      const dec = this.cryptoService.decryptBuffer(
        {
          iv: Buffer.from(p.iv, 'base64'),
          authTag: Buffer.from(p.authTag, 'base64'),
          encrypted: Buffer.from(p.data, 'base64'),
        },
        oldKey,
      );
      const reEnc = this.cryptoService.encryptBuffer(dec, newKey);
      return Buffer.from(
        JSON.stringify({
          iv: reEnc.iv.toString('base64'),
          authTag: reEnc.authTag.toString('base64'),
          data: reEnc.encrypted.toString('base64'),
        }),
        'utf8',
      );
    };

    // Re-encrypt bookmarks.
    const bookmarkRows = this.db
      .prepare('SELECT vault_object_id, title_enc, url_enc FROM bookmarks')
      .all() as BookmarkRow[];

    type BookmarkUpdate = { id: string; titleEnc: Buffer; urlEnc: Buffer };
    const bookmarkUpdates: BookmarkUpdate[] = [];
    for (const row of bookmarkRows) {
      bookmarkUpdates.push({
        id: row.vault_object_id,
        titleEnc: reEncField(row.title_enc),
        urlEnc: reEncField(row.url_enc),
      });
    }

    // Re-encrypt notes.
    const noteRows = this.db
      .prepare('SELECT vault_object_id, title_enc, body_enc FROM notes')
      .all() as NoteRow[];

    type NoteUpdate = { id: string; titleEnc: Buffer; bodyEnc: Buffer };
    const noteUpdates: NoteUpdate[] = [];
    for (const row of noteRows) {
      noteUpdates.push({
        id: row.vault_object_id,
        titleEnc: reEncField(row.title_enc),
        bodyEnc: reEncField(row.body_enc),
      });
    }

    // Write new file content to disk first (still readable with old key until DB commits).
    // Use temp files so a crash mid-write doesn't corrupt existing data.
    const tempPaths: Array<{ tmpPath: string; finalPath: string }> = [];
    for (const update of itemUpdates) {
      const tmpPath = `${update.newFilePath}.tmp`;
      await fs.writeFile(tmpPath, update.newFileData);
      tempPaths.push({ tmpPath, finalPath: update.newFilePath });
    }

    // Commit everything atomically in a single DB transaction, then rename temp files.
    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `UPDATE auth_state
             SET password_verifier = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`,
          )
          .run(newVerifier);

        this.db
          .prepare(
            `UPDATE vault_config
             SET salt = ?, kdf_params = ?
             WHERE id = 1`,
          )
          .run(newSalt, JSON.stringify(DEFAULT_ARGON2_PARAMS));

        const updateItem = this.db.prepare(
          `UPDATE vault_items
           SET original_filename_enc = ?,
               thumbnail_enc = ?, thumbnail_iv = ?, thumbnail_auth_tag = ?,
               iv = ?, auth_tag = ?
           WHERE vault_object_id = ?`,
        );
        for (const u of itemUpdates) {
          updateItem.run(
            u.originalFilenameEnc,
            u.thumbnailEnc, u.thumbnailIv, u.thumbnailAuthTag,
            u.iv, u.authTag,
            u.id,
          );
        }

        const updateBookmark = this.db.prepare(
          `UPDATE bookmarks SET title_enc = ?, url_enc = ? WHERE vault_object_id = ?`,
        );
        for (const b of bookmarkUpdates) {
          updateBookmark.run(b.titleEnc, b.urlEnc, b.id);
        }

        const updateNote = this.db.prepare(
          `UPDATE notes SET title_enc = ?, body_enc = ? WHERE vault_object_id = ?`,
        );
        for (const n of noteUpdates) {
          updateNote.run(n.titleEnc, n.bodyEnc, n.id);
        }
      })();

      // DB committed — rename temp files to final paths.
      for (const { tmpPath, finalPath } of tempPaths) {
        await fs.rename(tmpPath, finalPath);
      }
    } catch (err) {
      // DB transaction rolled back — clean up temp files.
      for (const { tmpPath } of tempPaths) {
        await fs.unlink(tmpPath).catch(() => undefined);
      }
      throw err;
    }

    // Update the live session key so the vault stays unlocked with the new key.
    this.sessionStore.unlock(newKey);
  }

  lockVault(): void {
    this.sessionStore.lock();
  }

  getSessionState(): { status: 'locked' | 'unlocked'; hasVault: boolean } {
    return this.sessionStore.getState();
  }

  private parseLockoutTimestamp(raw: string | null): number | null {
    if (!raw) return null;
    const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

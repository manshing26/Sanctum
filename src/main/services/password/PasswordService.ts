import type { Database as SqliteDatabase } from 'better-sqlite3';
import { CryptoService } from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';
import type {
  CreatePasswordInput,
  PasswordDetail,
  PasswordSummary,
  UpdatePasswordInput,
} from '../../../shared/ipc';

type PasswordRow = {
  id: string;
  domain_enc: Buffer;
  username_enc: Buffer;
  password_enc: Buffer;
  label_enc: Buffer | null;
  notes_enc: Buffer | null;
  created_at: string;
  updated_at: string;
};

type EncryptedPayload = {
  iv: string;
  authTag: string;
  data: string;
};

const decryptPayload = (
  payloadBuffer: Buffer,
  cryptoService: CryptoService,
  masterKey: Buffer,
): string => {
  const payload = JSON.parse(payloadBuffer.toString('utf8')) as EncryptedPayload;
  const decrypted = cryptoService.decryptBuffer(
    {
      iv: Buffer.from(payload.iv, 'base64'),
      authTag: Buffer.from(payload.authTag, 'base64'),
      encrypted: Buffer.from(payload.data, 'base64'),
    },
    masterKey,
  );
  return decrypted.toString('utf8');
};

const encryptPayload = (
  value: string,
  cryptoService: CryptoService,
  masterKey: Buffer,
): Buffer => {
  const encrypted = cryptoService.encryptBuffer(Buffer.from(value, 'utf8'), masterKey);
  return Buffer.from(
    JSON.stringify({
      iv: encrypted.iv.toString('base64'),
      authTag: encrypted.authTag.toString('base64'),
      data: encrypted.encrypted.toString('base64'),
    }),
    'utf8',
  );
};

const normalizeDomain = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Domain is required.');
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return trimmed.toLowerCase();
  }
};

const rowToSummary = (
  row: PasswordRow,
  cryptoService: CryptoService,
  masterKey: Buffer,
): PasswordSummary => ({
  id: row.id,
  domain: decryptPayload(row.domain_enc, cryptoService, masterKey),
  username: decryptPayload(row.username_enc, cryptoService, masterKey),
  label: row.label_enc ? decryptPayload(row.label_enc, cryptoService, masterKey) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PasswordService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
  ) {}

  private getMasterKey(): Buffer {
    try {
      return this.sessionStore.getMasterKey();
    } catch {
      throw new Error('Unlock vault to manage passwords.');
    }
  }

  listPasswords(): PasswordSummary[] {
    const masterKey = this.getMasterKey();
    const rows = this.db
      .prepare(
        `SELECT id, domain_enc, username_enc, password_enc, label_enc, notes_enc, created_at, updated_at
         FROM passwords
         ORDER BY datetime(updated_at) DESC, id DESC`,
      )
      .all() as PasswordRow[];

    const results: PasswordSummary[] = [];
    for (const row of rows) {
      try {
        results.push(rowToSummary(row, this.cryptoService, masterKey));
      } catch {
        // Skip corrupted rows.
      }
    }
    return results;
  }

  createPassword(input: CreatePasswordInput): PasswordSummary {
    const masterKey = this.getMasterKey();
    const domain = normalizeDomain(input.domain);
    const id = crypto.randomUUID();

    const domainEnc = encryptPayload(domain, this.cryptoService, masterKey);
    const usernameEnc = encryptPayload(input.username, this.cryptoService, masterKey);
    const passwordEnc = encryptPayload(input.password, this.cryptoService, masterKey);
    const labelEnc = input.label?.trim()
      ? encryptPayload(input.label.trim(), this.cryptoService, masterKey)
      : null;
    const notesEnc = input.notes?.trim()
      ? encryptPayload(input.notes.trim(), this.cryptoService, masterKey)
      : null;

    this.db
      .prepare(
        `INSERT INTO passwords (id, domain_enc, username_enc, password_enc, label_enc, notes_enc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(id, domainEnc, usernameEnc, passwordEnc, labelEnc, notesEnc);

    const row = this.db
      .prepare(`SELECT * FROM passwords WHERE id = ?`)
      .get(id) as PasswordRow | undefined;

    if (!row) throw new Error('Failed to create password entry.');
    return rowToSummary(row, this.cryptoService, masterKey);
  }

  updatePassword(input: UpdatePasswordInput): PasswordSummary {
    const masterKey = this.getMasterKey();
    const domain = normalizeDomain(input.domain);

    const domainEnc = encryptPayload(domain, this.cryptoService, masterKey);
    const usernameEnc = encryptPayload(input.username, this.cryptoService, masterKey);
    const passwordEnc = encryptPayload(input.password, this.cryptoService, masterKey);
    const labelEnc = input.label?.trim()
      ? encryptPayload(input.label.trim(), this.cryptoService, masterKey)
      : null;
    const notesEnc = input.notes?.trim()
      ? encryptPayload(input.notes.trim(), this.cryptoService, masterKey)
      : null;

    this.db
      .prepare(
        `UPDATE passwords
         SET domain_enc = ?, username_enc = ?, password_enc = ?, label_enc = ?, notes_enc = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(domainEnc, usernameEnc, passwordEnc, labelEnc, notesEnc, input.id);

    const row = this.db
      .prepare(`SELECT * FROM passwords WHERE id = ?`)
      .get(input.id) as PasswordRow | undefined;

    if (!row) throw new Error('Password entry not found.');
    return rowToSummary(row, this.cryptoService, masterKey);
  }

  deletePassword(id: string): void {
    this.getMasterKey();
    this.db.prepare('DELETE FROM passwords WHERE id = ?').run(id);
  }

  getPasswordsForDomain(domain: string): PasswordDetail[] {
    const masterKey = this.getMasterKey();
    const normalized = normalizeDomain(domain);

    const rows = this.db
      .prepare(`SELECT * FROM passwords`)
      .all() as PasswordRow[];

    const results: PasswordDetail[] = [];
    for (const row of rows) {
      try {
        const decryptedDomain = decryptPayload(row.domain_enc, this.cryptoService, masterKey);
        if (decryptedDomain !== normalized) continue;

        results.push({
          ...rowToSummary(row, this.cryptoService, masterKey),
          password: decryptPayload(row.password_enc, this.cryptoService, masterKey),
          notes: row.notes_enc ? decryptPayload(row.notes_enc, this.cryptoService, masterKey) : null,
        });
      } catch {
        // Skip corrupted rows.
      }
    }
    return results;
  }
}

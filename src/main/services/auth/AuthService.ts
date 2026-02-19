import type { Database as SqliteDatabase } from 'better-sqlite3';
import {
  CryptoService,
  DEFAULT_ARGON2_PARAMS,
  type Argon2KdfParams,
} from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';

type AuthStateRow = {
  password_verifier: string;
  failed_attempts: number | null;
  lockout_until: string | null;
};

type VaultConfigRow = {
  salt: Buffer;
  kdf_params: string;
};

export class AuthService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 15;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly cryptoService: CryptoService,
    private readonly sessionStore: SessionStore,
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

import type { Database as SqliteDatabase } from 'better-sqlite3';
import {
  CryptoService,
  DEFAULT_ARGON2_PARAMS,
  type Argon2KdfParams,
} from '../crypto/CryptoService';
import { SessionStore } from '../../state/SessionStore';

type AuthStateRow = {
  password_verifier: string;
};

type VaultConfigRow = {
  salt: Buffer;
  kdf_params: string;
};

export class AuthService {
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
      .prepare('SELECT password_verifier FROM auth_state WHERE id = 1')
      .get() as AuthStateRow | undefined;

    if (!authState) {
      throw new Error('Vault password has not been configured yet.');
    }

    const isValid = await this.cryptoService.verifyPassword(password, authState.password_verifier);
    if (!isValid) {
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
  }

  lockVault(): void {
    this.sessionStore.lock();
  }

  getSessionState(): { status: 'locked' | 'unlocked'; hasVault: boolean } {
    return this.sessionStore.getState();
  }
}

export type SessionStatus = 'locked' | 'unlocked';

export class SessionStore {
  private masterKey: Buffer | null = null;
  private status: SessionStatus = 'locked';
  private hasVault = false;

  setHasVault(value: boolean): void {
    this.hasVault = value;
  }

  unlock(masterKey: Buffer): void {
    this.masterKey = Buffer.from(masterKey);
    this.status = 'unlocked';
    this.hasVault = true;
  }

  lock(): void {
    if (this.masterKey) {
      this.masterKey.fill(0);
    }

    this.masterKey = null;
    this.status = 'locked';
  }

  getMasterKey(): Buffer {
    if (!this.masterKey) {
      throw new Error('Vault is locked.');
    }

    return this.masterKey;
  }

  getState(): { status: SessionStatus; hasVault: boolean } {
    return {
      status: this.status,
      hasVault: this.hasVault,
    };
  }
}

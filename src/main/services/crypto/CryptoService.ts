import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export type Argon2KdfParams = {
  type: 'argon2id';
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  hashLength: number;
};

export type EncryptedPayload = {
  iv: Buffer;
  authTag: Buffer;
  encrypted: Buffer;
};

export const DEFAULT_ARGON2_PARAMS: Argon2KdfParams = {
  type: 'argon2id',
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 1,
  hashLength: 32,
};

export class CryptoService {
  async createPasswordVerifier(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: DEFAULT_ARGON2_PARAMS.timeCost,
      memoryCost: DEFAULT_ARGON2_PARAMS.memoryCost,
      parallelism: DEFAULT_ARGON2_PARAMS.parallelism,
      hashLength: DEFAULT_ARGON2_PARAMS.hashLength,
    });
  }

  async verifyPassword(password: string, passwordVerifier: string): Promise<boolean> {
    return argon2.verify(passwordVerifier, password);
  }

  async deriveMasterKey(
    password: string,
    salt: Buffer,
    params: Argon2KdfParams,
  ): Promise<Buffer> {
    const derived = await argon2.hash(password, {
      raw: true,
      salt,
      type: argon2.argon2id,
      timeCost: params.timeCost,
      memoryCost: params.memoryCost,
      parallelism: params.parallelism,
      hashLength: params.hashLength,
    });

    return Buffer.from(derived);
  }

  generateVaultSalt(): Buffer {
    return randomBytes(16);
  }

  encryptBuffer(data: Buffer, key: Buffer): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    return {
      iv,
      authTag: cipher.getAuthTag(),
      encrypted,
    };
  }

  decryptBuffer(payload: EncryptedPayload, key: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, payload.iv);
    decipher.setAuthTag(payload.authTag);
    return Buffer.concat([decipher.update(payload.encrypted), decipher.final()]);
  }
}

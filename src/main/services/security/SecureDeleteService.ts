import { randomFillSync } from 'node:crypto';
import fs from 'node:fs/promises';

type SecureDeleteResult = {
  ok: boolean;
  warning?: string;
};

const CHUNK_SIZE = 1024 * 1024;

const createPatternChunk = (byte: number): Buffer => Buffer.alloc(CHUNK_SIZE, byte);

export class SecureDeleteService {
  async secureDelete(filePath: string): Promise<SecureDeleteResult> {
    try {
      const stat = await fs.stat(filePath);
      const size = stat.size;

      if (size > 0) {
        await this.overwriteWithPattern(filePath, size, 0x00);
        await this.overwriteWithPattern(filePath, size, 0xff);
        await this.overwriteWithRandom(filePath, size);
      }

      await fs.unlink(filePath);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown secure-delete error';

      try {
        await fs.unlink(filePath);
        return {
          ok: false,
          warning: `Secure overwrite failed (${message}), file was unlinked without overwrite.`,
        };
      } catch {
        return {
          ok: false,
          warning: `Secure delete failed: ${message}`,
        };
      }
    }
  }

  private async overwriteWithPattern(
    filePath: string,
    size: number,
    byte: number,
  ): Promise<void> {
    const handle = await fs.open(filePath, 'r+');

    try {
      const chunk = createPatternChunk(byte);
      let written = 0;

      while (written < size) {
        const remaining = size - written;
        const length = Math.min(CHUNK_SIZE, remaining);
        await handle.write(chunk, 0, length, written);
        written += length;
      }

      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async overwriteWithRandom(filePath: string, size: number): Promise<void> {
    const handle = await fs.open(filePath, 'r+');

    try {
      let written = 0;

      while (written < size) {
        const remaining = size - written;
        const length = Math.min(CHUNK_SIZE, remaining);
        const chunk = Buffer.alloc(length);
        randomFillSync(chunk);

        await handle.write(chunk, 0, length, written);
        written += length;
      }

      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

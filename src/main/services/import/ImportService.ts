import fs from 'node:fs';
import { VaultService } from '../vault/VaultService';
import type { ImportResult } from '../../../shared/ipc';

export class ImportService {
  constructor(private readonly vaultService: VaultService) {}

  async importFiles(filePaths: string[]): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      failed: 0,
      errors: [],
    };

    for (const filePath of filePaths) {
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        await this.vaultService.addEncryptedFile(filePath);
        result.imported += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown import error';
        result.errors.push(`${filePath}: ${message}`);
      }
    }

    return result;
  }
}

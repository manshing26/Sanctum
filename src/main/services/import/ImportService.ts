import fs from 'node:fs';
import path from 'node:path';
import { MetadataService } from './MetadataService';
import { ThumbnailService } from './ThumbnailService';
import { SettingsService } from '../settings/SettingsService';
import { SecureDeleteService } from '../security/SecureDeleteService';
import { VaultService } from '../vault/VaultService';
import type { ImportRequest, ImportResult } from '../../../shared/ipc';

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
    case '.mov':
      return 'video/quicktime';
    case '.heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
};

export class ImportService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly settingsService: SettingsService,
    private readonly secureDeleteService: SecureDeleteService,
    private readonly metadataService: MetadataService,
    private readonly thumbnailService: ThumbnailService,
  ) {}

  async importFiles(request: ImportRequest): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      failed: 0,
      errors: [],
      warnings: [],
    };

    const securitySettings = this.settingsService.getSecuritySettings();
    const secureDeleteEnabled =
      typeof request.deleteOriginals === 'boolean'
        ? request.deleteOriginals
        : securitySettings.secureDeleteOnImport;

    for (const filePath of request.filePaths) {
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        const mimeType = getMimeType(filePath);
        const { metadata, warning } = await this.metadataService.extract(filePath);
        if (warning) {
          result.warnings?.push(`${filePath}: ${warning}`);
        }

        const { thumbnail, warning: thumbnailWarning } = await this.thumbnailService.generate(
          filePath,
          mimeType,
        );
        if (thumbnailWarning) {
          result.warnings?.push(`${filePath}: ${thumbnailWarning}`);
        }

        try {
          await this.vaultService.addEncryptedFile(filePath, metadata, thumbnail, request.folderId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown import error';
          if (request.folderId !== undefined && request.folderId !== null) {
            const shouldFallbackToUnfiled =
              errorMessage.includes('Folder not found') || errorMessage.includes('FOREIGN KEY');
            if (shouldFallbackToUnfiled) {
              await this.vaultService.addEncryptedFile(filePath, metadata, thumbnail, null);
              result.warnings?.push(
                `${filePath}: Folder assignment failed, item imported as Unfiled.`,
              );
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
        result.imported += 1;

        if (secureDeleteEnabled) {
          const secureDeleteResult = await this.secureDeleteService.secureDelete(filePath);
          if (!secureDeleteResult.ok && secureDeleteResult.warning) {
            result.warnings?.push(`${filePath}: ${secureDeleteResult.warning}`);
          }
        }
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown import error';
        result.errors.push(`${filePath}: ${message}`);
      }
    }

    if (result.warnings && result.warnings.length === 0) {
      delete result.warnings;
    }

    return result;
  }
}

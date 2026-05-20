import fs from 'node:fs';
import path from 'node:path';
import { MetadataService } from './MetadataService';
import { ThumbnailService } from './ThumbnailService';
import { SettingsService } from '../settings/SettingsService';
import { SecureDeleteService } from '../security/SecureDeleteService';
import { VaultService } from '../vault/VaultService';
import type { ConflictResolution, ImportRequest, ImportResult } from '../../../shared/ipc';
import { getMimeTypeForFilename, isMediaMimeType } from '../../../shared/fileTypes';

export type ImportProgressCallback = (progress: {
  total: number;
  processed: number;
  failed: number;
  currentFile?: string;
}) => void;

export class ImportService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly settingsService: SettingsService,
    private readonly secureDeleteService: SecureDeleteService,
    private readonly metadataService: MetadataService,
    private readonly thumbnailService: ThumbnailService,
  ) {}

  async importFiles(request: ImportRequest, onProgress?: ImportProgressCallback): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      warnings: [],
    };

    const securitySettings = this.settingsService.getSecuritySettings();
    const secureDeleteEnabled =
      typeof request.deleteOriginals === 'boolean'
        ? request.deleteOriginals
        : securitySettings.secureDeleteOnImport;

    const resolutionMap = new Map<string, ConflictResolution>(
      (request.conflictResolutions ?? []).map((r) => [r.filePath, r]),
    );

    const total = request.filePaths.length;
    let processed = 0;
    let failed = 0;

    for (const filePath of request.filePaths) {
      try {
        const resolution = resolutionMap.get(filePath);

        if (resolution?.action === 'skip') {
          result.skipped += 1;
          processed += 1;
          onProgress?.({ total, processed, failed, currentFile: filePath });
          continue;
        }

        await fs.promises.access(filePath, fs.constants.R_OK);
        const mimeType = getMimeTypeForFilename(filePath);
        const { metadata, warning } = isMediaMimeType(mimeType)
          ? await this.metadataService.extract(filePath, mimeType)
          : { metadata: {} };
        if (warning) result.warnings?.push(`${filePath}: ${warning}`);

        const { thumbnail, warning: thumbnailWarning } = await this.thumbnailService.generate(
          filePath,
          mimeType,
        );
        if (thumbnailWarning) {
          result.warnings?.push(`${filePath}: ${thumbnailWarning}`);
        }

        const effectiveFolderId = request.folderId ?? null;

        try {
          if (resolution?.action === 'replace' && resolution.existingItemId) {
            await this.vaultService.replaceItem(
              resolution.existingItemId,
              filePath,
              metadata,
              thumbnail,
              effectiveFolderId,
            );
          } else {
            let importName = path.basename(filePath);
            if (resolution?.action === 'keep_both') {
              importName = await this.resolveUniqueFilename(importName, effectiveFolderId);
            }
            await this.vaultService.addEncryptedFile(
              filePath,
              metadata,
              thumbnail,
              effectiveFolderId,
              importName,
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown import error';
          if (effectiveFolderId !== null) {
            const shouldFallbackToUnfiled =
              errorMessage.includes('Folder not found') || errorMessage.includes('FOREIGN KEY');
            if (shouldFallbackToUnfiled) {
              await this.vaultService.addEncryptedFile(filePath, metadata, thumbnail, null);
              result.warnings?.push(
                `${filePath}: Folder assignment failed, item imported to Root.`,
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
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown import error';
        result.errors.push(`${filePath}: ${message}`);
      } finally {
        processed += 1;
        onProgress?.({
          total,
          processed,
          failed,
          currentFile: filePath,
        });
      }
    }

    if (result.warnings && result.warnings.length === 0) {
      delete result.warnings;
    }

    return result;
  }

  private async resolveUniqueFilename(filename: string, folderId: number | null): Promise<string> {
    const existing = this.vaultService.scanFolderItems(folderId);
    const existingNames = new Set(existing.map((item) => item.originalName.toLowerCase()));

    const ext = path.extname(filename);
    const base = ext ? filename.slice(0, -ext.length) : filename;

    let counter = 1;
    let candidate = filename;
    while (existingNames.has(candidate.toLowerCase())) {
      candidate = `${base} (${counter})${ext}`;
      counter += 1;
    }
    return candidate;
  }
}

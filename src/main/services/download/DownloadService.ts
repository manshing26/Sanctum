import fs from 'node:fs/promises';
import path from 'node:path';
import type { DownloadItem, Session } from 'electron';
import { IPC_CHANNELS, type DownloadProgress } from '../../../shared/ipc';
import { BrowserWindowController } from '../../windows/BrowserWindowController';
import { ImportService } from '../import/ImportService';
import { VaultPaths } from '../vault/VaultPaths';
import { SessionStore } from '../../state/SessionStore';

const sanitizeFilename = (name: string): string =>
  name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+/, '').slice(0, 120) || 'download';

type TrackedDownload = {
  id: string;
  item: DownloadItem;
  tempPath: string;
  url: string;
  filename: string;
};

export class DownloadService {
  private readonly downloads = new Map<string, TrackedDownload>();

  constructor(
    private readonly session: Session,
    private readonly vaultPaths: VaultPaths,
    private readonly importService: ImportService,
    private readonly browserWindowController: BrowserWindowController,
    private readonly sessionStore: SessionStore,
  ) {}

  start(): void {
    this.session.on('will-download', (_event, item) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (this.sessionStore.getState().status !== 'unlocked') {
        item.cancel();
        this.emitUpdate({
          id,
          url: item.getURL(),
          filename: item.getFilename(),
          totalBytes: item.getTotalBytes(),
          receivedBytes: item.getReceivedBytes(),
          state: 'failed',
          error: 'Vault is locked. Unlock to save downloads.',
        });
        return;
      }

      const filename = sanitizeFilename(item.getFilename());
      const tempPath = path.join(this.vaultPaths.tempDir, `${id}-${filename}`);
      item.setSavePath(tempPath);

      const tracked: TrackedDownload = {
        id,
        item,
        tempPath,
        url: item.getURL(),
        filename,
      };
      this.downloads.set(id, tracked);

      item.on('updated', () => {
        this.emitUpdate({
          id,
          url: tracked.url,
          filename,
          totalBytes: item.getTotalBytes(),
          receivedBytes: item.getReceivedBytes(),
          state: 'downloading',
        });
      });

      item.once('done', async (_eventDone, state) => {
        const updateBase: DownloadProgress = {
          id,
          url: tracked.url,
          filename,
          totalBytes: item.getTotalBytes(),
          receivedBytes: item.getReceivedBytes(),
          state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'failed',
        };

        if (state === 'completed') {
          try {
            await this.importService.importFiles({
              filePaths: [tempPath],
              deleteOriginals: false,
              folderId: null,
            });
          } catch (error) {
            updateBase.state = 'failed';
            updateBase.error =
              error instanceof Error ? error.message : 'Failed to import downloaded file.';
          }
        } else if (state !== 'cancelled') {
          updateBase.error = 'Download failed.';
        }

        await this.cleanupTempFile(tempPath);
        this.emitUpdate(updateBase);
        this.downloads.delete(id);
      });
    });
  }

  cancelDownload(id: string): boolean {
    const tracked = this.downloads.get(id);
    if (!tracked) {
      return false;
    }
    tracked.item.cancel();
    return true;
  }

  private emitUpdate(payload: DownloadProgress): void {
    const window = this.browserWindowController.getWindow();
    if (!window) {
      return;
    }
    window.webContents.send(IPC_CHANNELS.downloadUpdate, payload);
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore missing temp file.
    }
  }
}

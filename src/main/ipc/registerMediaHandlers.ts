import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type CloseMediaSessionInput,
  type OpenMediaSessionInput,
} from '../../shared/ipc';
import { MediaSessionService } from '../services/vault/MediaSessionService';
import { getLogger } from '../logging/logger';

type RegisterMediaHandlersParams = {
  mediaSessionService: MediaSessionService;
};

const logger = getLogger('media');

export const registerMediaHandlers = ({
  mediaSessionService,
}: RegisterMediaHandlersParams): void => {
  ipcMain.handle(IPC_CHANNELS.openMediaSession, async (_event, input: OpenMediaSessionInput) => {
    const startedAt = Date.now();
    logger.info('open request', { itemId: input.itemId });
    try {
      const data = await mediaSessionService.openMediaSession(input.itemId);
      logger.info('open success', {
        itemId: input.itemId,
        token: data.token.slice(0, 8),
        elapsedMs: Date.now() - startedAt,
      });
      return {
        ok: true as const,
        data,
      };
    } catch (error) {
      logger.error('open failed', {
        itemId: input.itemId,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Failed to open media session.',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.closeMediaSession,
    async (_event, input: CloseMediaSessionInput) => {
      const startedAt = Date.now();
      try {
        await mediaSessionService.closeMediaSession(input.token);
        logger.info('close success', {
          token: input.token.slice(0, 8),
          elapsedMs: Date.now() - startedAt,
        });
        return { ok: true as const };
      } catch (error) {
        logger.error('close failed', {
          token: input.token.slice(0, 8),
          elapsedMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Failed to close media session.',
        };
      }
    },
  );
};

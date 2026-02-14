import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { OpenMediaSessionResult } from '../../../shared/ipc';
import { VaultPaths } from './VaultPaths';
import { VaultService } from './VaultService';

const SESSION_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

type MediaSession = {
  token: string;
  itemId: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  expiresAt: number;
};

const parseRangeHeader = (
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number } | null => {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const raw = rangeHeader.replace('bytes=', '').split(',')[0].trim();
  const [startRaw, endRaw] = raw.split('-');
  const parsedStart = startRaw ? Number.parseInt(startRaw, 10) : NaN;
  const parsedEnd = endRaw ? Number.parseInt(endRaw, 10) : NaN;

  let start: number;
  let end: number;

  if (Number.isNaN(parsedStart)) {
    const suffixLength = Number.isNaN(parsedEnd) ? 0 : parsedEnd;
    if (suffixLength <= 0) {
      return null;
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = parsedStart;
    end = Number.isNaN(parsedEnd) ? fileSize - 1 : parsedEnd;
  }

  if (start < 0 || end < start || start >= fileSize) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
};

const extractToken = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const candidate = segments.at(-1);
    return candidate ?? null;
  } catch {
    return null;
  }
};

export class MediaSessionService {
  private readonly sessions = new Map<string, MediaSession>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly vaultService: VaultService,
    private readonly vaultPaths: VaultPaths,
  ) {}

  start(): void {
    if (this.sweepTimer) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      void this.sweepExpired();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }

    await this.clearAllSessions();
  }

  async openMediaSession(itemId: string): Promise<OpenMediaSessionResult> {
    const startedAt = Date.now();
    console.info('[media-service] open start', { itemId });
    const media = await this.vaultService.getDecryptedMedia(itemId);
    console.info('[media-service] decrypted media', {
      itemId,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      elapsedMs: Date.now() - startedAt,
    });
    const token = randomBytes(32).toString('hex');
    const sessionDir = path.join(this.vaultPaths.tempDir, 'sessions', token);
    const filePath = path.join(sessionDir, 'media');

    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(filePath, media.data);

    const expiresAt = Date.now() + SESSION_TTL_MS;
    this.sessions.set(token, {
      token,
      itemId: media.itemId,
      filePath,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      expiresAt,
    });

    console.info('[media-service] open ready', {
      itemId,
      token: token.slice(0, 8),
      elapsedMs: Date.now() - startedAt,
    });

    return {
      token,
      mediaUrl: `privatevault-media://session/${token}`,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async closeMediaSession(token: string): Promise<void> {
    const existing = this.sessions.get(token);
    if (!existing) {
      return;
    }

    this.sessions.delete(token);
    const dirPath = path.dirname(existing.filePath);
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  async clearAllSessions(): Promise<void> {
    const tokens = [...this.sessions.keys()];
    await Promise.all(tokens.map((token) => this.closeMediaSession(token)));

    const rootSessionsDir = path.join(this.vaultPaths.tempDir, 'sessions');
    await fs.rm(rootSessionsDir, { recursive: true, force: true });
  }

  async createProtocolResponse(rawUrl: string, rangeHeader: string | null): Promise<Response> {
    const token = extractToken(rawUrl);
    if (!token) {
      return new Response('Invalid media token.', { status: 400 });
    }

    const session = this.sessions.get(token);
    if (!session) {
      return new Response('Media session not found.', { status: 404 });
    }

    if (Date.now() > session.expiresAt) {
      await this.closeMediaSession(token);
      return new Response('Media session expired.', { status: 410 });
    }

    const stat = await fs.stat(session.filePath);
    const fileSize = stat.size;
    const parsedRange = parseRangeHeader(rangeHeader, fileSize);

    if (rangeHeader && !parsedRange) {
      return new Response('Requested range not satisfiable.', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const start = parsedRange?.start ?? 0;
    const end = parsedRange?.end ?? fileSize - 1;
    const contentLength = end - start + 1;
    const nodeStream = createReadStream(session.filePath, { start, end });
    const body = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(body, {
      status: parsedRange ? 206 : 200,
      headers: {
        'Content-Type': session.mimeType,
        'Content-Length': String(contentLength),
        'Accept-Ranges': 'bytes',
        ...(parsedRange ? { 'Content-Range': `bytes ${start}-${end}/${fileSize}` } : {}),
        'Cache-Control': 'no-store',
      },
    });
  }

  private async sweepExpired(): Promise<void> {
    const now = Date.now();
    const expiredTokens = [...this.sessions.entries()]
      .filter(([, session]) => now > session.expiresAt)
      .map(([token]) => token);
    if (expiredTokens.length === 0) {
      return;
    }

    await Promise.all(expiredTokens.map((token) => this.closeMediaSession(token)));
  }
}

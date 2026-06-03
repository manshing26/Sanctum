import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureFfmpegExecutable, resolveFfmpegPath } from './FfmpegBinary';
import { loadSharp } from './loadSharp';

const THUMBNAIL_SIZE = 240;
const execFileAsync = promisify(execFile);
const VIDEO_FRAME_OFFSETS_SECONDS = [1, 0.1, 0];

const canGenerateThumbnail = (mimeType: string): boolean => {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
};

export type GeneratedThumbnail = {
  mimeType: string;
  data: Buffer;
};

export class ThumbnailService {
  private async extractVideoFrame(filePath: string): Promise<Buffer> {
    const ffmpegPath = await resolveFfmpegPath();
    await ensureFfmpegExecutable(ffmpegPath);

    for (const offsetSeconds of VIDEO_FRAME_OFFSETS_SECONDS) {
      try {
        const { stdout } = await execFileAsync(ffmpegPath, [
          '-v',
          'error',
          '-ss',
          `${offsetSeconds}`,
          '-i',
          filePath,
          '-frames:v',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          'pipe:1',
        ], { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });

        if (Buffer.isBuffer(stdout) && stdout.byteLength > 0) {
          return stdout;
        }
      } catch {
        // Try the next timestamp fallback.
      }
    }

    throw new Error('Failed to extract a video frame.');
  }

  async generate(
    filePath: string,
    mimeType: string,
  ): Promise<{ thumbnail?: GeneratedThumbnail; warning?: string }> {
    if (!canGenerateThumbnail(mimeType)) {
      return {};
    }

    try {
      const sharp = loadSharp();
      const sourceBuffer = mimeType.startsWith('video/')
        ? await this.extractVideoFrame(filePath)
        : await sharp(filePath).toBuffer();

      const buffer = await sharp(sourceBuffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality: 78 })
        .toBuffer();

      return {
        thumbnail: {
          mimeType: 'image/webp',
          data: buffer,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown thumbnail generation failure';
      return {
        warning: `Thumbnail generation skipped: ${message}`,
      };
    }
  }
}

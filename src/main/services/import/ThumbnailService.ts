import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

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
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveFfmpegPath(): Promise<string> {
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
      ffmpegStatic ?? '',
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', binaryName),
      path.join(__dirname, 'native_modules', binaryName),
      path.join(__dirname, '..', 'native_modules', binaryName),
      path.join(
        process.resourcesPath ?? '',
        'app.asar.unpacked',
        'node_modules',
        'ffmpeg-static',
        binaryName,
      ),
      binaryName,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate === binaryName) {
        return candidate;
      }

      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    throw new Error('ffmpeg binary is unavailable in this build.');
  }

  private async ensureExecutable(binaryPath: string): Promise<void> {
    if (process.platform === 'win32') {
      return;
    }

    try {
      await access(binaryPath, constants.X_OK);
      return;
    } catch {
      // Continue and attempt to set execute permission.
    }

    await chmod(binaryPath, 0o755);
  }

  private async extractVideoFrame(filePath: string): Promise<Buffer> {
    const ffmpegPath = await this.resolveFfmpegPath();
    if (ffmpegPath !== (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')) {
      await this.ensureExecutable(ffmpegPath);
    }

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

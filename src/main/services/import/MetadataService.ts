import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseFile } from 'music-metadata';
import { isAudioMimeType, isImageMimeType, isVideoMimeType } from '../../../shared/fileTypes';
import { ensureFfmpegExecutable, resolveFfmpegPath } from './FfmpegBinary';
import { loadSharp } from './loadSharp';

const execFileAsync = promisify(execFile);

export type ExtractedMetadata = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  audioTitle?: string;
  audioArtist?: string;
  audioAlbum?: string;
  embeddedArtwork?: {
    mimeType: string;
    data: Buffer;
  };
};

export class MetadataService {
  private async extractImageMetadata(
    filePath: string,
  ): Promise<{ metadata: ExtractedMetadata; warning?: string }> {
    try {
      const sharp = loadSharp();
      const metadata = await sharp(filePath).metadata();
      return {
        metadata: {
          width: metadata.width,
          height: metadata.height,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown image metadata extraction failure';
      return {
        metadata: {},
        warning: `Metadata extraction skipped: ${message}`,
      };
    }
  }

  private async probeWithFfmpeg(binaryPath: string, filePath: string): Promise<string> {
    try {
      await execFileAsync(binaryPath, [
        '-hide_banner',
        '-i',
        filePath,
      ]);
    } catch (error) {
      const execError = error as { stderr?: unknown };
      if (typeof execError.stderr === 'string') {
        return execError.stderr;
      }
    }

    return '';
  }

  private parseFfmpegMetadata(output: string): ExtractedMetadata {
    const metadata: ExtractedMetadata = {};

    const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (durationMatch) {
      const hours = Number(durationMatch[1]);
      const minutes = Number(durationMatch[2]);
      const seconds = Number(durationMatch[3]);
      if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
        metadata.durationSeconds = hours * 3600 + minutes * 60 + seconds;
      }
    }

    const videoLine = output.split(/\r?\n/).find((line) => line.includes('Video:'));
    const dimensionsMatch = videoLine?.match(/(?:^|[\s,])(\d{2,5})x(\d{2,5})(?:[\s,\[]|$)/);
    if (dimensionsMatch) {
      const width = Number(dimensionsMatch[1]);
      const height = Number(dimensionsMatch[2]);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        metadata.width = width;
        metadata.height = height;
      }
    }

    return metadata;
  }

  private async extractVideoMetadata(
    filePath: string,
  ): Promise<{ metadata: ExtractedMetadata; warning?: string }> {
    try {
      const ffmpegPath = await resolveFfmpegPath();
      await ensureFfmpegExecutable(ffmpegPath);
      const output = await this.probeWithFfmpeg(ffmpegPath, filePath);
      const metadata = this.parseFfmpegMetadata(output);
      if (!metadata.width && !metadata.height && !metadata.durationSeconds) {
        return {
          metadata: {},
          warning: 'Metadata extraction skipped: ffmpeg output did not include readable video metadata.',
        };
      }

      return {
        metadata,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown metadata extraction failure';
      return {
        metadata: {},
        warning: `Metadata extraction skipped: ${message}`,
      };
    }
  }

  private async extractAudioMetadata(
    filePath: string,
  ): Promise<{ metadata: ExtractedMetadata; warning?: string }> {
    try {
      const parsed = await parseFile(filePath, { duration: true });
      const picture = parsed.common.picture?.find((entry) => entry.data.byteLength > 0);
      return {
        metadata: {
          durationSeconds: Number.isFinite(parsed.format.duration)
            ? parsed.format.duration
            : undefined,
          audioTitle: parsed.common.title?.trim() || undefined,
          audioArtist: parsed.common.artist?.trim() || undefined,
          audioAlbum: parsed.common.album?.trim() || undefined,
          embeddedArtwork: picture
            ? {
                mimeType: picture.format || 'image/jpeg',
                data: Buffer.from(picture.data),
              }
            : undefined,
        },
      };
    } catch (error) {
      try {
        const ffmpegPath = await resolveFfmpegPath();
        await ensureFfmpegExecutable(ffmpegPath);
        const output = await this.probeWithFfmpeg(ffmpegPath, filePath);
        const metadata = this.parseFfmpegMetadata(output);
        return {
          metadata: { durationSeconds: metadata.durationSeconds },
          warning: 'Audio tags could not be read; duration was recovered with ffmpeg.',
        };
      } catch {
        const message =
          error instanceof Error ? error.message : 'Unknown audio metadata extraction failure';
        return {
          metadata: {},
          warning: `Metadata extraction skipped: ${message}`,
        };
      }
    }
  }

  async extract(
    filePath: string,
    mimeType: string,
  ): Promise<{ metadata: ExtractedMetadata; warning?: string }> {
    if (isImageMimeType(mimeType)) {
      return this.extractImageMetadata(filePath);
    }

    if (isVideoMimeType(mimeType)) {
      return this.extractVideoMetadata(filePath);
    }

    if (isAudioMimeType(mimeType)) {
      return this.extractAudioMetadata(filePath);
    }

    return { metadata: {} };
  }
}

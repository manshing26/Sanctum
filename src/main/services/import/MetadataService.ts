import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod } from 'node:fs/promises';
import { promisify } from 'node:util';
import ffprobeStatic from 'ffprobe-static';
import { isImageMimeType, isVideoMimeType } from '../../../shared/fileTypes';
import { loadSharp } from './loadSharp';

const execFileAsync = promisify(execFile);

type FfprobeStream = {
  width?: number;
  height?: number;
  duration?: string | number;
};

type FfprobeFormat = {
  duration?: string | number;
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
};

export type ExtractedMetadata = {
  width?: number;
  height?: number;
  durationSeconds?: number;
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

  private async probe(binaryPath: string, filePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(binaryPath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        filePath,
      ]);
      return stdout;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EACCES' && process.platform !== 'win32') {
        await chmod(binaryPath, 0o755);
        const { stdout } = await execFileAsync(binaryPath, [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_streams',
          '-show_format',
          filePath,
        ]);
        return stdout;
      }

      throw error;
    }
  }

  private async extractVideoMetadata(
    filePath: string,
  ): Promise<{ metadata: ExtractedMetadata; warning?: string }> {
    if (!ffprobeStatic.path) {
      return {
        metadata: {},
        warning: 'Metadata probing is unavailable in this build.',
      };
    }

    try {
      await this.ensureExecutable(ffprobeStatic.path);
      const stdout = await this.probe(ffprobeStatic.path, filePath);

      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const streams = parsed.streams ?? [];
      const streamWithDimensions = streams.find(
        (stream) => Number.isFinite(stream.width) || Number.isFinite(stream.height),
      );
      const firstDuration =
        streams.find((stream) => stream.duration !== undefined)?.duration ??
        parsed.format?.duration;

      const toNumber = (value: string | number | undefined): number | undefined => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : undefined;
        }

        if (typeof value === 'string') {
          const parsedNumber = Number(value);
          return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
        }

        return undefined;
      };

      return {
        metadata: {
          width: toNumber(streamWithDimensions?.width),
          height: toNumber(streamWithDimensions?.height),
          durationSeconds: toNumber(firstDuration),
        },
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

    return { metadata: {} };
  }
}

import { constants } from 'node:fs';
import { access, chmod } from 'node:fs/promises';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const getFfmpegBinaryName = (): string => (
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
);

export const resolveFfmpegPath = async (): Promise<string> => {
  const binaryName = getFfmpegBinaryName();
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

    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error('ffmpeg binary is unavailable in this build.');
};

export const ensureFfmpegExecutable = async (binaryPath: string): Promise<void> => {
  if (process.platform === 'win32' || binaryPath === getFfmpegBinaryName()) {
    return;
  }

  try {
    await access(binaryPath, constants.X_OK);
    return;
  } catch {
    // Continue and attempt to set execute permission.
  }

  await chmod(binaryPath, 0o755);
};


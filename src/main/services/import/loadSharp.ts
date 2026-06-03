import { existsSync } from 'node:fs';
import path from 'node:path';

let sharpModule: typeof import('sharp') | null = null;

export const loadSharp = (): typeof import('sharp') => {
  if (!sharpModule) {
    // Keep sharp out of the Webpack bundle so its native optional packages
    // resolve from app.asar.unpacked at runtime.
    // eslint-disable-next-line no-eval
    const runtimeRequire = eval('require') as NodeRequire;
    const unpackedSharpPath = path.join(
      process.resourcesPath ?? '',
      'app.asar.unpacked',
      'node_modules',
      'sharp',
    );
    sharpModule = runtimeRequire(
      existsSync(unpackedSharpPath) ? unpackedSharpPath : 'sharp',
    ) as typeof import('sharp');
  }

  return sharpModule;
};

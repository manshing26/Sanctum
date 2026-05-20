import type { AppearanceSettings } from '../../shared/ipc';

export const TEXT_SIZE_SCALE: Record<AppearanceSettings['textSize'], number> = {
  small: 1,
  medium: 1.12,
  large: 1.25,
};

export const fontSize = (basePx: number): string =>
  `calc(${basePx}px * var(--sanctum-text-scale, 1))`;

export const applyTextScale = (textSize: AppearanceSettings['textSize']): void => {
  document.documentElement.style.setProperty(
    '--sanctum-text-scale',
    String(TEXT_SIZE_SCALE[textSize] ?? TEXT_SIZE_SCALE.small),
  );
};

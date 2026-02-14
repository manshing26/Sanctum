import { useMemo, useState } from 'react';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export const useViewerControls = () => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'fit' | 'original'>('fit');

  const zoomIn = (): void => {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  };

  const zoomOut = (): void => {
    setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2))));
  };

  const reset = (): void => {
    setZoom(1);
    setRotation(0);
    setFitMode('fit');
  };

  const rotateClockwise = (): void => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const toggleFitMode = (): void => {
    setFitMode((prev) => (prev === 'fit' ? 'original' : 'fit'));
  };

  const transformStyle = useMemo(
    () => ({
      transform: `scale(${zoom}) rotate(${rotation}deg)`,
    }),
    [zoom, rotation],
  );

  return {
    zoom,
    rotation,
    fitMode,
    transformStyle,
    zoomIn,
    zoomOut,
    rotateClockwise,
    toggleFitMode,
    reset,
  };
};

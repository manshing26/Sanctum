import { useCallback, useMemo, useState } from 'react';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export const useViewerControls = () => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'fit' | 'original'>('fit');
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const zoomIn = (): void => {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  };

  const zoomOut = (): void => {
    setZoom((prev) => {
      const next = Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const zoomBy = useCallback((delta: number): void => {
    setZoom((prev) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((prev + delta).toFixed(2))));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const reset = (): void => {
    setZoom(1);
    setRotation(0);
    setFitMode('fit');
    setPan({ x: 0, y: 0 });
  };

  const rotateClockwise = (): void => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const toggleFitMode = (): void => {
    setFitMode((prev) => (prev === 'fit' ? 'original' : 'fit'));
    setPan({ x: 0, y: 0 });
  };

  const setPanPosition = useCallback((nextPan: { x: number; y: number }): void => {
    setPan(nextPan);
  }, []);

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
    }),
    [pan.x, pan.y, zoom, rotation],
  );

  return {
    zoom,
    rotation,
    fitMode,
    pan,
    transformStyle,
    zoomIn,
    zoomOut,
    zoomBy,
    rotateClockwise,
    toggleFitMode,
    setPanPosition,
    reset,
  };
};

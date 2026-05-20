import React, { useRef, useState } from 'react';

type ImageViewerProps = {
  src: string;
  alt: string;
  transformStyle: React.CSSProperties;
  fitMode: 'fit' | 'original';
  zoom: number;
  pan: { x: number; y: number };
  onZoomBy: (delta: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onError?: () => void;
};

export const ImageViewer = ({
  src,
  alt,
  transformStyle,
  fitMode,
  zoom,
  pan,
  onZoomBy,
  onPanChange,
  onError,
}: ImageViewerProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const canPan = zoom > 1;
  const wheelAccumulatorRef = useRef(0);

  const clampPan = (nextPan: { x: number; y: number }): { x: number; y: number } => {
    const container = containerRef.current;
    if (!container) return nextPan;
    const maxX = Math.max(container.clientWidth * (zoom - 1) * 0.5, 0);
    const maxY = Math.max(container.clientHeight * (zoom - 1) * 0.5, 0);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!canPan || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    onPanChange(clampPan({
      x: drag.startPanX + event.clientX - drag.startX,
      y: drag.startPanY + event.clientY - drag.startY,
    }));
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    event.stopPropagation();

    wheelAccumulatorRef.current += event.deltaY;
    if (Math.abs(wheelAccumulatorRef.current) < 40) return;

    const direction = wheelAccumulatorRef.current < 0 ? 1 : -1;
    const step = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.15 : 0.1;
    onZoomBy(direction * step);
    wheelAccumulatorRef.current = 0;
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-auto p-4"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={handleWheel}
      style={{ cursor: canPan ? (isDragging ? 'grabbing' : 'grab') : 'default', touchAction: canPan ? 'none' : 'auto' }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`select-none transition-transform duration-200 ${
          fitMode === 'fit' ? 'max-h-full max-w-full object-contain' : 'object-none'
        }`}
        style={transformStyle}
        onError={() => onError?.()}
      />
    </div>
  );
};

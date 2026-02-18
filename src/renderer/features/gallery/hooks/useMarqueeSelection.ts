import { useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type UseMarqueeSelectionParams = {
  containerRef: RefObject<HTMLElement | null>;
  selectedItemIds: string[];
  onSetSelectedItems: (itemIds: string[]) => void;
  onBeginSelection?: () => void;
  onEmptyBackgroundClick?: () => void;
};

type UseMarqueeSelectionResult = {
  isSelecting: boolean;
  overlayStyle: CSSProperties | null;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
};

const toRect = (x1: number, y1: number, x2: number, y2: number): Rect => ({
  left: Math.min(x1, x2),
  top: Math.min(y1, y2),
  right: Math.max(x1, x2),
  bottom: Math.max(y1, y2),
});

const intersects = (a: Rect, b: Rect): boolean =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

export const useMarqueeSelection = ({
  containerRef,
  selectedItemIds,
  onSetSelectedItems,
  onBeginSelection,
  onEmptyBackgroundClick,
}: UseMarqueeSelectionParams): UseMarqueeSelectionResult => {
  const dragThresholdPx = 6;
  const [isSelecting, setIsSelecting] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties | null>(null);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasCrossedThresholdRef = useRef(false);
  const appendModeRef = useRef(false);
  const baseSelectionRef = useRef<string[]>([]);

  const onMouseDown = (event: ReactMouseEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    // Start marquee only from empty canvas/background, not from item cards/rows or controls.
    if (
      target.closest('[data-gallery-item-id]') ||
      target.closest('button, a, input, select, textarea, [role="button"], [data-no-marquee]')
    ) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    dragStartRef.current = { x: startX, y: startY };
    hasCrossedThresholdRef.current = false;
    appendModeRef.current = event.metaKey || event.ctrlKey;
    baseSelectionRef.current = selectedItemIds;

    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
      const start = dragStartRef.current;
      const container = containerRef.current;
      if (!start || !container) {
        return;
      }

      const currentX = moveEvent.clientX;
      const currentY = moveEvent.clientY;
      const distance = Math.hypot(currentX - start.x, currentY - start.y);
      if (!hasCrossedThresholdRef.current) {
        if (distance < dragThresholdPx) {
          return;
        }
        hasCrossedThresholdRef.current = true;
        onBeginSelection?.();
        setIsSelecting(true);
      }

      const selectionRect = toRect(start.x, start.y, currentX, currentY);
      const containerRect = container.getBoundingClientRect();
      const localRect = toRect(
        start.x - containerRect.left,
        start.y - containerRect.top,
        currentX - containerRect.left,
        currentY - containerRect.top,
      );

      setOverlayStyle({
        left: `${localRect.left}px`,
        top: `${localRect.top}px`,
        width: `${Math.max(1, localRect.right - localRect.left)}px`,
        height: `${Math.max(1, localRect.bottom - localRect.top)}px`,
      });

      const hitIds: string[] = [];
      const elements = container.querySelectorAll<HTMLElement>('[data-gallery-item-id]');
      for (const element of elements) {
        const itemId = element.dataset.galleryItemId;
        if (!itemId) {
          continue;
        }
        const itemRect = element.getBoundingClientRect();
        if (
          intersects(selectionRect, {
            left: itemRect.left,
            top: itemRect.top,
            right: itemRect.right,
            bottom: itemRect.bottom,
          })
        ) {
          hitIds.push(itemId);
        }
      }

      if (appendModeRef.current) {
        const merged = Array.from(new Set([...baseSelectionRef.current, ...hitIds]));
        onSetSelectedItems(merged);
      } else {
        onSetSelectedItems(hitIds);
      }
    };

    const onMouseUp = (): void => {
      if (!hasCrossedThresholdRef.current) {
        onEmptyBackgroundClick?.();
      }
      dragStartRef.current = null;
      hasCrossedThresholdRef.current = false;
      setIsSelecting(false);
      setOverlayStyle(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    event.preventDefault();
  };

  return {
    isSelecting,
    overlayStyle,
    onMouseDown,
  };
};

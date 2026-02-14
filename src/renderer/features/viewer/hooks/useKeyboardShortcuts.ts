import { useEffect } from 'react';

type KeyboardHandlers = {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRotate?: () => void;
  onReset?: () => void;
};

const isTypingElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
};

export const useKeyboardShortcuts = (handlers: KeyboardHandlers): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingElement(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        handlers.onClose();
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        handlers.onPrev();
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        handlers.onNext();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlers.onSeekBackward?.();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.onSeekForward?.();
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        handlers.onPlayPause?.();
        return;
      }

      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        handlers.onToggleMute?.();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        handlers.onToggleFullscreen?.();
        return;
      }

      if (event.key === '+') {
        event.preventDefault();
        handlers.onZoomIn?.();
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        handlers.onZoomOut?.();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        handlers.onRotate?.();
        return;
      }

      if (event.key === '0') {
        event.preventDefault();
        handlers.onReset?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handlers]);
};

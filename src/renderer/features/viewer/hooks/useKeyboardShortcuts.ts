import { useEffect } from 'react';

type KeyboardHandlers = {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause?: () => void;
  onVideoSeekBackward?: () => void;
  onVideoSeekForward?: () => void;
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onPdfZoomIn?: () => void;
  onPdfZoomOut?: () => void;
  onPdfReset?: () => void;
  onRotate?: () => void;
  onReset?: () => void;
  onToggleHelp?: () => void;
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

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        handlers.onToggleHelp?.();
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

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        handlers.onPrev();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        handlers.onNext();
        return;
      }

      if (event.key === 'ArrowLeft' && handlers.onVideoSeekBackward) {
        event.preventDefault();
        handlers.onVideoSeekBackward();
        return;
      }

      if (event.key === 'ArrowRight' && handlers.onVideoSeekForward) {
        event.preventDefault();
        handlers.onVideoSeekForward();
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

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        handlers.onZoomIn?.();
        handlers.onPdfZoomIn?.();
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        handlers.onZoomOut?.();
        handlers.onPdfZoomOut?.();
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
        handlers.onPdfReset?.();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [handlers]);
};

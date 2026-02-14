import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OpenMediaSessionResult } from '../../../shared/ipc';
import { ImageViewer } from './components/ImageViewer';
import { VideoViewer } from './components/VideoViewer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useViewerControls } from './hooks/useViewerControls';
import type { MediaViewerOverlayProps } from './types';

type ViewerLoadState = {
  isLoading: boolean;
  error: string | null;
  session: OpenMediaSessionResult | null;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
};

export const MediaViewerOverlay = ({
  items,
  currentItemId,
  onClose,
  onNavigate,
  onMessage,
}: MediaViewerOverlayProps): React.JSX.Element => {
  const [state, setState] = useState<ViewerLoadState>({
    isLoading: true,
    error: null,
    session: null,
  });
  const [reopenAttempted, setReopenAttempted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousTokenRef = useRef<string | null>(null);
  const openedAtRef = useRef<number>(Date.now());
  const viewerControls = useViewerControls();

  const currentIndex = useMemo(
    () => items.findIndex((item) => item.id === currentItemId),
    [items, currentItemId],
  );
  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < items.length - 1;
  const mimeType = state.session?.mimeType ?? currentItem?.mimeType ?? 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  const closeToken = async (token: string | null): Promise<void> => {
    if (!token) {
      return;
    }

    await window.electronAPI.closeMediaSession({ token });
  };

  const openSession = async (itemId: string): Promise<void> => {
    console.info('[viewer] open requested', { itemId });
    setState({
      isLoading: true,
      error: null,
      session: null,
    });

    const previousToken = previousTokenRef.current;
    previousTokenRef.current = null;
    await closeToken(previousToken);

    let result: Awaited<ReturnType<typeof window.electronAPI.openMediaSession>>;
    try {
      result = await withTimeout(
        window.electronAPI.openMediaSession({ itemId }),
        15000,
        'Timed out while opening media session.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open media session.';
      console.error('[viewer] open exception', { itemId, error: message });
      setState({
        isLoading: false,
        error: message,
        session: null,
      });
      onMessage(message);
      return;
    }

    if (!result.ok) {
      console.error('[viewer] open failed', { itemId, error: result.error });
      onMessage(result.error);
      setState({
        isLoading: false,
        error: result.error,
        session: null,
      });
      return;
    }

    console.info('[viewer] open success', {
      itemId,
      token: result.data.token.slice(0, 8),
    });
    previousTokenRef.current = result.data.token;
    setState({
      isLoading: false,
      error: null,
      session: result.data,
    });
  };

  useEffect(() => {
    console.info('[viewer] overlay mounted', { currentItemId });
    return () => {
      console.info('[viewer] overlay unmounted', { currentItemId });
    };
  }, []);

  useEffect(() => {
    console.info('[viewer] current item changed', { currentItemId });
    viewerControls.reset();
    setReopenAttempted(false);
    if (currentItem) {
      void openSession(currentItem.id);
    } else {
      setState({
        isLoading: false,
        error: 'Selected item is not available.',
        session: null,
      });
    }
  }, [currentItemId]);

  useEffect(() => {
    return () => {
      void closeToken(previousTokenRef.current);
      previousTokenRef.current = null;
    };
  }, []);

  const closeViewer = (): void => {
    console.info('[viewer] close requested');
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    onClose();
  };

  const navigatePrev = (): void => {
    if (!canPrev) {
      return;
    }
    onNavigate(items[currentIndex - 1].id);
  };

  const navigateNext = (): void => {
    if (!canNext) {
      return;
    }
    onNavigate(items[currentIndex + 1].id);
  };

  const togglePlayPause = (): void => {
    if (!videoRef.current) {
      return;
    }
    if (videoRef.current.paused) {
      void videoRef.current.play().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Video playback failed.';
        onMessage(message);
      });
    } else {
      videoRef.current.pause();
    }
  };

  const seekBy = (seconds: number): void => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
  };

  const toggleMute = (): void => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.muted = !videoRef.current.muted;
  };

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (!containerRef.current) {
      return;
    }
    void containerRef.current.requestFullscreen();
  };

  const handleImageError = async (): Promise<void> => {
    if (reopenAttempted || !currentItem) {
      setState((prev) => ({
        ...prev,
        error: prev.error ?? 'Unable to load this image.',
      }));
      return;
    }

    setReopenAttempted(true);
    onMessage('Image load failed once, retrying session...');
    await openSession(currentItem.id);
  };

  const handleVideoError = (): void => {
    setState((prev) => ({
      ...prev,
      error:
        prev.error ??
        'Unable to decode this video file in current runtime. Codec may be unsupported.',
    }));
  };

  useKeyboardShortcuts({
    onClose: closeViewer,
    onPrev: navigatePrev,
    onNext: navigateNext,
    onPlayPause: isVideo ? togglePlayPause : undefined,
    onSeekBackward: isVideo ? () => seekBy(-5) : undefined,
    onSeekForward: isVideo ? () => seekBy(5) : undefined,
    onToggleMute: isVideo ? toggleMute : undefined,
    onToggleFullscreen: toggleFullscreen,
    onZoomIn: isImage ? viewerControls.zoomIn : undefined,
    onZoomOut: isImage ? viewerControls.zoomOut : undefined,
    onRotate: isImage ? viewerControls.rotateClockwise : undefined,
    onReset: isImage ? viewerControls.reset : undefined,
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.82)',
      }}
      onClick={(event) => {
        // Prevent the opening click from immediately closing the modal.
        if (Date.now() - openedAtRef.current < 250) {
          return;
        }
        if (event.target !== event.currentTarget) {
          return;
        }
        console.info('[viewer] backdrop click close');
        closeViewer();
      }}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="flex h-[min(92vh,900px)] w-[min(96vw,1500px)] flex-col gap-3 rounded-xl border border-border bg-surface p-3"
        style={{
          width: 'min(96vw, 1500px)',
          height: 'min(92vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          border: '1px solid rgb(var(--border))',
          borderRadius: '12px',
          background: 'rgb(var(--surface))',
          padding: '12px',
          boxSizing: 'border-box',
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{currentItem?.originalName ?? 'Viewer'}</p>
            <p className="text-xs text-text-muted">{mimeType}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={navigatePrev}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:opacity-40"
            >
              Prev [
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={navigateNext}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:opacity-40"
            >
              Next ]
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Fullscreen
            </button>
            <button
              type="button"
              onClick={closeViewer}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Close
            </button>
          </div>
        </div>

        {isImage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={viewerControls.zoomOut}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Zoom -
            </button>
            <button
              type="button"
              onClick={viewerControls.zoomIn}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Zoom +
            </button>
            <button
              type="button"
              onClick={viewerControls.rotateClockwise}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Rotate
            </button>
            <button
              type="button"
              onClick={viewerControls.toggleFitMode}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              {viewerControls.fitMode === 'fit' ? 'Original size' : 'Fit'}
            </button>
            <button
              type="button"
              onClick={viewerControls.reset}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
            >
              Reset
            </button>
            <span className="text-xs text-text-muted">Zoom {Math.round(viewerControls.zoom * 100)}%</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {state.isLoading ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-bg/60 text-sm text-text-muted">
              Opening media...
            </div>
          ) : null}

          {!state.isLoading && state.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-danger/40 bg-danger/5 text-sm text-danger">
              <p>{state.error}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeViewer}
                  className="rounded-md border border-border px-2 py-1 text-xs text-text-primary"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={navigateNext}
                  className="rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {!state.isLoading && !state.error && state.session && isImage ? (
            <ImageViewer
              src={state.session.mediaUrl}
              alt={currentItem?.originalName ?? 'Image'}
              fitMode={viewerControls.fitMode}
              transformStyle={viewerControls.transformStyle}
              onError={() => {
                void handleImageError();
              }}
            />
          ) : null}

          {!state.isLoading && !state.error && state.session && isVideo ? (
            <VideoViewer
              src={state.session.mediaUrl}
              videoRef={videoRef}
              onError={() => {
                handleVideoError();
              }}
            />
          ) : null}

          {!state.isLoading && !state.error && state.session && !isImage && !isVideo ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-bg/60 text-sm text-text-muted">
              Unsupported media type: {state.session.mimeType}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

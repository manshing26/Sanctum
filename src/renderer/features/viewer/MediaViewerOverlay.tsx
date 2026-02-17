import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { OpenMediaSessionResult } from '../../../shared/ipc';
import { Button } from '../../components/ui/Button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/Tooltip';
import { ImageViewer } from './components/ImageViewer';
import { VideoViewer } from './components/VideoViewer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useViewerControls } from './hooks/useViewerControls';
import type { MediaViewerOverlayProps } from './types';
import { cn } from '../../lib/utils';

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

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

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

  // Auto-hide controls after inactivity
  const resetControlsTimer = (): void => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const closeToken = async (token: string | null): Promise<void> => {
    if (!token) return;
    await window.electronAPI.closeMediaSession({ token });
  };

  const openSession = async (itemId: string): Promise<void> => {
    setState({ isLoading: true, error: null, session: null });

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
      setState({ isLoading: false, error: message, session: null });
      onMessage(message);
      return;
    }

    if (!result.ok) {
      onMessage(result.error);
      setState({ isLoading: false, error: result.error, session: null });
      return;
    }

    previousTokenRef.current = result.data.token;
    setState({ isLoading: false, error: null, session: result.data });
  };

  useEffect(() => {
    return () => {
      void closeToken(previousTokenRef.current);
      previousTokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerControls.reset();
    setPlaybackRate(1);
    setReopenAttempted(false);
    resetControlsTimer();
    if (currentItem) {
      void openSession(currentItem.id);
    } else {
      setState({ isLoading: false, error: 'Selected item is not available.', session: null });
    }
  }, [currentItemId]);

  const closeViewer = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    onClose();
  };

  const navigatePrev = (): void => {
    if (canPrev) onNavigate(items[currentIndex - 1].id);
  };

  const navigateNext = (): void => {
    if (canNext) onNavigate(items[currentIndex + 1].id);
  };

  const togglePlayPause = (): void => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play().catch((error: unknown) => {
        onMessage(error instanceof Error ? error.message : 'Video playback failed.');
      });
    } else {
      videoRef.current.pause();
    }
  };

  const seekBy = (seconds: number): void => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
  };

  const toggleMute = (): void => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
  };

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (containerRef.current) void containerRef.current.requestFullscreen();
  };

  const handleImageError = async (): Promise<void> => {
    if (reopenAttempted || !currentItem) {
      setState((prev) => ({ ...prev, error: prev.error ?? 'Unable to load this image.' }));
      return;
    }
    setReopenAttempted(true);
    onMessage('Retrying...');
    await openSession(currentItem.id);
  };

  const handleVideoError = (): void => {
    setState((prev) => ({
      ...prev,
      error: prev.error ?? 'Unable to decode this video. Codec may be unsupported.',
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
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/90"
      onClick={(e) => {
        if (Date.now() - openedAtRef.current < 250) return;
        if (e.target !== e.currentTarget) return;
        closeViewer();
      }}
      onMouseMove={resetControlsTimer}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="relative flex h-full w-full flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top bar — filename, counter, close */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{currentItem?.originalName ?? 'Viewer'}</p>
            <p className="text-xs text-white/60">{mimeType}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/70">
              {currentIndex + 1} / {items.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={closeViewer}
              className="text-white hover:bg-white/10"
              aria-label="Close viewer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Navigation arrows */}
        {canPrev && (
          <button
            type="button"
            onClick={navigatePrev}
            className={cn(
              'absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 transition-all hover:bg-black/60 hover:text-white',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={navigateNext}
            className={cn(
              'absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 transition-all hover:bg-black/60 hover:text-white',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Content area */}
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {state.isLoading && (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Loading media...</span>
            </div>
          )}

          {!state.isLoading && state.error && (
            <div className="flex flex-col items-center gap-3 text-white/70">
              <AlertCircle className="h-10 w-10 text-danger" />
              <p className="max-w-md text-center text-sm">{state.error}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={closeViewer}>
                  Close
                </Button>
                {canNext && (
                  <Button variant="secondary" size="sm" onClick={navigateNext}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          )}

          {!state.isLoading && !state.error && state.session && isImage && (
            <ImageViewer
              src={state.session.mediaUrl}
              alt={currentItem?.originalName ?? 'Image'}
              fitMode={viewerControls.fitMode}
              transformStyle={viewerControls.transformStyle}
              onError={() => void handleImageError()}
            />
          )}

          {!state.isLoading && !state.error && state.session && isVideo && (
            <VideoViewer
              src={state.session.mediaUrl}
              videoRef={videoRef}
              playbackRate={playbackRate}
              onError={handleVideoError}
            />
          )}

          {!state.isLoading && !state.error && state.session && !isImage && !isVideo && (
            <div className="text-sm text-white/60">
              Unsupported media type: {state.session.mimeType}
            </div>
          )}
        </div>

        {/* Bottom control bar */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent px-4 py-3 transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
            {isImage && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={viewerControls.zoomOut} className="text-white hover:bg-white/10">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom out (-)</TooltipContent>
                </Tooltip>

                <span className="min-w-[3rem] text-center text-xs text-white/70">
                  {Math.round(viewerControls.zoom * 100)}%
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={viewerControls.zoomIn} className="text-white hover:bg-white/10">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom in (+)</TooltipContent>
                </Tooltip>

                <div className="mx-1 h-4 w-px bg-white/20" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={viewerControls.rotateClockwise} className="text-white hover:bg-white/10">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Rotate (R)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={viewerControls.toggleFitMode} className="text-white hover:bg-white/10">
                      {viewerControls.fitMode === 'fit' ? (
                        <Maximize2 className="h-4 w-4" />
                      ) : (
                        <Minimize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{viewerControls.fitMode === 'fit' ? 'Original size' : 'Fit to view'}</TooltipContent>
                </Tooltip>
              </>
            )}

            {isVideo && (
              <>
                <span className="text-xs text-white/60 mr-1">Speed</span>
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackRate(speed)}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs transition-colors',
                      playbackRate === speed
                        ? 'bg-accent text-accent-foreground'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </>
            )}

            <div className="mx-1 h-4 w-px bg-white/20" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen} className="text-white hover:bg-white/10">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen (F)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

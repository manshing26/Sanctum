import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Edit3,
  Expand,
  ListVideo,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { VideoTimestamp } from '../../../../shared/ipc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SanctumDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui';
import { cn, formatDuration } from '../../../lib/utils';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const VIDEO_ACCENT = 'rgb(124,154,146)';
const VIDEO_ACCENT_SOFT = 'rgba(124,154,146,0.16)';
const VIDEO_ACCENT_BORDER = 'rgba(124,154,146,0.44)';

type VideoViewerProps = {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fullscreenRef: React.MutableRefObject<(() => void) | null>;
  playbackRate?: number;
  onPlaybackRateChange: (speed: number) => void;
  timestamps: VideoTimestamp[];
  showResumePrompt: boolean;
  resumePosition?: number | null;
  onResume: () => void;
  onDismissResume: () => void;
  onSaveTimestamp: () => void | Promise<void>;
  onDeleteTimestamp: (id: string) => void | Promise<void>;
  onRenameTimestamp: (id: string, label: string) => Promise<boolean>;
  onManualSeek: () => void;
  onError?: () => void;
  onLoadedMetadata?: () => void;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
};

export const VideoViewer = ({
  src,
  videoRef,
  fullscreenRef,
  playbackRate = 1,
  onPlaybackRateChange,
  timestamps,
  showResumePrompt,
  resumePosition,
  onResume,
  onDismissResume,
  onSaveTimestamp,
  onDeleteTimestamp,
  onRenameTimestamp,
  onManualSeek,
  onError,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
}: VideoViewerProps): React.JSX.Element => {
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [renamingTimestamp, setRenamingTimestamp] = useState<VideoTimestamp | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  const showControlsTemporarily = useCallback((): void => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (!videoRef.current || videoRef.current.paused) return;
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, [videoRef]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  useEffect(() => {
    setScenesOpen(false);
  }, [src]);

  const togglePlayerFullscreen = useCallback((): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (playerFrameRef.current) {
      void playerFrameRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    fullscreenRef.current = togglePlayerFullscreen;
    return () => {
      if (fullscreenRef.current === togglePlayerFullscreen) fullscreenRef.current = null;
    };
  }, [fullscreenRef, togglePlayerFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsPlayerFullscreen(document.fullscreenElement === playerFrameRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const syncFromVideo = useCallback((): void => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    setVolume(video.volume);
    setMuted(video.muted);
    setIsPlaying(!video.paused);
  }, [videoRef]);

  const seekToPoint = useCallback((clientX: number): void => {
    const video = videoRef.current;
    const timeline = timelineRef.current;
    if (!video || !timeline || !duration) return;
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
    setCurrentTime(video.currentTime);
    onManualSeek();
  }, [duration, onManualSeek, videoRef]);

  const handleTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    seekToPoint(event.clientX);
    const handleMove = (moveEvent: PointerEvent): void => seekToPoint(moveEvent.clientX);
    const handleUp = (): void => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const togglePlayPause = (): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = (): void => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    syncFromVideo();
  };

  const changeVolume = (value: number): void => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    syncFromVideo();
  };

  const jumpToTimestamp = (positionSeconds: number): void => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, positionSeconds);
    setCurrentTime(video.currentTime);
    onManualSeek();
    video.focus();
  };

  const openRenameDialog = (timestamp: VideoTimestamp): void => {
    setRenamingTimestamp(timestamp);
    setRenameLabel(timestamp.label || formatDuration(timestamp.positionSeconds));
  };

  const submitRename = async (): Promise<void> => {
    if (!renamingTimestamp) return;
    setRenameBusy(true);
    const ok = await onRenameTimestamp(renamingTimestamp.id, renameLabel);
    setRenameBusy(false);
    if (ok) setRenamingTimestamp(null);
  };

  const sceneLabel = (timestamp: VideoTimestamp): string => (
    timestamp.label || formatDuration(timestamp.positionSeconds)
  );

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const showResume = showResumePrompt && resumePosition !== null && resumePosition !== undefined;

  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center',
        isPlayerFullscreen ? 'bg-black p-0' : 'p-4',
      )}
      onMouseMove={showControlsTemporarily}
      onFocus={showControlsTemporarily}
    >
      <div
        ref={playerFrameRef}
        className={cn(
          'relative flex overflow-hidden bg-black shadow-2xl',
          isPlayerFullscreen
            ? 'h-screen w-screen border-0'
            : 'max-h-full max-w-full border border-white/10',
        )}
      >
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          className={cn(
            'object-contain',
            isPlayerFullscreen
              ? 'h-full w-full'
              : 'max-h-[calc(100vh-5rem)] max-w-[calc(100vw-3rem)]',
          )}
          onClick={togglePlayPause}
          onDoubleClick={togglePlayerFullscreen}
          onError={() => {
            setIsPlaying(false);
            onError?.();
          }}
          onLoadedMetadata={() => {
            syncFromVideo();
            onLoadedMetadata?.();
          }}
          onTimeUpdate={() => {
            syncFromVideo();
            onTimeUpdate?.();
          }}
          onPlay={() => {
            setIsPlaying(true);
            showControlsTemporarily();
            onPlay?.();
          }}
          onPause={() => {
            setIsPlaying(false);
            setControlsVisible(true);
            onPause?.();
          }}
          onEnded={() => {
            setIsPlaying(false);
            setControlsVisible(true);
            onEnded?.();
          }}
        />

        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlayPause}
            className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/55 text-white/90 backdrop-blur transition hover:bg-black/75 hover:text-white"
            aria-label="Play video"
          >
            <Play className="h-7 w-7" />
          </button>
        )}

        {showResume && (
          <div
            className="absolute left-4 top-4 z-30 flex items-center border bg-black/70 shadow-lg backdrop-blur"
            style={{ borderColor: VIDEO_ACCENT_BORDER, color: VIDEO_ACCENT }}
          >
            <button
              type="button"
              onClick={onResume}
              className="px-3 py-2 font-mono text-[11px]"
              style={{ background: 'transparent' }}
            >
              Resume from {formatDuration(resumePosition)}
            </button>
            <button
              type="button"
              onClick={onDismissResume}
              className="border-l px-2 py-2 opacity-75 hover:opacity-100"
              style={{ borderColor: 'rgba(124,154,146,0.25)', color: VIDEO_ACCENT }}
              aria-label="Dismiss resume"
              title="Dismiss resume"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-4 pt-14 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div
            ref={timelineRef}
            role="slider"
            aria-label="Video timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onPointerDown={handleTimelinePointerDown}
            className="mb-3 h-4 cursor-pointer py-[6px]"
          >
            <div className="relative h-px bg-white/20">
              <div className="absolute inset-y-0 left-0" style={{ width: `${progressPercent}%`, backgroundColor: VIDEO_ACCENT }} />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 border shadow"
                style={{ left: `calc(${progressPercent}% - 6px)`, borderColor: 'rgba(255,255,255,0.82)', backgroundColor: VIDEO_ACCENT }}
              />
            </div>
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-2 border border-white/10 bg-black/55 px-2 py-2 backdrop-blur">
            <button
              type="button"
              onClick={togglePlayPause}
              className="flex h-8 w-8 items-center justify-center border border-white/10 text-white/85 hover:bg-white/10 hover:text-white"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <span className="min-w-[8.5rem] font-mono text-[11px] text-white/75">
              {formatDuration(currentTime)} / {duration > 0 ? formatDuration(duration) : '--:--'}
            </span>

            <button
              type="button"
              onClick={toggleMute}
              className="flex h-8 w-8 items-center justify-center border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.currentTarget.value))}
              className="h-1 w-20 accent-[rgb(124,154,146)]"
              aria-label="Volume"
            />

            <div className="h-5 w-px bg-white/15" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 border px-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-white/10"
                  style={{ borderColor: VIDEO_ACCENT_BORDER, color: VIDEO_ACCENT, backgroundColor: VIDEO_ACCENT_SOFT }}
                  aria-label="Playback speed"
                >
                  Speed · {playbackRate}x
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                sideOffset={8}
                className="z-[2147483647] min-w-[116px] rounded-none border-white/10 bg-black/90 p-1 shadow-2xl backdrop-blur"
              >
                {SPEED_OPTIONS.map((speed) => {
                  const selected = playbackRate === speed;
                  return (
                    <DropdownMenuItem
                      key={speed}
                      onClick={() => onPlaybackRateChange(speed)}
                      className="rounded-none px-2 py-1.5 font-mono text-[11px] text-white/70 focus:bg-white/10 focus:text-white"
                      style={selected ? { color: VIDEO_ACCENT, backgroundColor: VIDEO_ACCENT_SOFT } : undefined}
                    >
                      {speed}x
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-5 w-px bg-white/15" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void onSaveTimestamp()}
                  className="flex h-8 items-center gap-1 border border-white/10 px-2 font-mono text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Timestamp
                </button>
              </TooltipTrigger>
              <TooltipContent>Save current scene</TooltipContent>
            </Tooltip>

            <button
              type="button"
              onClick={() => setScenesOpen((open) => !open)}
              className="flex h-8 items-center gap-1 border border-white/10 px-2 font-mono text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              style={scenesOpen ? { borderColor: VIDEO_ACCENT_BORDER, color: VIDEO_ACCENT, backgroundColor: VIDEO_ACCENT_SOFT } : undefined}
              aria-label="Saved scenes"
              title="Saved scenes"
            >
              <ListVideo className="h-3.5 w-3.5" />
              Scenes · {timestamps.length}
            </button>

            <button
              type="button"
              onClick={togglePlayerFullscreen}
              className="ml-auto flex h-8 w-8 items-center justify-center border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Fullscreen"
              title="Fullscreen"
            >
              <Expand className="h-4 w-4" />
            </button>
          </div>
        </div>

        {scenesOpen && (
          <aside className="absolute bottom-20 right-4 top-4 z-40 flex w-[min(320px,calc(100%-2rem))] flex-col border border-white/10 bg-black/85 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div>
                <p className="font-serif text-base text-white/90">Saved Scenes</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{timestamps.length} timestamps</p>
              </div>
              <button
                type="button"
                onClick={() => setScenesOpen(false)}
                className="flex h-7 w-7 items-center justify-center border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Close saved scenes"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {timestamps.length === 0 ? (
                <div className="flex h-full min-h-[9rem] items-center justify-center border border-dashed border-white/10 px-4 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/35">No saved scenes yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {timestamps.map((timestamp) => {
                    const label = sceneLabel(timestamp);
                    return (
                      <div key={timestamp.id} className="group border border-white/10 bg-white/[0.025]">
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            onClick={() => jumpToTimestamp(timestamp.positionSeconds)}
                            className="min-w-0 flex-1 px-2 py-2 text-left hover:bg-white/10"
                            title={`Jump to ${label}`}
                          >
                            <span className="block truncate font-mono text-[11px] text-white/80">{label}</span>
                            <span className="mt-0.5 block font-mono text-[10px]" style={{ color: VIDEO_ACCENT }}>
                              {formatDuration(timestamp.positionSeconds)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openRenameDialog(timestamp)}
                            className="flex w-8 items-center justify-center border-l border-white/10 text-white/40 hover:bg-white/10"
                            aria-label={`Rename scene ${label}`}
                            title="Rename scene"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteTimestamp(timestamp.id)}
                            className="flex w-8 items-center justify-center border-l border-white/10 text-white/40 hover:bg-danger/20 hover:text-danger"
                            aria-label={`Delete scene ${label}`}
                            title="Delete scene"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <SanctumDialog
        open={renamingTimestamp !== null}
        onOpenChange={(open) => {
          if (!open && !renameBusy) setRenamingTimestamp(null);
        }}
        title="Rename timestamp"
        description="Name this saved scene."
        size="sm"
        busy={renameBusy}
        zIndex={2147483647}
        initialFocusRef={renameInputRef}
        footer={(
          <>
            <button
              type="button"
              onClick={() => setRenamingTimestamp(null)}
              disabled={renameBusy}
              className="h-8 border border-white/15 px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitRename()}
              disabled={renameBusy}
              className="h-8 border px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-black disabled:opacity-50"
              style={{ borderColor: VIDEO_ACCENT_BORDER, backgroundColor: VIDEO_ACCENT }}
            >
              Save
            </button>
          </>
        )}
      >
        <Input
          ref={renameInputRef}
          value={renameLabel}
          onChange={(event) => setRenameLabel(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submitRename();
          }}
          placeholder={renamingTimestamp ? formatDuration(renamingTimestamp.positionSeconds) : 'Scene label'}
          className="rounded-none font-mono text-xs"
        />
      </SanctumDialog>
    </div>
  );
};

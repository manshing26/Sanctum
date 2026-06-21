import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  ChevronDown,
  Edit3,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { AudioBookmark, AudioSleepTimerState } from '../../../../shared/ipc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SanctumDialog,
} from '../../../components/ui';
import { formatDuration } from '../../../lib/utils';
import {
  getAudioPlaybackPreferences,
  setAudioPlaybackPreferences,
} from '../audioPlaybackPreferences';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ACCENT = 'rgb(124,154,146)';
const ACCENT_SOFT = 'rgba(124,154,146,0.16)';
const ACCENT_BORDER = 'rgba(124,154,146,0.44)';

type AudioViewerProps = {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  artworkUrl?: string;
  filename: string;
  title?: string;
  artist?: string;
  album?: string;
  playbackRate: number;
  onPlaybackRateChange: (speed: number) => void;
  bookmarks: AudioBookmark[];
  showResumePrompt: boolean;
  resumePosition?: number | null;
  sleepTimer: AudioSleepTimerState | null;
  onResume: () => void;
  onDismissResume: () => void;
  onSaveBookmark: () => void | Promise<void>;
  onDeleteBookmark: (id: string) => void | Promise<void>;
  onRenameBookmark: (id: string, label: string) => Promise<boolean>;
  onSetSleepTimer: (minutes: number | 'end_of_track') => void | Promise<void>;
  onExtendSleepTimer: () => void | Promise<void>;
  onCancelSleepTimer: () => void | Promise<void>;
  onManualSeek: () => void;
  onError?: () => void;
  onLoadedMetadata?: () => void;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
};

export const AudioViewer = ({
  src,
  audioRef,
  artworkUrl,
  filename,
  title,
  artist,
  album,
  playbackRate,
  onPlaybackRateChange,
  bookmarks,
  showResumePrompt,
  resumePosition,
  sleepTimer,
  onResume,
  onDismissResume,
  onSaveBookmark,
  onDeleteBookmark,
  onRenameBookmark,
  onSetSleepTimer,
  onExtendSleepTimer,
  onCancelSleepTimer,
  onManualSeek,
  onError,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
}: AudioViewerProps): React.JSX.Element => {
  const initialPlaybackPreferences = useRef(getAudioPlaybackPreferences());
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const customTimerInputRef = useRef<HTMLInputElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialPlaybackPreferences.current.volume);
  const [muted, setMuted] = useState(initialPlaybackPreferences.current.muted);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [renaming, setRenaming] = useState<AudioBookmark | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [customTimerOpen, setCustomTimerOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('90');

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [audioRef, playbackRate]);

  useLayoutEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const remembered = getAudioPlaybackPreferences();
    audio.volume = remembered.volume;
    audio.muted = remembered.muted;
    setVolume(remembered.volume);
    setMuted(remembered.muted);
  }, [audioRef, src]);

  useEffect(() => {
    setBookmarksOpen(false);
  }, [src]);

  const sync = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    setVolume(audio.volume);
    setMuted(audio.muted);
    setPlaying(!audio.paused);
  };

  const syncVolumePreferences = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    const remembered = setAudioPlaybackPreferences({
      volume: audio.volume,
      muted: audio.muted,
    });
    setVolume(remembered.volume);
    setMuted(remembered.muted);
  };

  const togglePlay = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seekToPoint = (clientX: number): void => {
    const audio = audioRef.current;
    const timeline = timelineRef.current;
    if (!audio || !timeline || duration <= 0) return;
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
    onManualSeek();
  };

  const handleTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    seekToPoint(event.clientX);
    const move = (moveEvent: PointerEvent): void => seekToPoint(moveEvent.clientX);
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const jumpToBookmark = (positionSeconds: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, positionSeconds);
    setCurrentTime(audio.currentTime);
    onManualSeek();
    audio.focus();
  };

  const submitRename = async (): Promise<void> => {
    if (!renaming) return;
    setRenameBusy(true);
    const ok = await onRenameBookmark(renaming.id, renameLabel);
    setRenameBusy(false);
    if (ok) setRenaming(null);
  };

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const resumeVisible = showResumePrompt && resumePosition !== null && resumePosition !== undefined;
  const finalCountdown = sleepTimer?.mode === 'duration'
    && sleepTimer.remainingSeconds !== undefined
    && sleepTimer.remainingSeconds <= 60;

  return (
    <div className="flex h-full w-full items-center justify-center p-5">
      <div className="relative flex h-full max-h-[760px] w-full max-w-[880px] flex-col overflow-hidden border border-white/10 bg-[#080a09] shadow-2xl">
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onError={onError}
          onLoadedMetadata={() => { sync(); onLoadedMetadata?.(); }}
          onTimeUpdate={() => { sync(); onTimeUpdate?.(); }}
          onPlay={() => { setPlaying(true); onPlay?.(); }}
          onPause={() => { setPlaying(false); onPause?.(); }}
          onEnded={() => { setPlaying(false); onEnded?.(); }}
          onVolumeChange={syncVolumePreferences}
        />

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-5">
          <div className="relative aspect-square w-[min(46vh,420px)] max-w-full overflow-hidden border border-white/10 bg-[#0d100e]">
            {artworkUrl ? (
              <img src={artworkUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-20 w-20 text-white/15" strokeWidth={1} />
              </div>
            )}
            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-white/20 bg-black/60 text-white backdrop-blur hover:bg-black/75"
                aria-label="Play audio"
              >
                <Play className="h-7 w-7" />
              </button>
            )}
          </div>
          <div className="w-full min-w-0 text-center">
            <p className="truncate font-serif text-xl text-white/90" title={filename}>{filename}</p>
            {title && <p className="mt-1 truncate font-mono text-xs text-white/65">{title}</p>}
            {(artist || album) && (
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-white/40">
                {[artist, album].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {resumeVisible && (
          <div className="absolute left-4 top-4 z-30 flex border bg-black/75" style={{ borderColor: ACCENT_BORDER, color: ACCENT }}>
            <button type="button" onClick={onResume} className="px-3 py-2 font-mono text-[11px]">
              Resume from {formatDuration(resumePosition)}
            </button>
            <button type="button" onClick={onDismissResume} className="border-l px-2" style={{ borderColor: ACCENT_BORDER }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {finalCountdown && (
          <div className="absolute right-4 top-4 z-30 border border-amber-400/40 bg-black/80 p-3 font-mono text-[11px] text-amber-200">
            <p>Vault locks in {sleepTimer.remainingSeconds}s</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void onExtendSleepTimer()} className="border border-white/15 px-2 py-1 hover:bg-white/10">+15 min</button>
              <button type="button" onClick={() => void onCancelSleepTimer()} className="border border-white/15 px-2 py-1 hover:bg-white/10">Cancel</button>
            </div>
          </div>
        )}

        <div className="border-t border-white/10 bg-black/55 px-4 py-3 backdrop-blur">
          <div
            ref={timelineRef}
            role="slider"
            aria-label="Audio timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onPointerDown={handleTimelinePointerDown}
            className="mb-3 h-4 cursor-pointer py-[6px]"
          >
            <div className="relative h-px bg-white/20">
              <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, backgroundColor: ACCENT }} />
              <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 border border-white/80" style={{ left: `calc(${progress}% - 6px)`, backgroundColor: ACCENT }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center border border-white/10 text-white/80 hover:bg-white/10">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="min-w-[8.5rem] font-mono text-[11px] text-white/70">
              {formatDuration(currentTime)} / {duration > 0 ? formatDuration(duration) : '--:--'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!audioRef.current) return;
                audioRef.current.muted = !audioRef.current.muted;
                syncVolumePreferences();
              }}
              className="flex h-8 w-8 items-center justify-center border border-white/10 text-white/65 hover:bg-white/10"
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => {
                if (!audioRef.current) return;
                audioRef.current.volume = Number(event.currentTarget.value);
                audioRef.current.muted = audioRef.current.volume === 0;
                syncVolumePreferences();
              }}
              className="h-1 w-20 accent-[rgb(124,154,146)]"
              aria-label="Volume"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-8 items-center gap-2 border px-2 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ borderColor: ACCENT_BORDER, color: ACCENT, backgroundColor: ACCENT_SOFT }}>
                  Speed · {playbackRate}x <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="z-[2147483647] rounded-none border-white/10 bg-black/95">
                {SPEED_OPTIONS.map((speed) => (
                  <DropdownMenuItem key={speed} onClick={() => onPlaybackRateChange(speed)} className="rounded-none font-mono text-xs text-white/70 focus:bg-white/10">
                    {speed}x
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button type="button" onClick={() => void onSaveBookmark()} className="flex h-8 items-center gap-1 border border-white/10 px-2 font-mono text-[11px] text-white/75 hover:bg-white/10">
              <Plus className="h-3.5 w-3.5" /> Bookmark
            </button>
            <button type="button" onClick={() => setBookmarksOpen((open) => !open)} className="flex h-8 items-center gap-1 border border-white/10 px-2 font-mono text-[11px] text-white/65 hover:bg-white/10">
              <ListMusic className="h-3.5 w-3.5" /> Bookmarks · {bookmarks.length}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ml-auto flex h-8 items-center gap-1 border border-white/10 px-2 font-mono text-[11px] text-white/65 hover:bg-white/10">
                  <AlarmClock className="h-3.5 w-3.5" />
                  {sleepTimer
                    ? sleepTimer.mode === 'end_of_track'
                      ? 'End of track'
                      : formatDuration(sleepTimer.remainingSeconds ?? 0)
                    : 'Sleep'}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="z-[2147483647] rounded-none border-white/10 bg-black/95">
                {[15, 30, 45, 60].map((minutes) => (
                  <DropdownMenuItem key={minutes} onClick={() => void onSetSleepTimer(minutes)} className="rounded-none font-mono text-xs text-white/70 focus:bg-white/10">
                    {minutes} minutes
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => void onSetSleepTimer('end_of_track')} className="rounded-none font-mono text-xs text-white/70 focus:bg-white/10">
                  End of track
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCustomTimerOpen(true)} className="rounded-none font-mono text-xs text-white/70 focus:bg-white/10">
                  Custom...
                </DropdownMenuItem>
                {sleepTimer && (
                  <DropdownMenuItem onClick={() => void onCancelSleepTimer()} className="rounded-none font-mono text-xs text-red-300 focus:bg-red-500/10">
                    Cancel timer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {bookmarksOpen && (
          <aside className="absolute bottom-20 right-4 top-4 z-40 flex w-[min(320px,calc(100%-2rem))] flex-col border border-white/10 bg-black/90 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div>
                <p className="font-serif text-base text-white/90">Audio Bookmarks</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{bookmarks.length} saved</p>
              </div>
              <button type="button" onClick={() => setBookmarksOpen(false)} className="flex h-7 w-7 items-center justify-center border border-white/10 text-white/50 hover:bg-white/10">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {bookmarks.length === 0 ? (
                <div className="flex h-full items-center justify-center border border-dashed border-white/10 p-4 text-center font-mono text-[11px] text-white/35">
                  No saved bookmarks yet.
                </div>
              ) : bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="mb-1 flex border border-white/10 bg-white/[0.025]">
                  <button type="button" onClick={() => jumpToBookmark(bookmark.positionSeconds)} className="min-w-0 flex-1 px-2 py-2 text-left hover:bg-white/10">
                    <span className="block truncate font-mono text-[11px] text-white/80">{bookmark.label}</span>
                    <span className="font-mono text-[10px]" style={{ color: ACCENT }}>{formatDuration(bookmark.positionSeconds)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenaming(bookmark); setRenameLabel(bookmark.label); }}
                    className="w-8 border-l border-white/10 text-white/40 hover:bg-white/10"
                  >
                    <Edit3 className="mx-auto h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void onDeleteBookmark(bookmark.id)} className="w-8 border-l border-white/10 text-white/40 hover:bg-red-500/10 hover:text-red-300">
                    <X className="mx-auto h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <SanctumDialog
        open={renaming !== null}
        onOpenChange={(open) => { if (!open && !renameBusy) setRenaming(null); }}
        title="Rename audio bookmark"
        size="sm"
        busy={renameBusy}
        zIndex={2147483647}
        initialFocusRef={renameInputRef}
        footer={(
          <>
            <button type="button" onClick={() => setRenaming(null)} className="h-8 border border-white/15 px-3 font-mono text-[10px] text-white/55">Cancel</button>
            <button type="button" onClick={() => void submitRename()} className="h-8 border px-3 font-mono text-[10px] text-black" style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT }}>Save</button>
          </>
        )}
      >
        <Input
          ref={renameInputRef}
          value={renameLabel}
          onChange={(event) => setRenameLabel(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void submitRename(); }}
          className="rounded-none font-mono text-xs"
        />
      </SanctumDialog>

      <SanctumDialog
        open={customTimerOpen}
        onOpenChange={setCustomTimerOpen}
        title="Custom sleep timer"
        description="Lock Sanctum after 1 to 480 minutes."
        size="sm"
        zIndex={2147483647}
        initialFocusRef={customTimerInputRef}
        footer={(
          <>
            <button type="button" onClick={() => setCustomTimerOpen(false)} className="h-8 border border-white/15 px-3 font-mono text-[10px] text-white/55">Cancel</button>
            <button
              type="button"
              onClick={() => {
                const minutes = Math.max(1, Math.min(480, Number(customMinutes) || 1));
                void onSetSleepTimer(minutes);
                setCustomTimerOpen(false);
              }}
              className="h-8 border px-3 font-mono text-[10px] text-black"
              style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT }}
            >
              Set Timer
            </button>
          </>
        )}
      >
        <Input ref={customTimerInputRef} type="number" min={1} max={480} value={customMinutes} onChange={(event) => setCustomMinutes(event.currentTarget.value)} className="rounded-none font-mono text-xs" />
      </SanctumDialog>
    </div>
  );
};

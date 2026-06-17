import React, { useEffect } from 'react';

type VideoViewerProps = {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackRate?: number;
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
  playbackRate = 1,
  onError,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
}: VideoViewerProps): React.JSX.Element => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        className="max-h-full max-w-full rounded-lg object-contain"
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />
    </div>
  );
};

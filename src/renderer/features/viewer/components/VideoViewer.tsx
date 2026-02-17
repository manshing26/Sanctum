import React, { useEffect } from 'react';

type VideoViewerProps = {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackRate?: number;
  onError?: () => void;
};

export const VideoViewer = ({
  src,
  videoRef,
  playbackRate = 1,
  onError,
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
      />
    </div>
  );
};

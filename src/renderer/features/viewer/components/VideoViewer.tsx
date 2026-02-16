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
    if (!video) {
      return;
    }
    video.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const logState = (label: string) => {
      const error = video.error;
      console.info('[viewer][video]', label, {
        src: video.currentSrc,
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        seeking: video.seeking,
        width: video.videoWidth,
        height: video.videoHeight,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
    };

    const events: Array<keyof HTMLMediaElementEventMap> = [
      'loadstart',
      'loadedmetadata',
      'loadeddata',
      'canplay',
      'canplaythrough',
      'stalled',
      'waiting',
      'error',
      'abort',
      'emptied',
      'suspend',
      'play',
      'pause',
    ];

    const handlers = events.map((eventName) => {
      const handler = () => logState(eventName);
      video.addEventListener(eventName, handler);
      return { eventName, handler };
    });

    logState('mounted');

    return () => {
      handlers.forEach(({ eventName, handler }) => {
        video.removeEventListener(eventName, handler);
      });
    };
  }, [videoRef, src]);

  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-black">
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        className="h-full max-h-full w-full rounded-lg object-contain"
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video) {
            return;
          }
          console.info('[viewer][video] metadata', {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        }}
        onError={onError}
      />
    </div>
  );
};

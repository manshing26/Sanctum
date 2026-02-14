import React from 'react';

type VideoViewerProps = {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onError?: () => void;
};

export const VideoViewer = ({
  src,
  videoRef,
  onError,
}: VideoViewerProps): React.JSX.Element => {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-black">
      <video
        ref={videoRef}
        src={src}
        controls
        preload="metadata"
        className="h-full max-h-full w-full rounded-lg object-contain"
        onError={onError}
      />
    </div>
  );
};

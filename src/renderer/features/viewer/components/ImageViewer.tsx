import React from 'react';

type ImageViewerProps = {
  src: string;
  alt: string;
  transformStyle: React.CSSProperties;
  fitMode: 'fit' | 'original';
  onError?: () => void;
};

export const ImageViewer = ({
  src,
  alt,
  transformStyle,
  fitMode,
  onError,
}: ImageViewerProps): React.JSX.Element => {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto rounded-lg border border-border bg-bg/80 p-4">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`select-none transition-transform duration-200 ${
          fitMode === 'fit' ? 'max-h-full max-w-full object-contain' : 'object-none'
        }`}
        style={transformStyle}
        onLoad={(event) => {
          const target = event.currentTarget;
          console.info('[viewer][image] loaded', {
            src,
            width: target.naturalWidth,
            height: target.naturalHeight,
          });
        }}
        onError={() => {
          console.info('[viewer][image] error', { src });
          onError?.();
        }}
      />
    </div>
  );
};

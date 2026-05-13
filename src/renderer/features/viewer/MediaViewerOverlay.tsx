import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import 'pdfjs-dist/legacy/build/pdf.worker.entry';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
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
import { isDocxMimeType, isReadableDocumentMimeType } from '../../../shared/fileTypes';

type ViewerLoadState = {
  isLoading: boolean;
  error: string | null;
  session: OpenMediaSessionResult | null;
};

type DocumentPreview =
  | { kind: 'text'; content: string; truncated: boolean }
  | { kind: 'html'; content: string; truncated: boolean }
  | { kind: 'csv'; rows: string[][]; truncated: boolean };

const TEXT_PREVIEW_LIMIT = 750_000;
const CSV_ROW_LIMIT = 2_000;
const CSV_COLUMN_LIMIT = 80;

const decodeText = (bytes: ArrayBuffer): string => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

const sanitizeHtml = (html: string): string => {
  const purifier = DOMPurify(window);
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof HTMLImageElement && !node.src.startsWith('data:image/')) {
      node.removeAttribute('src');
    }
  });
  return purifier.sanitize(html, {
    ALLOWED_TAGS: [
      'article', 'section', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'span', 'div',
    ],
    ALLOWED_ATTR: ['alt', 'src', 'colspan', 'rowspan'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button'],
  });
};

const parseDelimitedText = (text: string, delimiter: ',' | '\t'): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      if (rows.length >= CSV_ROW_LIMIT) return rows;
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
};

const buildDocumentPreview = async (mimeType: string, bytes: ArrayBuffer): Promise<DocumentPreview> => {
  if (isDocxMimeType(mimeType)) {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: bytes },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.dataUri,
      },
    );
    return { kind: 'html', content: sanitizeHtml(result.value), truncated: false };
  }

  const rawText = decodeText(bytes);
  const truncated = rawText.length > TEXT_PREVIEW_LIMIT;
  const text = truncated ? rawText.slice(0, TEXT_PREVIEW_LIMIT) : rawText;

  if (mimeType === 'application/json') {
    try {
      return { kind: 'text', content: JSON.stringify(JSON.parse(text), null, 2), truncated };
    } catch {
      return { kind: 'text', content: text, truncated };
    }
  }

  if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') {
    const rows = parseDelimitedText(text, mimeType === 'text/csv' ? ',' : '\t')
      .map((row) => row.slice(0, CSV_COLUMN_LIMIT));
    return { kind: 'csv', rows, truncated: truncated || rows.length >= CSV_ROW_LIMIT };
  }

  if (mimeType === 'text/html') {
    return { kind: 'html', content: sanitizeHtml(text), truncated };
  }

  return { kind: 'text', content: text, truncated };
};

type PdfPageProxy = {
  getViewport: (input: { scale: number }) => { width: number; height: number };
  render: (input: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup?: () => void;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PdfPageCanvasProps = {
  document: PdfDocumentProxy;
  pageNumber: number;
  scale: number;
  onError: (message: string) => void;
};

const PdfPageCanvas = ({ document, pageNumber, scale, onError }: PdfPageCanvasProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    let page: PdfPageProxy | null = null;

    const renderPage = async (): Promise<void> => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas rendering is unavailable.');

        page = await document.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (cancelled) return;
        const message = renderError instanceof Error ? renderError.message : `Unable to render page ${pageNumber}.`;
        onError(message);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup?.();
    };
  }, [document, onError, pageNumber, scale]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="bg-white shadow-2xl" />
      <span className="font-mono text-[10px] text-white/45">Page {pageNumber}</span>
    </div>
  );
};

const PdfViewer = ({
  src,
  title,
  scale,
  onError,
}: {
  src: string;
  title: string;
  scale: number;
  onError: (message: string) => void;
}): React.JSX.Element => {
  const [document, setDocument] = useState<PdfDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let loadedDocument: PdfDocumentProxy | null = null;

    setDocument(null);
    setError(null);

    const loadPdf = async (): Promise<void> => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`PDF preview failed with status ${response.status}.`);
        }
        const bytes = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(bytes),
        });
        loadedDocument = await loadingTask.promise as unknown as PdfDocumentProxy;
        setDocument(loadedDocument);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : 'Unable to load PDF preview.';
        setError(message);
        onError(message);
      }
    };

    void loadPdf();

    return () => {
      controller.abort();
      void loadedDocument?.destroy();
    };
  }, [src, onError]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/70">
        <AlertCircle className="h-10 w-10 text-danger" />
        <p className="max-w-md text-center text-sm">{error}</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/60">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading PDF...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-zinc-700 px-6 pb-16 pt-20" role="document" aria-label={title}>
      <div className="mx-auto flex w-fit flex-col items-center gap-8">
        {Array.from({ length: document.numPages }, (_, index) => (
          <PdfPageCanvas
            key={`${src}-${index + 1}`}
            document={document}
            pageNumber={index + 1}
            scale={scale}
            onError={onError}
          />
        ))}
      </div>
    </div>
  );
};

const DocumentViewer = ({
  src,
  title,
  mimeType,
  onError,
  onOpenReadOnlyCopy,
}: {
  src: string;
  title: string;
  mimeType: string;
  onError: (message: string) => void;
  onOpenReadOnlyCopy?: () => void;
}): React.JSX.Element => {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setPreview(null);
    setError(null);

    const loadDocument = async (): Promise<void> => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Document preview failed with status ${response.status}.`);
        }
        const bytes = await response.arrayBuffer();
        const nextPreview = await buildDocumentPreview(mimeType, bytes);
        if (!controller.signal.aborted) setPreview(nextPreview);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : 'Unable to load document preview.';
        setError(message);
        onError(message);
      }
    };

    void loadDocument();

    return () => controller.abort();
  }, [mimeType, onError, src]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/70">
        <AlertCircle className="h-10 w-10 text-danger" />
        <p className="max-w-md text-center text-sm">{error}</p>
        {onOpenReadOnlyCopy && (
          <Button variant="secondary" size="sm" onClick={onOpenReadOnlyCopy}>
            Open Read-Only Copy
          </Button>
        )}
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-col items-center gap-3 text-white/60">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading document...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-zinc-800 px-6 pb-16 pt-20" role="document" aria-label={title}>
      <div className="mx-auto max-w-5xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl">
        <div className="mb-5 border-b border-white/10 pb-3">
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{mimeType}</p>
        </div>

        {preview.truncated && (
          <div className="mb-4 border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            Preview is capped for performance. Export or open a read-only copy to inspect the full file.
          </div>
        )}

        {preview.kind === 'text' && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-100">
            {preview.content || 'Empty document.'}
          </pre>
        )}

        {preview.kind === 'html' && (
          <>
            <style>
              {`
                .pv-document-preview { color: rgb(244 244 245); font-size: 14px; line-height: 1.7; }
                .pv-document-preview h1 { font-size: 28px; line-height: 1.2; margin: 0 0 18px; }
                .pv-document-preview h2 { font-size: 22px; line-height: 1.25; margin: 28px 0 12px; }
                .pv-document-preview h3 { font-size: 18px; line-height: 1.3; margin: 22px 0 10px; }
                .pv-document-preview p { margin: 0 0 12px; }
                .pv-document-preview ul, .pv-document-preview ol { margin: 0 0 14px 24px; padding: 0; }
                .pv-document-preview li { margin: 4px 0; }
                .pv-document-preview blockquote { margin: 16px 0; padding-left: 14px; border-left: 2px solid rgba(255,255,255,0.24); color: rgb(212 212 216); }
                .pv-document-preview table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
                .pv-document-preview th, .pv-document-preview td { border: 1px solid rgba(255,255,255,0.14); padding: 6px 8px; vertical-align: top; }
                .pv-document-preview img { max-width: 100%; height: auto; display: block; margin: 14px 0; }
                .pv-document-preview code, .pv-document-preview pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
                .pv-document-preview pre { overflow: auto; padding: 12px; background: rgba(255,255,255,0.06); }
              `}
            </style>
            <div
              className="pv-document-preview"
              dangerouslySetInnerHTML={{ __html: preview.content || '<p>Empty document.</p>' }}
            />
          </>
        )}

        {preview.kind === 'csv' && (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse font-mono text-xs text-zinc-100">
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-white/10">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="max-w-[22rem] border-r border-white/10 px-2 py-1 align-top">
                        <span className="block truncate" title={cell}>{cell}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
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
  onOpenReadOnlyCopy,
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
  const [pdfScale, setPdfScale] = useState(1.15);
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
  const isPdf = mimeType === 'application/pdf';
  const isReadableDocument = isReadableDocumentMimeType(mimeType);

  // Auto-hide controls after inactivity
  const resetControlsTimer = (): void => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (isPdf || isReadableDocument) return;
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
    setPdfScale(1.15);
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

  const handlePdfError = useCallback((message: string): void => {
    setState((prev) => ({
      ...prev,
      error: prev.error ?? message,
    }));
  }, []);

  const handleDocumentError = useCallback((message: string): void => {
    onMessage(message);
  }, [onMessage]);

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

          {!state.isLoading && !state.error && state.session && isPdf && (
            <PdfViewer
              src={state.session.mediaUrl}
              title={currentItem?.originalName ?? 'PDF preview'}
              scale={pdfScale}
              onError={handlePdfError}
            />
          )}

          {!state.isLoading && !state.error && state.session && isReadableDocument && (
            <DocumentViewer
              src={state.session.mediaUrl}
              title={currentItem?.originalName ?? 'Document preview'}
              mimeType={state.session.mimeType}
              onError={handleDocumentError}
              onOpenReadOnlyCopy={currentItem ? () => onOpenReadOnlyCopy?.(currentItem.id) : undefined}
            />
          )}

          {!state.isLoading && !state.error && state.session && !isImage && !isVideo && !isPdf && !isReadableDocument && (
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

            {isPdf && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPdfScale((value) => Math.max(0.5, Number((value - 0.15).toFixed(2))))}
                      className="text-white hover:bg-white/10"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom out</TooltipContent>
                </Tooltip>

                <span className="min-w-[3rem] text-center text-xs text-white/70">
                  {Math.round(pdfScale * 100)}%
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPdfScale((value) => Math.min(2.5, Number((value + 0.15).toFixed(2))))}
                      className="text-white hover:bg-white/10"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom in</TooltipContent>
                </Tooltip>
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

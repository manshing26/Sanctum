import type React from 'react';

declare global {
  interface WebviewTag extends HTMLElement {
    src: string;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    stop(): void;
    loadURL(url: string): void;
    getURL(): string;
    getTitle(): string;
    setZoomFactor(factor: number): void;
    getZoomFactor(): number;
    setZoomLevel(level: number): void;
    getZoomLevel(): number;
    setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
    setAutoResize(options: { width?: boolean; height?: boolean; horizontal?: boolean; vertical?: boolean }): void;
    executeJavaScript(code: string): Promise<unknown>;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
      };
    }
  }
}

export {};

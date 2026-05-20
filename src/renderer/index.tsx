import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/ui/Tooltip';
import { App } from './App';
import { fontSize } from './theme/typography';
import '../index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0a0c0b',
            border: '1px solid rgba(220,220,200,0.12)',
            borderRadius: 0,
            color: '#c4c9c5',
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontSize: fontSize(11),
            letterSpacing: '0.02em',
            padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
            gap: '10px',
          },
          classNames: {
            toast: 'sanctum-toast',
            title: 'sanctum-toast-title',
            description: 'sanctum-toast-desc',
          },
        }}
        icons={{
          success: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6a9e7f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,7 5.5,10.5 12,3.5" />
            </svg>
          ),
          error: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#c36b5f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          ),
          warning: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#c08a5e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2L13 12H1Z" /><line x1="7" y1="6" x2="7" y2="9" /><circle cx="7" cy="11" r="0.5" fill="#c08a5e" />
            </svg>
          ),
          info: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#7c9a92" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="5.5" /><line x1="7" y1="6" x2="7" y2="10" /><circle cx="7" cy="4" r="0.5" fill="#7c9a92" />
            </svg>
          ),
        }}
        closeButton
      />
      <style>{`
        .sanctum-toast [data-close-button] {
          background: transparent !important;
          border: 1px solid rgba(220,220,200,0.12) !important;
          border-radius: 0 !important;
          color: #79817a !important;
          width: 18px !important;
          height: 18px !important;
          top: -6px !important;
          right: -6px !important;
        }
        .sanctum-toast [data-close-button]:hover {
          background: rgba(124,154,146,0.10) !important;
          color: #e8e6dc !important;
        }
        .sanctum-toast-title {
          font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace !important;
          font-size: calc(11px * var(--sanctum-text-scale, 1)) !important;
          color: #e8e6dc !important;
          letter-spacing: 0.02em !important;
        }
        .sanctum-toast-desc {
          font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace !important;
          font-size: calc(10px * var(--sanctum-text-scale, 1)) !important;
          color: #79817a !important;
          letter-spacing: 0.02em !important;
        }
      `}</style>
    </TooltipProvider>
  </React.StrictMode>,
);

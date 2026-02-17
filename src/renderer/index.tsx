import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TooltipProvider } from './components/ui/Tooltip';
import { App } from './App';
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
            background: 'rgb(20 24 31)',
            border: '1px solid rgb(52 64 84)',
            color: 'rgb(230 238 255)',
            fontSize: '0.875rem',
          },
        }}
        closeButton
      />
    </TooltipProvider>
  </React.StrictMode>,
);

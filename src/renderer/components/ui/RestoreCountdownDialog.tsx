import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

export const RestoreCountdownDialog: React.FC = () => {
  const [seconds, setSeconds] = useState(10);
  const calledRef = useRef(false);

  const quit = (): void => {
    if (calledRef.current) return;
    calledRef.current = true;
    void window.electronAPI.quitApp();
  };

  useEffect(() => {
    if (seconds <= 0) {
      quit();
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg p-6 shadow-2xl space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <svg className="h-6 w-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-text-primary">Vault Restored</h2>
          <p className="text-sm text-text-muted">
            The app needs to restart to load the restored vault.
          </p>
        </div>
        <Button className="w-full" onClick={quit}>
          Exit Now
        </Button>
        <p className="text-xs text-text-muted">Closing automatically in {seconds}s…</p>
      </div>
    </div>
  );
};

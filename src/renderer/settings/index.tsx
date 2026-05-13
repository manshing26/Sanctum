import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';

const SettingsApp = (): React.JSX.Element => {
  const [version, setVersion] = useState('...');
  useEffect(() => {
    void window.electronAPI.appVersion().then(setVersion);
  }, []);

  return (
    <div className="min-h-screen bg-bg px-6 py-7 text-text-primary">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">privateVault</p>
        <h1 className="mt-2 text-2xl font-semibold">Settings</h1>
      </header>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Application</h2>
          <p className="mt-1 text-sm text-text-muted">Version {version}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-text-primary">Week 1 Scope</h2>
          <p className="mt-1 text-sm text-text-muted">
            This settings window validates multi-window architecture and IPC wiring.
          </p>
        </div>
      </section>

      <section className="mt-5 space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-5">
        <h2 className="text-sm font-medium text-danger">Temporary Test Tools</h2>
        <p className="text-xs text-text-muted">
          Destructive vault wipe tools are disabled in this legacy settings window. Use the main
          Settings tab so password confirmation is enforced.
        </p>
        <button
          type="button"
          disabled
          className="rounded-lg border border-danger bg-danger/20 px-4 py-2 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete All Vault Items
        </button>
      </section>

      <button
        type="button"
        onClick={() => void window.electronAPI.closeSettings()}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
      >
        Close Settings
      </button>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found for settings window.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);

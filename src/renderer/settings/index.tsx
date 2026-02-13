import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';

const SettingsApp = (): React.JSX.Element => {
  const [version, setVersion] = useState('...');
  const [statusMessage, setStatusMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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
          Delete all imported vault items (encrypted files + database rows). This is destructive and
          intended for test cleanup only.
        </p>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => {
            const confirmed = window.confirm(
              'Delete all vault items now? This cannot be undone.',
            );
            if (!confirmed) {
              return;
            }

            setIsDeleting(true);
            setStatusMessage('');

            void window.electronAPI
              .clearAllVaultItems()
              .then((result) => {
                if (!result.ok) {
                  setStatusMessage(`Failed: ${result.error}`);
                  return;
                }

                setStatusMessage(`Deleted ${result.data.deleted} item(s).`);
              })
              .finally(() => {
                setIsDeleting(false);
              });
          }}
          className="rounded-lg border border-danger bg-danger/20 px-4 py-2 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? 'Deleting...' : 'Delete All Vault Items'}
        </button>
        {statusMessage ? <p className="text-xs text-danger">{statusMessage}</p> : null}
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

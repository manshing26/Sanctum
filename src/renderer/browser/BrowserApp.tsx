import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkSummary } from '../../shared/ipc';
import { DEFAULT_SEARCH_ENGINE, normalizeAddressInput } from './utils/address';

const BROWSER_PARTITION = 'persist:privatevault-browser';
const HOME_URL = 'https://duckduckgo.com/';

const getDomainLabel = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname || 'Unknown';
  } catch {
    return 'Unknown';
  }
};

type BrowserTab = {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasCrashed: boolean;
};

type TabWebViewProps = {
  tab: BrowserTab;
  onAttach: (tabId: string, el: WebviewTag | null) => void;
  onStateChange: (tabId: string, patch: Partial<BrowserTab>) => void;
};

const createTab = (url = HOME_URL): BrowserTab => ({
  id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  url,
  title: 'New Tab',
  isLoading: true,
  canGoBack: false,
  canGoForward: false,
  hasCrashed: false,
});

const syncNavState = (tabId: string, webview: WebviewTag, onStateChange: TabWebViewProps['onStateChange']): void => {
  onStateChange(tabId, {
    url: webview.getURL() || '',
    title: webview.getTitle() || 'New Tab',
    isLoading: false,
    canGoBack: webview.canGoBack(),
    canGoForward: webview.canGoForward(),
    hasCrashed: false,
  });
};

const TabWebView = ({ tab, onAttach, onStateChange }: TabWebViewProps): React.JSX.Element => {
  const webviewRef = useRef<WebviewTag | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const onLoadStart = (): void => {
      onStateChange(tab.id, { isLoading: true, hasCrashed: false });
    };

    const onLoadStop = (): void => {
      syncNavState(tab.id, webview, onStateChange);
      void readGuestSize();
    };

    const onNavigate = (): void => {
      syncNavState(tab.id, webview, onStateChange);
    };

    const onFailLoad = (event: Event): void => {
      const details = event as unknown as { errorCode?: number; errorDescription?: string };
      if (details.errorCode === -3) {
        // -3 is ERR_ABORTED, typically caused by quick successive navigations.
        return;
      }
      console.warn('[browser] load failed', {
        tabId: tab.id,
        errorCode: details.errorCode,
        errorDescription: details.errorDescription,
      });
      onStateChange(tab.id, { isLoading: false });
    };

    const onProcessGone = (): void => {
      onStateChange(tab.id, { isLoading: false, hasCrashed: true });
    };

    const readGuestSize = async (): Promise<void> => {
      try {
        await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));');
      } catch {
        // Ignore guest errors.
      }
    };

    const applyZoom = async (): Promise<void> => {
      await webview.setVisualZoomLevelLimits(1, 1);
      webview.setZoomLevel(0);
      webview.setZoomFactor(1);
      void readGuestSize();
    };

    webview.addEventListener('did-start-loading', onLoadStart);
    webview.addEventListener('did-stop-loading', onLoadStop);
    webview.addEventListener('did-navigate', onNavigate);
    webview.addEventListener('did-navigate-in-page', onNavigate);
    webview.addEventListener('page-title-updated', onNavigate);
    webview.addEventListener('dom-ready', applyZoom);
    webview.addEventListener('did-fail-load', onFailLoad);
    webview.addEventListener('render-process-gone', onProcessGone);

    return () => {
      webview.removeEventListener('did-start-loading', onLoadStart);
      webview.removeEventListener('did-stop-loading', onLoadStop);
      webview.removeEventListener('did-navigate', onNavigate);
      webview.removeEventListener('did-navigate-in-page', onNavigate);
      webview.removeEventListener('page-title-updated', onNavigate);
      webview.removeEventListener('dom-ready', applyZoom);
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('render-process-gone', onProcessGone);
    };
  }, [onStateChange, tab.id]);

  useEffect(() => {
    const host = hostRef.current;
    const webview = webviewRef.current;
    if (!host || !webview) {
      return;
    }

    const syncSize = (): void => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      webview.style.width = `${width}px`;
      webview.style.height = `${height}px`;
      // Keep webview and guest viewport in sync.
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, [tab.id]);

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
      >
        <webview
          ref={(element) => {
            const next = element as unknown as WebviewTag | null;
            webviewRef.current = next;
            onAttach(tab.id, next);
          }}
          src={tab.url}
          partition={BROWSER_PARTITION}
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgb(var(--bg))',
          }}
        />
      </div>
    </div>
  );
};

export const BrowserApp = (): React.JSX.Element => {
  const [tabs, setTabs] = useState<BrowserTab[]>([createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [addressInput, setAddressInput] = useState(HOME_URL);
  const [statusMessage, setStatusMessage] = useState('');
  const [bookmarkError, setBookmarkError] = useState('');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>({});
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({});

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    setAddressInput(activeTab.url || HOME_URL);
  }, [activeTab]);

  useEffect(() => {
    const loadBookmarks = async (): Promise<void> => {
      const result = await window.browserAPI.listBookmarks();
      if (!result.ok) {
        setBookmarkError(result.error);
        return;
      }

      setBookmarks(result.data);
    };

    void loadBookmarks();
  }, []);


  const applyTabPatch = useCallback((tabId: string, patch: Partial<BrowserTab>): void => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const loadInActiveTab = (nextUrl: string): void => {
    if (!activeTab) {
      return;
    }

    const webview = webviewRefs.current[activeTab.id];
    if (!webview) {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }

    if (webview.getURL && webview.getURL() === nextUrl) {
      return;
    }
    // Avoid Electron throwing ERR_ABORTED when a previous navigation is in-flight.
    if (activeTab.isLoading) {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }

    try {
      webview.loadURL(nextUrl);
    } catch {
      // Swallow navigation errors that otherwise trigger the dev overlay.
    }
    applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
  };

  const handleAddressSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!addressInput.trim()) {
      return;
    }
    const normalized = normalizeAddressInput(addressInput, DEFAULT_SEARCH_ENGINE);
    if (!normalized.ok) {
      return;
    }
    setBookmarkError('');
    setStatusMessage('');
    loadInActiveTab(normalized.url);
  };

  const handleOpenNewTab = (): void => {
    const tab = createTab(HOME_URL);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setStatusMessage('');
  };

  const handleCloseTab = (tabId: string): void => {
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === tabId);
      if (index === -1) {
        return prev;
      }

      const next = prev.filter((tab) => tab.id !== tabId);
      delete webviewRefs.current[tabId];

      if (next.length === 0) {
        const replacement = createTab(HOME_URL);
        setActiveTabId(replacement.id);
        return [replacement];
      }

      if (activeTabId === tabId) {
        const replacementIndex = Math.max(0, index - 1);
        setActiveTabId(next[replacementIndex].id);
      }

      return next;
    });
  };

  const handleGoBack = (): void => {
    if (!activeTab) {
      return;
    }
    const webview = webviewRefs.current[activeTab.id];
    if (webview?.canGoBack()) {
      webview.goBack();
    }
  };

  const handleGoForward = (): void => {
    if (!activeTab) {
      return;
    }
    const webview = webviewRefs.current[activeTab.id];
    if (webview?.canGoForward()) {
      webview.goForward();
    }
  };

  const handleReload = (): void => {
    if (!activeTab) {
      return;
    }
    const webview = webviewRefs.current[activeTab.id];
    if (!webview) {
      return;
    }

    if (activeTab.isLoading) {
      webview.stop();
      applyTabPatch(activeTab.id, { isLoading: false });
      return;
    }

    webview.reload();
    applyTabPatch(activeTab.id, { isLoading: true });
  };

  const refreshBookmarks = async (): Promise<void> => {
    const result = await window.browserAPI.listBookmarks();
    if (!result.ok) {
      setBookmarkError(result.error);
      return;
    }

    setBookmarks(result.data);
  };

  const handleCreateBookmark = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = await window.browserAPI.createBookmark({
      title: bookmarkTitle,
      url: bookmarkUrl,
    });

    if (!result.ok) {
      setBookmarkError(result.error);
      return;
    }

    setBookmarkTitle('');
    setBookmarkUrl('');
    setBookmarkError('');
    setStatusMessage('Bookmark saved.');
    await refreshBookmarks();
  };

  const handleSaveCurrentAsBookmark = async (): Promise<void> => {
    if (!activeTab) {
      return;
    }

    const result = await window.browserAPI.createBookmark({
      title: activeTab.title,
      url: activeTab.url,
    });

    if (!result.ok) {
      setBookmarkError(result.error);
      return;
    }

    setBookmarkError('');
    setStatusMessage('Current page bookmarked.');
    await refreshBookmarks();
  };

  const handleDeleteBookmark = async (id: number): Promise<void> => {
    const result = await window.browserAPI.deleteBookmark({ id });
    if (!result.ok) {
      setBookmarkError(result.error);
      return;
    }

    setBookmarkError('');
    setStatusMessage('Bookmark deleted.');
    await refreshBookmarks();
  };

  const handleOpenBookmark = (url: string): void => {
    loadInActiveTab(url);
    setShowBookmarks(false);
  };

  const groupedBookmarks = useMemo(() => {
    const groups = new Map<string, BookmarkSummary[]>();
    for (const bookmark of bookmarks) {
      const domain = getDomainLabel(bookmark.url);
      const list = groups.get(domain) ?? [];
      list.push(bookmark);
      groups.set(domain, list);
    }
    return Array.from(groups.entries());
  }, [bookmarks]);

  return (
    <div className="flex h-screen flex-col bg-bg text-text-primary">
      <header className="border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={!activeTab?.canGoBack}
            className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            onClick={handleGoForward}
            disabled={!activeTab?.canGoForward}
            className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            →
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="rounded border border-border px-2 py-1 text-xs"
          >
            {activeTab?.isLoading ? 'Stop' : 'Reload'}
          </button>

          <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center gap-2">
            <input
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              placeholder="Enter URL or search"
              className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-1.5 text-sm"
            />
            <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs text-accent-foreground">
              Go
            </button>
          </form>

          <button type="button" onClick={handleOpenNewTab} className="rounded border border-border px-2 py-1 text-xs">
            + Tab
          </button>
          <button type="button" onClick={handleSaveCurrentAsBookmark} className="rounded border border-border px-2 py-1 text-xs">
            ☆ Save
          </button>
          <button type="button" onClick={() => setShowBookmarks((prev) => !prev)} className="rounded border border-border px-2 py-1 text-xs">
            Bookmarks
          </button>
          <button type="button" onClick={() => void window.browserAPI.closeBrowserWindow()} className="rounded border border-border px-2 py-1 text-xs">
            Close
          </button>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                tab.id === activeTabId ? 'border-accent bg-accent/20' : 'border-border bg-bg'
              }`}
            >
              <span className="max-w-[180px] truncate">{tab.title || tab.url || 'New Tab'}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCloseTab(tab.id);
                  }
                }}
                className="hidden rounded px-1 group-hover:inline"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      </header>

      {bookmarkError ? (
        <div className="border-b border-border bg-surface px-3 py-2 text-xs text-danger">
          {bookmarkError}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="border-b border-border bg-surface px-3 py-2 text-xs text-text-muted">
          {statusMessage}
        </div>
      ) : null}

      {showBookmarks ? (
        <aside className="border-b border-border bg-surface px-3 py-3">
          <form onSubmit={(event) => void handleCreateBookmark(event)} className="flex flex-wrap items-center gap-2">
            <input
              value={bookmarkTitle}
              onChange={(event) => setBookmarkTitle(event.target.value)}
              placeholder="Bookmark title"
              className="min-w-[180px] rounded border border-border bg-bg px-2 py-1 text-xs"
            />
            <input
              value={bookmarkUrl}
              onChange={(event) => setBookmarkUrl(event.target.value)}
              placeholder="https://example.com"
              className="min-w-[280px] flex-1 rounded border border-border bg-bg px-2 py-1 text-xs"
            />
            <button type="submit" className="rounded bg-accent px-3 py-1 text-xs text-accent-foreground">
              Add Bookmark
            </button>
          </form>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1">
            {bookmarks.length === 0 ? (
              <p className="text-xs text-text-muted">No bookmarks saved.</p>
            ) : (
              groupedBookmarks.map(([domain, domainBookmarks]) => {
                const isCollapsed = collapsedDomains[domain] ?? false;
                return (
                  <div key={domain} className="space-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedDomains((prev) => ({
                          ...prev,
                          [domain]: !isCollapsed,
                        }))
                      }
                      className="flex w-full items-center justify-between rounded border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                    >
                      <span className="truncate">{domain}</span>
                      <span className="text-text-muted">{isCollapsed ? '+' : '−'}</span>
                    </button>
                    {!isCollapsed
                      ? domainBookmarks.map((bookmark) => (
                          <div
                            key={bookmark.id}
                            className="flex items-center gap-2 rounded border border-border bg-bg px-2 py-1"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenBookmark(bookmark.url)}
                              className="min-w-0 flex-1 truncate text-left text-xs text-text-primary"
                              title={bookmark.url}
                            >
                              {bookmark.title}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteBookmark(bookmark.id)}
                              className="rounded border border-border px-2 py-0.5 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      ) : null}

      <main className="flex min-h-0 flex-1 overflow-hidden p-3">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${tab.id === activeTabId ? 'flex' : 'hidden'} min-h-0 flex-1`}
          >
            <TabWebView
              tab={tab}
              onAttach={(tabId, element) => {
                webviewRefs.current[tabId] = element;
              }}
              onStateChange={applyTabPatch}
            />
            {tab.hasCrashed ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-bg/80">
                <div className="pointer-events-auto rounded border border-border bg-surface px-4 py-3 text-center">
                  <p className="text-sm">This tab crashed.</p>
                  <button
                    type="button"
                    onClick={handleReload}
                    className="mt-2 rounded border border-border px-3 py-1 text-xs"
                  >
                    Reload Tab
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </main>
    </div>
  );
};

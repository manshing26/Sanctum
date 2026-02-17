import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Plus,
  Star,
  Bookmark,
  Puzzle,
  Lock,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { BookmarkSummary, DownloadProgress, ExtensionSummary } from '../../shared/ipc';
import { DEFAULT_SEARCH_ENGINE, normalizeAddressInput } from './utils/address';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/Progress';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../components/ui/Tooltip';
import { ScrollArea } from '../components/ui/ScrollArea';
import { cn } from '../lib/utils';

const BROWSER_PARTITION = 'persist:privatevault-browser';
const HOME_URL = 'https://duckduckgo.com/';

const getDomainLabel = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).hostname || 'Unknown';
  } catch {
    return 'Unknown';
  }
};

const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
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

type DownloadEntry = DownloadProgress & { updatedAt: number };

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
    if (!webview || webview.dataset.listenersAttached === 'true') return;
    webview.dataset.listenersAttached = 'true';

    const onLoadStart = (): void => onStateChange(tab.id, { isLoading: true, hasCrashed: false });
    const onLoadStop = (): void => {
      syncNavState(tab.id, webview, onStateChange);
      void readGuestSize();
    };
    const onNavigate = (): void => syncNavState(tab.id, webview, onStateChange);
    const onFailLoad = (event: Event): void => {
      const details = event as unknown as { errorCode?: number };
      if (details.errorCode === -3) return;
      onStateChange(tab.id, { isLoading: false });
    };
    const onProcessGone = (): void => onStateChange(tab.id, { isLoading: false, hasCrashed: true });
    const readGuestSize = async (): Promise<void> => {
      try { await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));'); } catch {}
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
      delete webview.dataset.listenersAttached;
    };
  }, [onStateChange, tab.id]);

  useEffect(() => {
    const host = hostRef.current;
    const webview = webviewRef.current;
    if (!host || !webview) return;

    const syncSize = (): void => {
      webview.style.width = `${host.clientWidth}px`;
      webview.style.height = `${host.clientHeight}px`;
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [tab.id]);

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <webview
          ref={(element) => {
            const next = element as unknown as WebviewTag | null;
            webviewRef.current = next;
            onAttach(tab.id, next);
          }}
          src={tab.url}
          partition={BROWSER_PARTITION}
          style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'rgb(var(--bg))' }}
        />
      </div>
    </div>
  );
};

// ── Main Browser App ─────────────────────────────────────────────────
export const BrowserApp = (): React.JSX.Element => {
  const [tabs, setTabs] = useState<BrowserTab[]>([createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [addressInput, setAddressInput] = useState(HOME_URL);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadEntry>>({});
  const [showExtensions, setShowExtensions] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [extensionError, setExtensionError] = useState('');
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({});
  const downloadCleanupTimers = useRef<Record<string, number>>({});

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  useEffect(() => {
    if (activeTab) setAddressInput(activeTab.url || HOME_URL);
  }, [activeTab]);

  useEffect(() => {
    void window.browserAPI.listBookmarks().then((result) => {
      if (result.ok) setBookmarks(result.data);
    });
  }, []);

  const refreshExtensions = async (): Promise<void> => {
    const result = await window.browserAPI.listExtensions();
    if (result.ok) setExtensions(result.data);
    else setExtensionError(result.error);
  };

  useEffect(() => {
    const unsubscribe = window.browserAPI.onDownloadUpdate((payload) => {
      setDownloads((prev) => ({ ...prev, [payload.id]: { ...payload, updatedAt: Date.now() } }));
      if (payload.state !== 'downloading') {
        if (downloadCleanupTimers.current[payload.id]) {
          window.clearTimeout(downloadCleanupTimers.current[payload.id]);
        }
        downloadCleanupTimers.current[payload.id] = window.setTimeout(() => {
          setDownloads((prev) => {
            const next = { ...prev };
            delete next[payload.id];
            return next;
          });
          delete downloadCleanupTimers.current[payload.id];
        }, 8000);
      }
    });
    return () => {
      unsubscribe();
      Object.values(downloadCleanupTimers.current).forEach((t) => window.clearTimeout(t));
      downloadCleanupTimers.current = {};
    };
  }, []);

  const applyTabPatch = useCallback((tabId: string, patch: Partial<BrowserTab>): void => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const loadInActiveTab = (nextUrl: string): void => {
    if (!activeTab) return;
    const webview = webviewRefs.current[activeTab.id];
    if (!webview) {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }
    if (webview.getURL && webview.getURL() === nextUrl) return;
    if (activeTab.isLoading) {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }
    try { webview.loadURL(nextUrl); } catch {}
    applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
  };

  const handleAddressSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    const normalized = normalizeAddressInput(addressInput, DEFAULT_SEARCH_ENGINE);
    if (!normalized.ok) return;
    loadInActiveTab(normalized.url);
  };

  const handleOpenNewTab = (): void => {
    const tab = createTab(HOME_URL);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleCloseTab = (tabId: string): void => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === tabId);
      if (index === -1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      delete webviewRefs.current[tabId];
      if (next.length === 0) {
        const replacement = createTab(HOME_URL);
        setActiveTabId(replacement.id);
        return [replacement];
      }
      if (activeTabId === tabId) {
        setActiveTabId(next[Math.max(0, index - 1)].id);
      }
      return next;
    });
  };

  const handleGoBack = (): void => {
    const wv = activeTab ? webviewRefs.current[activeTab.id] : null;
    if (wv?.canGoBack()) wv.goBack();
  };

  const handleGoForward = (): void => {
    const wv = activeTab ? webviewRefs.current[activeTab.id] : null;
    if (wv?.canGoForward()) wv.goForward();
  };

  const handleReload = (): void => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    if (!wv) return;
    if (activeTab.isLoading) {
      wv.stop();
      applyTabPatch(activeTab.id, { isLoading: false });
    } else {
      wv.reload();
      applyTabPatch(activeTab.id, { isLoading: true });
    }
  };

  const refreshBookmarks = async (): Promise<void> => {
    const result = await window.browserAPI.listBookmarks();
    if (result.ok) setBookmarks(result.data);
  };

  const handleCreateBookmark = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const result = await window.browserAPI.createBookmark({ title: bookmarkTitle, url: bookmarkUrl });
    if (!result.ok) return;
    setBookmarkTitle('');
    setBookmarkUrl('');
    await refreshBookmarks();
  };

  const handleSaveCurrentAsBookmark = async (): Promise<void> => {
    if (!activeTab) return;
    await window.browserAPI.createBookmark({ title: activeTab.title, url: activeTab.url });
    await refreshBookmarks();
  };

  const handleDeleteBookmark = async (id: number): Promise<void> => {
    await window.browserAPI.deleteBookmark({ id });
    await refreshBookmarks();
  };

  const handleOpenBookmark = (url: string): void => {
    loadInActiveTab(url);
    setShowBookmarks(false);
  };

  const handleLoadExtension = async (): Promise<void> => {
    const result = await window.browserAPI.loadExtension();
    if (!result.ok) setExtensionError(result.error);
    else { setExtensionError(''); await refreshExtensions(); }
  };

  const downloadList = useMemo(() => Object.values(downloads), [downloads]);

  const groupedBookmarks = useMemo(() => {
    const groups = new Map<string, BookmarkSummary[]>();
    for (const bm of bookmarks) {
      const domain = getDomainLabel(bm.url);
      groups.set(domain, [...(groups.get(domain) ?? []), bm]);
    }
    return Array.from(groups.entries());
  }, [bookmarks]);

  const activeIsHttps = activeTab ? isHttps(activeTab.url) : false;

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-bg text-text-primary">
        {/* Navigation bar */}
        <header className="border-b border-border bg-surface px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleGoBack} disabled={!activeTab?.canGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleGoForward} disabled={!activeTab?.canGoForward}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleReload}>
                  {activeTab?.isLoading ? <X className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{activeTab?.isLoading ? 'Stop' : 'Reload'}</TooltipContent>
            </Tooltip>

            {/* Address bar */}
            <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center">
              <div className="relative flex-1">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                  {activeIsHttps ? (
                    <Lock className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
                  )}
                </div>
                <input
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Enter URL or search"
                  className="h-8 w-full rounded-full border border-border bg-bg pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
              </div>
            </form>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => void handleSaveCurrentAsBookmark()}>
                  <Star className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bookmark page</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showBookmarks ? 'default' : 'ghost'} size="icon-sm" onClick={() => setShowBookmarks((p) => !p)}>
                  <Bookmark className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bookmarks</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showExtensions ? 'default' : 'ghost'}
                  size="icon-sm"
                  onClick={() => { setShowExtensions((p) => !p); void refreshExtensions(); }}
                >
                  <Puzzle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Extensions</TooltipContent>
            </Tooltip>

            <Button variant="ghost" size="icon-sm" onClick={() => void window.browserAPI.closeBrowserWindow()}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab strip */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  'group flex max-w-[200px] items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1.5 text-xs transition-colors',
                  tab.id === activeTabId
                    ? 'border-border bg-bg text-text-primary'
                    : 'border-transparent bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                {tab.isLoading && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                <span className="truncate">{tab.title || 'New Tab'}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                  className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-border group-hover:opacity-100"
                  aria-label="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            ))}
            <Button variant="ghost" size="icon-sm" onClick={handleOpenNewTab} aria-label="New tab" className="shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* Bookmarks panel */}
        {showBookmarks && (
          <aside className="border-b border-border bg-surface px-3 py-3">
            <form onSubmit={(e) => void handleCreateBookmark(e)} className="flex items-center gap-2">
              <input
                value={bookmarkTitle}
                onChange={(e) => setBookmarkTitle(e.target.value)}
                placeholder="Title"
                className="h-7 min-w-[140px] rounded-md border border-border bg-bg px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
              <input
                value={bookmarkUrl}
                onChange={(e) => setBookmarkUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-7 min-w-[200px] flex-1 rounded-md border border-border bg-bg px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
              <Button type="submit" size="sm" className="h-7 text-xs">Add</Button>
            </form>
            <ScrollArea className="mt-2 max-h-44">
              {bookmarks.length === 0 ? (
                <p className="py-2 text-xs text-text-muted">No bookmarks saved.</p>
              ) : (
                <div className="space-y-1">
                  {groupedBookmarks.map(([domain, domainBookmarks]) => {
                    const collapsed = collapsedDomains[domain] ?? false;
                    return (
                      <div key={domain}>
                        <button
                          type="button"
                          onClick={() => setCollapsedDomains((p) => ({ ...p, [domain]: !collapsed }))}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-hover"
                        >
                          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          <span className="font-medium">{domain}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">{domainBookmarks.length}</Badge>
                        </button>
                        {!collapsed && domainBookmarks.map((bm) => (
                          <div key={bm.id} className="ml-5 flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface-hover">
                            <button
                              type="button"
                              onClick={() => handleOpenBookmark(bm.url)}
                              className="min-w-0 flex-1 truncate text-left text-text-primary"
                              title={bm.url}
                            >
                              {bm.title}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteBookmark(bm.id)}
                              className="shrink-0 rounded p-0.5 text-text-muted hover:text-danger"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>
        )}

        {/* Extensions panel */}
        {showExtensions && (
          <aside className="border-b border-border bg-surface px-3 py-3">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void handleLoadExtension()} className="h-7 text-xs">
                Load Extension
              </Button>
              <span className="text-xs text-text-muted">Unpacked only</span>
            </div>
            {extensionError && <p className="mt-1 text-xs text-danger">{extensionError}</p>}
            <div className="mt-2 space-y-1">
              {extensions.length === 0 ? (
                <p className="text-xs text-text-muted">No extensions loaded.</p>
              ) : extensions.map((ext) => (
                <div key={ext.id} className="flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1">
                  <Puzzle className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-xs text-text-primary">{ext.name}</span>
                  <span className="text-[10px] text-text-muted">{ext.version}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <div key={tab.id} className={cn(tab.id === activeTabId ? 'flex' : 'hidden', 'relative min-h-0 flex-1')}>
              <TabWebView
                tab={tab}
                onAttach={(tabId, el) => { webviewRefs.current[tabId] = el; }}
                onStateChange={applyTabPatch}
              />
              {tab.hasCrashed && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/80">
                  <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-4">
                    <p className="text-sm text-text-primary">This tab crashed.</p>
                    <Button variant="secondary" size="sm" onClick={handleReload}>Reload Tab</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </main>

        {/* Downloads bar */}
        {downloadList.length > 0 && (
          <div className="border-t border-border bg-surface px-3 py-2">
            <div className="flex flex-col gap-2">
              {downloadList.map((item) => {
                const percent = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : null;
                const isActive = item.state === 'downloading';
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-md border border-border bg-bg px-3 py-1.5">
                    <Download className="h-4 w-4 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-text-primary">{item.filename}</div>
                      <Progress
                        value={percent ?? 30}
                        className="mt-1 h-1"
                        variant={item.state === 'completed' ? 'success' : item.state === 'failed' ? 'danger' : 'default'}
                      />
                      <div className="mt-0.5 text-[10px] text-text-muted">
                        {item.state === 'completed' ? 'Saved to Vault' : item.state}
                        {percent !== null ? ` · ${percent}%` : ''}
                        {item.error ? ` · ${item.error}` : ''}
                      </div>
                    </div>
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void window.browserAPI.cancelDownload(item.id)}
                        aria-label="Cancel download"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

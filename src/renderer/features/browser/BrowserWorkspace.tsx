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
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  BookmarkSummary,
  BrowserSettings,
  DownloadProgress,
  ExtensionStartupError,
  ExtensionSummary,
} from '../../../shared/ipc';
import { DEFAULT_SEARCH_ENGINE, normalizeAddressInput } from '../../browser/utils/address';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Progress } from '../../components/ui/Progress';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../../components/ui/Tooltip';
import { ScrollArea } from '../../components/ui/ScrollArea';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../components/ui/ContextMenu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/Dialog';
import { cn } from '../../lib/utils';

const BROWSER_PARTITION = 'persist:privatevault-browser';
const HOME_URL = 'https://duckduckgo.com/';

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

export type BrowserWorkspaceProps = {
  mode: 'same-window' | 'legacy-window';
  showLeftPanel?: boolean;
  showCloseButton?: boolean;
  isActive?: boolean;
  pendingUrl?: string | null;
  onPendingUrlConsumed?: () => void;
};

type TabWebViewProps = {
  tab: BrowserTab;
  onAttach: (tabId: string, el: WebviewTag | null) => void;
  onStateChange: (tabId: string, patch: Partial<BrowserTab>) => void;
  onNavigateEvent?: (tabId: string, url: string) => void;
};

type NavigationSample = {
  url: string;
  at: number;
};

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

const createTab = (url = HOME_URL): BrowserTab => ({
  id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  url,
  title: 'New Tab',
  isLoading: true,
  canGoBack: false,
  canGoForward: false,
  hasCrashed: false,
});

const TAB_PERSIST_KEY = 'pv_browser_tabs';

type PersistedTabState = {
  urls: string[];
  activeIndex: number;
};

const loadPersistedTabs = (): { tabs: BrowserTab[]; activeTabId: string } => {
  try {
    const raw = localStorage.getItem(TAB_PERSIST_KEY);
    if (!raw) return { tabs: [createTab()], activeTabId: '' };
    const saved = JSON.parse(raw) as PersistedTabState;
    if (!Array.isArray(saved.urls) || saved.urls.length === 0) return { tabs: [createTab()], activeTabId: '' };
    const tabs = saved.urls.map((url) => createTab(url));
    const index = Math.max(0, Math.min(saved.activeIndex ?? 0, tabs.length - 1));
    return { tabs, activeTabId: tabs[index].id };
  } catch {
    return { tabs: [createTab()], activeTabId: '' };
  }
};

const CHALLENGE_HINT_PATTERNS = [
  '__cf_chl_',
  '/cdn-cgi/challenge-platform',
  'captcha',
  'challenge',
  'cf_chl',
];

const CHALLENGE_WINDOW_MS = 12_000;
const CHALLENGE_MIN_NAVS = 8;
const CHALLENGE_COOLDOWN_MS = 60_000;
const CHALLENGE_HISTORY_SIZE = 12;

const isChallengeLikeUrl = (url: string): boolean => {
  const normalized = url.toLowerCase();
  return CHALLENGE_HINT_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const getHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

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

const TabWebView = ({ tab, onAttach, onStateChange, onNavigateEvent }: TabWebViewProps): React.JSX.Element => {
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
    const onNavigate = (): void => {
      const nextUrl = webview.getURL() || tab.url;
      syncNavState(tab.id, webview, onStateChange);
      onNavigateEvent?.(tab.id, nextUrl);
    };
    const onFailLoad = (event: Event): void => {
      const details = event as unknown as { errorCode?: number };
      if (details.errorCode === -3) return;
      onStateChange(tab.id, { isLoading: false });
    };
    const onProcessGone = (): void => onStateChange(tab.id, { isLoading: false, hasCrashed: true });
    const readGuestSize = async (): Promise<void> => {
      try {
        await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));');
      } catch {
        // Ignore guest resize sync failures.
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
      delete webview.dataset.listenersAttached;
    };
  }, [onNavigateEvent, onStateChange, tab.id, tab.url]);

  useEffect(() => {
    const host = hostRef.current;
    const webview = webviewRef.current;
    if (!host || !webview) return;

    const dispatchGuestResize = async (): Promise<void> => {
      try {
        await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));');
      } catch {
        // Ignore guest resize sync failures.
      }
    };

    void dispatchGuestResize();
    const observer = new ResizeObserver(() => {
      void dispatchGuestResize();
    });
    observer.observe(host);
    window.addEventListener('resize', dispatchGuestResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', dispatchGuestResize);
    };
  }, [tab.id]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div ref={hostRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
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

export const BrowserWorkspace = ({
  mode,
  showLeftPanel,
  showCloseButton,
  isActive,
  pendingUrl,
  onPendingUrlConsumed,
}: BrowserWorkspaceProps): React.JSX.Element => {
  const showPersistentLeftPanel = showLeftPanel ?? mode === 'same-window';
  const canShowCloseButton = showCloseButton ?? mode === 'legacy-window';
  const isWorkspaceActive = isActive ?? true;
  const isSuspended = !isWorkspaceActive;

  const [{ tabs: initialTabs, activeTabId: initialActiveTabId }] = useState(loadPersistedTabs);
  const [tabs, setTabs] = useState<BrowserTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialActiveTabId || initialTabs[0].id);
  const [addressInput, setAddressInput] = useState(HOME_URL);
  const [legacyShowBookmarks, setLegacyShowBookmarks] = useState(false);
  const [legacyShowExtensions] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'bookmarks' | 'extensions'>('bookmarks');
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [showBookmarkForm, setShowBookmarkForm] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameBookmarkTarget, setRenameBookmarkTarget] = useState<BookmarkSummary | null>(null);
  const [renameBookmarkTitle, setRenameBookmarkTitle] = useState('');
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadEntry>>({});
  const [extensions, setExtensions] = useState<ExtensionSummary[]>([]);
  const [extensionError, setExtensionError] = useState('');
  const [extensionStartupErrors, setExtensionStartupErrors] = useState<ExtensionStartupError[]>([]);
  const [browserSettings, setBrowserSettings] = useState<BrowserSettings | null>(null);
  const [isCleaningWeb, setIsCleaningWeb] = useState(false);
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({});
  const downloadCleanupTimers = useRef<Record<string, number>>({});
  const navigationHistoryRef = useRef<Record<string, NavigationSample[]>>({});
  const challengeWarningCooldownRef = useRef<Record<string, number>>({});

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    const state: PersistedTabState = {
      urls: tabs.map((t) => t.url),
      activeIndex: Math.max(0, activeIndex),
    };
    localStorage.setItem(TAB_PERSIST_KEY, JSON.stringify(state));
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (tabs.length === 0) {
      return;
    }
    const stillExists = tabs.some((tab) => tab.id === activeTabId);
    if (!stillExists) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (activeTab) setAddressInput(activeTab.url || HOME_URL);
  }, [activeTab]);

  useEffect(() => {
    if (isSuspended) {
      webviewRefs.current = {};
    }
  }, [isSuspended]);

  useEffect(() => {
    if (!isWorkspaceActive || !activeTab || isSuspended) {
      return;
    }

    const activeWebview = webviewRefs.current[activeTab.id];
    if (!activeWebview) {
      return;
    }

    const dispatchResize = (): void => {
      try {
        void activeWebview.executeJavaScript('window.dispatchEvent(new Event("resize"));');
      } catch {
        // Ignore pre-dom-ready sync failures.
      }
    };

    const rafA = window.requestAnimationFrame(() => {
      dispatchResize();
      window.requestAnimationFrame(dispatchResize);
    });
    const timer = window.setTimeout(dispatchResize, 120);

    return () => {
      window.cancelAnimationFrame(rafA);
      window.clearTimeout(timer);
    };
  }, [isWorkspaceActive, leftPanelOpen, activeTab?.id, isSuspended]);

  useEffect(() => {
    if (!pendingUrl) return;
    const tab = createTab(pendingUrl);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    onPendingUrlConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUrl]);

  useEffect(() => {
    void window.browserAPI.listBookmarks().then((result) => {
      if (result.ok) setBookmarks(result.data);
    });
  }, []);

  useEffect(() => {
    void window.browserAPI.getBrowserSettings().then((result) => {
      if (result.ok) {
        setBrowserSettings(result.data);
      }
    });
  }, []);

  const refreshExtensionStartupErrors = async (): Promise<void> => {
    const result = await window.browserAPI.listExtensionStartupErrors();
    if (result.ok) {
      setExtensionStartupErrors(result.data);
    }
  };

  useEffect(() => {
    void refreshExtensionStartupErrors();
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
    try {
      if (webview.getURL && webview.getURL() === nextUrl) return;
    } catch {
      // Webview not yet attached to DOM — fall through to URL patch.
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }
    if (activeTab.isLoading) {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
      return;
    }
    try {
      webview.loadURL(nextUrl);
    } catch {
      // Ignore transient load failures; state update still occurs.
    }
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

  const updateStrictCookieBlocking = async (
    strict: boolean,
    options?: { reloadCurrentTab?: boolean; silent?: boolean },
  ): Promise<void> => {
    const result = await window.browserAPI.updateBrowserSettings({ blockThirdPartyCookies: strict });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setBrowserSettings(result.data);

    if (!options?.silent) {
      if (strict) {
        toast.info('Strict cookie blocking enabled.');
      } else {
        toast.success('Compatibility mode enabled. Reloading tab.');
      }
    }

    if (!strict && options?.reloadCurrentTab) {
      const wv = activeTab ? webviewRefs.current[activeTab.id] : null;
      if (wv) {
        try {
          wv.reload();
        } catch {
          // Ignore transient reload failures.
        }
      }
    }
  };

  const handleCleanWeb = async (): Promise<void> => {
    if (isCleaningWeb) {
      return;
    }
    setIsCleaningWeb(true);
    try {
      const result = await window.browserAPI.clearData();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const freshTab = createTab(HOME_URL);
      webviewRefs.current = {};
      navigationHistoryRef.current = {};
      challengeWarningCooldownRef.current = {};
      localStorage.removeItem(TAB_PERSIST_KEY);
      setTabs([freshTab]);
      setActiveTabId(freshTab.id);
      setAddressInput(freshTab.url);
      toast.success('Web data cleared and tabs reset.');
    } finally {
      setIsCleaningWeb(false);
    }
  };

  const handleTabNavigate = useCallback((tabId: string, url: string): void => {
    const now = Date.now();
    const previous = navigationHistoryRef.current[tabId] ?? [];
    const samples = [...previous, { url, at: now }]
      .filter((sample) => now - sample.at <= CHALLENGE_WINDOW_MS)
      .slice(-CHALLENGE_HISTORY_SIZE);
    navigationHistoryRef.current[tabId] = samples;

    if (samples.length < CHALLENGE_MIN_NAVS) {
      return;
    }

    const latestHost = getHost(url);
    const sameHostSamples = latestHost
      ? samples.filter((sample) => getHost(sample.url) === latestHost)
      : [];
    const uniqueSameHostUrls = new Set(sameHostSamples.map((sample) => sample.url)).size;
    const looksLikeChallenge = samples.some((sample) => isChallengeLikeUrl(sample.url));
    const looksLikeHighChurn = sameHostSamples.length >= CHALLENGE_MIN_NAVS && uniqueSameHostUrls >= 4;

    if (!looksLikeChallenge && !looksLikeHighChurn) {
      return;
    }

    if ((challengeWarningCooldownRef.current[tabId] ?? 0) > now) {
      return;
    }
    challengeWarningCooldownRef.current[tabId] = now + CHALLENGE_COOLDOWN_MS;

    if (!browserSettings?.blockThirdPartyCookies) {
      toast.warning('Possible anti-bot challenge loop detected on this site.');
      return;
    }

    toast.warning('Possible challenge loop detected. Try compatibility mode.', {
      action: {
        label: 'Enable Compatibility',
        onClick: () => {
          void updateStrictCookieBlocking(false, { reloadCurrentTab: true });
        },
      },
    });

    if (process.env.NODE_ENV !== 'production') {
      const durationMs = samples[samples.length - 1].at - samples[0].at;
      // eslint-disable-next-line no-console
      console.warn('[BrowserChallengeLoop]', {
        tabId,
        host: latestHost,
        samples: samples.length,
        durationMs,
      });
    }
  }, [browserSettings?.blockThirdPartyCookies]);

  const refreshBookmarks = async (): Promise<void> => {
    const result = await window.browserAPI.listBookmarks();
    if (result.ok) setBookmarks(result.data);
  };

  const extractOgImageFromTab = async (tabId: string): Promise<string | undefined> => {
    const webview = webviewRefs.current[tabId];
    if (!webview) return undefined;
    try {
      const result = await webview.executeJavaScript(`(async function(){
        const selectors = [
          'meta[property="og:image"]',
          'meta[property="og:image:url"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
        ];
        let src = null;
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { src = el.getAttribute('content'); break; }
        }
        if (!src) return null;
        try {
          const res = await fetch(src, { credentials: 'include' });
          if (!res.ok) return null;
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const mime = res.headers.get('content-type') || 'image/jpeg';
          return 'data:' + mime + ';base64,' + btoa(bin);
        } catch { return null; }
      })()`);
      if (typeof result === 'string' && result.startsWith('data:')) return result;
      return undefined;
    } catch {
      return undefined;
    }
  };

  const handleCreateBookmark = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const normalizedInputUrl = bookmarkUrl.trim().toLowerCase();
    const hasDuplicate = bookmarks.some((bookmark) => bookmark.url.trim().toLowerCase() === normalizedInputUrl);
    if (hasDuplicate) {
      toast.warning('Bookmark already exists for this URL.');
      return;
    }

    const thumbnailDataUrl = activeTab ? await extractOgImageFromTab(activeTab.id) : undefined;
    const result = await window.browserAPI.createBookmark({ title: bookmarkTitle, url: bookmarkUrl, thumbnailDataUrl });
    if (!result.ok) return;
    setBookmarkTitle('');
    setBookmarkUrl('');
    setShowBookmarkForm(false);
    toast.success('Bookmark added.');
    await refreshBookmarks();
  };

  const handleSaveCurrentAsBookmark = async (): Promise<void> => {
    if (!activeTab) return;
    const normalizedActiveUrl = activeTab.url.trim().toLowerCase();
    const hasDuplicate = bookmarks.some((bookmark) => bookmark.url.trim().toLowerCase() === normalizedActiveUrl);
    if (hasDuplicate) {
      toast.warning('Bookmark already exists for this URL.');
      return;
    }

    const thumbnailDataUrl = await extractOgImageFromTab(activeTab.id);
    await window.browserAPI.createBookmark({ title: activeTab.title, url: activeTab.url, thumbnailDataUrl });
    toast.success('Bookmark added.');
    await refreshBookmarks();
  };

  const handleDeleteBookmark = async (id: number): Promise<void> => {
    await window.browserAPI.deleteBookmark({ id });
    await refreshBookmarks();
  };

  const openRenameBookmarkDialog = (bookmark: BookmarkSummary): void => {
    setRenameBookmarkTarget(bookmark);
    setRenameBookmarkTitle(bookmark.title);
    setRenameDialogOpen(true);
  };

  const handleRenameBookmark = async (): Promise<void> => {
    if (!renameBookmarkTarget) {
      return;
    }
    const trimmed = renameBookmarkTitle.trim();
    if (!trimmed || trimmed === renameBookmarkTarget.title) {
      setRenameDialogOpen(false);
      return;
    }

    const created = await window.browserAPI.createBookmark({ title: trimmed, url: renameBookmarkTarget.url });
    if (!created.ok) {
      toast.error(created.error);
      return;
    }
    await window.browserAPI.deleteBookmark({ id: renameBookmarkTarget.id });
    setRenameDialogOpen(false);
    setRenameBookmarkTarget(null);
    setRenameBookmarkTitle('');
    toast.success('Bookmark renamed.');
    await refreshBookmarks();
  };

  const handleOpenBookmark = (url: string): void => {
    loadInActiveTab(url);
    if (mode === 'legacy-window') {
      setLegacyShowBookmarks(false);
    }
  };

  const handleLoadExtension = async (): Promise<void> => {
    const result = await window.browserAPI.loadExtension();
    if (!result.ok) setExtensionError(result.error);
    else {
      setExtensionError('');
      await refreshExtensions();
      await refreshExtensionStartupErrors();
    }
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

  const bookmarksContent = (
    <>
      <Button
        variant={showBookmarkForm ? 'default' : 'secondary'}
        size="sm"
        onClick={() => setShowBookmarkForm((prev) => !prev)}
        className="h-8 text-xs"
      >
        {showBookmarkForm ? 'Hide Manual Add' : 'Add Bookmark'}
      </Button>
      {showBookmarkForm && (
        <form onSubmit={(e) => void handleCreateBookmark(e)} className="mt-2 flex flex-col gap-2">
          <input
            value={bookmarkTitle}
            onChange={(e) => setBookmarkTitle(e.target.value)}
            placeholder="Title"
            className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <input
            value={bookmarkUrl}
            onChange={(e) => setBookmarkUrl(e.target.value)}
            placeholder="https://example.com"
            className="h-8 rounded-md border border-border bg-bg px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <Button type="submit" size="sm" className="h-8 text-xs">Save Bookmark</Button>
        </form>
      )}
      <ScrollArea className="mt-3 flex-1">
        {bookmarks.length === 0 ? (
          <p className="py-2 text-xs text-text-muted">No bookmarks saved.</p>
        ) : (
          <div className="space-y-1 pb-2">
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
                    <ContextMenu key={bm.id}>
                      <ContextMenuTrigger asChild>
                        <div className="ml-5 flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface-hover">
                          <button
                            type="button"
                            onClick={() => handleOpenBookmark(bm.url)}
                            className="min-w-0 flex-1 truncate text-left text-text-primary"
                            title={bm.url}
                          >
                            {bm.title}
                          </button>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => openRenameBookmarkDialog(bm)}>
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => void handleDeleteBookmark(bm.id)}
                          className="text-danger focus:text-danger"
                        >
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </>
  );

  const extensionsContent = (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void handleLoadExtension()} className="h-8 text-xs">
          Load Extension
        </Button>
        <span className="text-xs text-text-muted">Unpacked only</span>
      </div>
      {extensionError && <p className="mt-2 text-xs text-danger">{extensionError}</p>}
      {extensionStartupErrors.length > 0 && (
        <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2">
          <p className="mb-1 text-xs font-medium text-warning">Startup load errors</p>
          <div className="space-y-1">
            {extensionStartupErrors.map((item) => (
              <div key={`${item.path}:${item.error}`} className="text-[11px] text-text-muted">
                <div className="truncate">{item.path}</div>
                <div className="truncate text-danger">{item.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ScrollArea className="mt-3 flex-1">
        <div className="space-y-1 pb-2">
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
      </ScrollArea>
    </>
  );

  return (
    <TooltipProvider>
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-bg text-text-primary', mode === 'legacy-window' && 'h-screen')}>
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
                  className="h-8 w-full rounded-full border border-border bg-bg pl-8 pr-9 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleSaveCurrentAsBookmark()}
                      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                      aria-label="Bookmark page"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Bookmark page</TooltipContent>
                </Tooltip>
              </div>
            </form>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={browserSettings?.blockThirdPartyCookies ? 'secondary' : 'default'}
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    void updateStrictCookieBlocking(Boolean(!browserSettings?.blockThirdPartyCookies), {
                      reloadCurrentTab: Boolean(browserSettings?.blockThirdPartyCookies),
                    });
                  }}
                >
                  {browserSettings?.blockThirdPartyCookies ? 'Strict' : 'Compat'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {browserSettings?.blockThirdPartyCookies
                  ? 'Strict cookie blocking is enabled'
                  : 'Compatibility mode is enabled'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    void handleCleanWeb();
                  }}
                  disabled={isCleaningWeb}
                >
                  {isCleaningWeb ? 'Cleaning...' : 'Clean Web'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear all browser data and reset tabs</TooltipContent>
            </Tooltip>

            {canShowCloseButton && (
              <Button variant="ghost" size="icon-sm" onClick={() => void window.browserAPI.closeBrowserWindow()}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTabId(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveTabId(tab.id);
                  }
                }}
                className={cn(
                  'group flex max-w-[220px] items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1.5 text-xs transition-colors',
                  tab.id === activeTabId
                    ? 'border-border bg-bg text-text-primary'
                    : 'border-transparent bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                {tab.isLoading && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                <span className="truncate">{tab.title || 'New Tab'}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-border group-hover:opacity-100"
                  aria-label="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="icon-sm" onClick={handleOpenNewTab} aria-label="New tab" className="shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {!showPersistentLeftPanel && legacyShowBookmarks && (
          <aside className="border-b border-border bg-surface px-3 py-3">
            <div className="flex h-[240px] min-h-0 flex-col">{bookmarksContent}</div>
          </aside>
        )}

        {!showPersistentLeftPanel && legacyShowExtensions && (
          <aside className="border-b border-border bg-surface px-3 py-3">
            <div className="flex h-[240px] min-h-0 flex-col">{extensionsContent}</div>
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {showPersistentLeftPanel && (
            <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-3">
              <Button
                variant={libraryTab === 'bookmarks' ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => {
                  if (libraryTab === 'bookmarks') {
                    setLeftPanelOpen((prev) => !prev);
                  } else {
                    setLibraryTab('bookmarks');
                    setLeftPanelOpen(true);
                  }
                }}
                aria-label="Open bookmarks panel"
              >
                <Bookmark className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={libraryTab === 'extensions' ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => {
                  if (libraryTab === 'extensions') {
                    setLeftPanelOpen((prev) => !prev);
                  } else {
                    setLibraryTab('extensions');
                    void refreshExtensions();
                    setLeftPanelOpen(true);
                  }
                }}
                aria-label="Open extensions panel"
              >
                <Puzzle className="h-3.5 w-3.5" />
              </Button>
            </aside>
          )}

          {showPersistentLeftPanel && leftPanelOpen && (
            <aside className="flex w-[280px] min-w-[240px] shrink-0 flex-col border-r border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {libraryTab === 'bookmarks' ? 'Bookmarks' : 'Extensions'}
                </h2>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setLeftPanelOpen(false)}
                  aria-label="Hide library panel"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                {libraryTab === 'bookmarks' ? bookmarksContent : extensionsContent}
              </div>
            </aside>
          )}

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {tabs.map((tab) => (
              <div key={tab.id} className={cn(tab.id === activeTabId ? 'flex' : 'hidden', 'relative min-h-0 min-w-0 h-full flex-1')}>
                {isSuspended ? (
                  <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-bg">
                    <p className="text-xs text-text-muted">Browser suspended while vault is locked or tab is inactive.</p>
                  </div>
                ) : (
                  <TabWebView
                    tab={tab}
                    onAttach={(tabId, el) => { webviewRefs.current[tabId] = el; }}
                    onStateChange={applyTabPatch}
                    onNavigateEvent={handleTabNavigate}
                  />
                )}
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
          </div>
        </main>

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

        <Dialog
          open={renameDialogOpen}
          onOpenChange={(open) => {
            setRenameDialogOpen(open);
            if (!open) {
              setRenameBookmarkTarget(null);
              setRenameBookmarkTitle('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Bookmark</DialogTitle>
              <DialogDescription>Update bookmark title.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <input
                value={renameBookmarkTitle}
                onChange={(e) => setRenameBookmarkTitle(e.target.value)}
                placeholder="Bookmark title"
                autoFocus
                className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleRenameBookmark()} disabled={!renameBookmarkTitle.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

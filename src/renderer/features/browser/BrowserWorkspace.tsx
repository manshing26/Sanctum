import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  BookmarkSummary,
  BrowserCommand,
  BrowserSettings,
  DownloadProgress,
  ExtensionStartupError,
  ExtensionSummary,
  FolderNode,
  PasswordDetail,
} from '../../../shared/ipc';
import { normalizeAddressInput } from '../../browser/utils/address';
import { resolveSearchTemplate } from '../../../shared/browserSearch';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../components/ui/ContextMenu';
import { fontSize } from '../../theme/typography';

// ── Design tokens ────────────────────────────────────────────────────
const T = {
  bg:         '#0a0c0b',
  bg2:        '#10110f',
  line:       'rgba(220,220,200,0.07)',
  line2:      'rgba(220,220,200,0.12)',
  text:       '#e8e6dc',
  mute:       '#79817a',
  mute2:      '#4d524d',
  accent:     '#7c9a92',
  accentGlow: 'rgba(124,154,146,0.12)',
  danger:     '#c36b5f',
  dangerGlow: 'rgba(195,107,95,0.10)',
  warn:       '#c08a5e',
  success:    '#6a9e7f',
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

// ── Types ────────────────────────────────────────────────────────────
const BROWSER_PARTITION = 'persist:privatevault-browser';
const HOME_URL = 'sanctum://newtab';
const isNewTab = (url: string): boolean => url === HOME_URL || url === '' || url === 'about:blank';

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
  imperativeRef?: React.Ref<BrowserWorkspaceHandle>;
};

export type BrowserWorkspaceHandle = {
  scrapeImagesFromActiveTab: () => Promise<string[]>;
};

type TabWebViewProps = {
  tab: BrowserTab;
  onAttach: (tabId: string, el: WebviewTag | null) => void;
  onStateChange: (tabId: string, patch: Partial<BrowserTab>) => void;
  onNavigateEvent?: (tabId: string, url: string) => void;
};

type NavigationSample = { url: string; at: number };

const isMacPlatform = (): boolean =>
  /Mac|iPhone|iPad|iPod/.test(window.navigator.platform);

const browserCommandFromKeyboardEvent = (event: KeyboardEvent): BrowserCommand | null => {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  const isLeft = key === 'arrowleft' || key === 'left' || code === 'arrowleft';
  const isRight = key === 'arrowright' || key === 'right' || code === 'arrowright';
  const isMac = isMacPlatform();

  if (isMac && event.metaKey && !event.altKey && !event.ctrlKey) {
    if (isLeft || key === '[') return 'history-back';
    if (isRight || key === ']') return 'history-forward';
    if (key === 't') return 'new-tab';
    if (key === 'w') return 'close-active-tab';
    if (key === 'r') return 'reload-or-stop';
    if (key === 'l') return 'focus-address';
  }

  if (!isMac && event.altKey && !event.ctrlKey && !event.metaKey) {
    if (isLeft) return 'history-back';
    if (isRight) return 'history-forward';
  }

  if (!isMac && event.ctrlKey && !event.altKey && !event.metaKey) {
    if (key === 't') return 'new-tab';
    if (key === 'w') return 'close-active-tab';
    if (key === 'r') return 'reload-or-stop';
    if (key === 'l') return 'focus-address';
  }

  return null;
};

// ── Helpers ──────────────────────────────────────────────────────────
const getDomainLabel = (rawUrl: string): string => {
  try { return new URL(rawUrl).hostname || 'Unknown'; } catch { return 'Unknown'; }
};

const isHttps = (url: string): boolean => {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
};

const createTab = (url = HOME_URL): BrowserTab => ({
  id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  url, title: 'New Tab', isLoading: !isNewTab(url), canGoBack: false, canGoForward: false, hasCrashed: false,
});

const TAB_PERSIST_KEY = 'pv_browser_tabs';
type PersistedTabState = { urls: string[]; activeIndex: number };

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

const CHALLENGE_HINT_PATTERNS = ['__cf_chl_', '/cdn-cgi/challenge-platform', 'captcha', 'challenge', 'cf_chl'];
const CHALLENGE_WINDOW_MS = 12_000;
const CHALLENGE_MIN_NAVS = 8;
const CHALLENGE_COOLDOWN_MS = 60_000;
const CHALLENGE_HISTORY_SIZE = 12;

const isChallengeLikeUrl = (url: string): boolean => {
  const n = url.toLowerCase();
  return CHALLENGE_HINT_PATTERNS.some((p) => n.includes(p));
};
const getHost = (url: string): string => { try { return new URL(url).hostname; } catch { return ''; } };

const syncNavState = (tabId: string, webview: WebviewTag, onStateChange: TabWebViewProps['onStateChange']): void => {
  onStateChange(tabId, {
    url: webview.getURL() || '', title: webview.getTitle() || 'New Tab',
    isLoading: false, canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward(), hasCrashed: false,
  });
};

// ── Inline SVG icons ─────────────────────────────────────────────────
const IcoBack = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9,2 4,7 9,12"/>
  </svg>
);
const IcoForward = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5,2 10,7 5,12"/>
  </svg>
);
const IcoReload = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 7A5 5 0 1 1 9.5 2.5"/><polyline points="9,1 9.5,2.5 11,2"/>
  </svg>
);
const IcoStop = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
  </svg>
);
const IcoLock = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5.5" width="8" height="5.5"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/>
  </svg>
);
const IcoGlobe = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="4.5"/><path d="M6 1.5c-1.4 1.5-2 3-2 4.5s.6 3 2 4.5"/><path d="M6 1.5c1.4 1.5 2 3 2 4.5s-.6 3-2 4.5"/><line x1="1.5" y1="6" x2="10.5" y2="6"/>
  </svg>
);
const IcoStar = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6.5,1 8.1,4.8 12.3,5.1 9.2,7.8 10.2,12 6.5,9.8 2.8,12 3.8,7.8 0.7,5.1 4.9,4.8"/>
  </svg>
);
const IcoCamera = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 4l1-1.5h3L9.5 4H12a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.5z"/>
    <circle cx="7" cy="7.7" r="2.1"/>
  </svg>
);
const IcoBookmark = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 1.5h8v10l-4-2.5-4 2.5z"/>
  </svg>
);
const IcoPuzzle = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2H3.5a1 1 0 0 0-1 1v2.5M6 2c0 1-1 1.5-1 2.5H8C8 3.5 7 3 7 2H6z"/>
    <path d="M2.5 5.5v5a1 1 0 0 0 1 1H9M2.5 9c1 0 1.5-1 2.5-1s1.5 1 2.5 1v-3c-1 0-1.5-1-2.5-1s-1.5 1-2.5 1V9z"/>
    <path d="M9 11.5h1.5a1 1 0 0 0 1-1V8M9 11.5c0-1 1-1.5 1-2.5V6c-1 0-1.5 1-2.5 1h0V9.5"/>
  </svg>
);
const IcoDownload = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,6.5 7,9.5 10,6.5"/><line x1="7" y1="2" x2="7" y2="9.5"/><line x1="2" y1="12" x2="12" y2="12"/>
  </svg>
);
const IcoPlus = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/>
  </svg>
);
const IcoChevRight = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,2 7,5 3,8"/>
  </svg>
);
const IcoChevDown = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,3 5,7 8,3"/>
  </svg>
);
const IcoSpinner = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M9 5A4 4 0 1 1 5 1"/>
  </svg>
);

// ── Small primitives ─────────────────────────────────────────────────
const NavBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, disabled, style, ...props }) => (
  <button
    type="button"
    {...props}
    disabled={disabled}
    style={{
      width: 28, height: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'none', border: 'none',
      color: disabled ? T.mute2 : T.mute,
      cursor: disabled ? 'default' : 'pointer',
      flexShrink: 0,
      ...style,
    }}
  >
    {children}
  </button>
);

// ── TabWebView (unchanged logic, minimal style tweaks) ────────────────
const TabWebView = ({ tab, onAttach, onStateChange, onNavigateEvent }: TabWebViewProps): React.JSX.Element => {
  const webviewRef = useRef<WebviewTag | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || webview.dataset.listenersAttached === 'true') return;
    webview.dataset.listenersAttached = 'true';

    const onLoadStart = (): void => onStateChange(tab.id, { isLoading: true, hasCrashed: false });
    const onLoadStop = (): void => { syncNavState(tab.id, webview, onStateChange); void readGuestSize(); };
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
      try { await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));'); } catch { /* ignore */ }
    };
    const applyZoom = async (): Promise<void> => {
      await webview.setVisualZoomLevelLimits(1, 1);
      webview.setZoomLevel(0); webview.setZoomFactor(1);
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
      try { await webview.executeJavaScript('window.dispatchEvent(new Event("resize"));'); } catch { /* ignore */ }
    };
    void dispatchGuestResize();
    const observer = new ResizeObserver(() => { void dispatchGuestResize(); });
    observer.observe(host);
    window.addEventListener('resize', dispatchGuestResize);
    return () => { observer.disconnect(); window.removeEventListener('resize', dispatchGuestResize); };
  }, [tab.id]);

  return (
    <div style={{ display: 'flex', minHeight: 0, minWidth: 0, flex: 1 }}>
      <div ref={hostRef} style={{ position: 'relative', minHeight: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <webview
          ref={(element) => {
            const next = element as unknown as WebviewTag | null;
            webviewRef.current = next;
            onAttach(tab.id, next);
          }}
          src={tab.url || undefined}
          partition={BROWSER_PARTITION}
          style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: T.bg }}
        />
      </div>
    </div>
  );
};

// ── NewTabPage ───────────────────────────────────────────────────────
const SERIF = "'Fraunces', Georgia, serif";

const NewTabPage: React.FC<{
  bookmarks: BookmarkSummary[];
  folders: FolderNode[];
  onNavigate: (url: string) => void;
  searchTemplate: string;
}> = ({ bookmarks, folders, onNavigate, searchTemplate }) => {
  const [query, setQuery] = React.useState('');
  const [selectedFolderId, setSelectedFolderId] = React.useState<number | null | 'all'>('all');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!query.trim()) return;
    const normalized = normalizeAddressInput(query.trim(), searchTemplate);
    if (normalized.ok) onNavigate(normalized.url);
  };

  // Build folder lookup map
  const folderMap = React.useMemo((): Map<number, string> => {
    const map = new Map<number, string>();
    const walk = (nodes: FolderNode[]): void => { for (const n of nodes) { map.set(n.id, n.name); walk(n.children); } };
    walk(folders);
    return map;
  }, [folders]);

  // Folders that actually have bookmarks
  const usedFolderIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const bm of bookmarks) { if (bm.folderId !== null && bm.folderId !== undefined) ids.add(bm.folderId); }
    return ids;
  }, [bookmarks]);

  const visibleBookmarks = React.useMemo(() => {
    if (selectedFolderId === 'all') return bookmarks.slice(0, 24);
    if (selectedFolderId === null) return bookmarks.filter((b) => b.folderId === null).slice(0, 24);
    return bookmarks.filter((b) => b.folderId === selectedFolderId).slice(0, 24);
  }, [bookmarks, selectedFolderId]);

  const folderTabs: Array<{ id: number | null | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    ...Array.from(usedFolderIds).map((id) => ({ id, label: folderMap.get(id) ?? `Folder ${id}` })),
  ];
  if (bookmarks.some((b) => b.folderId === null || b.folderId === undefined)) {
    folderTabs.push({ id: null, label: 'Unfiled' });
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', borderBottom: active ? `1px solid ${T.accent}` : '1px solid transparent',
    cursor: 'pointer', color: active ? T.accent : T.mute,
    fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase',
    padding: '4px 10px', paddingBottom: 8, flexShrink: 0,
  });

  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: T.bg, overflowY: 'auto', padding: '0 24px 48px' }}>
      {/* Brand */}
      <div style={{ marginTop: 72, marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: fontSize(36), fontWeight: 300, letterSpacing: '0.18em', color: T.text }}>Sanctum</div>
        <div style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.32em', textTransform: 'uppercase', color: T.mute, marginTop: 8 }}>private vault · browser</div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ width: '100%', maxWidth: 560, marginBottom: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 46, border: `1px solid ${T.line2}`, background: T.bg2 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={T.mute} strokeWidth="1.4" strokeLinecap="round">
            <circle cx="6" cy="6" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or enter address…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: T.text, fontFamily: MONO, fontSize: fontSize(12), letterSpacing: '0.02em' }}
          />
          {query && (
            <button type="submit" style={{ background: T.accent, border: 'none', color: T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer' }}>
              Go
            </button>
          )}
        </div>
      </form>

      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <div style={{ width: '100%', maxWidth: 760 }}>
          {/* Folder filter tabs */}
          {folderTabs.length > 1 && (
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}`, marginBottom: 20, overflowX: 'auto' }}>
              {folderTabs.map((ft) => (
                <button
                  key={String(ft.id)}
                  type="button"
                  onClick={() => setSelectedFolderId(ft.id)}
                  style={tabBtn(selectedFolderId === ft.id)}
                >
                  {ft.label}
                </button>
              ))}
            </div>
          )}

          {visibleBookmarks.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>No bookmarks in this folder.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
              {visibleBookmarks.map((bm) => {
                const domain = (() => { try { return new URL(bm.url).hostname.replace(/^www\./, ''); } catch { return bm.url; } })();
                const grad = (() => {
                  let h = 0;
                  for (let i = 0; i < domain.length; i++) h = domain.charCodeAt(i) + ((h << 5) - h);
                  const hue = Math.abs(h) % 360;
                  return `linear-gradient(135deg,hsl(${hue},28%,18%),hsl(${(hue+48)%360},22%,12%))`;
                })();
                return (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => onNavigate(bm.url)}
                    title={bm.url}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                  >
                    <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', border: `1px solid ${T.line2}`, marginBottom: 6 }}>
                      {bm.thumbnailDataUrl
                        ? <img src={bm.thumbnailDataUrl} alt={bm.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontFamily: MONO, fontSize: fontSize(18), color: 'rgba(232,230,220,0.4)' }}>{domain.charAt(0).toUpperCase()}</span>
                          </div>
                      }
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.title}</div>
                    <div style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{domain}</div>
                    {bm.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {bm.tags.slice(0, 3).map((tag) => (
                          <span key={tag.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 4px',
                            border: `1px solid ${T.line2}`,
                            fontFamily: MONO, fontSize: fontSize(8), color: T.mute,
                          }}>
                            {tag.color && <span style={{ width: 4, height: 4, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── BrowserWorkspace ─────────────────────────────────────────────────
export const BrowserWorkspace = ({
  mode,
  showLeftPanel,
  showCloseButton,
  isActive,
  pendingUrl,
  onPendingUrlConsumed,
  imperativeRef,
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
  const [folders, setFolders] = useState<FolderNode[]>([]);
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
  const [isCapturingPage, setIsCapturingPage] = useState(false);
  const [pwPanelOpen, setPwPanelOpen] = useState(false);
  const [pwPanelEntries, setPwPanelEntries] = useState<PasswordDetail[]>([]);
  const [pwPanelLoading, setPwPanelLoading] = useState(false);
  const [pwSaveForm, setPwSaveForm] = useState<{ username: string; password: string; label: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({});
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const gestureCooldownRef = useRef(0);

  const scrapeImagesFromTab = useCallback(async (tabId: string): Promise<string[]> => {
    const webview = webviewRefs.current[tabId];
    if (!webview) return [];
    try {
      const urls = await webview.executeJavaScript(`(function(){
        const og=['meta[property="og:image"]','meta[property="og:image:url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]']
          .map(s=>document.querySelector(s)?.getAttribute('content')).filter(Boolean);
        const imgs=Array.from(document.querySelectorAll('img'))
          .filter(i=>i.naturalWidth>=100&&i.naturalHeight>=100)
          .map(i=>i.currentSrc||i.src).filter(Boolean);
        return[...new Set([...og,...imgs])].slice(0,20);
      })()`);
      if (!Array.isArray(urls) || urls.length === 0) return [];
      const dataUrls = await webview.executeJavaScript(`(async function(urls){
        const results=[];
        for(const src of urls){
          try{
            const res=await fetch(src,{credentials:'include'});
            if(!res.ok)continue;
            const blob=await res.blob();
            const dataUrl=await new Promise((resolve,reject)=>{
              const r=new FileReader();
              r.onload=()=>resolve(r.result);
              r.onerror=reject;
              r.readAsDataURL(blob);
            });
            if(typeof dataUrl==='string')results.push(dataUrl);
          }catch{}
        }return results;
      })(${JSON.stringify(urls)})`);
      return Array.isArray(dataUrls) ? (dataUrls as string[]) : [];
    } catch { return []; }
  }, []);
  const downloadCleanupTimers = useRef<Record<string, number>>({});
  const navigationHistoryRef = useRef<Record<string, NavigationSample[]>>({});
  const challengeWarningCooldownRef = useRef<Record<string, number>>({});

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);

  useImperativeHandle(imperativeRef, () => ({
    scrapeImagesFromActiveTab: () => scrapeImagesFromTab(activeTab?.id ?? ''),
  }), [scrapeImagesFromTab, activeTab?.id]);

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    const state: PersistedTabState = { urls: tabs.map((t) => t.url), activeIndex: Math.max(0, activeIndex) };
    localStorage.setItem(TAB_PERSIST_KEY, JSON.stringify(state));
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((t) => t.id === activeTabId)) setActiveTabId(tabs[0].id);
  }, [tabs, activeTabId]);

  useEffect(() => { if (activeTab) setAddressInput(isNewTab(activeTab.url) ? '' : (activeTab.url || '')); }, [activeTab]);

  useEffect(() => {
    if (!isWorkspaceActive || !activeTab || isSuspended) return;
    const activeWebview = webviewRefs.current[activeTab.id];
    if (!activeWebview) return;
    const dispatch = (): void => {
      try { void activeWebview.executeJavaScript('window.dispatchEvent(new Event("resize"));'); } catch { /* ignore */ }
    };
    const rafA = window.requestAnimationFrame(() => { dispatch(); window.requestAnimationFrame(dispatch); });
    const timer = window.setTimeout(dispatch, 120);
    return () => { window.cancelAnimationFrame(rafA); window.clearTimeout(timer); };
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
    void window.browserAPI.listBookmarks().then((r) => { if (r.ok) setBookmarks(r.data); });
    void window.browserAPI.listFoldersTree().then((r) => { if (r.ok) setFolders(r.data); });
  }, []);

  const refreshBrowserSettings = useCallback(async (): Promise<void> => {
    const r = await window.browserAPI.getBrowserSettings();
    if (r.ok) setBrowserSettings(r.data);
  }, []);

  useEffect(() => {
    void refreshBrowserSettings();
  }, [refreshBrowserSettings]);

  useEffect(() => {
    if (isWorkspaceActive) {
      void refreshBrowserSettings();
    }
  }, [isWorkspaceActive, refreshBrowserSettings]);

  useEffect(() => {
    const handleFocus = (): void => { void refreshBrowserSettings(); };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') void refreshBrowserSettings();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshBrowserSettings]);

  const refreshExtensionStartupErrors = async (): Promise<void> => {
    const r = await window.browserAPI.listExtensionStartupErrors();
    if (r.ok) setExtensionStartupErrors(r.data);
  };
  useEffect(() => { void refreshExtensionStartupErrors(); }, []);

  const refreshExtensions = async (): Promise<void> => {
    const r = await window.browserAPI.listExtensions();
    if (r.ok) setExtensions(r.data); else setExtensionError(r.error);
  };

  useEffect(() => {
    const unsub = window.browserAPI.onDownloadUpdate((payload) => {
      setDownloads((prev) => ({ ...prev, [payload.id]: { ...payload, updatedAt: Date.now() } }));
      if (payload.state !== 'downloading') {
        if (downloadCleanupTimers.current[payload.id]) window.clearTimeout(downloadCleanupTimers.current[payload.id]);
        downloadCleanupTimers.current[payload.id] = window.setTimeout(() => {
          setDownloads((prev) => { const next = { ...prev }; delete next[payload.id]; return next; });
          delete downloadCleanupTimers.current[payload.id];
        }, 8000);
      }
    });
    return () => {
      unsub();
      Object.values(downloadCleanupTimers.current).forEach((t) => window.clearTimeout(t));
      downloadCleanupTimers.current = {};
    };
  }, []);

  const applyTabPatch = useCallback((tabId: string, patch: Partial<BrowserTab>): void => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  const loadInActiveTab = (nextUrl: string): void => {
    if (!activeTab) return;
    if (isNewTab(nextUrl)) { applyTabPatch(activeTab.id, { url: HOME_URL, isLoading: false, title: 'New Tab' }); return; }
    const webview = webviewRefs.current[activeTab.id];
    if (!webview) { applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false }); return; }
    try { if (webview.getURL && webview.getURL() === nextUrl) return; } catch {
      applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false }); return;
    }
    if (activeTab.isLoading) { applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false }); return; }
    try { webview.loadURL(nextUrl); } catch { /* ignore */ }
    applyTabPatch(activeTab.id, { url: nextUrl, isLoading: true, hasCrashed: false });
  };

  const handleAddressSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    const normalized = normalizeAddressInput(
      addressInput,
      resolveSearchTemplate(
        browserSettings?.searchEngine ?? 'duckduckgo',
        browserSettings?.customSearchTemplate ?? '',
      ),
    );
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
      if (activeTabId === tabId) setActiveTabId(next[Math.max(0, index - 1)].id);
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
    if (activeTab.isLoading) { wv.stop(); applyTabPatch(activeTab.id, { isLoading: false }); }
    else { wv.reload(); applyTabPatch(activeTab.id, { isLoading: true }); }
  };

  const handleCaptureVisiblePage = async (): Promise<void> => {
    if (!activeTab || activeTab.hasCrashed) {
      toast.error('Cannot capture this page.');
      return;
    }
    const webview = webviewRefs.current[activeTab.id];
    if (!webview) {
      toast.error('Cannot capture this page.');
      return;
    }

    const toastId = toast('Capturing page...', { duration: Infinity });
    setIsCapturingPage(true);
    try {
      const image = await webview.capturePage();
      const dataUrl = image.toDataURL();
      const pngBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      if (!pngBase64) throw new Error('Empty capture.');

      const result = await window.browserAPI.importPageCapture({
        pngBase64,
        pageTitle: activeTab.title,
        pageUrl: activeTab.url,
      });
      if (!result.ok) {
        toast.error('Capture failed.', { id: toastId });
        return;
      }
      toast.success('Captured to Vault.', { id: toastId });
    } catch {
      toast.error('Capture failed.', { id: toastId });
    } finally {
      setIsCapturingPage(false);
    }
  };

  const runBrowserCommand = useCallback((command: BrowserCommand): void => {
    if (command === 'history-back') {
      if (activeTab?.canGoBack) handleGoBack();
      return;
    }
    if (command === 'history-forward') {
      if (activeTab?.canGoForward) handleGoForward();
      return;
    }
    if (command === 'new-tab') {
      handleOpenNewTab();
      return;
    }
    if (command === 'close-active-tab') {
      if (activeTab) handleCloseTab(activeTab.id);
      return;
    }
    if (command === 'reload-or-stop') {
      handleReload();
      return;
    }
    if (command === 'focus-address') {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }
  }, [activeTab, activeTabId, applyTabPatch]);

  useEffect(() => {
    const unsubscribe = window.browserAPI.onBrowserCommand((command) => {
      if (!isWorkspaceActive) {
        return;
      }
      runBrowserCommand(command);
    });
    return unsubscribe;
  }, [isWorkspaceActive, runBrowserCommand]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isWorkspaceActive) {
        return;
      }
      const command = browserCommandFromKeyboardEvent(event);
      if (!command) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      runBrowserCommand(command);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isWorkspaceActive, runBrowserCommand]);

  const runHistoryGestureCommand = useCallback((command: BrowserCommand): boolean => {
    if (command === 'history-back' && activeTab?.canGoBack) {
      runBrowserCommand(command);
      return true;
    }
    if (command === 'history-forward' && activeTab?.canGoForward) {
      runBrowserCommand(command);
      return true;
    }
    return false;
  }, [activeTab?.canGoBack, activeTab?.canGoForward, runBrowserCommand]);

  const handleBrowserWheel = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
    if (!isWorkspaceActive) {
      return;
    }
    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    if (absX < 80 || absX < absY * 1.4) {
      return;
    }

    const now = Date.now();
    if (now - gestureCooldownRef.current < 650) {
      return;
    }
    const command: BrowserCommand = event.deltaX < 0 ? 'history-back' : 'history-forward';
    if (!runHistoryGestureCommand(command)) {
      return;
    }
    gestureCooldownRef.current = now;
    event.preventDefault();
    event.stopPropagation();
  }, [isWorkspaceActive, runHistoryGestureCommand]);

  const handleBrowserMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    if (!isWorkspaceActive) {
      return;
    }
    const command: BrowserCommand | null =
      event.button === 3 ? 'history-back' : event.button === 4 ? 'history-forward' : null;
    if (!command || !runHistoryGestureCommand(command)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, [isWorkspaceActive, runHistoryGestureCommand]);

  const updateStrictCookieBlocking = async (strict: boolean, options?: { reloadCurrentTab?: boolean; silent?: boolean }): Promise<void> => {
    const r = await window.browserAPI.updateBrowserSettings({ blockThirdPartyCookies: strict });
    if (!r.ok) { toast.error(r.error); return; }
    setBrowserSettings(r.data);
    if (!options?.silent) {
      if (strict) toast.info('Strict cookie blocking enabled.');
      else toast.success('Compatibility mode enabled. Reloading tab.');
    }
    if (!strict && options?.reloadCurrentTab) {
      const wv = activeTab ? webviewRefs.current[activeTab.id] : null;
      if (wv) { try { wv.reload(); } catch { /* ignore */ } }
    }
  };

  const handleCleanWeb = async (): Promise<void> => {
    if (isCleaningWeb) return;
    setIsCleaningWeb(true);
    try {
      const r = await window.browserAPI.clearData();
      if (!r.ok) { toast.error(r.error); return; }
      const freshTab = createTab(HOME_URL);
      webviewRefs.current = {};
      navigationHistoryRef.current = {};
      challengeWarningCooldownRef.current = {};
      localStorage.removeItem(TAB_PERSIST_KEY);
      setTabs([freshTab]); setActiveTabId(freshTab.id); setAddressInput(freshTab.url);
      toast.success('Web data cleared and tabs reset.');
    } finally { setIsCleaningWeb(false); }
  };

  const handleTabNavigate = useCallback((tabId: string, url: string): void => {
    const now = Date.now();
    const previous = navigationHistoryRef.current[tabId] ?? [];
    const samples = [...previous, { url, at: now }].filter((s) => now - s.at <= CHALLENGE_WINDOW_MS).slice(-CHALLENGE_HISTORY_SIZE);
    navigationHistoryRef.current[tabId] = samples;
    if (samples.length < CHALLENGE_MIN_NAVS) return;
    const latestHost = getHost(url);
    const sameHostSamples = latestHost ? samples.filter((s) => getHost(s.url) === latestHost) : [];
    const uniqueSameHostUrls = new Set(sameHostSamples.map((s) => s.url)).size;
    const looksLikeChallenge = samples.some((s) => isChallengeLikeUrl(s.url));
    const looksLikeHighChurn = sameHostSamples.length >= CHALLENGE_MIN_NAVS && uniqueSameHostUrls >= 4;
    if (!looksLikeChallenge && !looksLikeHighChurn) return;
    if ((challengeWarningCooldownRef.current[tabId] ?? 0) > now) return;
    challengeWarningCooldownRef.current[tabId] = now + CHALLENGE_COOLDOWN_MS;
    if (!browserSettings?.blockThirdPartyCookies) {
      toast.warning('Possible anti-bot challenge loop detected on this site.');
      return;
    }
    toast.warning('Possible challenge loop detected. Try compatibility mode.', {
      action: { label: 'Enable Compatibility', onClick: () => { void updateStrictCookieBlocking(false, { reloadCurrentTab: true }); } },
    });
    if (process.env.NODE_ENV !== 'production') {
      const durationMs = samples[samples.length - 1].at - samples[0].at;
      // eslint-disable-next-line no-console
      console.warn('[BrowserChallengeLoop]', { tabId, host: latestHost, samples: samples.length, durationMs });
    }
  }, [browserSettings?.blockThirdPartyCookies]);

  const activeDomain = useMemo(() => {
    try { return new URL(activeTab?.url ?? '').hostname; } catch { return ''; }
  }, [activeTab?.url]);

  const openPwPanel = async (): Promise<void> => {
    setPwPanelOpen((prev) => {
      if (prev) return false;
      return true;
    });
    if (pwPanelOpen) return;
    setPwSaveForm(null);
    setPwPanelLoading(true);
    try {
      if (!activeDomain) { setPwPanelEntries([]); return; }
      const r = await window.electronAPI.getPasswordsForDomain({ domain: activeDomain });
      setPwPanelEntries(r.ok ? (r.data as PasswordDetail[]) : []);
    } finally {
      setPwPanelLoading(false);
    }
  };

  const handlePwSave = async (): Promise<void> => {
    if (!pwSaveForm || !activeDomain) return;
    setPwSaving(true);
    try {
      const r = await window.electronAPI.createPassword({
        domain: activeDomain,
        username: pwSaveForm.username,
        password: pwSaveForm.password,
        label: pwSaveForm.label || undefined,
      });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Password saved.');
      setPwSaveForm(null);
      const r2 = await window.electronAPI.getPasswordsForDomain({ domain: activeDomain });
      setPwPanelEntries(r2.ok ? (r2.data as PasswordDetail[]) : []);
    } finally {
      setPwSaving(false);
    }
  };


  const refreshBookmarks = async (): Promise<void> => {
    const r = await window.browserAPI.listBookmarks();
    if (r.ok) setBookmarks(r.data);
  };

  const extractOgImageFromTab = async (tabId: string): Promise<string | undefined> => {
    const webview = webviewRefs.current[tabId];
    if (!webview) return undefined;
    try {
      const result = await webview.executeJavaScript(`(async function(){
        const selectors=['meta[property="og:image"]','meta[property="og:image:url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]'];
        let src=null;
        for(const sel of selectors){const el=document.querySelector(sel);if(el){src=el.getAttribute('content');break;}}
        if(!src)return null;
        try{const res=await fetch(src,{credentials:'include'});if(!res.ok)return null;const buf=await res.arrayBuffer();const bytes=new Uint8Array(buf);let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);const mime=res.headers.get('content-type')||'image/jpeg';return'data:'+mime+';base64,'+btoa(bin);}catch{return null;}
      })()`);
      if (typeof result === 'string' && result.startsWith('data:')) return result;
      return undefined;
    } catch { return undefined; }
  };

  const handleCreateBookmark = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const norm = bookmarkUrl.trim().toLowerCase();
    if (bookmarks.some((bm) => bm.url.trim().toLowerCase() === norm)) { toast.warning('Bookmark already exists for this URL.'); return; }
    const thumbnailDataUrl = activeTab ? await extractOgImageFromTab(activeTab.id) : undefined;
    const r = await window.browserAPI.createBookmark({ title: bookmarkTitle, url: bookmarkUrl, thumbnailDataUrl });
    if (!r.ok) return;
    setBookmarkTitle(''); setBookmarkUrl(''); setShowBookmarkForm(false);
    toast.success('Bookmark added.');
    await refreshBookmarks();
  };

  const handleSaveCurrentAsBookmark = async (): Promise<void> => {
    if (!activeTab) return;
    const norm = activeTab.url.trim().toLowerCase();
    if (bookmarks.some((bm) => bm.url.trim().toLowerCase() === norm)) { toast.warning('Bookmark already exists for this URL.'); return; }
    const thumbnailDataUrl = await extractOgImageFromTab(activeTab.id);
    await window.browserAPI.createBookmark({ title: activeTab.title, url: activeTab.url, thumbnailDataUrl });
    toast.success('Bookmark added.');
    await refreshBookmarks();
  };

  const handleDeleteBookmark = async (id: string): Promise<void> => {
    await window.browserAPI.deleteBookmark({ id });
    await refreshBookmarks();
  };

  const openRenameBookmarkDialog = (bm: BookmarkSummary): void => {
    setRenameBookmarkTarget(bm); setRenameBookmarkTitle(bm.title); setRenameDialogOpen(true);
  };

  const handleRenameBookmark = async (): Promise<void> => {
    if (!renameBookmarkTarget) return;
    const trimmed = renameBookmarkTitle.trim();
    if (!trimmed || trimmed === renameBookmarkTarget.title) { setRenameDialogOpen(false); return; }
    const created = await window.browserAPI.createBookmark({ title: trimmed, url: renameBookmarkTarget.url });
    if (!created.ok) { toast.error(created.error); return; }
    await window.browserAPI.deleteBookmark({ id: renameBookmarkTarget.id });
    setRenameDialogOpen(false); setRenameBookmarkTarget(null); setRenameBookmarkTitle('');
    toast.success('Bookmark renamed.');
    await refreshBookmarks();
  };

  const handleOpenBookmark = (url: string): void => {
    loadInActiveTab(url);
    if (mode === 'legacy-window') setLegacyShowBookmarks(false);
  };

  const handleLoadExtension = async (): Promise<void> => {
    const r = await window.browserAPI.loadExtension();
    if (!r.ok) setExtensionError(r.error);
    else { setExtensionError(''); await refreshExtensions(); await refreshExtensionStartupErrors(); }
  };

  const downloadList = useMemo(() => Object.values(downloads), [downloads]);
  const groupedBookmarks = useMemo(() => {
    const groups = new Map<string, BookmarkSummary[]>();
    for (const bm of bookmarks) { const d = getDomainLabel(bm.url); groups.set(d, [...(groups.get(d) ?? []), bm]); }
    return Array.from(groups.entries());
  }, [bookmarks]);

  const activeIsHttps = activeTab ? isHttps(activeTab.url) : false;

  // ── Bookmarks panel content ──────────────────────────────────────
  const bookmarksContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <button
        type="button"
        onClick={() => setShowBookmarkForm((p) => !p)}
        style={{
          height: 28, padding: '0 12px', flexShrink: 0,
          background: showBookmarkForm ? T.accentGlow : 'none',
          border: `1px solid ${showBookmarkForm ? T.accent : T.line2}`,
          color: showBookmarkForm ? T.accent : T.mute,
          fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {showBookmarkForm ? 'Cancel' : '+ Add Bookmark'}
      </button>

      {showBookmarkForm && (
        <form onSubmit={(e) => void handleCreateBookmark(e)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={bookmarkTitle} onChange={(e) => setBookmarkTitle(e.target.value)} placeholder="Title"
            style={{ height: 28, padding: '0 8px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }} />
          <input value={bookmarkUrl} onChange={(e) => setBookmarkUrl(e.target.value)} placeholder="https://…"
            style={{ height: 28, padding: '0 8px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }} />
          <button type="submit" style={{ height: 28, background: T.accent, border: 'none', color: T.bg, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Save
          </button>
        </form>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {bookmarks.length === 0 ? (
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, margin: '8px 0' }}>No bookmarks saved.</p>
        ) : (
          <div>
            {groupedBookmarks.map(([domain, domainBookmarks]) => {
              const collapsed = collapsedDomains[domain] ?? false;
              return (
                <div key={domain}>
                  <button
                    type="button"
                    onClick={() => setCollapsedDomains((p) => ({ ...p, [domain]: !collapsed }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '5px 4px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: T.mute, fontFamily: MONO, fontSize: fontSize(10),
                    }}
                  >
                    {collapsed ? <IcoChevRight /> : <IcoChevDown />}
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                    <span style={{ fontSize: fontSize(9), color: T.mute2 }}>{domainBookmarks.length}</span>
                  </button>
                  {!collapsed && domainBookmarks.map((bm) => (
                    <ContextMenu key={bm.id}>
                      <ContextMenuTrigger asChild>
                        <div style={{ marginLeft: 20 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenBookmark(bm.url)}
                            title={bm.url}
                            style={{
                              display: 'block', width: '100%', padding: '4px 8px',
                              background: 'none', border: 'none',
                              color: T.text, fontFamily: MONO, fontSize: fontSize(10),
                              textAlign: 'left', cursor: 'pointer',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {bm.title}
                          </button>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => openRenameBookmarkDialog(bm)}>Rename</ContextMenuItem>
                        <ContextMenuItem onClick={() => void handleDeleteBookmark(bm.id)} className="text-danger">Delete</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── Extensions panel content ─────────────────────────────────────
  const extensionsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => void handleLoadExtension()} style={{ height: 28, padding: '0 12px', background: T.accentGlow, border: `1px solid ${T.accent}`, color: T.accent, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Load Extension
        </button>
        <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2 }}>Unpacked only</span>
      </div>
      {extensionError && <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.danger, margin: 0 }}>{extensionError}</p>}
      {extensionStartupErrors.length > 0 && (
        <div style={{ border: `1px solid ${T.warn}`, background: 'rgba(192,138,94,0.08)', padding: '8px 10px' }}>
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.warn, margin: '0 0 6px' }}>Startup load errors</p>
          {extensionStartupErrors.map((item) => (
            <div key={`${item.path}:${item.error}`} style={{ fontFamily: MONO, fontSize: fontSize(9), marginBottom: 4 }}>
              <div style={{ color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.path}</div>
              <div style={{ color: T.danger, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.error}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {extensions.length === 0 ? (
          <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, margin: '8px 0' }}>No extensions loaded.</p>
        ) : extensions.map((ext) => (
          <div key={ext.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: `1px solid ${T.line}`, marginBottom: 4 }}>
            <IcoPuzzle />
            <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ext.name}</span>
            <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2 }}>{ext.version}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      onWheelCapture={handleBrowserWheel}
      onMouseUpCapture={handleBrowserMouseUp}
      style={{ display: 'flex', minHeight: 0, minWidth: 0, flex: 1, flexDirection: 'column', background: T.bg, color: T.text, ...(mode === 'legacy-window' ? { height: '100vh' } : {}) }}
    >
      {/* ── Toolbar ── */}
      <header style={{ borderBottom: `1px solid ${T.line}`, background: T.bg2, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <NavBtn onClick={handleGoBack} disabled={!activeTab?.canGoBack} title="Back (Cmd+Left / Alt+Left)"><IcoBack /></NavBtn>
          <NavBtn onClick={handleGoForward} disabled={!activeTab?.canGoForward} title="Forward (Cmd+Right / Alt+Right)"><IcoForward /></NavBtn>
          <NavBtn onClick={handleReload} title={activeTab?.isLoading ? 'Stop (Cmd/Ctrl+R)' : 'Reload (Cmd/Ctrl+R)'}>
            {activeTab?.isLoading ? <IcoStop /> : <IcoReload />}
          </NavBtn>

          {/* Address bar */}
          <form onSubmit={handleAddressSubmit} style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', minWidth: 0 }}>
            <span style={{ position: 'absolute', left: 10, color: activeIsHttps ? T.success : T.mute2, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              {activeIsHttps ? <IcoLock /> : <IcoGlobe />}
            </span>
            <input
              ref={addressInputRef}
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Enter URL or search"
              title="Address and search (Cmd/Ctrl+L)"
              style={{
                flex: 1, height: 28, padding: '0 36px 0 30px',
                background: T.bg, border: `1px solid ${T.line2}`,
                color: T.text, fontFamily: MONO, fontSize: fontSize(11), outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void handleSaveCurrentAsBookmark()}
              title="Bookmark page"
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              <IcoStar />
            </button>
          </form>

          <button
            type="button"
            onClick={() => void handleCaptureVisiblePage()}
            disabled={isCapturingPage || Boolean(activeTab?.hasCrashed)}
            title="Capture visible page"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCapturingPage ? T.accentGlow : 'none',
              border: `1px solid ${isCapturingPage ? T.accent : 'transparent'}`,
              color: isCapturingPage ? T.accent : T.mute,
              cursor: isCapturingPage || activeTab?.hasCrashed ? 'default' : 'pointer',
              opacity: activeTab?.hasCrashed ? 0.45 : 1,
              flexShrink: 0,
            }}
          >
            <IcoCamera />
          </button>

          {/* Password manager toggle */}
          <button
            type="button"
            onClick={() => void openPwPanel()}
            title="Saved passwords for this domain"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: pwPanelOpen ? T.accentGlow : 'none',
              border: `1px solid ${pwPanelOpen ? T.accent : 'transparent'}`,
              color: pwPanelOpen ? T.accent : T.mute,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5.5" cy="7" r="3"/><path d="M8.5 7h4M11 7v1.5"/>
            </svg>
          </button>

          {/* Cookie mode toggle */}
          <button
            type="button"
            onClick={() => void updateStrictCookieBlocking(Boolean(!browserSettings?.blockThirdPartyCookies), { reloadCurrentTab: Boolean(browserSettings?.blockThirdPartyCookies) })}
            title={browserSettings?.blockThirdPartyCookies ? 'Strict cookie blocking enabled' : 'Compatibility mode enabled'}
            style={{
              height: 28, padding: '0 10px',
              background: browserSettings?.blockThirdPartyCookies ? T.accentGlow : 'none',
              border: `1px solid ${browserSettings?.blockThirdPartyCookies ? T.accent : T.line2}`,
              color: browserSettings?.blockThirdPartyCookies ? T.accent : T.mute,
              fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {browserSettings?.blockThirdPartyCookies ? 'Strict' : 'Compat'}
          </button>

          <button
            type="button"
            onClick={() => void handleCleanWeb()}
            disabled={isCleaningWeb}
            title="Clear all browser data and reset tabs"
            style={{
              height: 28, padding: '0 10px',
              background: 'none', border: `1px solid ${T.line2}`,
              color: isCleaningWeb ? T.mute2 : T.mute,
              fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: isCleaningWeb ? 'default' : 'pointer', flexShrink: 0,
            }}
          >
            {isCleaningWeb ? 'Cleaning…' : 'Clean Web'}
          </button>

          {canShowCloseButton && (
            <NavBtn onClick={() => void window.browserAPI.closeBrowserWindow()} title="Close"><IcoStop /></NavBtn>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, overflowX: 'auto' }}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTabId(tab.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTabId(tab.id); } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  maxWidth: 200, height: 26, padding: '0 8px',
                  background: active ? T.bg : 'none',
                  border: `1px solid ${active ? T.line2 : 'transparent'}`,
                  borderBottom: active ? `1px solid ${T.bg}` : `1px solid transparent`,
                  color: active ? T.text : T.mute,
                  fontFamily: MONO, fontSize: fontSize(10),
                  cursor: 'pointer', flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {tab.isLoading && <IcoSpinner />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{tab.title || 'New Tab'}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                  aria-label="Close tab"
                  title="Close tab (Cmd/Ctrl+W)"
                  style={{ background: 'none', border: 'none', color: T.mute2, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                >
                  <IcoStop />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={handleOpenNewTab} aria-label="New tab" title="New tab (Cmd/Ctrl+T)" style={{ width: 28, height: 26, background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IcoPlus />
          </button>
        </div>
      </header>

      {/* Password panel */}
      {pwPanelOpen && (
        <div style={{ borderBottom: `1px solid ${T.line2}`, background: T.bg2, padding: '12px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2 }}>
              Passwords for <span style={{ color: T.accent }}>{activeDomain || '—'}</span>
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setPwSaveForm(pwSaveForm ? null : { username: '', password: '', label: '' })}
              style={{ height: 22, padding: '0 10px', background: pwSaveForm ? 'none' : T.accent, border: `1px solid ${pwSaveForm ? T.line2 : T.accent}`, color: pwSaveForm ? T.mute : T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {pwSaveForm ? 'Cancel' : '+ Save'}
            </button>
          </div>

          {pwSaveForm && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={pwSaveForm.username}
                onChange={(e) => setPwSaveForm((f) => f && ({ ...f, username: e.target.value }))}
                placeholder="Username / email"
                style={{ flex: '1 1 140px', height: 26, padding: '0 8px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
              />
              <input
                type="password"
                value={pwSaveForm.password}
                onChange={(e) => setPwSaveForm((f) => f && ({ ...f, password: e.target.value }))}
                placeholder="Password"
                style={{ flex: '1 1 120px', height: 26, padding: '0 8px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
              />
              <input
                type="text"
                value={pwSaveForm.label}
                onChange={(e) => setPwSaveForm((f) => f && ({ ...f, label: e.target.value }))}
                placeholder="Label (optional)"
                style={{ flex: '1 1 100px', height: 26, padding: '0 8px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => void handlePwSave()}
                disabled={pwSaving || !pwSaveForm.username || !pwSaveForm.password}
                style={{ height: 26, padding: '0 12px', background: T.accent, border: 'none', color: T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!pwSaveForm.username || !pwSaveForm.password) ? 0.5 : 1 }}
              >
                {pwSaving ? '…' : 'Save'}
              </button>
            </div>
          )}

          {pwPanelLoading ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, margin: 0 }}>Loading…</p>
          ) : pwPanelEntries.length === 0 ? (
            <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, margin: 0 }}>No saved credentials for this domain.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pwPanelEntries.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: T.bg, border: `1px solid ${T.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {entry.username || <span style={{ color: T.mute2 }}>no username</span>}
                    </span>
                    {entry.label && <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2 }}>{entry.label}</span>}
                  </div>
                  <button
                    type="button"
                    title="Copy username"
                    onClick={() => { void navigator.clipboard.writeText(entry.username); toast.success('Username copied.'); }}
                    style={{ height: 22, padding: '0 8px', background: 'none', border: `1px solid ${T.accent}`, color: T.accent, fontFamily: MONO, fontSize: fontSize(9), cursor: 'pointer', flexShrink: 0 }}
                  >
                    Copy user
                  </button>
                  <button
                    type="button"
                    title="Copy password"
                    onClick={() => { void navigator.clipboard.writeText(entry.password); toast.success('Password copied.'); }}
                    style={{ height: 22, padding: '0 8px', background: T.accent, border: `1px solid ${T.accent}`, color: T.bg, fontFamily: MONO, fontSize: fontSize(9), cursor: 'pointer', flexShrink: 0 }}
                  >
                    Copy pw
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legacy bookmarks/extensions panels */}
      {!showPersistentLeftPanel && legacyShowBookmarks && (
        <aside style={{ borderBottom: `1px solid ${T.line}`, background: T.bg2, padding: '10px 12px', height: 240, display: 'flex', flexDirection: 'column' }}>
          {bookmarksContent}
        </aside>
      )}
      {!showPersistentLeftPanel && legacyShowExtensions && (
        <aside style={{ borderBottom: `1px solid ${T.line}`, background: T.bg2, padding: '10px 12px', height: 240, display: 'flex', flexDirection: 'column' }}>
          {extensionsContent}
        </aside>
      )}

      <main style={{ display: 'flex', minHeight: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {/* Icon sidebar */}
        {showPersistentLeftPanel && (
          <aside style={{ width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderRight: `1px solid ${T.line}`, background: T.bg2, padding: '10px 0' }}>
            {([
              { id: 'bookmarks' as const, icon: <IcoBookmark />, label: 'Bookmarks' },
              { id: 'extensions' as const, icon: <IcoPuzzle />, label: 'Extensions' },
            ]).map(({ id, icon, label }) => {
              const isActive = libraryTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`Open ${label} panel`}
                  title={label}
                  onClick={() => {
                    if (libraryTab === id) { setLeftPanelOpen((p) => !p); }
                    else {
                      setLibraryTab(id); setLeftPanelOpen(true);
                      if (id === 'extensions') void refreshExtensions();
                    }
                  }}
                  style={{
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive && leftPanelOpen ? T.accentGlow : 'none',
                    border: `1px solid ${isActive && leftPanelOpen ? T.accent : 'transparent'}`,
                    color: isActive && leftPanelOpen ? T.accent : T.mute,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              );
            })}
          </aside>
        )}

        {/* Library panel */}
        {showPersistentLeftPanel && leftPanelOpen && (
          <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.line}`, background: T.bg2, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.12em', textTransform: 'uppercase', color: T.mute2 }}>
                · {libraryTab === 'bookmarks' ? 'Bookmarks' : 'Extensions'} ·
              </span>
              <button type="button" onClick={() => setLeftPanelOpen(false)} aria-label="Close panel" style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 2 }}>
                <IcoStop />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {libraryTab === 'bookmarks' ? bookmarksContent : extensionsContent}
            </div>
          </aside>
        )}

        {/* Webview area */}
        <div style={{ minHeight: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {tabs.map((tab) => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', position: 'relative', minHeight: 0, minWidth: 0, height: '100%', flex: 1 }}>
              {isSuspended && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', minHeight: 0, minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center', background: T.bg, zIndex: 1 }}>
                  <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>Browser suspended while vault is locked or tab is inactive.</p>
                </div>
              )}
              {!isSuspended && isNewTab(tab.url) ? (
                <NewTabPage
                  bookmarks={bookmarks}
                  folders={folders}
                  onNavigate={loadInActiveTab}
                  searchTemplate={resolveSearchTemplate(
                    browserSettings?.searchEngine ?? 'duckduckgo',
                    browserSettings?.customSearchTemplate ?? '',
                  )}
                />
              ) : (
              <div style={{ display: isSuspended ? 'none' : 'flex', minHeight: 0, minWidth: 0, flex: 1 }}>
                <TabWebView
                  tab={tab}
                  onAttach={(tabId, el) => { webviewRefs.current[tabId] = el; }}
                  onStateChange={applyTabPatch}
                  onNavigateEvent={handleTabNavigate}
                />
              </div>
              )}
              {tab.hasCrashed && (
                <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,12,11,0.8)' }}>
                  <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: `1px solid ${T.line2}`, background: T.bg2, padding: '20px 28px' }}>
                    <p style={{ fontFamily: MONO, fontSize: fontSize(11), color: T.text, margin: 0 }}>This tab crashed.</p>
                    <button type="button" onClick={handleReload} style={{ height: 32, padding: '0 16px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Reload Tab
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Downloads tray */}
      {downloadList.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.line}`, background: T.bg2, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {downloadList.map((item) => {
            const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : null;
            const isActive = item.state === 'downloading';
            const barColor = item.state === 'completed' ? T.success : item.state === 'failed' ? T.danger : T.accent;
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${T.line}`, background: T.bg, padding: '6px 10px' }}>
                <IcoDownload />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</div>
                  <div style={{ marginTop: 3, height: 2, background: T.line2 }}>
                    <div style={{ height: '100%', width: `${pct ?? 30}%`, background: barColor, transition: 'width 0.2s' }} />
                  </div>
                  <div style={{ marginTop: 2, fontFamily: MONO, fontSize: fontSize(9), color: T.mute2 }}>
                    {item.state === 'completed' ? 'Saved to Vault' : item.state}
                    {pct !== null ? ` · ${pct}%` : ''}
                    {item.error ? ` · ${item.error}` : ''}
                  </div>
                </div>
                {isActive && (
                  <button type="button" onClick={() => void window.browserAPI.cancelDownload(item.id)} aria-label="Cancel download" style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 2 }}>
                    <IcoStop />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rename bookmark modal */}
      {renameDialogOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center' }}
          onClick={() => { setRenameDialogOpen(false); setRenameBookmarkTarget(null); setRenameBookmarkTitle(''); }}>
          <div style={{ width: 360, background: T.bg2, border: `1px solid ${T.line2}`, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontFamily: MONO, fontSize: fontSize(12), color: T.text, margin: '0 0 4px', letterSpacing: '0.04em' }}>Rename Bookmark</p>
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: '0 0 16px' }}>Update bookmark title.</p>
            <input
              value={renameBookmarkTitle}
              onChange={(e) => setRenameBookmarkTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && renameBookmarkTitle.trim()) void handleRenameBookmark(); }}
              placeholder="Bookmark title"
              autoFocus
              style={{ width: '100%', height: 32, padding: '0 10px', background: T.bg, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(11), outline: 'none', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => { setRenameDialogOpen(false); setRenameBookmarkTarget(null); setRenameBookmarkTitle(''); }}
                style={{ height: 30, padding: '0 14px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleRenameBookmark()} disabled={!renameBookmarkTitle.trim()}
                style={{ height: 30, padding: '0 14px', background: renameBookmarkTitle.trim() ? T.accent : T.accentGlow, border: `1px solid ${T.accent}`, color: renameBookmarkTitle.trim() ? T.bg : T.mute, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: renameBookmarkTitle.trim() ? 'pointer' : 'default' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

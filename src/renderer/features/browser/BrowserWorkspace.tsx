import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  BookmarkSummary,
  BrowserCommand,
  BrowserPopupRequest,
  BrowserSettings,
  DownloadProgress,
  ExternalPrivateBrowserTarget,
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '../../components/ui/ContextMenu';
import { SanctumConfirmDialog } from '../../components/ui';
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
type CaptureRect = { x: number; y: number; width: number; height: number };
type CaptureDrag = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

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

const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

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
    if (key === 'b' && !isEditableShortcutTarget(event.target)) return 'toggle-saved-web';
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
    if (key === 'b' && !isEditableShortcutTarget(event.target)) return 'toggle-saved-web';
  }

  return null;
};

// ── Helpers ──────────────────────────────────────────────────────────
const getDomainLabel = (rawUrl: string): string => {
  try { return new URL(rawUrl).hostname || 'Unknown'; } catch { return 'Unknown'; }
};

const formatDownloadBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const getDomainAccent = (domain: string): string => {
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 26%, 20%), hsl(${(hue + 42) % 360}, 24%, 11%))`;
};

const isHttps = (url: string): boolean => {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
};

const createTab = (url = HOME_URL): BrowserTab => ({
  id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  url, title: 'New Tab', isLoading: !isNewTab(url), canGoBack: false, canGoForward: false, hasCrashed: false,
});

const TAB_PERSIST_KEY = 'pv_browser_tabs';
const MAX_VISIBLE_TABS = 8;
const MIN_VISIBLE_TABS = 3;
const COMPACT_TAB_WIDTH = 112;
const STACK_CHIP_WIDTH = 54;
const STACKED_TAB_THRESHOLD = 10;
const SAVED_WEB_DRAWER_WIDTH = 320;
const SAVED_WEB_OVERLAY_BREAKPOINT = 980;
type PersistedTabState = { urls: string[]; activeIndex: number };

type VisibleTabWindow = {
  visibleTabs: BrowserTab[];
  hiddenBeforeCount: number;
  hiddenAfterCount: number;
  previousStackTargetId: string | null;
  nextStackTargetId: string | null;
};

const getVisibleTabWindow = (tabs: BrowserTab[], activeTabId: string, maxVisibleTabs = MAX_VISIBLE_TABS): VisibleTabWindow => {
  if (tabs.length <= STACKED_TAB_THRESHOLD) {
    return {
      visibleTabs: tabs,
      hiddenBeforeCount: 0,
      hiddenAfterCount: 0,
      previousStackTargetId: null,
      nextStackTargetId: null,
    };
  }

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
  const visibleCount = Math.max(MIN_VISIBLE_TABS, Math.min(maxVisibleTabs, MAX_VISIBLE_TABS, tabs.length));
  const halfWindow = Math.floor(visibleCount / 2);
  let start = activeIndex - halfWindow;
  start = Math.max(0, Math.min(start, tabs.length - visibleCount));
  const end = Math.min(tabs.length, start + visibleCount);
  const hiddenBeforeCount = start;
  const hiddenAfterCount = tabs.length - end;

  return {
    visibleTabs: tabs.slice(start, end),
    hiddenBeforeCount,
    hiddenAfterCount,
    previousStackTargetId: hiddenBeforeCount > 0 ? tabs[start - 1].id : null,
    nextStackTargetId: hiddenAfterCount > 0 ? tabs[end].id : null,
  };
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const dragToRect = (drag: CaptureDrag): CaptureRect => {
  const x = Math.min(drag.startX, drag.currentX);
  const y = Math.min(drag.startY, drag.currentY);
  return {
    x,
    y,
    width: Math.abs(drag.currentX - drag.startX),
    height: Math.abs(drag.currentY - drag.startY),
  };
};

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
const IcoStar: React.FC<{ filled?: boolean }> = ({ filled = false }) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="6.5,1 8.1,4.8 12.3,5.1 9.2,7.8 10.2,12 6.5,9.8 2.8,12 3.8,7.8 0.7,5.1 4.9,4.8" />
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
          allowFullScreen
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
  showCloseButton,
  isActive,
  pendingUrl,
  onPendingUrlConsumed,
  imperativeRef,
}: BrowserWorkspaceProps): React.JSX.Element => {
  const canShowCloseButton = showCloseButton ?? mode === 'legacy-window';
  const isWorkspaceActive = isActive ?? true;
  const isSuspended = !isWorkspaceActive;

  const [{ tabs: initialTabs, activeTabId: initialActiveTabId }] = useState(loadPersistedTabs);
  const [tabs, setTabs] = useState<BrowserTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialActiveTabId || initialTabs[0].id);
  const [addressInput, setAddressInput] = useState(HOME_URL);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [privateOpenTargets, setPrivateOpenTargets] = useState<ExternalPrivateBrowserTarget[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [collapsedDomains, setCollapsedDomains] = useState<Record<string, boolean>>({});
  const [downloads, setDownloads] = useState<Record<string, DownloadEntry>>({});
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [browserSettings, setBrowserSettings] = useState<BrowserSettings | null>(null);
  const [isCleaningWeb, setIsCleaningWeb] = useState(false);
  const [cleanWebConfirmOpen, setCleanWebConfirmOpen] = useState(false);
  const [isCapturingPage, setIsCapturingPage] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [popupRequests, setPopupRequests] = useState<BrowserPopupRequest[]>([]);
  const [areaCaptureActive, setAreaCaptureActive] = useState(false);
  const [areaCaptureDrag, setAreaCaptureDrag] = useState<CaptureDrag | null>(null);
  const [pwPanelOpen, setPwPanelOpen] = useState(false);
  const [pwPanelEntries, setPwPanelEntries] = useState<PasswordDetail[]>([]);
  const [pwPanelLoading, setPwPanelLoading] = useState(false);
  const [pwSaveForm, setPwSaveForm] = useState<{ username: string; password: string; label: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [audioFrozenTabIds, setAudioFrozenTabIds] = useState<Set<string>>(() => new Set());
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({});
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const captureMenuRef = useRef<HTMLDivElement | null>(null);
  const popupMenuRef = useRef<HTMLDivElement | null>(null);
  const passwordMenuRef = useRef<HTMLDivElement | null>(null);
  const downloadsMenuRef = useRef<HTMLDivElement | null>(null);
  const gestureCooldownRef = useRef(0);
  const seenDownloadIdsRef = useRef<Set<string>>(new Set());
  const navigationHistoryRef = useRef<Record<string, NavigationSample[]>>({});
  const challengeWarningCooldownRef = useRef<Record<string, number>>({});

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const latestPopupRequest = popupRequests[popupRequests.length - 1] ?? null;
  const hiddenPopupRequestCount = Math.max(0, popupRequests.length - 1);
  const maxVisibleTabs = useMemo(() => {
    if (tabBarWidth <= 0) return MAX_VISIBLE_TABS;
    const reservedWidth = STACK_CHIP_WIDTH * 2;
    return Math.max(MIN_VISIBLE_TABS, Math.min(MAX_VISIBLE_TABS, Math.floor((tabBarWidth - reservedWidth) / COMPACT_TAB_WIDTH)));
  }, [tabBarWidth]);
  const visibleTabWindow = useMemo(() => getVisibleTabWindow(tabs, activeTabId, maxVisibleTabs), [tabs, activeTabId, maxVisibleTabs]);
  const savedWebOverlayMode = workspaceWidth > 0 && workspaceWidth < SAVED_WEB_OVERLAY_BREAKPOINT;

  useImperativeHandle(imperativeRef, () => ({}), []);

  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return undefined;
    const updateWidth = (): void => setWorkspaceWidth(node.clientWidth);
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const node = tabBarRef.current;
    if (!node) return undefined;
    const updateWidth = (): void => setTabBarWidth(node.clientWidth);
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    const state: PersistedTabState = { urls: tabs.map((t) => t.url), activeIndex: Math.max(0, activeIndex) };
    localStorage.setItem(TAB_PERSIST_KEY, JSON.stringify(state));
  }, [tabs, activeTabId]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSessionChanged(({ state }) => {
      if (state.status !== 'locked') return;
      setAudioFrozenTabIds(new Set(tabs.map((tab) => tab.id)));
    });
    return unsubscribe;
  }, [tabs]);

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
    if (!captureMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (captureMenuRef.current?.contains(event.target as Node)) return;
      setCaptureMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [captureMenuOpen]);

  useEffect(() => {
    if (popupRequests.length === 0) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (popupMenuRef.current?.contains(event.target as Node)) return;
      setPopupRequests([]);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [popupRequests.length]);

  useEffect(() => {
    if (!pwPanelOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (passwordMenuRef.current?.contains(event.target as Node)) return;
      setPwPanelOpen(false);
      setPwSaveForm(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPwPanelOpen(false);
      setPwSaveForm(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pwPanelOpen]);

  useEffect(() => {
    if (!leftPanelOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setLeftPanelOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [leftPanelOpen]);

  useEffect(() => {
    if (!areaCaptureActive) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setAreaCaptureActive(false);
      setAreaCaptureDrag(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [areaCaptureActive]);

  useEffect(() => {
    setAreaCaptureActive(false);
    setAreaCaptureDrag(null);
  }, [activeTab?.id]);

  useEffect(() => {
    if (!pendingUrl) return;
    const tab = createTab(pendingUrl);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    onPendingUrlConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUrl]);

  const refreshBrowserSettings = useCallback(async (): Promise<void> => {
    const r = await window.browserAPI.getBrowserSettings();
    if (r.ok) setBrowserSettings(r.data);
  }, []);

  const refreshBookmarks = useCallback(async (): Promise<void> => {
    const [bookmarkResult, folderResult] = await Promise.all([
      window.browserAPI.listBookmarks(),
      window.browserAPI.listFoldersTree(),
    ]);
    if (bookmarkResult.ok) setBookmarks(bookmarkResult.data);
    if (folderResult.ok) setFolders(folderResult.data);
  }, []);

  useEffect(() => {
    void refreshBookmarks();
    void window.electronAPI.listPrivateOpenTargets().then((r) => {
      if (r.ok) setPrivateOpenTargets(r.data.filter((target) => target.available));
    });
  }, [refreshBookmarks]);

  useEffect(() => {
    const unsubscribe = window.browserAPI.onBookmarksChanged(() => {
      void refreshBookmarks();
    });
    return unsubscribe;
  }, [refreshBookmarks]);

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

  useEffect(() => {
    let cancelled = false;
    const unsub = window.browserAPI.onDownloadUpdate((payload) => {
      const isNewDownload = !seenDownloadIdsRef.current.has(payload.id);
      seenDownloadIdsRef.current.add(payload.id);
      setDownloads((prev) => ({ ...prev, [payload.id]: { ...payload, updatedAt: Date.now() } }));
      if (isNewDownload && payload.state === 'downloading' && isWorkspaceActive) {
        setDownloadsOpen(true);
      }
    });

    void window.browserAPI.listDownloads().then((result) => {
      if (cancelled || !result.ok) return;
      const hydrated = result.data.reduce<Record<string, DownloadEntry>>((entries, item, index) => {
        seenDownloadIdsRef.current.add(item.id);
        entries[item.id] = { ...item, updatedAt: Date.now() - index };
        return entries;
      }, {});
      setDownloads((prev) => ({ ...hydrated, ...prev }));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [isWorkspaceActive]);

  useEffect(() => {
    if (!downloadsOpen) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (downloadsMenuRef.current?.contains(event.target as Node)) return;
      setDownloadsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDownloadsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [downloadsOpen]);

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

  const openUrlInNewTab = useCallback((url: string): void => {
    const tab = createTab(url);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const removePopupRequest = useCallback((requestId: string): void => {
    setPopupRequests((prev) => prev.filter((request) => request.id !== requestId));
  }, []);

  const handleOpenPopupOnce = useCallback((request: BrowserPopupRequest): void => {
    removePopupRequest(request.id);
    openUrlInNewTab(request.url);
  }, [openUrlInNewTab, removePopupRequest]);

  const handleAlwaysAllowPopupHost = useCallback(async (request: BrowserPopupRequest): Promise<void> => {
    const result = await window.browserAPI.allowPopupHost(request.requestingHost);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setBrowserSettings(result.data);
    removePopupRequest(request.id);
    openUrlInNewTab(request.url);
  }, [openUrlInNewTab, removePopupRequest]);

  useEffect(() => {
    const unsubscribe = window.browserAPI.onPopupBlocked((request) => {
      const allowedHosts = browserSettings?.allowedPopupHosts ?? [];
      if (request.allowed || allowedHosts.includes(request.requestingHost)) {
        openUrlInNewTab(request.url);
        return;
      }
      setPopupRequests((prev) => [...prev.filter((entry) => entry.id !== request.id), request].slice(-4));
    });
    return unsubscribe;
  }, [browserSettings?.allowedPopupHosts, openUrlInNewTab]);

  useEffect(() => {
    const unsubscribe = window.browserAPI.onOpenUrlInTab((payload) => {
      if (!isWorkspaceActive) {
        return;
      }
      openUrlInNewTab(payload.url);
    });
    return unsubscribe;
  }, [isWorkspaceActive, openUrlInNewTab]);

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
      setAudioFrozenTabIds((prevFrozen) => {
        if (!prevFrozen.has(tabId)) return prevFrozen;
        const nextFrozen = new Set(prevFrozen);
        nextFrozen.delete(tabId);
        return nextFrozen;
      });
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

  const handleResumeTabAudio = (tabId: string): void => {
    const webview = webviewRefs.current[tabId];
    if (!webview) {
      toast.error('Could not resume browser audio.');
      return;
    }
    try {
      webview.setAudioMuted(false);
      setAudioFrozenTabIds((prevFrozen) => {
        if (!prevFrozen.has(tabId)) return prevFrozen;
        const nextFrozen = new Set(prevFrozen);
        nextFrozen.delete(tabId);
        return nextFrozen;
      });
    } catch {
      toast.error('Could not resume browser audio.');
    }
  };

  const importCapture = async (rect?: CaptureRect): Promise<void> => {
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
      const image = await webview.capturePage(rect);
      const dataUrl = image.toDataURL();
      const pngBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      if (!pngBase64) throw new Error('Empty capture.');

      const result = await window.browserAPI.importPageCapture({
        pngBase64,
        pageTitle: activeTab.title,
        pageUrl: activeTab.url,
      });
      if (!result.ok) {
        toast.error('Capture failed.', { id: toastId, duration: 4000 });
        return;
      }
      toast.success('Captured to Vault.', { id: toastId, duration: 4000 });
    } catch {
      toast.error('Capture failed.', { id: toastId, duration: 4000 });
    } finally {
      setIsCapturingPage(false);
    }
  };

  const handleCaptureVisiblePage = async (): Promise<void> => {
    setCaptureMenuOpen(false);
    await importCapture();
  };

  const handleStartAreaCapture = (): void => {
    setCaptureMenuOpen(false);
    if (!activeTab || activeTab.hasCrashed || isNewTab(activeTab.url)) {
      toast.error('Cannot capture this page.');
      return;
    }
    const webview = webviewRefs.current[activeTab.id];
    if (!webview) {
      toast.error('Cannot capture this page.');
      return;
    }
    setAreaCaptureDrag(null);
    setAreaCaptureActive(true);
    toast('Select area to capture');
  };

  const getCapturePoint = (
    event: React.PointerEvent<HTMLDivElement>,
  ): { x: number; y: number; width: number; height: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
      width: bounds.width,
      height: bounds.height,
    };
  };

  const handleAreaCapturePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!areaCaptureActive || isCapturingPage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCapturePoint(event);
    setAreaCaptureDrag({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const handleAreaCapturePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!areaCaptureActive || !areaCaptureDrag) return;
    const point = getCapturePoint(event);
    setAreaCaptureDrag((prev) => prev ? {
      ...prev,
      currentX: point.x,
      currentY: point.y,
    } : prev);
  };

  const handleAreaCapturePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!areaCaptureActive || !areaCaptureDrag) return;
    event.preventDefault();
    const point = getCapturePoint(event);
    const rect = dragToRect({
      ...areaCaptureDrag,
      currentX: point.x,
      currentY: point.y,
    });
    setAreaCaptureActive(false);
    setAreaCaptureDrag(null);

    const captureRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    if (captureRect.width < 8 || captureRect.height < 8) return;
    void importCapture(captureRect);
  };

  const handleAreaCapturePointerCancel = (): void => {
    setAreaCaptureActive(false);
    setAreaCaptureDrag(null);
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
      return;
    }
    if (command === 'toggle-saved-web') {
      setCaptureMenuOpen(false);
      setPwPanelOpen(false);
      setPwSaveForm(null);
      setLeftPanelOpen((open) => !open);
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

  const handleCleanWeb = async (): Promise<boolean> => {
    if (isCleaningWeb) return false;
    setIsCleaningWeb(true);
    try {
      const r = await window.browserAPI.clearData();
      if (!r.ok) { toast.error(r.error); return false; }
      const freshTab = createTab(HOME_URL);
      webviewRefs.current = {};
      navigationHistoryRef.current = {};
      challengeWarningCooldownRef.current = {};
      setAudioFrozenTabIds(new Set());
      setPopupRequests([]);
      localStorage.removeItem(TAB_PERSIST_KEY);
      setTabs([freshTab]); setActiveTabId(freshTab.id); setAddressInput(freshTab.url);
      toast.success('Web data cleared and tabs reset.');
      return true;
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

  useEffect(() => {
    setPwPanelOpen(false);
    setPwSaveForm(null);
  }, [activeTab?.id, activeDomain]);

  const openPwPanel = async (): Promise<void> => {
    setDownloadsOpen(false);
    setCaptureMenuOpen(false);
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

  const handleSaveCurrentAsBookmark = async (): Promise<void> => {
    if (!activeTab) return;
    const norm = activeTab.url.trim().toLowerCase();
    if (bookmarks.some((bm) => bm.url.trim().toLowerCase() === norm)) { toast.warning('Bookmark already exists for this URL.'); return; }
    const thumbnailDataUrl = await extractOgImageFromTab(activeTab.id);
    await window.browserAPI.createBookmark({ title: activeTab.title, url: activeTab.url, thumbnailDataUrl });
    toast.success('Bookmark added.');
    await refreshBookmarks();
  };

  const handleOpenBookmarkPrivate = async (bookmark: BookmarkSummary, target: ExternalPrivateBrowserTarget): Promise<void> => {
    const result = await window.electronAPI.openExternalPrivate({ url: bookmark.url, browser: target.id });
    if (!result.ok) {
      toast.error('Could not open private browser.');
      return;
    }
    toast.success('Opened in private browser.');
  };


  const handleOpenBookmark = (url: string): void => {
    loadInActiveTab(url);
    if (savedWebOverlayMode) setLeftPanelOpen(false);
  };

  const downloadList = useMemo(
    () => Object.values(downloads).sort((a, b) => b.updatedAt - a.updatedAt),
    [downloads],
  );
  const activeDownloadCount = useMemo(
    () => downloadList.filter((item) => item.state === 'downloading' || item.state === 'saving_to_vault').length,
    [downloadList],
  );
  const filteredBookmarks = useMemo(() => {
    const query = bookmarkSearch.trim().toLowerCase();
    if (!query) return bookmarks;
    return bookmarks.filter((bm) => {
      const domain = getDomainLabel(bm.url).toLowerCase();
      return bm.title.toLowerCase().includes(query) || bm.url.toLowerCase().includes(query) || domain.includes(query);
    });
  }, [bookmarks, bookmarkSearch]);
  const groupedBookmarks = useMemo(() => {
    const groups = new Map<string, BookmarkSummary[]>();
    for (const bm of filteredBookmarks) { const d = getDomainLabel(bm.url); groups.set(d, [...(groups.get(d) ?? []), bm]); }
    return Array.from(groups.entries());
  }, [filteredBookmarks]);
  const domainCount = useMemo(() => new Set(bookmarks.map((bm) => getDomainLabel(bm.url))).size, [bookmarks]);

  const activeIsHttps = activeTab ? isHttps(activeTab.url) : false;
  const activeBookmark = useMemo(() => {
    const activeUrl = activeTab?.url.trim().toLowerCase() ?? '';
    if (!activeUrl || isNewTab(activeUrl)) return undefined;
    return bookmarks.find((bookmark) => bookmark.url.trim().toLowerCase() === activeUrl);
  }, [activeTab?.url, bookmarks]);
  const isActiveBookmarked = Boolean(activeBookmark);

  // ── Bookmarks panel content ──────────────────────────────────────
  const bookmarksContent = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 12, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: fontSize(22), fontWeight: 400, color: T.text, letterSpacing: '0.01em' }}>
            Saved Web
          </h2>
          <p style={{ margin: '4px 0 0', fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {bookmarks.length} bookmark{bookmarks.length === 1 ? '' : 's'} · {domainCount} domain{domainCount === 1 ? '' : 's'}
          </p>
        </div>
        <button type="button" onClick={() => setLeftPanelOpen(false)} aria-label="Close Saved Web" style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}>
          <IcoStop />
        </button>
      </div>

      <div style={{ position: 'relative', margin: '12px 0' }}>
        <input
          value={bookmarkSearch}
          onChange={(event) => setBookmarkSearch(event.target.value)}
          placeholder="Search saved pages..."
          style={{
            width: '100%',
            height: 32,
            padding: bookmarkSearch ? '0 30px 0 10px' : '0 10px',
            background: T.bg,
            border: `1px solid ${T.line2}`,
            color: T.text,
            fontFamily: MONO,
            fontSize: fontSize(10),
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {bookmarkSearch && (
          <button
            type="button"
            onClick={() => setBookmarkSearch('')}
            aria-label="Clear bookmark search"
            style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 0 }}
          >
            <IcoStop />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {bookmarks.length === 0 ? (
          <div style={{ minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, border: `1px solid ${T.line}`, background: 'rgba(124,154,146,0.04)', padding: 18, textAlign: 'center' }}>
            <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.line2}`, color: T.mute, background: T.bg }}>
              <IcoBookmark />
            </div>
            <div>
              <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, margin: '0 0 4px' }}>No saved web pages yet.</p>
              <p style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, margin: 0 }}>Use the star button to save the current page.</p>
            </div>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div style={{ minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.line}`, background: T.bg, padding: 18, textAlign: 'center' }}>
            <p style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute2, margin: 0 }}>No saved pages match this search.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedBookmarks.map(([domain, domainBookmarks]) => {
              const collapsed = collapsedDomains[domain] ?? false;
              return (
                <div key={domain} style={{ border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.01)' }}>
                  <button
                    type="button"
                    onClick={() => setCollapsedDomains((p) => ({ ...p, [domain]: !collapsed }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '7px 8px',
                      background: T.bg, border: 'none', borderBottom: collapsed ? 'none' : `1px solid ${T.line}`, cursor: 'pointer',
                      color: T.mute, fontFamily: MONO, fontSize: fontSize(10),
                    }}
                  >
                    {collapsed ? <IcoChevRight /> : <IcoChevDown />}
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.accent }}>{domain}</span>
                    <span style={{ fontSize: fontSize(9), color: T.mute2 }}>{domainBookmarks.length}</span>
                  </button>
                  {!collapsed && domainBookmarks.map((bm) => (
                    <ContextMenu key={bm.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleOpenBookmark(bm.url)}
                          title={bm.url}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px',
                            background: activeBookmark?.id === bm.id ? T.accentGlow : 'none',
                            border: 'none',
                            borderBottom: `1px solid ${T.line}`,
                            color: T.text,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ width: 46, height: 46, flexShrink: 0, overflow: 'hidden', border: `1px solid ${activeBookmark?.id === bm.id ? T.accent : T.line2}`, background: getDomainAccent(domain), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {bm.thumbnailDataUrl ? (
                              <img src={bm.thumbnailDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: fontSize(16), color: T.text, opacity: 0.72, textTransform: 'uppercase' }}>{domain.charAt(0)}</span>
                            )}
                          </span>
                          <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {bm.title || domain}
                            </span>
                            <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: activeBookmark?.id === bm.id ? T.accent : T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {activeBookmark?.id === bm.id ? 'Current page · ' : ''}{domain}
                            </span>
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {privateOpenTargets.length > 0 && (
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>Open Private In...</ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              {privateOpenTargets.map((target) => (
                                <ContextMenuItem key={target.id} onClick={() => void handleOpenBookmarkPrivate(bm, target)}>
                                  {target.label}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                        )}
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

  return (
    <div
      ref={workspaceRef}
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
              title={isActiveBookmarked ? 'Bookmarked' : 'Bookmark page'}
              style={{
                position: 'absolute',
                right: 6,
                background: 'none',
                border: 'none',
                color: isActiveBookmarked ? T.accent : T.mute,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 2,
              }}
            >
              <IcoStar filled={isActiveBookmarked} />
            </button>
          </form>

          {latestPopupRequest && (
            <div ref={popupMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                title="Popup blocked"
                style={{
                  height: 28, padding: '0 9px',
                  background: T.warn,
                  border: `1px solid ${T.warn}`,
                  color: T.bg,
                  fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'default',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                Popup
                {hiddenPopupRequestCount > 0 && <span>+{hiddenPopupRequestCount}</span>}
              </button>
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  zIndex: 38,
                  width: 310,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  border: `1px solid ${T.line2}`,
                  background: T.bg2,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  padding: 10,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.warn }}>
                    Popup blocked from {latestPopupRequest.requestingHost}
                  </span>
                  <span title={latestPopupRequest.url} style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {latestPopupRequest.targetHost || latestPopupRequest.url}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleOpenPopupOnce(latestPopupRequest)}
                    style={{ height: 28, padding: '0 8px', background: T.accent, border: `1px solid ${T.accent}`, color: T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Open Once
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAlwaysAllowPopupHost(latestPopupRequest)}
                    style={{ height: 28, padding: '0 8px', background: 'none', border: `1px solid ${T.accent}`, color: T.accent, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Always Allow
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removePopupRequest(latestPopupRequest.id)}
                  style={{ height: 24, padding: '0 8px', background: 'none', border: `1px solid ${T.line2}`, color: T.mute, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setCaptureMenuOpen(false);
              setDownloadsOpen(false);
              setPwPanelOpen(false);
              setPwSaveForm(null);
              setLeftPanelOpen((open) => !open);
            }}
            title="Saved Web (Cmd/Ctrl+B)"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: leftPanelOpen ? T.accentGlow : 'none',
              border: `1px solid ${leftPanelOpen ? T.accent : 'transparent'}`,
              color: leftPanelOpen ? T.accent : T.mute,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <IcoBookmark />
          </button>

          <div ref={downloadsMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setCaptureMenuOpen(false);
                setPwPanelOpen(false);
                setPwSaveForm(null);
                setLeftPanelOpen(false);
                setDownloadsOpen((open) => !open);
              }}
              title="Downloads"
              aria-label="Downloads"
              style={{
                position: 'relative',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: downloadsOpen || activeDownloadCount > 0 ? T.accentGlow : 'none',
                border: `1px solid ${downloadsOpen || activeDownloadCount > 0 ? T.accent : 'transparent'}`,
                color: downloadsOpen || activeDownloadCount > 0 ? T.accent : T.mute,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <IcoDownload />
              {downloadList.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    right: -4,
                    top: -4,
                    minWidth: 14,
                    height: 14,
                    padding: '0 3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: activeDownloadCount > 0 ? T.accent : T.mute2,
                    color: T.bg,
                    border: `1px solid ${T.bg2}`,
                    fontFamily: MONO,
                    fontSize: fontSize(8),
                    lineHeight: 1,
                  }}
                >
                  {activeDownloadCount > 0 ? activeDownloadCount : Math.min(downloadList.length, 99)}
                </span>
              )}
            </button>

            {downloadsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  zIndex: 40,
                  width: 360,
                  maxWidth: 'calc(100vw - 24px)',
                  maxHeight: 'min(480px, calc(100vh - 96px))',
                  display: 'flex',
                  flexDirection: 'column',
                  border: `1px solid ${T.line2}`,
                  background: T.bg2,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: fontSize(10), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.text }}>
                    Downloads
                  </span>
                  {activeDownloadCount > 0 && (
                    <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.accent }}>
                      {activeDownloadCount} active
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDownloadsOpen(false)}
                    title="Close"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0, display: 'flex' }}
                  >
                    <IcoStop />
                  </button>
                </div>

                <div style={{ minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {downloadList.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', border: `1px dashed ${T.line2}`, fontFamily: MONO, fontSize: fontSize(10), color: T.mute2 }}>
                      No downloads this session.
                    </div>
                  ) : downloadList.map((item) => {
                    const pct = item.totalBytes > 0
                      ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
                      : null;
                    const isDownloading = item.state === 'downloading';
                    const isSaving = item.state === 'saving_to_vault';
                    const barColor = item.state === 'completed'
                      ? T.success
                      : item.state === 'failed'
                        ? T.danger
                        : item.state === 'cancelled'
                          ? T.mute2
                          : T.accent;
                    const stateLabel = item.state === 'completed'
                      ? 'Saved to Vault'
                      : isSaving
                        ? 'Saving to Vault...'
                        : item.state === 'downloading'
                          ? 'Downloading'
                          : item.state === 'cancelled'
                            ? 'Cancelled'
                            : 'Failed';
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, border: `1px solid ${T.line}`, background: T.bg, padding: '9px 10px' }}>
                        <span style={{ color: barColor, display: 'flex', paddingTop: 1 }}><IcoDownload /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div title={item.filename} style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.filename}
                          </div>
                          <div style={{ marginTop: 6, height: 2, background: T.line2 }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${isSaving || item.state === 'completed' ? 100 : pct ?? 30}%`,
                                background: barColor,
                                transition: 'width 0.2s',
                              }}
                            />
                          </div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, justifyContent: 'space-between', fontFamily: MONO, fontSize: fontSize(9), color: item.state === 'failed' ? T.danger : T.mute2 }}>
                            <span>{item.error || stateLabel}</span>
                            <span style={{ flexShrink: 0 }}>
                              {isSaving
                                ? formatDownloadBytes(item.totalBytes || item.receivedBytes)
                                : item.totalBytes > 0
                                  ? `${formatDownloadBytes(item.receivedBytes)} / ${formatDownloadBytes(item.totalBytes)}${pct !== null ? ` · ${pct}%` : ''}`
                                  : formatDownloadBytes(item.receivedBytes)}
                            </span>
                          </div>
                        </div>
                        {isDownloading && (
                          <button
                            type="button"
                            onClick={() => void window.browserAPI.cancelDownload(item.id)}
                            aria-label="Cancel download"
                            title="Cancel download"
                            style={{ background: 'none', border: 'none', color: T.mute, cursor: 'pointer', display: 'flex', padding: 2 }}
                          >
                            <IcoStop />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div ref={captureMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setDownloadsOpen(false);
                setPwPanelOpen(false);
                setPwSaveForm(null);
                setCaptureMenuOpen((open) => !open);
              }}
              disabled={isCapturingPage || Boolean(activeTab?.hasCrashed)}
              title="Capture page"
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: captureMenuOpen || isCapturingPage || areaCaptureActive ? T.accentGlow : 'none',
                border: `1px solid ${captureMenuOpen || isCapturingPage || areaCaptureActive ? T.accent : 'transparent'}`,
                color: captureMenuOpen || isCapturingPage || areaCaptureActive ? T.accent : T.mute,
                cursor: isCapturingPage || activeTab?.hasCrashed ? 'default' : 'pointer',
                opacity: activeTab?.hasCrashed ? 0.45 : 1,
                flexShrink: 0,
              }}
            >
              <IcoCamera />
            </button>
            {captureMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  zIndex: 30,
                  minWidth: 150,
                  border: `1px solid ${T.line2}`,
                  background: T.bg2,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  padding: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleCaptureVisiblePage()}
                  style={{ width: '100%', height: 28, padding: '0 10px', background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontFamily: MONO, fontSize: fontSize(10), textAlign: 'left' }}
                >
                  Visible Page
                </button>
                <button
                  type="button"
                  onClick={handleStartAreaCapture}
                  style={{ width: '100%', height: 28, padding: '0 10px', background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontFamily: MONO, fontSize: fontSize(10), textAlign: 'left' }}
                >
                  Select Area
                </button>
              </div>
            )}
          </div>

          {/* Password manager toggle */}
          <div ref={passwordMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
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
            {pwPanelOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  zIndex: 35,
                  width: 340,
                  maxHeight: 'min(420px, calc(100vh - 96px))',
                  display: 'flex',
                  flexDirection: 'column',
                  border: `1px solid ${T.line2}`,
                  background: T.bg2,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Passwords for <span style={{ color: T.accent }}>{activeDomain || '—'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setPwPanelOpen(false); setPwSaveForm(null); }}
                    title="Close"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 0, display: 'flex', alignItems: 'center' }}
                  >
                    <IcoStop />
                  </button>
                </div>

                <div style={{ minHeight: 0, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pwSaveForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: T.bg, border: `1px solid ${T.line}` }}>
                      <input
                        type="text"
                        value={pwSaveForm.username}
                        onChange={(e) => setPwSaveForm((f) => f && ({ ...f, username: e.target.value }))}
                        placeholder="Username / email"
                        style={{ height: 28, padding: '0 8px', background: T.bg2, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
                      />
                      <input
                        type="password"
                        value={pwSaveForm.password}
                        onChange={(e) => setPwSaveForm((f) => f && ({ ...f, password: e.target.value }))}
                        placeholder="Password"
                        style={{ height: 28, padding: '0 8px', background: T.bg2, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
                      />
                      <input
                        type="text"
                        value={pwSaveForm.label}
                        onChange={(e) => setPwSaveForm((f) => f && ({ ...f, label: e.target.value }))}
                        placeholder="Label (optional)"
                        style={{ height: 28, padding: '0 8px', background: T.bg2, border: `1px solid ${T.line2}`, color: T.text, fontFamily: MONO, fontSize: fontSize(10), outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => void handlePwSave()}
                        disabled={pwSaving || !pwSaveForm.username || !pwSaveForm.password}
                        style={{ height: 28, padding: '0 12px', background: T.accent, border: 'none', color: T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!pwSaveForm.username || !pwSaveForm.password) ? 0.5 : 1 }}
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
                        <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: T.bg, border: `1px solid ${T.line}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                              {entry.username || <span style={{ color: T.mute2 }}>no username</span>}
                            </span>
                            {entry.label && <span style={{ fontFamily: MONO, fontSize: fontSize(9), color: T.mute2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.label}</span>}
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

                <div style={{ padding: 10, borderTop: `1px solid ${T.line}` }}>
                  <button
                    type="button"
                    onClick={() => setPwSaveForm(pwSaveForm ? null : { username: '', password: '', label: '' })}
                    style={{ width: '100%', height: 28, padding: '0 10px', background: pwSaveForm ? 'none' : T.accent, border: `1px solid ${pwSaveForm ? T.line2 : T.accent}`, color: pwSaveForm ? T.mute : T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    {pwSaveForm ? 'Cancel' : '+ Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

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
            onClick={() => {
              if (!isCleaningWeb) setCleanWebConfirmOpen(true);
            }}
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
        <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: 0, overflow: 'hidden' }}>
          <div ref={tabBarRef} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {visibleTabWindow.hiddenBeforeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (visibleTabWindow.previousStackTargetId) setActiveTabId(visibleTabWindow.previousStackTargetId);
                }}
                title={`${visibleTabWindow.hiddenBeforeCount} tabs before`}
                style={{
                  height: 26, minWidth: 46, padding: '0 8px',
                  background: T.bg2, border: `1px solid ${T.line2}`,
                  color: T.accent,
                  fontFamily: MONO, fontSize: fontSize(10),
                  cursor: 'pointer', flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                ‹ {visibleTabWindow.hiddenBeforeCount}
              </button>
            )}
            {visibleTabWindow.visibleTabs.map((tab) => {
              const active = tab.id === activeTabId;
              const compact = tabs.length > STACKED_TAB_THRESHOLD;
              return (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTabId(tab.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTabId(tab.id); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: compact ? 4 : 6,
                    width: compact ? 112 : 150, maxWidth: compact ? 112 : 200, minWidth: compact ? 78 : 90, height: 26, padding: compact ? '0 6px' : '0 8px',
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
            {visibleTabWindow.hiddenAfterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (visibleTabWindow.nextStackTargetId) setActiveTabId(visibleTabWindow.nextStackTargetId);
                }}
                title={`${visibleTabWindow.hiddenAfterCount} tabs after`}
                style={{
                  height: 26, minWidth: 46, padding: '0 8px',
                  background: T.bg2, border: `1px solid ${T.line2}`,
                  color: T.accent,
                  fontFamily: MONO, fontSize: fontSize(10),
                  cursor: 'pointer', flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {visibleTabWindow.hiddenAfterCount} ›
              </button>
            )}
          </div>
          <button type="button" onClick={handleOpenNewTab} aria-label="New tab" title="New tab (Cmd/Ctrl+T)" style={{ width: 32, height: 26, marginLeft: 4, background: T.bg2, border: `1px solid ${T.line}`, color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IcoPlus />
          </button>
        </div>
      </header>

      <main style={{ display: 'flex', minHeight: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {/* Webview area */}
        <div style={{ position: 'relative', minHeight: 0, minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {tabs.map((tab) => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', position: 'relative', minHeight: 0, minWidth: 0, height: '100%', flex: 1 }}>
              {(() => {
                const selectionRect = areaCaptureDrag ? dragToRect(areaCaptureDrag) : null;
                return areaCaptureActive && tab.id === activeTabId ? (
                  <div
                    onPointerDown={handleAreaCapturePointerDown}
                    onPointerMove={handleAreaCapturePointerMove}
                    onPointerUp={handleAreaCapturePointerUp}
                    onPointerCancel={handleAreaCapturePointerCancel}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 8,
                      cursor: isCapturingPage ? 'wait' : 'crosshair',
                      background: 'rgba(10,12,11,0.18)',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        padding: '5px 8px',
                        border: `1px solid ${T.line2}`,
                        background: 'rgba(10,12,11,0.85)',
                        color: T.text,
                        fontFamily: MONO,
                        fontSize: fontSize(10),
                        pointerEvents: 'none',
                      }}
                    >
                      Select area to capture
                    </div>
                    {selectionRect && (
                      <div
                        style={{
                          position: 'absolute',
                          left: selectionRect.x,
                          top: selectionRect.y,
                          width: selectionRect.width,
                          height: selectionRect.height,
                          border: `1px solid ${T.accent}`,
                          background: 'rgba(124,154,146,0.18)',
                          boxShadow: '0 0 0 9999px rgba(0,0,0,0.18)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                ) : null;
              })()}
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
              {!isSuspended && !isNewTab(tab.url) && audioFrozenTabIds.has(tab.id) && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,12,11,0.32)', zIndex: 3, pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${T.line2}`, background: 'rgba(16,17,15,0.96)', padding: '12px 14px', boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}>
                    <span style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.text, letterSpacing: '0.04em' }}>
                      Browser audio paused after lock.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleResumeTabAudio(tab.id)}
                      style={{ height: 28, padding: '0 12px', background: T.accent, border: `1px solid ${T.accent}`, color: T.bg, fontFamily: MONO, fontSize: fontSize(9), letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Resume This Tab
                    </button>
                  </div>
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
          {leftPanelOpen && savedWebOverlayMode && (
            <div
              onMouseDown={() => setLeftPanelOpen(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.22)' }}
            >
              <aside
                onMouseDown={(event) => event.stopPropagation()}
                style={{
                  width: 'min(340px, calc(100% - 32px))',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderLeft: `1px solid ${T.line2}`,
                  background: T.bg2,
                  boxShadow: '-18px 0 34px rgba(0,0,0,0.38)',
                  padding: '14px 12px',
                  boxSizing: 'border-box',
                }}
              >
                {bookmarksContent}
              </aside>
            </div>
          )}
        </div>
        {leftPanelOpen && !savedWebOverlayMode && (
          <aside
            style={{
              width: SAVED_WEB_DRAWER_WIDTH,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: `1px solid ${T.line2}`,
              background: T.bg2,
              padding: '14px 12px',
              boxSizing: 'border-box',
            }}
          >
            {bookmarksContent}
          </aside>
        )}
      </main>

      <SanctumConfirmDialog
        open={cleanWebConfirmOpen}
        onOpenChange={setCleanWebConfirmOpen}
        title="Clean browser data?"
        description="This will clear cookies, local storage, cache, service workers, and reset open browser tabs. Saved Vault bookmarks and passwords will not be deleted."
        variant="warning"
        size="md"
        confirmLabel="Clean Web"
        cancelLabel="Cancel"
        busy={isCleaningWeb}
        onConfirm={async () => {
          const cleaned = await handleCleanWeb();
          if (cleaned) setCleanWebConfirmOpen(false);
        }}
      />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

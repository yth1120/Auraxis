import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Layout, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  Cube,
  PanelBottom,
  Bell,
  MagnifyingGlass,
  ChatTeardropDots,
  ChatCircle,
  Robot,
  Minus,
  Square,
  Copy,
  X,
  Layout as LayoutIcon,
  ClockCounterClockwise,
  ShieldCheck,
  Browser,
  FolderOpen,
} from '@/components/common/icons';
import { Allotment, type AllotmentHandle } from 'allotment';
import clsx from 'clsx';
import { useAppStore } from '../../stores/useAppStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { useUndoStore } from '../../stores/useUndoStore';
import { useAgentStore } from '../../stores/useAgentStore';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { useTerminalTasksStore } from '../../stores/useTerminalTasksStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { getContentText } from '../../types/chat';
import { t, useI18nStore, useT, type I18nKey } from '../../i18n';
import { openWorkbenchTab } from '../../utils/workbenchTabs';

import SiderNav from './SiderNav';
import TabBar from './TabBar';
import ChatArea from './ChatArea';
import WorkbenchActionsButton from './WorkbenchActionsButton';
import TerminalDrawer from './TerminalDrawer';

const DiffPanel = lazy(() => import('./DiffPanel'));
const PreviewBrowser = lazy(() => import('./PreviewBrowser'));
const FileTreePanel = lazy(() => import('../preview/FileTreePanel'));
const WorkspaceInspector = lazy(() => import('../inspector/WorkspaceInspector'));
const TimelinePanel = lazy(() => import('../inspector/TimelinePanel'));
const ReviewPanel = lazy(() => import('../inspector/ReviewPanel'));

const { Header } = Layout;

function relativeSearchTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('time.justNow');
  if (diff < 3_600_000) return t('time.minutesAgo', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('time.hoursAgo', { n: Math.floor(diff / 3_600_000) });
  const d = new Date(ts);
  return new Intl.DateTimeFormat(useI18nStore.getState().locale === 'en-US' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }).format(d);
}

const PANEL_LABELS: Record<string, I18nKey> = {
  'file-tree': 'workbench.files',
  'diff': 'workbench.diff',
  'browser': 'workbench.preview',
  'inspector': 'workbench.overview',
  'timeline': 'workbench.timeline',
  'review': 'workbench.review',
  'preview': 'workbench.preview',
};

/** Right-panel "cockpit" tabs — one click switches the active execution view. */
const COCKPIT_TABS: { key: 'file-tree' | 'inspector' | 'timeline' | 'review' | 'preview'; labelKey: I18nKey; shortcut: string; icon: React.ReactNode }[] = [
  { key: 'file-tree', labelKey: 'workbench.files', shortcut: '', icon: <FolderOpen size={14} /> },
  { key: 'inspector', labelKey: 'workbench.overview', shortcut: 'Ctrl+Shift+1', icon: <LayoutIcon size={14} /> },
  { key: 'timeline', labelKey: 'workbench.timeline', shortcut: 'Ctrl+Shift+2', icon: <ClockCounterClockwise size={14} /> },
  { key: 'review', labelKey: 'workbench.review', shortcut: 'Ctrl+Shift+3', icon: <ShieldCheck size={14} /> },
  { key: 'preview', labelKey: 'workbench.preview', shortcut: 'Ctrl+Shift+4', icon: <Browser size={14} /> },
];

export default function WorkbenchLayout() {
  const t = useT();

  const {
    tabs,
    activeTabId,
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    showRightPanel,
    rightPanelView,
    setRightPanelView,
    rightPanelWidth,
    setRightPanelWidth,
    paneSizes,
    setPaneSizes,
    activeToolView,
    openToolView,
    sidebarMode,
    toggleRightPanel,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    terminalHeight,
    setTerminalHeight,
  } = useAppStore();

  const unreadNotifications = useNotificationStore(
    (s) => s.items.filter((i) => !i.read).length,
  );
  const showSettings = useAppStore((s) => s.showSettings);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const [searchResults, setSearchResults] = useState<{ type: 'chat' | 'agent' | 'session'; id: string; title: string; snippet: string; ts: number; score: number }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic sequence so a slow FTS response can never overwrite results
  // for a newer query (async race: old query resolves after new one).
  const searchSeq = useRef(0);

  // Opening the settings modal must never leave the global search popup open —
  // some focus paths (modal focus restore, programmatic focus) can otherwise
  // resurrect it behind the dialog.
  useEffect(() => {
    if (showSettings) {
      setSearchOpen(false);
      setSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchIndex(-1);
    }
  }, [showSettings]);

  const worktreeActive = useWorktreeStore((s) => s.active);
  const worktreeTaskId = useWorktreeStore((s) => s.taskId);
  const openFileRequest = useAppStore((s) => s.openFileRequest);
  const projectPath = useSettingsStore((s) => s.projectPath);
  const sidebarGlass = useSettingsStore((s) => s.sidebarGlass);
  const sidebarGlassSupported = useSettingsStore((s) => s.sidebarGlassSupported);
  // Frosted sidebar: only translucent when the OS actually provides Acrylic,
  // otherwise the solid panel color stays untouched (no unblurred window
  // transparency on Windows 10 / non-Windows).
  const sidebarGlassOn = sidebarGlass > 0 && sidebarGlassSupported;
  // At 100 the panel keeps a faint 12% tint so labels stay readable over the
  // blurred desktop; the tint grows with the value towards fully solid.
  const sidebarBg = sidebarGlassOn
    ? `color-mix(in srgb, var(--color-glass-panel) ${Math.round(100 - sidebarGlass * 0.88)}%, transparent)`
    : undefined;

  // Track maximize state so the maximize button reflects 还原 vs 最大化.
  const [isMaximized, setIsMaximized] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  useEffect(() => useTerminalTasksStore.getState().subscribe(), []);
  // Project switch invalidates any open file tabs.
  useEffect(() => {
    useAppStore.getState().clearFileTabs();
  }, [projectPath]);
  // Cross-panel file linkage: a chip anywhere (概览/时间线/产物) can request
  // opening a file — flip the right panel to the 文件 tab and let FileTreePanel
  // consume the request.
  useEffect(() => {
    if (!openFileRequest) return;
    const st = useAppStore.getState();
    if (st.sidebarMode === 'chat') return;
    st.setRightPanelView('file-tree');
    if (!st.showRightPanel) st.toggleRightPanel();
  }, [openFileRequest]);
  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.isMaximized().then(setIsMaximized).catch(() => {});
    return window.electronAPI!.onMaximizeChange?.(setIsMaximized);
  }, [isElectron]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // ── Keyboard shortcuts are handled globally in App.tsx via useKeybindingsStore ──

  // Chat mode is pure conversation — the workbench panel only exists in Work/Agent.
  const hasRightPanel = showRightPanel && rightPanelView !== 'none' && sidebarMode !== 'chat';
  const expectedLength = hasRightPanel ? 2 : 1;

  const fileMenuItems: MenuProps['items'] = [
    {
      key: 'new-chat',
      label: t('menu.newChat'),
      onClick: () => {
        const appState = useAppStore.getState();
        if (appState.sidebarMode === 'code') {
          // Agent 模式下「新建对话」= 新建任务：清空选中并标记新建，
          // 否则发送会继续旧任务而不是开新任务（与侧边栏/顶栏行为一致）。
          appState.setActiveToolView('none');
          useAgentStore.getState().setCurrentAgent(null);
          useChatStore.getState().setPendingNewTask(true);
        }
        useSessionStore.getState().newSession();
        useChatStore.getState().clearMessages();
      },
    },
    {
      key: 'clear-chat',
      label: t('menu.clearChat'),
      onClick: () => useChatStore.getState().clearMessages(),
    },
    { type: 'divider' },
    {
      key: 'settings',
      label: t('menu.settings'),
      onClick: () => {
        useAppStore.getState().setSettingsInitialKey('general');
        useAppStore.getState().setShowSettings(true);
      },
    },
  ];

  const editMenuItems: MenuProps['items'] = [
    {
      key: 'undo',
      label: t('menu.undo'),
      onClick: () => {
        const { undoLast, undos } = useUndoStore.getState();
        if (undos.length > 0) undoLast();
      },
    },
  ];

  const viewMenuItems: MenuProps['items'] = [
    {
      key: 'toggle-sidebar',
      label: t('menu.toggleSidebar'),
      onClick: () => useAppStore.getState().toggleSidebar(),
    },
    {
      key: 'toggle-right-panel',
      label: t('menu.toggleRightPanel'),
      onClick: () => useAppStore.getState().toggleRightPanel(),
    },
    { type: 'divider' },
    {
      key: 'toggle-theme',
      label: t('menu.toggleTheme'),
      onClick: () => useAppStore.getState().toggleTheme(),
    },
  ];

  const helpMenuItems: MenuProps['items'] = [
    {
      key: 'about',
      label: t('menu.about'),
      onClick: () => message.info('Auraxis v2.0.0'),
    },
  ];

  const allotmentRef = useRef<AllotmentHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const siderDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rightDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isResizingSider, setIsResizingSider] = useState(false);

  // ── Dynamic drag limits ──
  // The right panel may cover most of the screen, but the main content must
  // never be squeezed below a comfortable width. Its max is therefore derived
  // from the live container width instead of a fixed pixel cap.
  const MAIN_MIN = 480;
  const [containerW, setContainerW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  useEffect(() => {
    // Calibrate to the actual body width once mounted (excludes window chrome).
    const w = bodyRef.current?.clientWidth;
    if (w) setContainerW(w);
  }, []);
  const siderW = sidebarCollapsed ? 0 : Math.max(260, sidebarWidth);
  const rightMaxSize = Math.max(360, containerW - siderW - MAIN_MIN);
  // ── Initial pane sizes ──
  // We deliberately compute from sidebarWidth + rightPanelWidth (both already
  // persisted on drag-end) + the current viewport width, instead of replaying a
  // persisted paneSizes array. That makes the layout adapt when the user starts
  // a session at a new viewport size — the content slot soaks up the remainder
  // rather than leaving a gap from a previous, smaller viewport.
  // Passing undefined or a too-short array would send Allotment's internal
  // splitView into a bad state ("Cannot read properties of undefined (reading
  // 'minimumSize')") — so this always returns a complete sizes array.
  const initialSizes = useMemo<number[]>(() => {
    const sider = sidebarCollapsed ? 0 : Math.max(260, sidebarWidth);
    const w = containerW || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const right = hasRightPanel ? rightPanelWidth : 0;
    const content = Math.max(350, w - sider - right);
    return hasRightPanel ? [content, right] : [content];
    // expectedLength is the only dep that matters for Allotment's first paint;
    // changes to the others post-mount are handled by the resize effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedLength, containerW]);

  const openSearchResult = (r: { type: 'chat' | 'agent' | 'session'; id: string }) => {
    setSearchOpen(false);
    setSearchResults([]);
    setSearchQuery('');
    setSearchIndex(-1);
    const appState = useAppStore.getState();
    appState.setActiveToolView('none');
    if (r.type === 'session' || r.type === 'chat') {
      appState.setSidebarMode('chat');
      useChatStore.getState().switchSession(r.id);
    } else {
      appState.setSidebarMode('code');
      useAgentStore.getState().setCurrentAgent(r.id);
    }
  };


  // ── Resize helper — sync correction for Allotment's proportional defaultSizes ──
  const resizePanes = useCallback(() => {
    const handle = allotmentRef.current;
    const w = bodyRef.current?.clientWidth;
    if (!handle || !w) return;
    setContainerW(w);
    const sider = sidebarCollapsed ? 0 : Math.max(260, sidebarWidth);
    const right = hasRightPanel
      ? Math.min(rightPanelWidth, Math.max(360, w - sider - MAIN_MIN))
      : 0;
    const content = Math.max(MAIN_MIN, w - sider - right);
    handle.resize(hasRightPanel ? [content, right] : [content]);
  }, [sidebarCollapsed, sidebarWidth, rightPanelWidth, hasRightPanel]);

  // ── Pin sidebar pixel width across window & panel toggles ──
  // useLayoutEffect fires synchronously after DOM commit, before paint —
  // corrects Allotment's proportional defaultSizes before the user sees anything.
  useLayoutEffect(() => { resizePanes(); }, [resizePanes]);
  useEffect(() => {
    const handler = () => resizePanes();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resizePanes]);

  const handleDragEnd = (sizes: number[]) => {
    setPaneSizes(sizes);
    if (hasRightPanel && typeof sizes[1] === 'number') {
      setRightPanelWidth(sizes[1]);
    }
  };

  const startSiderResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    e.preventDefault();
    siderDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setIsResizingSider(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveSiderResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = siderDragRef.current;
    if (!drag) return;
    const bodyW = bodyRef.current?.clientWidth ?? containerW;
    const rightMin = hasRightPanel ? 320 : 0;
    const maxW = Math.max(260, Math.min(420, bodyW - MAIN_MIN - rightMin));
    setSidebarWidth(Math.max(260, Math.min(maxW, drag.startWidth + (e.clientX - drag.startX))));
  };

  const endSiderResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!siderDragRef.current) return;
    siderDragRef.current = null;
    setIsResizingSider(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startRightResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    rightDragRef.current = { startX: e.clientX, startWidth: rightPanelWidth };
    setIsResizingRight(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveRightResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = rightDragRef.current;
    if (!drag) return;
    const next = Math.min(rightMaxSize, Math.max(320, drag.startWidth + (drag.startX - e.clientX)));
    setRightPanelWidth(next);
  };

  const endRightResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rightDragRef.current) return;
    rightDragRef.current = null;
    setIsResizingRight(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    if (!isResizingSider && !isResizingRight) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [isResizingSider, isResizingRight]);

  const renderTabContent = () => {
    if (!activeTab) return <ChatArea />;
    if (activeTab.type === 'chat') return <ChatArea />;
    if (activeTab.type === 'file-tree') {
      return <Suspense fallback={null}><FileTreePanel variant="embedded" /></Suspense>;
    }
    if (activeTab.type === 'diff') {
      return <Suspense fallback={null}><DiffPanel tabId={activeTab.id} /></Suspense>;
    }
    if (activeTab.type === 'browser') {
      return <Suspense fallback={null}><PreviewBrowser tabId={activeTab.id} /></Suspense>;
    }
    return null;
  };

  const renderRightPanel = () => {
    switch (rightPanelView) {
      case 'file-tree': return <Suspense fallback={null}><FileTreePanel variant="tabs" /></Suspense>;
      case 'inspector': return <Suspense fallback={null}><WorkspaceInspector /></Suspense>;
      case 'timeline': return <Suspense fallback={null}><TimelinePanel /></Suspense>;
      case 'review': return <Suspense fallback={null}><ReviewPanel /></Suspense>;
      case 'preview': return <Suspense fallback={null}><PreviewBrowser tabId="right-preview" /></Suspense>;
      case 'none':
      default: return null;
    }
  };

  const headerToolActive = (key: 'terminal' | 'notifications') => {
    if (key === 'notifications') return activeToolView === 'notifications';
    return activeToolView === 'terminal';
  };

  return (
    <Layout className={clsx(
      'workbench-layout !h-screen !overflow-hidden',
      sidebarGlassOn ? '!bg-transparent' : '!bg-[var(--color-glass-header)]',
    )}>
      {/* ── Top Header Bar ── */}
      <Header className="ax-header !h-10 !pl-0 !pr-3 shrink-0">
        <div className="ax-header-group flex-1 min-w-0 gap-2.5">
          <div className="ax-header-group shrink-0">
          <button
            className={clsx(
              "ax-header-action text-sm",
              !canGoBack() && "ax-header-action:disabled"
            )}
            onClick={goBack} disabled={!canGoBack()} title={t('header.back')}
          >
            <ArrowLeft weight="bold" />
          </button>
          <button
            className={clsx(
              "ax-header-action text-sm",
              !canGoForward() && "ax-header-action:disabled"
            )}
            onClick={goForward} disabled={!canGoForward()} title={t('header.forward')}
          >
            <ArrowRight weight="bold" />
          </button>
        </div>

        <div className="ax-header-group shrink-0">
          <Dropdown menu={{ items: fileMenuItems }} trigger={['click']} placement="bottomLeft" overlayClassName="ax-top-menu-popup" transitionName="">
            <button className="ax-header-action !w-auto !px-1.5 text-sm">
              {t('menu.file')}
            </button>
          </Dropdown>
          <Dropdown menu={{ items: editMenuItems }} trigger={['click']} placement="bottomLeft" overlayClassName="ax-top-menu-popup" transitionName="">
            <button className="ax-header-action !w-auto !px-1.5 text-sm">
              {t('menu.edit')}
            </button>
          </Dropdown>
          <Dropdown menu={{ items: viewMenuItems }} trigger={['click']} placement="bottomLeft" overlayClassName="ax-top-menu-popup" transitionName="">
            <button className="ax-header-action !w-auto !px-1.5 text-sm">
              {t('menu.view')}
            </button>
          </Dropdown>
          <Dropdown menu={{ items: helpMenuItems }} trigger={['click']} placement="bottomLeft" overlayClassName="ax-top-menu-popup" transitionName="">
            <button className="ax-header-action !w-auto !px-1.5 text-sm">
              {t('menu.help')}
            </button>
          </Dropdown>
        </div>

        <div
          className={clsx('relative shrink-0 transition-[width] duration-200 ease-out', searchActive || searchOpen ? 'w-80' : 'w-52')}
          style={{ lineHeight: 1 }}
        >
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)] pointer-events-none" />
          <input
            id="global-search-input"
            type="search"
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onMouseDown={() => { setSearchActive(true); setSearchOpen(true); }}
            onFocus={() => { setSearchActive(true); setSearchOpen(true); }}
            onChange={(e) => {
              const q = e.target.value;
              const seq = ++searchSeq.current;
              setSearchQuery(q);
              setSearchIndex(-1);
              if (searchTimer.current) clearTimeout(searchTimer.current);
              if (!q.trim()) { setSearchResults([]); searchSeq.current++; return; }
              setSearchOpen(true);
              searchTimer.current = setTimeout(() => {
                const ql = q.trim().toLowerCase();
                const local = useSessionStore.getState().sessions
                  .filter(
                    (s) =>
                      s.title.toLowerCase().includes(ql) ||
                      s.messages.some((m) => getContentText(m.content).toLowerCase().includes(ql)),
                  )
                  .slice(0, 6)
                  .map((s) => {
                    const last = s.messages[s.messages.length - 1];
                    return {
                      type: 'session' as const,
                      id: s.id,
                      title: s.title,
                      snippet: last ? getContentText(last.content).replace(/\s+/g, ' ').slice(0, 90) : '',
                      ts: s.updated,
                      score: 1,
                    };
                  });
                const fts = window.electronAPI?.fts?.search;
                if (fts) {
                  void fts(q, 8).then((r) => {
                    if (seq !== searchSeq.current) return;
                    setSearchResults([...local, ...(r.ok && r.data ? r.data : [])]);
                    setSearchIndex(0);
                  }).catch(() => { if (seq === searchSeq.current) setSearchResults(local); });
                } else {
                  setSearchResults(local);
                  setSearchIndex(0);
                }
              }, 250);
            }}
            onBlur={() => {
              setSearchActive(false);
              setTimeout(() => setSearchOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSearchOpen(true);
                setSearchIndex((i) => (searchResults.length ? (i + 1) % searchResults.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSearchIndex((i) => (searchResults.length ? (i - 1 + searchResults.length) % searchResults.length : 0));
              } else if (e.key === 'Enter') {
                const target = searchResults[searchIndex >= 0 ? searchIndex : 0];
                if (target) openSearchResult(target);
              } else if (e.key === 'Escape') {
                setSearchOpen(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={clsx(
              'w-full h-8 rounded-full pl-9 pr-8 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-[background,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary [&::-webkit-search-cancel-button]:hidden',
              searchActive || searchOpen
                ? 'bg-[var(--color-bg-elevated)] border border-[var(--color-border-strong)] shadow-sm'
                : 'bg-[var(--color-bg-secondary)] border border-transparent hover:border-[var(--color-border-default)]',
            )}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={t('search.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-text-muted hover:text-text-primary hover:bg-[var(--color-hover)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                searchSeq.current++;
                setSearchQuery('');
                setSearchResults([]);
                setSearchIndex(-1);
                setSearchOpen(false);
              }}
            >
              <X size={10} weight="bold" />
            </button>
          )}
          {searchOpen && !showSettings && (
            <div
              className="absolute top-full left-0 w-80 z-50 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border-default)] shadow-[var(--shadow-lg)] overflow-hidden"
              style={{ marginTop: 6 }}
            >
              <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--color-border-dim)]">
                <MagnifyingGlass size={14} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">
                  {searchQuery.trim() ? t('search.query', { q: searchQuery.trim() }) : t('search.placeholder')}
                </span>
                {searchQuery.trim() && (
                  <span className="shrink-0 text-2xs text-text-faint tabular-nums">{t('search.results', { n: searchResults.length })}</span>
                )}
              </div>

              {!searchQuery.trim() ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-bg-inset)] text-text-faint">
                    <MagnifyingGlass size={18} />
                  </span>
                  <span className="text-sm font-medium text-text-secondary">{t('search.start')}</span>
                  <span className="text-2xs text-text-faint leading-[1.5]">{t('search.scope')}</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-bg-inset)] text-text-faint">
                    <MagnifyingGlass size={18} />
                  </span>
                  <span className="text-sm font-medium text-text-secondary">{t('search.noResults')}</span>
                  <span className="text-2xs text-text-faint leading-[1.5]">{t('search.tryAgain')}</span>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto p-1">
                  {(['session', 'chat', 'agent'] as const).map((group) => {
                    const groupItems = searchResults.filter((r) => r.type === group);
                    if (groupItems.length === 0) return null;
                    const groupLabel = group === 'session' ? t('search.groupSession') : group === 'chat' ? t('search.groupChat') : 'Agent';
                    return (
                      <div key={group}>
                        <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                          <span className="text-2xs font-semibold text-text-faint">{groupLabel}</span>
                          <span className="text-2xs text-text-faint tabular-nums">{groupItems.length}</span>
                        </div>
                        {groupItems.map((r, gi) => {
                          const idx = searchResults.indexOf(r);
                          const icon = group === 'session' ? <ChatTeardropDots size={14} weight="regular" /> : group === 'chat' ? <ChatCircle size={14} weight="regular" /> : <Robot size={14} weight="regular" />;
                          const iconCls = group === 'session'
                            ? 'bg-[var(--color-violet-soft)] text-[var(--color-violet)]'
                            : group === 'chat'
                              ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                              : 'bg-[var(--color-violet-soft)] text-[var(--color-violet)]';
                          return (
                            <button
                              key={`${group}-${r.id}-${gi}`}
                              type="button"
                              className={clsx(
                                'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors duration-100',
                                idx === searchIndex ? 'bg-[var(--color-hover)]' : 'hover:bg-[var(--color-hover)]',
                              )}
                              onMouseDown={(e) => { e.preventDefault(); openSearchResult(r); }}
                              onMouseEnter={() => setSearchIndex(idx)}
                            >
                              <span className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-lg ${iconCls}`}>
                                {icon}
                              </span>
                              <span className="min-w-0 flex-1 flex flex-col gap-[2px]">
                                <span className="flex items-baseline gap-2 min-w-0">
                                  <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{r.title}</span>
                                  <span className="shrink-0 text-2xs text-text-faint tabular-nums">{relativeSearchTime(r.ts)}</span>
                                </span>
                                {r.snippet && (
                                  <span className="text-xs text-text-muted truncate">{r.snippet}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3 px-3 h-8 border-t border-[var(--color-border-dim)] text-2xs text-text-faint">
                <span>{t('search.upDown')}</span>
                <span>{t('search.enter')}</span>
                <span>{t('search.esc')}</span>
              </div>
            </div>
          )}
        </div>

          {worktreeActive && (
            <span className="ax-badge" title={t('header.sandbox', { id: worktreeTaskId || 'active' })}>
              <Cube weight="bold" />
              Sandbox {worktreeTaskId?.slice(0, 16) || 'Active'}
            </span>
          )}
        </div>

          {/* ── Top-right feature actions — notifications / terminal / workbench ── */}
          <div className="ax-header-group shrink-0 gap-2">
          <button
            className={clsx(
              'ax-header-action relative text-sm',
              headerToolActive('notifications') && '!bg-primary-soft !text-primary',
            )}
            onClick={() => openToolView('notifications')}
            title={t('workbench.notifications')}
          >
            <Bell weight={headerToolActive('notifications') ? 'fill' : 'regular'} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[15px] h-[15px] px-[3px] rounded-full bg-danger text-2xs font-semibold text-white leading-none">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
          {sidebarMode !== 'chat' && (
            <button
              className={clsx(
                'ax-header-action text-sm',
                headerToolActive('terminal') && '!bg-primary-soft !text-primary',
              )}
              onClick={() => openToolView('terminal')}
              title={`${t('workbench.terminal')} (Ctrl+\`)`}
            >
              <PanelBottom weight={headerToolActive('terminal') ? 'fill' : 'regular'} />
            </button>
          )}
          {sidebarMode !== 'chat' && <WorkbenchActionsButton />}
        </div>

        <div className="ax-header-group">
          {isElectron && (
            <>
              <button className="ax-header-action text-sm" onClick={() => window.electronAPI?.minimize()} title={t('header.minimize')}>
                <Minus size={12} weight="bold" />
              </button>
              <button className="ax-header-action text-sm" onClick={() => window.electronAPI?.maximize()} title={isMaximized ? t('header.restore') : t('header.maximize')}>
                {isMaximized ? (
                  <Copy size={12} />
                ) : (
                  <Square size={12} />
                )}
              </button>
              <button className="ax-header-action text-sm hover:!bg-danger-soft hover:!text-text-secondary" onClick={() => window.electronAPI?.close()} title={t('header.close')}>
                <X size={12} weight="bold" />
              </button>
            </>
          )}
        </div>
      </Header>

      {/* ── Tab Bar ── Only when multiple workbench tabs are actually open. */}
      {tabs.length > 1 && <TabBar />}

      {/* ── Body: drawer sider + Allotment (Content | optional Right Panel) ── */}
      <div className={clsx(
        'flex-1 flex min-h-0 min-w-0 overflow-hidden !p-0',
        sidebarGlassOn ? '!bg-transparent' : '!bg-[var(--color-glass-panel)]',
      )} ref={bodyRef}>
        <aside
          data-pane="sider"
          className={clsx(
            'sider-drawer relative z-30 h-full shrink-0 overflow-hidden bg-[var(--color-glass-panel)] border-r border-border-dim transition-[width] duration-300 ease-out',
            isResizingSider && '!transition-none',
          )}
          style={{ width: sidebarCollapsed ? 0 : Math.max(260, sidebarWidth), background: sidebarBg }}
        >
          <div className="h-full overflow-hidden" style={{ width: Math.max(260, sidebarWidth) }}>
            <SiderNav collapsed={sidebarCollapsed} />
          </div>
          {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('sidebar.resize')}
              className={clsx('panel-resize-handle panel-resize-handle--sider', isResizingSider && 'is-resizing')}
              onPointerDown={startSiderResize}
              onPointerMove={moveSiderResize}
              onPointerUp={endSiderResize}
              onPointerCancel={endSiderResize}
              onDoubleClick={() => setSidebarWidth(260)}
            />
          )}
        </aside>

        <div className="flex-1 min-w-0 h-full">
          <Allotment
            ref={allotmentRef}
            defaultSizes={initialSizes}
            onDragEnd={handleDragEnd}
          >
            <Allotment.Pane minSize={MAIN_MIN} className="!overflow-hidden">
              <div data-pane="main" tabIndex={-1} className="relative w-full h-full !bg-bg-primary rounded-none overflow-hidden flex flex-col box-border !border-none outline-none">
                <div className="flex-1 min-h-0 relative">
                  {renderTabContent()}
                </div>
                {activeToolView === 'terminal' && (
                  <TerminalDrawer
                    height={terminalHeight}
                    onChange={setTerminalHeight}
                    onClose={() => useAppStore.getState().setActiveToolView('none')}
                  />
                )}
              </div>
            </Allotment.Pane>

            {hasRightPanel && (
              <Allotment.Pane minSize={320} maxSize={rightMaxSize} preferredSize={rightPanelWidth}>
                <aside data-pane="right" tabIndex={-1} className="relative w-full h-full flex flex-col bg-[var(--color-glass-panel)] overflow-hidden border-l border-border-dim dark:border-l-[var(--color-border-dim)] outline-none">
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('panel.resize')}
                    className={clsx('panel-resize-handle panel-resize-handle--right', isResizingRight && 'is-resizing')}
                    onPointerDown={startRightResize}
                    onPointerMove={moveRightResize}
                    onPointerUp={endRightResize}
                    onPointerCancel={endRightResize}
                    onDoubleClick={() => setRightPanelWidth(360)}
                  />
                  <div className="flex items-center justify-between shrink-0 h-10 px-2 gap-2 border-b border-[var(--color-border-dim)]">
                    <div className="ax-panel-tabs overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={t('workbench.tablist')}>
                      {COCKPIT_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          role="tab"
                          aria-selected={rightPanelView === tab.key}
                          className="ax-panel-tab"
                          data-active={rightPanelView === tab.key || undefined}
                          onClick={() => setRightPanelView(tab.key)}
                          title={`${t(PANEL_LABELS[tab.key] ?? 'workbench.overview')}${tab.shortcut ? ` (${tab.shortcut})` : ''}`}
                        >
                          {tab.icon}
                          <span>{t(tab.labelKey)}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="ax-header-action shrink-0"
                      onClick={toggleRightPanel}
                      title={t('header.closePanel')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {renderRightPanel()}
                  </div>
                </aside>
              </Allotment.Pane>
            )}
          </Allotment>
        </div>
      </div>
    </Layout>
  );
}

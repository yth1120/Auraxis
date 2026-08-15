import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import {
  NEW_CHAT_ICON,
  SidebarSimple,
} from '@/components/common/icons';
import { useChatStore } from '@/stores/useChatStore';
import { useAppStore } from '@/stores/useAppStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { ACCOUNT_NAME } from '../../constants/account';
import { t, useT } from '../../i18n';
import MessageList from '../chat/MessageList';
import ChatInput from '../input/ChatInput';
import HeaderModeSwitcher from './HeaderModeSwitcher';

const AgentConversation = lazy(() => import('../agent/AgentConversation'));
const ScheduledPanel = lazy(() => import('../tools/ScheduledPanel'));
const NotificationsPanel = lazy(() => import('../tools/NotificationsPanel'));
const PluginsPanel = lazy(() => import('../tools/PluginsPanel'));
import QuickActionsPanel from '../inspector/QuickActionsPanel';
import ExecutingIndicator from '../common/ExecutingIndicator';
import StateDot from '../common/StateDot';
import { compactChatContext, forkCurrentChatSession } from '../../utils/chatActions';
import logoPng from '../../assets/auraxis-logo.png';

const CONTEXT_WINDOW = 1_000_000;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return t('greeting.night');
  if (h < 12) return t('greeting.morning');
  if (h < 18) return t('greeting.afternoon');
  return t('greeting.evening');
}

export default function ChatArea() {
  const tConv = useT();
  const messages = useChatStore((s) => s.messages);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayEvents, setReplayEvents] = useState<Array<{ seq: number; type: string; ts: number; data: Record<string, unknown> }>>([]);
  const [composerHeight, setComposerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hasMessages = messages.length > 0;
  const chatRunning = useChatStore((s) => s.isStreaming);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const inputTokens = useChatStore((s) => s.exactInputTokens);
  const outputTokens = useChatStore((s) => s.exactOutputTokens);
  const reasoningTokens = useChatStore((s) => s.reasoningOutputTokens);
  const sidebarMode = useAppStore((s) => s.sidebarMode);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeToolView = useAppStore((s) => s.activeToolView);
  const setActiveToolView = useAppStore((s) => s.setActiveToolView);
  const isCode = sidebarMode === 'code';
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const currentAgent = useAgentStore((s) => s.agents.find((a) => a.id === currentAgentId));

  const totalTokens = inputTokens + outputTokens + reasoningTokens;

  // Composer floats over the full-height message area — track its real height
  // so the message list can reserve scroll room for the last message.
  const composerBottom = isCode || hasMessages;
  useEffect(() => {
    if (!composerBottom) return;
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setComposerHeight(Math.round(entry.target.getBoundingClientRect().height));
      }
    });
    ro.observe(el);
    setComposerHeight(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, [composerBottom, hasMessages, isCode]);

  // Top hairline: only while the conversation is running AND the window is
  // not maximized — a maximized surface stays clean, a restored window gets
  // the divider back.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isMaximized) return;
    void api.isMaximized().then(setIsMaximized).catch(() => {});
    return api.onMaximizeChange?.(setIsMaximized);
  }, []);

  // The floating header height drives the message list's top scroll room.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(Math.round(entry.target.getBoundingClientRect().height));
      }
    });
    ro.observe(el);
    setHeaderHeight(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, []);

  const handleNewConversation = () => {
    useAppStore.getState().setSidebarMode('chat');
    useAppStore.getState().setActiveToolView('none');
    useSessionStore.getState().newSession();
    useChatStore.getState().clearMessages();
  };

  const openReplay = async () => {
    const sessionId = useSessionStore.getState().currentSessionId;
    if (!sessionId) return;
    const r = await window.electronAPI?.chatLog?.read(sessionId);
    setReplayEvents(r?.ok && r.data ? r.data : []);
    setReplayOpen(true);
  };

  const renderToolView = () => {
    if (activeToolView === 'none' || activeToolView === 'terminal') return null;
    return (
      <>
        <div
          className="absolute inset-0 z-30 bg-black/20"
          onClick={() => setActiveToolView('none')}
          aria-hidden="true"
        />
        <div className="absolute inset-y-0 right-0 z-40 w-[440px] max-w-[85%] flex flex-col bg-[var(--color-bg-primary)] border-l border-[var(--color-border-dim)] shadow-[var(--shadow-lg)]">
          <Suspense fallback={null}>
            {activeToolView === 'notifications' && <NotificationsPanel onClose={() => setActiveToolView('none')} />}
            {activeToolView === 'scheduled' && <ScheduledPanel onClose={() => setActiveToolView('none')} />}
            {activeToolView === 'plugins' && <PluginsPanel onClose={() => setActiveToolView('none')} />}
          </Suspense>
        </div>
      </>
    );
  };

  return (
    <div className="chat-area relative flex flex-col h-full w-full overflow-hidden">
      {/* 细分隔头栏: appears once the conversation starts and
          divides the top controls from the message flow. The header floats
          above the full-height message area; a downward gradient softens the
          fade of messages scrolling underneath it. */}
      <div
        ref={headerRef}
        className={
          'absolute inset-x-0 top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-3 '
          + (((!isCode && chatRunning) || (isCode && currentAgent?.status === 'running')) && !isMaximized
            ? 'pb-2 border-b border-[var(--color-border-default)]'
            : 'pb-1')
        }
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[var(--color-bg-primary)] via-[var(--color-bg-primary)]/80 to-transparent"
          aria-hidden="true"
        />
        <div className="relative z-[1] flex items-center gap-2 min-w-0">
          {sidebarCollapsed && (
            <>
              <button
                type="button"
                className="ax-header-action shrink-0"
                onClick={toggleSidebar}
                title={tConv('sidebar.expand')}
                aria-label={tConv('sidebar.expand')}
              >
                <SidebarSimple />
              </button>
              <button
                type="button"
                className="ax-header-action shrink-0"
                onClick={() => {
                  if (isCode) {
                    useAppStore.getState().setSidebarMode('code');
                    useAgentStore.getState().setCurrentAgent(null);
                    useChatStore.getState().setPendingNewTask(true);
                  } else {
                    handleNewConversation();
                  }
                }}
                title={tConv('nav.newChat')}
                aria-label={tConv('nav.newChat')}
              >
                {NEW_CHAT_ICON}
              </button>
            </>
          )}
          {isCode && currentAgentId && currentAgent && (
            <div className="flex items-center gap-1.5 min-w-0">
              {currentAgent.status === 'running' ? (
                <ExecutingIndicator size={14} />
              ) : (
                <StateDot
                  size={8}
                  className="shrink-0"
                  state={currentAgent.status === 'completed'
                    ? 'done'
                    : currentAgent.status === 'error' || currentAgent.status === 'stopped'
                      ? 'error'
                      : currentAgent.status === 'paused'
                        ? 'warning'
                        : 'done'}
                />
              )}
              <span className="shrink-0 w-px h-4 bg-[var(--color-border-dim)]" />
              <button
                type="button"
                className="shrink-0 px-1.5 py-[2px] rounded-md border-none bg-transparent text-2xs text-text-muted cursor-pointer hover:bg-[var(--color-hover)] hover:text-text-secondary"
                onClick={() => void compactChatContext()}
                title={tConv('conv.compressTip')}
              >
                {tConv('conv.compress')}
              </button>
              <button
                type="button"
                className="shrink-0 px-1.5 py-[2px] rounded-md border-none bg-transparent text-2xs text-text-muted cursor-pointer hover:bg-[var(--color-hover)] hover:text-text-secondary"
                onClick={forkCurrentChatSession}
                title={tConv('conv.forkTip')}
              >
                {tConv('conv.fork')}
              </button>
            </div>
          )}
        </div>
        <div className="relative z-[1] min-w-0">
          <HeaderModeSwitcher />
        </div>
        <div className="relative z-[1] flex justify-end items-center gap-2 min-w-0">
          {hasMessages && (
            <button
              type="button"
              className="text-2xs text-text-muted px-2 py-1 rounded-md cursor-pointer hover:bg-[var(--color-hover)] hover:text-text-secondary"
              onClick={openReplay}
            >
              {tConv('chat.sessionLog')}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0 flex flex-col min-h-0">
          {isCode && currentAgentId ? (
        /* Code mode with a selected task: live execution view — completed /
           stopped tasks stay viewable as history. */
            <div className="flex-1 min-h-0 flex flex-col" style={{ paddingTop: headerHeight }}>
              <Suspense fallback={<div className="flex-1 min-h-0" />}>
                <AgentConversation />
              </Suspense>
            </div>
          ) : isCode ? (
            /* Code-mode home: personal dashboard (always show when no active agent task). */
            <div className="stats-home-scroll flex-1 min-h-0 overflow-y-auto flex justify-center" style={{ paddingTop: headerHeight }}>
              <div className="w-full max-w-[1080px] min-h-full flex flex-col justify-center py-10 px-8 box-border">
                <div className="flex w-full max-w-[720px] mx-auto flex-col items-start text-left gap-1 mb-[18px]">
                  <span className="flex items-center gap-2">
                    <img src={logoPng} alt="Auraxis" className="w-9 h-9 object-contain" />
                    <span className="text-2xl font-medium text-text-primary tracking-[0.01em]">
                      {ACCOUNT_NAME ? `${ACCOUNT_NAME}，` : ''}{greeting()}，
                    </span>
                  </span>
                  <span className="text-md font-semibold leading-6 text-[var(--color-text-muted)]">
                    {tConv('chat.fromIdea')}
                  </span>
                </div>
                <QuickActionsPanel />
              </div>
            </div>
          ) : hasMessages ? (
            <MessageList bottomInset={composerHeight} headerInset={headerHeight} />
          ) : null}

          {/* Agent-mode empty state: same 品牌光晕 behind the pinned composer. */}
          {isCode && !hasMessages && <div className="ax-hero-glow" aria-hidden="true" />}

          {/* Messages own the whole main area; the composer + context meter
              float above them, so scrolling continues underneath the dock. */}
          {composerBottom ? (
            <div ref={dockRef} className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
              <div
                className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 z-0 bg-gradient-to-t from-[var(--color-bg-primary)] via-[var(--color-bg-primary)]/82 to-transparent"
                aria-hidden="true"
              />
              <div className="relative z-[1] pointer-events-auto">
                {hasMessages && totalTokens > 0 && (
                  <div className="ax-context-meter flex items-center justify-center gap-2 shrink-0 px-4 py-1 font-mono tabular-nums">
                    <span className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">{selectedModel}</span>
                    <span className="w-[3px] h-[3px] rounded-full bg-text-faint opacity-50" />
                    <span className="whitespace-nowrap">
                      {totalTokens.toLocaleString()} / {CONTEXT_WINDOW.toLocaleString()} tokens
                    </span>
                  </div>
                )}
                <ChatInput position="bottom" />
              </div>
            </div>
          ) : (
            <ChatInput position="center" />
          )}
        </div>
      </div>

      <Modal
        title={tConv('chat.sessionLogTip')}
        open={replayOpen}
        onCancel={() => setReplayOpen(false)}
        transitionName=""
        maskTransitionName=""
        footer={
          <button
            type="button"
            className="text-xs text-text-muted px-2 py-1 rounded-md cursor-pointer hover:bg-[var(--color-hover)] hover:text-text-secondary"
            onClick={() => {
              const blob = new Blob([replayEvents.map((e) => JSON.stringify(e)).join('\n')], { type: 'application/x-ndjson' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `chat-log-${Date.now()}.jsonl`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            {tConv('chat.exportJsonl')}
          </button>
        }
        width={680}
      >
        <div className="max-h-[480px] overflow-y-auto flex flex-col gap-1">
          {replayEvents.length === 0 ? (
            <div className="text-xs text-muted">{tConv('chat.noLogs')}</div>
          ) : replayEvents.map((e) => {
            const time = new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false });
            let label: React.ReactNode;
            if (e.type === 'user') {
              label = <span className="text-text-primary">{tConv('chat.userLabel', { text: String(e.data.text ?? '') })}</span>;
            } else if (e.type === 'assistant_chunk') {
              label = <span className="text-text-secondary">{String(e.data.text ?? '')}</span>;
            } else if (e.type === 'tool') {
              label = (
                <span className="text-text-secondary">
                  {String(e.data.action ?? '')} {String(e.data.toolName ?? '')} {String(e.data.error ?? '')}
                </span>
              );
            } else if (e.type === 'command') {
              const data = e.data as { name?: string; args?: string };
              label = (
                <span className="text-text-secondary font-mono">
                  /{String(data.name ?? '')} {String(data.args ?? '').trim()}
                </span>
              );
            } else {
              label = <span className="text-text-muted">{String(e.data.text ?? e.type)}</span>;
            }
            return (
              <div key={e.seq} className="flex gap-2 text-xs leading-[1.6] font-mono">
                <span className="shrink-0 text-text-faint">#{e.seq}</span>
                <span className="shrink-0 text-text-faint">{time}</span>
                <span className="min-w-0 flex-1">{label}</span>
              </div>
            );
          })}
        </div>
      </Modal>
      {renderToolView()}
    </div>
  );
}

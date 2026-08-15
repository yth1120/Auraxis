import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message, ChatStore, CodeBlock } from '../types/chat';
import { getContentText } from '../types/chat';
import { streamChat } from '../services/ai-service';
import type { AIStreamSubscription } from '../types/electron-api';
import type { ToolStreamEvent, ToolCall } from '../types/tools';
import { getApiKeyFromStore, useSettingsStore } from './useSettingsStore';
import { useSessionStore, isSessionDeleted } from './useSessionStore';
import { useUndoStore } from './useUndoStore';
import { useAppStore } from './useAppStore';
import { useInspectorStore } from './useInspectorStore';
import { useAgentStore } from './useAgentStore';
import { resolveSessionRefs } from '../utils/sessionRefs';

let abortController: AbortController | null = null;
let ipcSubscription: AIStreamSubscription | null = null;
let isQueryStream = false;
let stopping = false;
const STREAM_TIMEOUT_MS = 300_000; // 5 min
const usageAcc = { input: 0, output: 0, reasoning: 0 };

function flushUsageToStore() {
  if (usageAcc.input === 0 && usageAcc.output === 0 && usageAcc.reasoning === 0) return;
  // write directly via useChatStore.getState()—no subscribe trigger
  useChatStore.setState((s) => ({
    exactInputTokens: s.exactInputTokens + usageAcc.input,
    exactOutputTokens: s.exactOutputTokens + usageAcc.output,
    reasoningOutputTokens: s.reasoningOutputTokens + usageAcc.reasoning,
  }));
  usageAcc.input = 0;
  usageAcc.output = 0;
  usageAcc.reasoning = 0;
}
let streamTimeout: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
// Tracks last time ANY event was received from the backend.
// Updated by text_chunk, tool_start/end, thinking_chunk, etc.
// Heartbeat checker uses this to detect silent disconnections.
let lastEventTime = 0;

function clearStreamTimeout() {
  if (streamTimeout !== null) {
    clearTimeout(streamTimeout);
    streamTimeout = null;
  }
}

function clearHeartbeatInterval() {
  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function getApiKey(): string | null {
  return getApiKeyFromStore();
}

/** Keep the current session's persisted messages in sync with chat edits
 *  (delete/undo). Without this, switching back to the same session reloads
 *  stale messages and "resurrects" deleted content. */
function syncCurrentSessionMessages(messages: Message[]): void {
  const id = useSessionStore.getState().currentSessionId;
  if (!id) return;
  useSessionStore.setState((s) => ({
    sessions: s.sessions.map((ses) =>
      ses.id === id
        ? { ...ses, messages, messageCount: messages.length, updated: Date.now() }
        : ses,
    ),
  }));
}

// ── Streaming state helpers (extract repeated set() patterns) ──

type MsgState = { messages: Message[] };

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      id: `cb-${Date.now()}-${idx++}`,
      language: match[1] || 'text',
      code: match[2].replace(/\n$/, ''),
      applied: false,
    });
  }
  return blocks;
}

function setAssistantContent(assistantId: string, content: string) {
  return (s: MsgState) => ({
    messages: s.messages.map((m) =>
      m.id === assistantId ? { ...m, content } : m
    ),
  });
}

function setAssistantDone(assistantId: string) {
  return (s: MsgState) => ({
    messages: s.messages.map((m) =>
      m.id === assistantId
        ? { ...m, isStreaming: false, codeBlocks: extractCodeBlocks(getContentText(m.content)) }
        : m
    ),
  });
}

function setAssistantError(assistantId: string, fallback: string) {
  return (s: MsgState) => ({
    messages: s.messages.map((m) =>
      m.id === assistantId
        ? { ...m, isStreaming: false, content: getContentText(m.content) || fallback, codeBlocks: extractCodeBlocks(getContentText(m.content) || fallback) }
        : m
    ),
  });
}

function appendToolCall(assistantId: string, tc: ToolCall) {
  return (s: MsgState & { toolCallMap: Record<string, ToolCall> }) => ({
    messages: s.messages.map((m) =>
      m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), tc] } : m
    ),
    toolCallMap: { ...s.toolCallMap, [tc.id]: tc },
  });
}

function updateToolCall(assistantId: string, toolCallId: string, updates: Partial<ToolCall>) {
  return (s: MsgState & { toolCallMap: Record<string, ToolCall> }) => {
    let updatedTc: ToolCall | undefined;
    const messages = s.messages.map((m) => {
      if (m.id !== assistantId) return m;
      return {
        ...m,
        toolCalls: m.toolCalls?.map((tc) => {
          if (tc.id === toolCallId) { updatedTc = { ...tc, ...updates } as ToolCall; return updatedTc; }
          return tc;
        }),
      };
    });
    return {
      messages,
      ...(updatedTc ? { toolCallMap: { ...s.toolCallMap, [toolCallId]: updatedTc } } : {}),
    };
  };
}

function appendThinkingChunk(
  blocks: { content: string }[] | undefined,
  chunk: string,
  isNewBlock: boolean,
): { content: string }[] {
  if (!blocks || blocks.length === 0 || isNewBlock) {
    return [...(blocks || []), { content: chunk }];
  }
  const last = blocks[blocks.length - 1];
  return [...blocks.slice(0, -1), { ...last, content: last.content + chunk }];
}

function appendToolProgress(assistantId: string, toolCallId: string, chunk: string) {
  return (s: MsgState) => ({
    messages: s.messages.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            toolCalls: m.toolCalls?.map((tc) =>
              tc.id === toolCallId ? { ...tc, streamOutput: (tc.streamOutput || '') + chunk } : tc,
            ),
          }
        : m,
    ),
  });
}

// ── Debounced localStorage to avoid I/O thrashing during streaming ──
// Zustand persist calls setItem synchronously on every set() — during
// streaming at ~33 Hz, that's 33+ serialise+write cycles per second for
// potentially large message arrays.  This wrapper coalesces writes so we
// hit localStorage at most once per second.

interface DebouncedStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

export function createDebouncedStorage(delayMs = 1000): DebouncedStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, string>();

  return {
    getItem: (name: string): string | null => {
      if (pending.has(name)) return pending.get(name)!;
      try { return localStorage.getItem(name); } catch { return null; }
    },
    setItem: (name: string, value: string) => {
      pending.set(name, value);
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          for (const [k, v] of pending) {
            try { localStorage.setItem(k, v); } catch { /* quota exceeded */ }
          }
          pending.clear();
        }, delayMs);
      }
    },
    removeItem: (name: string) => {
      pending.delete(name);
      try { localStorage.removeItem(name); } catch { /* ignore */ }
    },
  };
}

const debouncedStorage = createDebouncedStorage(1000);

// ── Durable chat event log (event-sourcing-lite) ──
// The renderer buffers events during streaming and flushes to the main
// process once per second + on completion, so every chat is replayable.
const chatLogBuffer = new Map<string, Array<{ type: 'user' | 'assistant_chunk' | 'tool' | 'system'; ts: number; data: Record<string, unknown> }>>();
let chatLogTimer: ReturnType<typeof setTimeout> | null = null;

function queueChatLog(
  sessionId: string | null,
  type: 'user' | 'assistant_chunk' | 'tool' | 'system',
  data: Record<string, unknown>,
) {
  if (!sessionId) return;
  const list = chatLogBuffer.get(sessionId) || [];
  list.push({ type, ts: Date.now(), data });
  chatLogBuffer.set(sessionId, list);
  if (!chatLogTimer) {
    chatLogTimer = setTimeout(() => { void flushChatLog(); }, 1000);
  }
}

async function flushChatLog() {
  if (chatLogTimer) { clearTimeout(chatLogTimer); chatLogTimer = null; }
  const entries = [...chatLogBuffer.entries()];
  chatLogBuffer.clear();
  for (const [sessionId, events] of entries) {
    if (!window.electronAPI?.chatLog) continue;
    try {
      await window.electronAPI.chatLog.append(sessionId, events);
    } catch {
      const prev = chatLogBuffer.get(sessionId) || [];
      chatLogBuffer.set(sessionId, [...prev, ...events]);
    }
  }
  if (chatLogBuffer.size > 0 && !chatLogTimer) {
    chatLogTimer = setTimeout(() => { void flushChatLog(); }, 2000);
  }
}

/** Best-effort flush of buffered chat-log events (call on unload). */
export function flushChatLogNow(): void {
  void flushChatLog();
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      commands: [],
      isStreaming: false,
      inputValue: '',
      isDeepThink: false,
      reasoningEffort: 'medium' as const,
      isWebSearch: false,
      autoApprove: false,
      taskPriority: 'normal' as const,
      pendingPlanMode: false,
      agentQueue: [],
      goal: null,
      memoriesEnabled: true,
      selectedModel: useSettingsStore.getState().defaultModel || 'deepseek-v4-pro',
      currentProjectPath: null,
      currentIteration: null,
      maxIterations: null,
      toolCallMap: {},
      exactInputTokens: 0,
      exactOutputTokens: 0,
      reasoningOutputTokens: 0,
      lastCompression: null,
      lastUserMessage: null,
      composerFocusTick: 0,
      pendingNewTask: false,

      setInputValue: (value: string) => set({ inputValue: value }),
      appendCommand: (cmd) => set((s) => ({
        commands: [...(s.commands ?? []), { id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...cmd }].slice(-50),
      })),
      requestComposerFocus: () => set((s) => ({ composerFocusTick: s.composerFocusTick + 1 })),
      setPendingNewTask: (v: boolean) => set({ pendingNewTask: v }),

      toggleDeepThink: () => set((s) => ({ isDeepThink: !s.isDeepThink })),
      setReasoningEffort: (effort) => set({ reasoningEffort: effort, isDeepThink: true }),

      toggleWebSearch: () => set((s) => ({ isWebSearch: !s.isWebSearch })),

      toggleAutoApprove: () => set((s) => ({ autoApprove: !s.autoApprove })),

      setPendingPlanMode: (enabled) => set({ pendingPlanMode: enabled }),
      setTaskPriority: (priority) => set({ taskPriority: priority }),

      enqueueAgentMessage: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((s) => ({
          agentQueue: [
            ...s.agentQueue,
            {
              id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: trimmed,
              createdAt: Date.now(),
            },
          ],
        }));
      },

      dequeueAgentMessage: (id: string) =>
        set((s) => ({ agentQueue: s.agentQueue.filter((q) => q.id !== id) })),

      editAgentQueueItem: (id: string, text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((s) => ({
          agentQueue: s.agentQueue.map((q) => (q.id === id ? { ...q, text: trimmed } : q)),
        }));
      },

      clearAgentQueue: () => set({ agentQueue: [] }),

      setGoal: (goal) => set({ goal }),
      updateGoal: (patch) => set((s) => (s.goal ? { goal: { ...s.goal, ...patch } } : s)),
      clearGoal: () => set({ goal: null }),
      setMemoriesEnabled: (enabled) => set({ memoriesEnabled: enabled }),

      setSelectedModel: (model: string) => set({ selectedModel: model }),

      setCurrentProjectPath: (path: string | null) => set({ currentProjectPath: path }),

      clearMessages: () => {
        // A live stream belongs to the session it started in — if the user
        // starts a new conversation mid-stream, abort it first so the UI
        // never stays in a phantom "streaming" state and the stop button
        // doesn't control an invisible request.
        if (get().isStreaming) get().stopStreaming();
        useInspectorStore.getState().clear();
        set({
          messages: [],
          commands: [],
          exactInputTokens: 0,
          exactOutputTokens: 0,
          reasoningOutputTokens: 0,
          toolCallMap: {},
        });
      },

      switchSession: (id: string) => {
        // Same guard as clearMessages: abort any in-flight reply before
        // swapping views, otherwise the target session inherits the source
        // stream's isStreaming state until it settles.
        if (get().isStreaming) get().stopStreaming();
        // Capture the CURRENT session id BEFORE loadSession mutates it.
        const { messages, selectedModel: chatModel } = get();
        const currentId = useSessionStore.getState().currentSessionId;
        // Already on this session with live content — no-op. Reloading here is
        // dangerous: a stream that just finished may not have hit the 500ms
        // auto-save yet, and swapping in the stale persisted copy would let
        // the pending save persist the stale messages over the fresh reply.
        if (currentId === id && messages.length > 0) return;
        const session = useSessionStore.getState().loadSession(id);
        if (!session) return;
        // Opening a session must bring its project context along, otherwise
        // the composer, @file mentions and tool calls would still target the
        // previously selected directory.
        const sessionProject = session.projectRoot;
        if (sessionProject) {
          useSettingsStore.getState().setProjectPath(sessionProject);
        }
        useInspectorStore.getState().clear();
        // History always opens in chat view — its messages are chat messages.
        // (session.mode may be 'code' from legacy sends; forcing 'code' there
        // would land on a blank Agent surface with no clickable history.)
        useAppStore.getState().setSidebarMode('chat');
        useSessionStore.setState({ pendingMode: 'chat' });
        // Rebuild toolCallMap from loaded session messages so that
        // ToolCallCardWrapper can look up ToolCalls by ID (needed for
        // DiffView rendering and live tool status). Without this,
        // oldContent/newContent persisted in ToolCall.output would be
        // invisible after a session switch.
        const map: Record<string, ToolCall> = {};
        for (const m of session.messages) {
          if (m.toolCalls) {
            for (const tc of m.toolCalls) map[tc.id] = tc;
          }
        }
        set({
          messages: session.messages,
          commands: [],
          ...(sessionProject ? { currentProjectPath: sessionProject } : {}),
          exactInputTokens: 0,
          exactOutputTokens: 0,
          reasoningOutputTokens: 0,
          toolCallMap: map,
          selectedModel: session.model || chatModel,
          currentIteration: null,
          maxIterations: null,
          lastCompression: null,
        });
        void window.electronAPI?.chatLog?.read(id).then((r) => {
          if (!r?.ok || !r.data) return;
          const commands = r.data
            .filter((e) => e.type === 'command')
            .map((e) => ({
              id: `cmd-log-${e.seq}`,
              name: String((e.data as { name?: unknown })?.name ?? ''),
              args: String((e.data as { args?: unknown })?.args ?? ''),
              ts: e.ts,
            }));
          if (commands.length > 0) set({ commands });
        }).catch(() => {});
      },

      stopStreaming: () => {
        clearStreamTimeout();
        clearHeartbeatInterval();
        flushUsageToStore();
        // Reset inspector active tool count — streaming is over
        useInspectorStore.getState().setActiveToolCount(0);
        // Set stopping + isStreaming BEFORE unsubscribe so any late events
        // that fire during cleanup see the correct state and skip double-finalize.
        stopping = true;
        set({ isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null });
        if (ipcSubscription) {
          const api = window.electronAPI?.ai;
          if (api && ipcSubscription.requestId) {
            if (isQueryStream) {
              api.abortQuery(ipcSubscription.requestId);
            } else {
              api.abortStream(ipcSubscription.requestId);
            }
          }
          ipcSubscription.unsubscribe();
          ipcSubscription = null;
        } else {
          abortController?.abort();
        }
        abortController = null;
        void flushChatLog();
      },

      retryLastMessage: () => {
        const state = get();
        if (state.isStreaming) return;
        // Fall back to last user message in the chat history when lastUserMessage is null (e.g. after page reload)
        const lastUser = state.lastUserMessage || (() => {
          for (let i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i].role === 'user') return getContentText(state.messages[i].content);
          }
          return null;
        })();
        if (!lastUser) return;

        // Stop any in-flight request
        if (ipcSubscription) {
          const api = window.electronAPI?.ai;
          if (api && ipcSubscription.requestId) {
            if (isQueryStream) api.abortQuery(ipcSubscription.requestId);
            else api.abortStream(ipcSubscription.requestId);
          }
          ipcSubscription.unsubscribe();
          ipcSubscription = null;
        }
        abortController?.abort();
        abortController = null;

        // Remove the last error assistant message and its preceding user message
        set((s) => {
          const msgs = [...s.messages];
          if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
          if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') msgs.pop();
          return { messages: msgs, currentIteration: null, maxIterations: null, lastCompression: null };
        });

        // Re-set input and trigger send
        get().setInputValue(lastUser);
        get().sendMessage();
      },

      retryTool: (requestId: string, toolCallId: string, toolName: string) => {
        // Tell the backend to inject a retry nudge
        window.electronAPI?.ai.retryTool(requestId, toolName);

        // Reset the ToolCall's error state in the frontend
        set((s) => ({
          messages: s.messages.map((m) => {
            if (!m.toolCalls) return m;
            const updated = m.toolCalls.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, status: 'running' as const, error: undefined, endTime: undefined, output: undefined }
                : tc,
            );
            return updated === m.toolCalls ? m : { ...m, toolCalls: updated };
          }),
        }));
      },

      editMessage: (messageId: string, newContent: string) => {
        const state = get();
        if (state.isStreaming) return;

        const idx = state.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return;

        // Update the message content, drop everything after it
        const updated = [...state.messages.slice(0, idx)];
        updated.push({
          ...state.messages[idx],
          content: newContent,
          codeBlocks: undefined,
          thinkingBlocks: undefined,
        });

        set({
          messages: updated,
          currentIteration: null,
          maxIterations: null,
          lastCompression: null,
        });

        // Re-send with the edited content
        get().setInputValue(newContent);
        get().sendMessage();
      },

      deleteMessage: (messageId: string) => {
        const state = get();
        if (state.isStreaming) {
          state.stopStreaming();
        }

        const idx = state.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return;

        // Save deleted messages for undo
        const removedMsgs = state.messages.slice(idx);

        const remaining = state.messages.slice(0, idx);
        set({
          messages: remaining,
          currentIteration: null,
          maxIterations: null,
          lastCompression: null,
        });
        syncCurrentSessionMessages(remaining);

        // Register message-delete undo entry
        useUndoStore.getState().addUndo({
          id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sessionId: '',
          timestamp: Date.now(),
          type: 'message:delete',
          description: `删除消息 (${removedMsgs.length} 条)`,
          revert: async () => {
            const s = useChatStore.getState();
            const combined = [...s.messages, ...removedMsgs];
            useChatStore.setState({ messages: combined });
            syncCurrentSessionMessages(combined);
          },
        });
      },

      sendMessage: async () => {
        const { inputValue, messages, selectedModel, isDeepThink, reasoningEffort, isWebSearch } = get();
        const trimmed = inputValue.trim();
        if (!trimmed || get().isStreaming) return;
        const resolved = resolveSessionRefs(trimmed, useSessionStore.getState().sessions);
        const content = resolved.text;

        const userMessage: Message = {
          id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now(),
        };
        const assistantId = `assistant-${Date.now()}`;
        const assistantMessage: Message = {
          id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true,
        };

        const newMessages = [...messages, userMessage, assistantMessage];

        // Ensure a session exists so the sidebar tracks this conversation in real time
        const sessionStore = useSessionStore.getState();
        if (!sessionStore.currentSessionId) {
          sessionStore.newSession(useAppStore.getState().sidebarMode);
        }
        sessionStore.touchCurrentSession(newMessages.length);
        const logSessionId = useSessionStore.getState().currentSessionId || sessionStore.currentSessionId;
        queueChatLog(logSessionId, 'user', { text: content });
        stopping = false;
        usageAcc.input = 0; usageAcc.output = 0; usageAcc.reasoning = 0;
        set({ messages: newMessages, inputValue: '', isStreaming: true, lastUserMessage: content });
        abortController = new AbortController();

        // Guard against dropped connections — auto-stop after timeout
        clearStreamTimeout();
        clearHeartbeatInterval();
        lastEventTime = Date.now();

        // Session touch interval: bump updatedAt on the current session every 15 s
        // so the sidebar clock stays alive during long-running tool executions.
        const sessionTouchInterval = setInterval(() => {
          const s = get();
          if (!s.isStreaming) { clearInterval(sessionTouchInterval); return; }
          useSessionStore.getState().touchCurrentSession(s.messages.length);
        }, 15_000);

        // Heartbeat checker: if no event arrives for 120 s, the connection is dead.
        // Tool execution (Bash, etc.) can be silent for a long time, so the threshold
        // is generous to avoid false positives.
        heartbeatInterval = setInterval(() => {
          if (Date.now() - lastEventTime > 120_000) {
            const state = get();
            if (state.isStreaming) {
              state.stopStreaming();
              set((s) => {
                const msgs = [...s.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'assistant' && last.isStreaming) {
                  msgs[msgs.length - 1] = { ...last, isStreaming: false, content: getContentText(last.content) || '[连接已断开 — 长时间未收到数据]' };
                }
                return { messages: msgs, isStreaming: false };
              });
            }
          }
        }, 5_000);

        streamTimeout = setTimeout(() => {
          get().stopStreaming();
          set((s) => {
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant' && last.isStreaming) {
              msgs[msgs.length - 1] = { ...last, isStreaming: false, content: getContentText(last.content) || '[请求超时 — 连接异常断开]' };
            }
            return { messages: msgs, isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null };
          });
        }, STREAM_TIMEOUT_MS);

        const chatHistory = newMessages
          .filter((m) => !m.isStreaming || m.id === assistantId)
          .map((m) => ({ role: m.role, content: getContentText(m.content) }));

        // Inject project context (Code/agent mode only — Chat is a plain,
        // tool-less conversation, so the "explore with tools" preamble misleads there).
        const projectPath = get().currentProjectPath || useSettingsStore.getState().projectPath;
        const appMode = useAppStore.getState().sidebarMode;
        if (projectPath && chatHistory.length <= 2 && appMode !== 'chat') {
          let contextBlock = `<project_context>\n当前项目路径: ${projectPath}\n`;
          const ctxApi = window.electronAPI?.context;
          if (ctxApi) {
            try {
              const ctxResult = await ctxApi.getProjectContext(projectPath);
              if (ctxResult.ok && ctxResult.data) {
                const { instructionsMd, fileTree, packageJson } = ctxResult.data;
                if (instructionsMd) contextBlock += `\n=== 项目指令 ===\n${instructionsMd.slice(0, 4000)}\n`;
                if (fileTree) contextBlock += `\n=== 项目结构 ===\n${fileTree.slice(0, 3000)}\n`;
                if (packageJson) contextBlock += `\n=== package.json ===\n${packageJson.slice(0, 2000)}\n`;
              }
            } catch { /* fallback */ }
          }
          contextBlock += '\n</project_context>';
          chatHistory.unshift({ role: 'user', content: contextBlock });
        }

        // Inject relevant memories from previous sessions (Code/agent mode only).
        if (projectPath && appMode !== 'chat' && window.electronAPI?.memory) {
          try {
            const memResult = await window.electronAPI.memory.getByProject(projectPath);
            if (memResult.ok && memResult.data && memResult.data.length > 0) {
              const memoryItems = memResult.data;
              // Build a simple inline memory preamble (avoids electron-rootdir import)
              const preambleParts: string[] = ['## 项目记忆（来自之前的会话）'];
              const groups: Record<string, typeof memResult.data> = {};
              for (const m of memoryItems) {
                (groups[m.type] ||= []).push(m);
              }
              const labels: Record<string, string> = {
                decision: '关键决策',
                architecture: '架构信息',
                progress: '上次进度',
                preference: '用户偏好',
                problem: '已知问题',
                context: '上下文信息',
              };
              for (const [type, label] of Object.entries(labels)) {
                const items = groups[type] || [];
                if (items.length > 0) {
                  preambleParts.push(`\n### ${label}`);
                  for (const m of items.slice(0, 3)) {
                    preambleParts.push(`- ${m.content.slice(0, 200)}（${new Date(m.timestamp).toISOString().slice(0, 10)}）`);
                  }
                }
              }
              preambleParts.push('\n请利用以上记忆理解用户当前任务，避免重复已有的决策和偏好。');
              const preamble = preambleParts.join('\n');
              chatHistory.unshift({ role: 'user', content: preamble });
              set((s) => ({
                messages: [
                  ...s.messages,
                  {
                    id: `disclosure-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    role: 'system' as const,
                    content: '跨会话召回',
                    timestamp: Date.now(),
                    tags: ['injected'] as Message['tags'],
                    disclosure: {
                      source: 'memory' as const,
                      producer: '记忆库',
                      detail: `${memoryItems.length} 条跨会话记忆`,
                      content: preamble.slice(0, 2000),
                    },
                  },
                ],
              }));
            }
          } catch { /* memory retrieval failed — non-critical */ }
        }

        const apiMessages = chatHistory.slice(0, -1);
        const electronAI = window.electronAPI?.ai;

        // Shared streaming callbacks for chat / browser paths
        const makeOnChunk = (acc: { text: string }) => (chunk: string) => {
          lastEventTime = Date.now();
          acc.text += chunk;
          queueChatLog(logSessionId, 'assistant_chunk', { text: chunk });
          set(setAssistantContent(assistantId, acc.text));
        };

        const makeOnDone = () => {
          if (stopping) return;
          clearStreamTimeout();
          clearHeartbeatInterval();
          flushUsageToStore();
          ipcSubscription?.unsubscribe();
          ipcSubscription = null;
          set((s) => ({ ...setAssistantDone(assistantId)(s), isStreaming: false }));
          void flushChatLog();
        };

        const makeOnError = (error: string) => {
          if (stopping) return;
          clearStreamTimeout();
          clearHeartbeatInterval();
          ipcSubscription?.unsubscribe();
          ipcSubscription = null;
          set((s) => ({ ...setAssistantError(assistantId, `Error: ${error}`)(s), isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null }));
          void flushChatLog();
        };

        const makeCatch = (err: any, abortedMsg?: string) => {
          if (stopping) return;
          clearStreamTimeout();
          clearHeartbeatInterval();
          ipcSubscription?.unsubscribe();
          ipcSubscription = null;
          if (err.name === 'AbortError') {
            set((s) => ({ ...setAssistantError(assistantId, abortedMsg || '[已停止生成]')(s), isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null }));
          } else {
            set((s) => ({ ...setAssistantError(assistantId, `Error: ${err.message}`)(s), isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null }));
          }
          void flushChatLog();
        };

        // ─── Unified engine path (tools) — Code/agent mode only. Chat mode falls
        //     through to the tool-less chatStream path below (pure conversation). ───
        if (electronAI && projectPath && appMode !== 'chat') {
          try {
            const acc = { text: '' };
            // Buffers for text / thinking / tool_progress — all flushed atomically
            const thinkingBuf: Array<{ chunk: string; isNewBlock: boolean }> = [];
            const toolProgressDoneBuf = new Map<string, string>();
            isQueryStream = true;

            // ── Unified flush: single RAF + single set() per frame ──
            // MIN_INTERVAL=50 (~20fps) — measured to be the sweet spot between
            // perceived smoothness and downstream Markdown re-parse cost. Going
            // below 30ms quickly saturates the main thread on long messages
            // (each chunk re-parses GFM tables / KaTeX in the active paragraph).
            let rafPending = false;
            let lastFlush = 0;
            const MIN_INTERVAL = 50;

            function flushAll() {
              rafPending = false;
              lastFlush = performance.now();

              const thinkingChunks = thinkingBuf.length > 0 ? thinkingBuf.splice(0) : null;
              const tpEntries = toolProgressDoneBuf.size > 0
                ? Array.from(toolProgressDoneBuf.entries())
                : null;
              toolProgressDoneBuf.clear();

              const currentText = acc.text;

              set((s) => {
                let msgs = s.messages;

                msgs = msgs.map((m) =>
                  m.id === assistantId ? { ...m, content: currentText } : m,
                );

                if (thinkingChunks) {
                  msgs = msgs.map((m) => {
                    if (m.id !== assistantId) return m;
                    let blocks = m.thinkingBlocks;
                    for (const c of thinkingChunks!) {
                      blocks = appendThinkingChunk(blocks, c.chunk, c.isNewBlock);
                    }
                    return { ...m, thinkingBlocks: blocks };
                  });
                }

                if (tpEntries) {
                  msgs = msgs.map((m) => {
                    if (m.id !== assistantId || !m.toolCalls) return m;
                    return {
                      ...m,
                      toolCalls: m.toolCalls.map((tc) => {
                        const extra = tpEntries!
                          .filter(([id]) => id === tc.id)
                          .map(([, t]) => t)
                          .join('');
                        return extra ? { ...tc, streamOutput: (tc.streamOutput || '') + extra } : tc;
                      }),
                    };
                  });
                }

                return { messages: msgs };
              });
            }

            function scheduleFlush() {
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(flushAll);
              }
            }

            const subscription = electronAI.sendQuery(
              {
                model: selectedModel,
                messages: apiMessages,
                isDeepThink,
                reasoningEffort: reasoningEffort === 'low' ? 'high' : reasoningEffort === 'medium' ? 'high' : 'max',
                projectRoot: projectPath,
                autoApprove: get().autoApprove,
                apiKey: getApiKey() || undefined,
                surface: appMode,
              },
              {
                onEvent: ((() => {
                  return (event: ToolStreamEvent) => {
                  lastEventTime = Date.now();
                  switch (event.type) {
                    case 'text_chunk':
                      queueChatLog(logSessionId, 'assistant_chunk', { text: event.text });
                      acc.text += event.text;
                      if (performance.now() - lastFlush >= MIN_INTERVAL) {
                        flushAll();
                      } else {
                        scheduleFlush();
                      }
                      break;
                    case 'tool_start':
                      queueChatLog(logSessionId, 'tool', { action: 'start', toolName: event.toolName, toolCallId: event.toolCallId, requestId: event.requestId, input: event.input });
                      flushAll();
                      useInspectorStore.getState().incrementActiveTools();
                      useSessionStore.getState().touchCurrentSession(get().messages.length + 2);
                      set(appendToolCall(assistantId, {
                        id: event.toolCallId,
                        requestId: event.requestId,
                        toolName: event.toolName,
                        input: event.input,
                        status: 'running',
                        startTime: event.timestamp,
                        stepGroupId: event.stepGroupId,
                      }));
                      break;
                    case 'tool_progress':
                      toolProgressDoneBuf.set(event.toolCallId, (toolProgressDoneBuf.get(event.toolCallId) || '') + event.progress);
                      scheduleFlush();
                      break;
                    case 'tool_end':
                      queueChatLog(logSessionId, 'tool', { action: 'end', toolName: event.toolName, toolCallId: event.toolCallId, requestId: event.requestId, output: event.output });
                      flushAll();
                      useInspectorStore.getState().decrementActiveTools();
                      useSessionStore.getState().touchCurrentSession(get().messages.length + 1);
                      {
                        const outputObj = event.output as Record<string, unknown> | null | undefined;
                        const oldContent = outputObj?.oldContent as string | undefined;
                        const newContent = outputObj?.newContent as string | undefined;
                        set(updateToolCall(assistantId, event.toolCallId, {
                          status: 'done', output: event.output, endTime: event.timestamp,
                          ...(oldContent !== undefined ? { oldContent } : {}),
                          ...(newContent !== undefined ? { newContent } : {}),
                        }));
                      }
                      // Only Write/Edit actually modify files — skip Bash
                      if (event.toolName === 'Write' || event.toolName === 'Edit') {
                        try { useAppStore.getState().incrementFileTreeVersion(); } catch { /* non-critical */ }
                      }
                      // Defer undo registration so it doesn't block the event pipeline
                      if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.input) {
                        const filePath = (event.input as any).file_path as string;
                        if (filePath) {
                          const projectPath = get().currentProjectPath || useSettingsStore.getState().projectPath;
                          const toolName = event.toolName;
                          queueMicrotask(() => {
                            try {
                              useUndoStore.getState().addUndo({
                                id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                sessionId: '',
                                timestamp: Date.now(),
                                type: toolName === 'Write' ? 'file:write' : 'file:edit',
                                description: `${toolName === 'Write' ? '写入' : '编辑'} ${filePath.split(/[\\/]/).pop() || filePath}`,
                                revert: async () => {
                                  if (projectPath && window.electronAPI?.undo) {
                                    await window.electronAPI.undo.revertLast(projectPath);
                                  }
                                },
                              });
                            } catch { /* non-critical */ }
                          });
                        }
                      }
                      break;
                    case 'tool_error':
                      queueChatLog(logSessionId, 'tool', { action: 'error', toolName: event.toolName, toolCallId: event.toolCallId, requestId: event.requestId, error: event.error });
                      flushAll();
                      useInspectorStore.getState().decrementActiveTools();
                      useSessionStore.getState().touchCurrentSession(get().messages.length + 1);
                      set(updateToolCall(assistantId, event.toolCallId, {
                        status: 'error', error: event.error, endTime: event.timestamp,
                      }));
                      break;
                    case 'tool_aborted':
                      flushAll();
                      useInspectorStore.getState().decrementActiveTools();
                      useSessionStore.getState().touchCurrentSession(get().messages.length + 1);
                      set(updateToolCall(assistantId, event.toolCallId, {
                        status: 'done', error: event.error, endTime: event.timestamp,
                        streamOutput: undefined, // clear terminal output
                      }));
                      break;
                    case 'iteration':
                      set({ currentIteration: event.iteration, maxIterations: event.maxIterations });
                      break;
                    case 'system_message':
                      useInspectorStore.getState().addSystemMessage({
                        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        content: event.content,
                        level: event.level,
                        timestamp: Date.now(),
                      });
                      break;
                    case 'context_injected': {
                      const disclosure = {
                        source: event.source,
                        producer: event.producer,
                        detail: event.detail,
                      };
                      set((s) => ({
                        messages: [
                          ...s.messages,
                          {
                            id: `disclosure-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            role: 'system' as const,
                            content: `${disclosure.producer} 已注入上下文`,
                            timestamp: Date.now(),
                            tags: ['injected'] as Message['tags'],
                            disclosure,
                          },
                        ],
                      }));
                      break;
                    }
                    case 'thinking_chunk':
                      thinkingBuf.push({ chunk: event.chunk, isNewBlock: event.isNewBlock });
                      scheduleFlush();
                      break;
                    case 'usage_update':
                      // Accumulate locally; flush to store on done/error to avoid per-event set()
                      usageAcc.input += event.inputTokens;
                      usageAcc.output += event.outputTokens;
                      usageAcc.reasoning += event.reasoningTokens || 0;
                      break;
                    case 'context_compressed':
                      {
                        const compaction = {
                          tokensBefore: event.tokensBefore,
                          tokensAfter: event.tokensAfter,
                          messagesRemoved: event.messagesRemoved,
                          tokensSaved: event.tokensSaved,
                        };
                        set((s) => ({
                          lastCompression: { ...compaction, timestamp: Date.now() },
                          messages: [
                            ...s.messages,
                            {
                              id: `compact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              role: 'system' as const,
                              content: '上下文已压缩',
                              timestamp: Date.now(),
                              tags: ['system'] as Message['tags'],
                              compaction,
                            },
                          ],
                        }));
                      }
                      break;
                    case 'plan_generated':
                      useInspectorStore.getState().addPlan({
                        planId: event.planId,
                        steps: event.steps,
                        status: 'pending' as const,
                        filePath: event.filePath,
                        agentId: event.agentId,
                      });
                      if (event.filePath) useAgentStore.getState().setPlanFile(event.filePath, event.agentId);
                      flushAll();
                      break;
                    case 'done':
                      // Preload routes 'done' through onEvent first, then onDone.
                      // Flush all buffered data here so onDone only finalises.
                      flushAll();
                      clearStreamTimeout();
                      clearHeartbeatInterval();
                      flushUsageToStore();
                      useInspectorStore.getState().setActiveToolCount(0);
                      break;
                    case 'error':
                      flushAll();
                      clearStreamTimeout();
                      clearHeartbeatInterval();
                      flushUsageToStore();
                      useInspectorStore.getState().setActiveToolCount(0);
                      break;
                  }
                };
              })()),
                onDone: () => {
                  if (stopping) return;
                  // Flush + cleanup already handled by the 'done' case in onEvent.
                  ipcSubscription?.unsubscribe();
                  ipcSubscription = null;
                  set((s) => ({ ...setAssistantDone(assistantId)(s), isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null }));
                },
                onError: (error: string) => {
                  if (stopping) return;
                  // Flush + cleanup already handled by the 'error' case in onEvent.
                  ipcSubscription?.unsubscribe();
                  ipcSubscription = null;
                  set((s) => ({ ...setAssistantError(assistantId, `Error: ${error}`)(s), isStreaming: false, currentIteration: null, maxIterations: null, lastCompression: null }));
                },
              }
            );

            ipcSubscription = subscription;
            abortController = null;
          } catch (err: any) {
            makeCatch(err);
          }
          return;
        }

        // ─── Chat path (text-only, IPC) ───
        if (electronAI) {
          try {
            const acc = { text: '' };
            isQueryStream = false;

            const subscription = electronAI.chatStream(
              {
                model: selectedModel,
                messages: apiMessages,
                isDeepThink,
                reasoningEffort: reasoningEffort === 'low' ? 'high' : reasoningEffort === 'medium' ? 'high' : 'max',
                isWebSearch,
                apiKey: getApiKey() || undefined,
                surface: appMode,
              },
              {
                onChunk: makeOnChunk(acc),
                onDone: makeOnDone,
                onError: makeOnError,
              }
            );

            ipcSubscription = subscription;
            abortController = null;
          } catch (err: any) {
            makeCatch(err);
          }
          return;
        }

        // ─── Browser fallback ───
        try {
          const acc = { text: '' };
          await streamChat(
            { model: selectedModel, messages: apiMessages, isDeepThink, reasoningEffort: reasoningEffort === 'low' ? 'high' : reasoningEffort === 'medium' ? 'high' : 'max', isWebSearch },
            makeOnChunk(acc),
            abortController.signal,
          );
          set((s) => ({ ...setAssistantDone(assistantId)(s), isStreaming: false }));
        } catch (err: any) {
          makeCatch(err);
        }
        abortController = null;
      },
    }),
    {
      name: 'auraxis-chat-storage',
      version: 1,
      migrate: (persisted) => persisted as any,
      // debouncedStorage speaks the raw-string StateStorage API; wrap it with
      // createJSONStorage so zustand's persist (which expects the parsed
      // StorageValue API in 4.5) can hydrate/round-trip correctly.
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        messages: state.messages
          // Permission cards are live IPC artifacts — their requestId dies
          // with the backend process. Persisting them resurrects dead cards.
          .filter((m) => !m.permissionRequest)
          .slice(-40)
          .map((m) => (m.isStreaming ? { ...m, isStreaming: false, content: getContentText(m.content) || '[未完成的回复]' } : m)),
        selectedModel: state.selectedModel,
        isDeepThink: state.isDeepThink,
        reasoningEffort: state.reasoningEffort,
        isWebSearch: state.isWebSearch,
        taskPriority: state.taskPriority,
        memoriesEnabled: state.memoriesEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Never hydrate into a streaming state — the connection is dead
          clearStreamTimeout();
          state.isStreaming = false;
          // Rebuild toolCallMap from persisted messages
          const map: Record<string, ToolCall> = {};
          for (const m of state.messages) {
            if (m.toolCalls) {
              for (const tc of m.toolCalls) map[tc.id] = tc;
            }
          }
          state.toolCallMap = map;
        }
      },
    }
  )
);

// Switching to chat mode cancels an armed /plan — plan mode belongs to the
// Agent surface and must not leak back after a mode round-trip.
useAppStore.subscribe((state, prev) => {
  if (state.sidebarMode === 'chat' && prev.sidebarMode !== 'chat') {
    useChatStore.getState().setPendingPlanMode(false);
  }
});

// Auto-save session when streaming completes
let wasStreaming = false;
useChatStore.subscribe((state) => {
  // Skip when isStreaming hasn't changed — most set() calls are text chunks
  if (state.isStreaming === wasStreaming) return;
  wasStreaming = state.isStreaming;

  if (!state.isStreaming && state.messages.length > 0) {
    // Snapshot session metadata NOW. The timer below fires 500ms later —
    // by then the user may have started a new conversation (messages
    // cleared → the save would silently drop the finished session) or
    // switched modes (which would stamp the session with the wrong mode).
    const snapshot = {
      sessionId: useSessionStore.getState().currentSessionId,
      messages: state.messages,
      model: state.selectedModel,
      projectRoot: state.currentProjectPath || useSettingsStore.getState().projectPath || undefined,
      mode: useAppStore.getState().sidebarMode,
    };
    setTimeout(() => {
      const s = useChatStore.getState();
      if (!s.isStreaming && snapshot.sessionId) {
        // 用户可能在 500ms 内删除了该会话——已删会话不能被自动保存复活。
        if (!isSessionDeleted(snapshot.sessionId)) {
          useSessionStore.getState().saveSession(
            snapshot.messages,
            snapshot.model,
            snapshot.projectRoot,
            snapshot.mode,
            snapshot.sessionId,
          );
        }
      }
    }, 500);
  }
});

// ── HMR cleanup: kill timers & subscriptions on module reload ──
// Module-level timers (heartbeatInterval, streamTimeout) and IPC
// subscription live outside React's lifecycle.  On Vite HMR the old
// module is disposed but its timers keep firing — we must kill them.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearStreamTimeout();
    clearHeartbeatInterval();
    if (ipcSubscription) {
      ipcSubscription.unsubscribe();
      ipcSubscription = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (_planUnsub) {
      _planUnsub();
      _planUnsub = null;
    }
  });
}

// ── Plan approval listener ─────────────────────────────
// Listens for plan:generated IPC events from plan-handlers.ts and feeds them
// into the inspector store for downstream consumption.

let _planUnsub: (() => void) | null = null;
let _planInitCalled = false;

export function initPlanListener(): () => void {
  // Prevent duplicate initialization from multiple component mounts
  if (_planInitCalled) return _planUnsub || (() => {});
  _planInitCalled = true;

  if (_planUnsub) _planUnsub();
  const api = window.electronAPI;
  if (!api?.plan) return () => {};

  const unsub = api.plan.onGenerated(({ planId, steps, filePath, agentId }) => {
    useInspectorStore.getState().addPlan({
      planId,
      steps,
      status: 'pending' as const,
      filePath,
      agentId,
    });
    if (filePath) useAgentStore.getState().setPlanFile(filePath, agentId);
  });

  _planUnsub = unsub;
  return unsub;
}

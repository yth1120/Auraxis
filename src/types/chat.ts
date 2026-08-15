import type { ToolCall } from './tools';
import { BUILT_IN_MODELS as SHARED_MODELS } from '../../electron/types';
import type { PermissionRequest } from './advanced';

// Re-export for convenience
export type ModelProvider = 'deepseek';

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  maxTokens?: number;
  apiBase?: string;
}

export const BUILT_IN_MODELS: AIModel[] = SHARED_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  provider: m.provider,
  maxTokens: m.maxTokens,
  apiBase: m.apiBase,
}));

// ─── Content blocks for multi-modal messages ──────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { data: string; media_type: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** Extract concatenated text from a ContentBlock array (for display/comparison). */
export function getContentText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');
}

// ─── Plan approval ─────────────────────────────────────

export interface PlanStep {
  id: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type PlanStatus = 'pending' | 'approved' | 'rejected';

export interface PlanData {
  planId: string;
  steps: PlanStep[];
  status: PlanStatus;
  approvedStepIds?: string[];
  /** 计划持久化到的 Markdown 文件路径。 */
  filePath?: string;
  /** Owning scheduler task — absent for legacy query-path plans. */
  agentId?: string;
}

// ─── Session & Message ────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: number;
  codeBlocks?: CodeBlock[];
  thinkingBlocks?: { content: string }[];
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  tags?: ('warning' | 'error' | 'system' | 'injected')[];
  /** Plan data received via plan:generated IPC event (plan approval mode). */
  plan?: PlanData;
  /** Context-compaction checkpoint — rendered as an inline foldable row. */
  compaction?: CompactionData;
  /** Injected-context disclosure — rendered as a source-labeled foldable row. */
  disclosure?: ContextDisclosure;
  /** Inline permission request — rendered as InlinePermissionCard in the chat stream. */
  permissionRequest?: PermissionRequest;
}

export interface CodeBlock {
  id: string;
  language: string;
  code: string;
  applied: boolean;
}

/** Compaction checkpoint facts （压缩检查点）. */
export interface CompactionData {
  tokensBefore: number;
  tokensAfter: number;
  messagesRemoved?: number;
  tokensSaved?: number;
}

/** Injected-context disclosure （上下文注入披露, UI-only metadata). */
export interface ContextDisclosure {
  source: 'instructions' | 'memory';
  producer: string;
  detail?: string;
  /** Optional preview of the injected text (never required). */
  content?: string;
}

/** A message queued while the Agent is busy （排队消息）. */
export interface AgentQueueItem {
  id: string;
  text: string;
  createdAt: number;
}

export interface ChatStore {
  messages: Message[];
  commands: { id: string; name: string; args: string; ts: number }[];
  isStreaming: boolean;
  inputValue: string;
  isDeepThink: boolean;
  /** Thinking depth: low/medium → API reasoning_effort="high", high → "max" */
  reasoningEffort: 'low' | 'medium' | 'high';
  isWebSearch: boolean;
  autoApprove: boolean;
  /** /plan arms the next Agent task to run in plan mode (plan → approve → execute). */
  pendingPlanMode: boolean;
  /** Code-mode task launcher: scheduler priority for new tasks. Persisted. */
  taskPriority: 'high' | 'normal' | 'low';
  /** Agent-mode messages queued while the current task is running (FIFO drain). */
  agentQueue: AgentQueueItem[];
  /** Goal-mode shell — `/goal` progress row until the engine lands. */
  goal: GoalState | null;
  /** Per-chat memory switch — persisted, gates memory use/contribution. */
  memoriesEnabled: boolean;
  selectedModel: string;
  currentProjectPath: string | null;
  currentIteration: number | null;
  maxIterations: number | null;
  /** O(1) lookup index keyed by toolCallId — maintained alongside messages.toolCalls. */
  toolCallMap: Record<string, ToolCall>;
  exactInputTokens: number;
  exactOutputTokens: number;
  reasoningOutputTokens: number;
  lastCompression: { tokensBefore: number; tokensAfter: number; timestamp: number; messagesRemoved?: number; tokensSaved?: number } | null;
  lastUserMessage: string | null;
  /** Bumped when another view asks the composer to focus (diff 继续改, 错误修复). */
  composerFocusTick: number;
  /** Set by 新建任务 / 新建对话: the next code-mode send must NOT fall back
   *  to the most recently settled task — it should start fresh. */
  pendingNewTask: boolean;

  sendMessage: () => Promise<void>;
  retryLastMessage: () => void;
  retryTool: (requestId: string, toolCallId: string, toolName: string) => void;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  setInputValue: (value: string) => void;
  appendCommand: (cmd: { name: string; args: string; ts: number }) => void;
  requestComposerFocus: () => void;
  setPendingNewTask: (v: boolean) => void;
  toggleDeepThink: () => void;
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void;
  toggleWebSearch: () => void;
  toggleAutoApprove: () => void;
  setPendingPlanMode: (enabled: boolean) => void;
  setTaskPriority: (priority: 'high' | 'normal' | 'low') => void;
  enqueueAgentMessage: (text: string) => void;
  dequeueAgentMessage: (id: string) => void;
  editAgentQueueItem: (id: string, text: string) => void;
  clearAgentQueue: () => void;
  setGoal: (goal: GoalState | null) => void;
  updateGoal: (patch: Partial<GoalState>) => void;
  clearGoal: () => void;
  setMemoriesEnabled: (enabled: boolean) => void;
  setSelectedModel: (model: string) => void;
  clearMessages: () => void;
  switchSession: (id: string) => void;
  setCurrentProjectPath: (path: string | null) => void;
  stopStreaming: () => void;
}

export type LeftPanelTab = 'agents' | 'sessions' | 'files' | 'git';
export type ThemeMode = 'system' | 'light' | 'dark';

/** Full-screen tool entry views (front-end shells; real engines land later). */
export type ToolView =
  | 'none'
  | 'notifications'
  | 'scheduled'
  | 'plugins'
  | 'terminal';

/** Goal-mode state — `/goal` shell until the real long-running engine lands. */
export interface GoalState {
  text: string;
  status: 'running' | 'paused';
  startedAt: number;
}

// ─── Workbench Multi-Tab Support ──────────────────────────

export type WorkbenchTabType = 'chat' | 'file-tree' | 'diff' | 'browser';

export interface WorkbenchTab {
  id: string;
  type: WorkbenchTabType;
  label: string;
  agentId?: string;
  metadata?: {
    filePath?: string;
    diffRequestId?: string;
    browserUrl?: string;
  };
  isDirty?: boolean;
}

export interface AppStore {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  showSettings: boolean;
  showRightPanel: boolean;
  sidebarWidth: number;
  leftPanelWidth: number;
  rightPanelWidth: number;
  /** Persisted Allotment pane sizes. Length 2 when right panel hidden, 3 when shown. null = use defaults. */
  paneSizes: number[] | null;
  activeLeftPanel: LeftPanelTab;
  fileTreeVersion: number;

  // Workbench multi-tab
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  rightPanelView: 'file-tree' | 'inspector' | 'timeline' | 'review' | 'preview' | 'none';
  /** Sidebar content mode — 'chat' = conversation surface, 'code' = agent tasks. */
  sidebarMode: 'chat' | 'code';
  /** Tool entry view shown instead of the chat/task surface ('' = normal). */
  activeToolView: ToolView;
  /** Settings pane to open next time the Settings modal is shown. */
  settingsInitialKey: string;
  /** Bottom terminal drawer height (px). */
  terminalHeight: number;
  /** Cross-panel focus request: timeline → agent log row. */
  agentLogFocusRequest: { agentId: string; toolCallId: string; ts: number } | null;
  /** Cross-panel focus request: agent log row → timeline row. */
  trajectoryFocusRequest: { agentId: string; toolCallId: string; ts: number } | null;
  /** Last agent shell tab shown in the terminal drawer (persisted). */
  lastAgentShellId: string | null;
  /** Cross-panel "errors only" filter for agent execution views. */
  agentErrorsOnly: boolean;
  /** Cross-panel "text only" filter for agent execution views. */
  agentTextOnly: boolean;
  /** Cross-panel "running only" filter for agent execution views. */
  agentRunningOnly: boolean;
  /** Auto-follow newest running tool while running-only is active. */
  agentRunningFollow: boolean;
  /** Rounds currently expanded in the agent execution view (shared). */
  openAgentTurns: number[];
  /** Total round count, kept in sync by AgentConversation. */
  agentTurnCount: number;
  /** Timestamp bump requesting the raw-log modal. */
  agentRawLogRequest: number;
  /** Error navigation request: { ts, dir } where dir is +1 / -1. */
  agentErrorNavRequest: { ts: number; dir: 1 | -1 } | null;
  /** Cross-panel request to open a file in the 文件 right-panel tab. */
  openFileRequest: { path: string; requestId: number } | null;
  /** Multi-file tabs inside the 文件 panel (session-only, not persisted). */
  fileTabs: { path: string; name: string }[];
  /** Active file tab path; null = the fixed 文件树 tab. */
  activeFilePath: string | null;

  // Navigation history
  tabHistory: string[];
  tabHistoryIndex: number;

  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  toggleSidebar: () => void;
  setSidebarMode: (mode: 'chat' | 'code') => void;
  toggleRightPanel: () => void;
  setShowSettings: (show: boolean) => void;
  setActiveToolView: (view: ToolView) => void;
  /** Toggle a tool entry view — clicking the active entry returns to chat. */
  openToolView: (view: Exclude<ToolView, 'none'>) => void;
  setSettingsInitialKey: (key: string) => void;
  setTerminalHeight: (h: number) => void;
  requestAgentLogFocus: (agentId: string, toolCallId: string) => void;
  clearAgentLogFocus: () => void;
  requestTrajectoryFocus: (agentId: string, toolCallId: string) => void;
  clearTrajectoryFocus: () => void;
  setLastAgentShellId: (id: string | null) => void;
  setAgentErrorsOnly: (v: boolean) => void;
  setAgentTextOnly: (v: boolean) => void;
  setAgentRunningOnly: (v: boolean) => void;
  setAgentRunningFollow: (v: boolean) => void;
  setOpenAgentTurns: (turns: number[]) => void;
  toggleAllAgentTurns: () => void;
  setAgentTurnCount: (n: number) => void;
  requestAgentRawLog: () => void;
  requestAgentErrorNav: (dir: 1 | -1) => void;
  clearAgentErrorNav: () => void;
  setSidebarWidth: (w: number) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setPaneSizes: (sizes: number[]) => void;
  setActiveLeftPanel: (tab: LeftPanelTab) => void;
  incrementFileTreeVersion: () => void;
  requestOpenFile: (path: string) => void;
  clearOpenFileRequest: () => void;
  openFileTab: (path: string) => void;
  closeFileTab: (path: string) => void;
  setActiveFilePath: (path: string | null) => void;
  clearFileTabs: () => void;

  // Workbench tab methods
  addTab: (tab: Omit<WorkbenchTab, 'id'>) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<WorkbenchTab>) => void;
  closeAllTabs: () => void;
  setRightPanelView: (view: 'file-tree' | 'inspector' | 'timeline' | 'review' | 'preview' | 'none') => void;

  // Navigation
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

// ─── Agentic-workspace task model (TodoWrite-driven checklist) ───
export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  detail?: string;
  /** Tool calls that fulfilled this step (links task → ToolCallTimeline). */
  toolCallIds?: string[];
  startedAt?: number;
  endedAt?: number;
}

/** State-aware file-tree activity (badges driven by agent tool calls). */
export type FileActivity = 'reading' | 'editing' | 'modified' | 'created' | 'deleted';

/**
 * Fetch the full model list (built-in + custom from backend).
 * In browser-only mode, returns the built-in list.
 */
export async function fetchModels(): Promise<AIModel[]> {
  if (window.electronAPI?.model) {
    const result = await window.electronAPI.model.getAll();
    if (result.ok && result.data) {
      return result.data.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        maxTokens: m.maxTokens,
        apiBase: m.apiBase,
      }));
    }
  }
  return BUILT_IN_MODELS;
}

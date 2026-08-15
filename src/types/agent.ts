// Unified Agent type definitions — single source of truth
// Merges AgentInfo (System A) + AgentState (System B) into one schema

import type { ToolName } from './tools';
import type { PermissionRequest, PermissionMode } from './advanced';
import type { CompactionData, ContextDisclosure } from './chat';

// ─── Status ────────────────────────────────────────

export type AgentStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'stopped';

// ─── Priority ──────────────────────────────────────

export type AgentPriority = 'high' | 'normal' | 'low';

// ─── Log ───────────────────────────────────────────

export interface AgentLogEntry {
  type: 'text' | 'thinking' | 'user_message' | 'tool_start' | 'tool_end' | 'tool_error' | 'iteration_start' | 'iteration_end' | 'turn_start' | 'turn_end' | 'error' | 'plan' | 'progress' | 'warning' | 'context';
  timestamp: number;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
  error?: string;
  iteration?: number;
  maxIterations?: number;
  /** Shared identifier for tool calls dispatched in the same parallel batch. */
  stepGroupId?: string;
  /** Structured tool output summary for card rendering */
  summary?: Record<string, unknown>;
  /** Live terminal/stdout payload accumulated while the tool is running. */
  streamOutput?: string;
  /** Per-tool timing */
  toolsThisIteration?: number;
  llmLatencyMs?: number;
  /** Time from step start to the first streamed token (ms). */
  firstTokenMs?: number;
  /** LLM output tokens attributed to this iteration. */
  outputTokens?: number;
  /** Turn-scoped lifecycle ids （每回合一个尾部操作行）. */
  turnId?: string;
  reason?: string;
  /** Context-compaction checkpoint (rendered as an inline foldable row). */
  compaction?: CompactionData;
  /** Injected-context disclosure （上下文注入披露). */
  disclosure?: ContextDisclosure;
  todos?: { content: string; status: string; activeForm?: string }[];
}

// ─── Plan ──────────────────────────────────────────

export interface AgentPlan {
  planId?: string;
  todos: { content: string; status: string; activeForm?: string }[];
}

// ─── Core Agent ────────────────────────────────────

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  type: 'Explore' | 'Plan' | 'general-purpose';
  status: AgentStatus;
  priority: AgentPriority;

  startTime: number;
  endTime?: number;

  // Execution stats
  iteration: number;
  maxIterations: number;
  toolCallCount: number;
  messagesCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Project directory this task operates in (workspace linkage). */
  projectRoot?: string;
  parentAgentId?: string;
  /** 通过 Report 工具发送的进度汇报。 */
  reports?: { id: string; text: string; ts: number }[];
  goal?: { text: string; maxRounds: number } | null;

  // Tool set override (empty = use type defaults)
  customTools?: ToolName[];

  // LLM config
  model?: string;
  isDeepThink?: boolean;
  reasoningEffort?: 'high' | 'max';

  // Workspace isolation
  workspaceId?: string;

  // Result
  result?: string;
  error?: string;

  // Plan (from scheduler path)
  plan?: AgentPlan | null;
  /** Markdown file this agent's plan was persisted to (`.auraxis/plans/`). */
  planFile?: string;

  // Live log (from IPC streaming path)
  log: AgentLogEntry[];
}

/** Durable same-session goal state (mirrors electron/goal-store). */
export interface AgentGoalState {
  id: string;
  sessionId: string;
  text: string;
  phase: 'active' | 'paused' | 'completed' | 'blocked' | 'cleared';
  reason?: string;
  revision: number;
  roundsStarted: number;
  maxRounds: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Create request ────────────────────────────────

export interface AgentCreateRequest {
  name: string;
  description: string;
  /** UI-facing description (user's literal words). `description` may carry an
   *  internal prompt wrapper (e.g. follow-up context) that must never render. */
  displayDescription?: string;
  type: 'Explore' | 'Plan' | 'general-purpose';
  model: string;
  temperature?: number;
  messages?: { role: string; content: string }[];
  projectRoot?: string;
  apiKey?: string;
  priority?: AgentPriority;
  maxIterations?: number;
  customTools?: ToolName[];
  autoApprove?: boolean;
  isDeepThink?: boolean;
  reasoningEffort?: 'high' | 'max';
  /** Permission mode for this task's tool calls (ask/plan/afe). */
  mode?: PermissionMode;
  /** Per-task sandbox boundary; falls back to the global setting when absent. */
  sandboxMode?: 'read' | 'workspace-write' | 'full';
  /** Which UI surface created this task — 'chat' is rejected by the backend. */
  surface?: 'chat' | 'code';
  /** Active goal carried into the agent run （目标状态）. */
  goal?: { text: string; maxRounds: number } | null;
}

// ─── IPC action envelope ───────────────────────────

export type AgentAction =
  | { type: 'start'; payload: AgentCreateRequest; projectPath: string }
  | { type: 'stop'; agentId: string }
  | { type: 'pause'; agentId: string }
  | { type: 'resume'; agentId: string }
  | { type: 'setPriority'; agentId: string; priority: AgentPriority }
  | { type: 'setMaxConcurrent'; count: number }
  | { type: 'getAll' }
  | { type: 'getState'; agentId: string }
  | { type: 'remove'; agentId: string }
  | { type: 'clear' };

// ─── Store shape ───────────────────────────────────

export interface AgentStore {
  agents: AgentInfo[];
  isLoading: boolean;
  maxConcurrent: number;
  /** The agent task currently focused in the Code-mode middle column. */
  currentAgentId: string | null;
  /** Pending permission prompts keyed by the agent task they belong to. */
  agentPermissions: Record<string, PermissionRequest[]>;

  // Local mutations
  setCurrentAgent: (id: string | null) => void;
  setPlanFile: (path: string | null, agentId?: string) => void;
  addAgent: (agent: AgentInfo) => void;
  updateAgent: (id: string, updates: Partial<AgentInfo>) => void;
  removeAgent: (id: string) => void;
  appendAgentLog: (id: string, entries: AgentLogEntry[]) => void;
  addAgentPermission: (agentId: string, req: PermissionRequest) => void;
  removeAgentPermission: (agentId: string, requestId: string) => void;

  // IPC-backed actions
  startAgent: (request: AgentCreateRequest, projectPath: string) => Promise<string | null>;
  stopAgent: (agentId: string) => Promise<void>;
  stopAllAgents: () => Promise<void>;
  pauseAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<void>;
  /** Continue a settled task on the SAME agent (id/workspace/history). */
  continueAgent: (agentId: string, instruction: string, displayInstruction?: string) => Promise<{ ok: boolean; error?: string }>;
  setAgentPriority: (agentId: string, priority: AgentPriority) => Promise<void>;
  setMaxConcurrent: (count: number) => Promise<void>;
  refreshStates: () => Promise<void>;
  clearAgents: () => Promise<void>;

  // Subscriptions
  subscribeToUpdates: () => () => void;
}

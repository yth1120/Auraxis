/**
 * advanced.ts — single source of truth for MCP / permission / agent types.
 *
 * electron/advanced-defs.ts and src/types/advanced.ts both re-export from
 * here; fields that only one side needed (maxIterations, parentAgentId, goal)
 * are merged so neither side loses information.
 */
import type { PermissionMode } from './core';

export type { PermissionMode };

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface MCPStatus {
  serverId: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface PermissionRule {
  id: string;
  toolName: string;
  action: 'allow' | 'deny';
  scope: 'once' | 'session' | 'always';
  createdAt: number;
  matchPattern?: string;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  message: string;
  timestamp: number;
  mode: PermissionMode;
  oldContent?: string;
  /** Set when the request originates from a background (Code-mode) agent task. */
  agentId?: string;
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'stopped';

export interface AgentLogEntry {
  type: 'text' | 'tool_start' | 'tool_end' | 'tool_error' | 'iteration_start' | 'iteration_end' | 'error' | 'plan' | 'context';
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
  toolsThisIteration?: number;
  llmLatencyMs?: number;
  firstTokenMs?: number;
  outputTokens?: number;
  disclosure?: { source: string; producer: string; detail?: string };
  todos?: { content: string; status: string; activeForm: string }[];
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  projectRoot?: string;
  status: AgentStatus;
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  toolCallCount: number;
  iterations: number;
  parentAgentId?: string;
  goal?: { text: string; maxRounds: number } | null;
  /** 该 Agent 通过 Report 工具发送的进度汇报。 */
  reports?: { id: string; text: string; ts: number }[];
  log: AgentLogEntry[];
}

export interface AgentCreateRequest {
  name: string;
  description: string;
  model: string;
  messages: { role: string; content: string }[];
  projectRoot: string;
  apiKey: string;
  autoApprove?: boolean;
  isDeepThink?: boolean;
  reasoningEffort?: 'high' | 'max';
}

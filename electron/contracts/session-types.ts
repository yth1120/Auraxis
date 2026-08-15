/**
 * session-types.ts — unified session event vocabulary.
 *
 * Both chat sessions and agent runs are stored as append-only event streams
 * with this single contract. The log is the authoritative source; UI state,
 * replay, fork and search are projections over the same events.
 *
 * This file is intentionally free of `electron` imports so the renderer can
 * import it directly (see src/types/electron-api.ts).
 */

export type SessionEventType =
  | 'user'
  | 'assistant_chunk'
  | 'thinking_chunk'
  | 'tool'
  | 'command'
  | 'system'
  | 'agent_status';

export interface SessionEvent {
  /** Monotonic per-session sequence number (assigned by the store). */
  seq: number;
  type: SessionEventType;
  ts: number;
  data: Record<string, unknown>;
}

/** Durable session metadata — appended as `system` events; last write wins. */
export interface SessionMeta {
  kind?: 'chat' | 'agent';
  title?: string;
  created?: number;
  updated?: number;
  model?: string;
  projectRoot?: string;
  mode?: 'chat' | 'code';
  messageCount?: number;
  pinned?: boolean;
  branchedFrom?: { sessionId: string; messageId: string; title: string };
  /** Agent-run extras (kind === 'agent'). */
  agentName?: string;
  agentStatus?: string;
  result?: string;
  error?: string;
}

/** Lightweight directory entry — metadata + counts, no full projection. */
export interface SessionSummary {
  id: string;
  kind?: 'chat' | 'agent';
  title: string;
  created: number;
  updated: number;
  model?: string;
  projectRoot?: string;
  mode?: 'chat' | 'code';
  pinned?: boolean;
  branchedFrom?: { sessionId: string; messageId: string; title: string };
  messageCount: number;
  eventCount: number;
}

export interface ProjectedToolCall {
  id: string;
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: 'running' | 'done' | 'error';
  startTime: number;
  endTime?: number;
  error?: string;
  /** Log seq of the first event for this call — used as a fork boundary. */
  seq: number;
}

export interface ProjectedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ProjectedToolCall[];
}

export interface ProjectedSession {
  id: string;
  kind?: 'chat' | 'agent';
  title: string;
  created: number;
  updated: number;
  model?: string;
  projectRoot?: string;
  mode?: 'chat' | 'code';
  pinned?: boolean;
  branchedFrom?: { sessionId: string; messageId: string; title: string };
  messageCount: number;
  messages: ProjectedMessage[];
}

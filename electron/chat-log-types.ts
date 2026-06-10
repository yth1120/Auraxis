/**
 * chat-log-types.ts — backward-compatible chat-log contract.
 *
 * The canonical session vocabulary lives in contracts/session-types.ts; these
 * aliases keep existing chat IPC / renderer imports working unchanged.
 */
export type {
  ProjectedMessage,
  ProjectedToolCall,
  SessionEvent as ChatLogEvent,
  SessionEventType as ChatLogEventType,
  SessionMeta as ChatSessionMeta,
  ProjectedSession as ProjectedChatSession,
  SessionSummary as ChatSessionSummary,
} from './contracts/session-types';

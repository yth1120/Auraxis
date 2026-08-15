/**
 * core.ts — single source of truth for cross-process core types.
 *
 * electron/types.ts and the renderer both re-export from here, so IPC contract
 * types (PermissionMode, IpcResponse, ModelDefinition, …) are never
 * duplicated across the process boundary.
 */

export type PermissionMode = 'ask' | 'plan' | 'afe';

export interface FileResult {
  name: string;
  path: string;
  content: string;
  mimeType: string;
}

export interface FileSearchResult {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ApplyCodePayload {
  filePath: string;
  code: string;
  projectRoot: string;
}

export interface ApplyCodeResult {
  ok: boolean;
  filePath: string;
  action: 'created' | 'overwritten';
  error?: string;
}

export interface PreviewCodeResult {
  ok: boolean;
  filePath?: string;
  url?: string;
  error?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryEntry[];
}

export interface AIStreamRequest {
  requestId: string;
  model: string;
  messages: { role: string; content: string }[];
  isDeepThink: boolean;
  isWebSearch: boolean;
}

export interface AIStreamChunk {
  requestId: string;
  type: 'chunk' | 'done' | 'error';
  text?: string;
  error?: string;
}

// ─── Workspace task diff (read-only 变更 view) ───────────
export interface WorkspaceFileDiff {
  path: string;
  oldContent?: string;
  newContent?: string;
  /** Set when content is withheld: binary file or over the size cap. */
  skipped?: 'binary' | 'too-large';
}

export interface IpcResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Model definitions (single source of truth) ──────────
export type ModelProvider = 'deepseek';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  maxTokens?: number;
  apiBase?: string;
  apiKey?: string;
}

export const BUILT_IN_MODELS: ModelDefinition[] = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', maxTokens: 8192 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', maxTokens: 8192 },
];

export interface UndoEntry {
  id: string;
  sessionId: string;
  agentId?: string;
  timestamp: number;
  type: 'file:write' | 'file:edit' | 'message:delete';
  description: string;
  revert: () => Promise<void>;
  expiresAt?: number;
}

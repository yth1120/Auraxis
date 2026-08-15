/**
 * agent-snapshot.ts — durable agent checkpoints （会话检查点）.
 *
 * Terminal and paused agents are written to userData/agent-snapshots so the
 * task history survives restarts and paused agents can be resumed with their
 * saved loop state. API keys are never persisted — they resolve at resume.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';

export type AgentSnapshotStatus = 'paused' | 'completed' | 'error' | 'stopped';

export interface AgentSnapshotRecord {
  id: string;
  name: string;
  description?: string;
  displayDescription?: string;
  type: string;
  model: string;
  projectPath: string;
  workspacePath?: string;
  priority: 'high' | 'normal' | 'low';
  autoApprove?: boolean;
  mode?: string;
  sandboxMode?: string;
  approvedPlanSteps?: string[];
  tools?: string[];
  maxIterations: number;
  isDeepThink?: boolean;
  reasoningEffort?: string;
  systemPrompt?: string;
  goal?: { text: string; maxRounds: number } | null;
  status: AgentSnapshotStatus;
  startTime: number;
  endTime?: number;
  iteration: number;
  toolCallCount: number;
  messagesCount: number;
  result?: string;
  error?: string;
  plan?: unknown;
  log: Array<{ type: string; timestamp: number; [key: string]: any }>;
  savedState?: {
    messages: unknown[];
    plan: unknown;
    iteration: number;
    toolCallCount: number;
    allText: string;
  };
  /** Final LLM transcript for same-task continuation after a restart. */
  lastMessages?: unknown[];
}

function snapshotDir(): string {
  // Test seam: allow overriding the snapshot root without an Electron app.
  if (process.env.AURAXIS_SNAPSHOT_DIR) return process.env.AURAXIS_SNAPSHOT_DIR;
  return path.join(app.getPath('userData'), 'agent-snapshots');
}

export async function saveAgentSnapshot(record: AgentSnapshotRecord): Promise<void> {
  const dir = snapshotDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${record.id}.json`);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record), 'utf8');
  await fs.rename(tmp, target);
}

export async function loadAgentSnapshots(): Promise<AgentSnapshotRecord[]> {
  const dir = snapshotDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const records: AgentSnapshotRecord[] = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const record = JSON.parse(raw) as AgentSnapshotRecord;
      if (record && typeof record.id === 'string' && record.id) records.push(record);
    } catch {
      // Skip corrupt snapshots.
    }
  }
  return records.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
}

export async function removeAgentSnapshot(id: string): Promise<void> {
  try {
    await fs.rm(path.join(snapshotDir(), `${id}.json`), { force: true });
  } catch {
    // Best-effort cleanup.
  }
}

/** Keep at most `max` most recent snapshots on disk. */
export async function pruneSnapshots(max = 50): Promise<void> {
  const records = await loadAgentSnapshots();
  for (const record of records.slice(max)) {
    await removeAgentSnapshot(record.id);
  }
}

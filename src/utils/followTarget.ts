/**
 * Resolve which agent a send should continue.
 *
 * Priority:
 *   1. the task currently selected in the Agent view
 *   2. the most recently settled task — so a plain new instruction after a
 *      restart (where the selection is intentionally not restored) continues
 *      the last task instead of silently spawning a new one.
 *
 * `pendingNewTask` is set by the 新建任务 / 新建对话 entry points and skips
 * the fallback, so an explicit "start fresh" stays fresh.
 */
import type { AgentInfo } from '../types/agent';

const TERMINAL = new Set(['completed', 'error', 'stopped', 'review']);

function isTerminal(a: AgentInfo | null | undefined): a is AgentInfo {
  return !!a && TERMINAL.has(a.status);
}

export function resolveFollowTarget(opts: {
  selected: AgentInfo | null;
  agents: AgentInfo[];
  pendingNewTask: boolean;
}): AgentInfo | null {
  if (isTerminal(opts.selected)) return opts.selected;
  if (opts.pendingNewTask) return null;
  const settled = opts.agents
    .filter(isTerminal)
    .sort((a, b) => (b.endTime ?? b.startTime ?? 0) - (a.endTime ?? a.startTime ?? 0));
  return settled[0] ?? null;
}

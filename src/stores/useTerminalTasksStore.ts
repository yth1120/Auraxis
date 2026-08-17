import { create } from 'zustand';
import type { TerminalTask } from '@/types/electron-api';

/** 终态任务超过 5 分钟自动从列表清理，避免手动“清任务”按钮。 */
const TERMINAL_STATUSES = new Set(['success', 'failed', 'stopped', 'timeout']);
const PRUNE_AFTER_MS = 5 * 60_000;

function pruneOldTerminal(tasks: TerminalTask[]): TerminalTask[] {
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  return tasks.filter((t) => !(TERMINAL_STATUSES.has(t.status) && (t.finishedAt ?? 0) < cutoff));
}

interface TerminalTasksState {
  tasks: TerminalTask[];
  /** Subscribe to main-process broadcasts and pull the initial snapshot. */
  subscribe: () => () => void;
  stopTask: (id: string) => Promise<void>;
  clearTasks: () => Promise<void>;
}

export const useTerminalTasksStore = create<TerminalTasksState>()((set) => ({
  tasks: [],

  subscribe: () => {
    const api = window.electronAPI?.terminal;
    if (!api) return () => {};
    const unsubscribe = api.onTasksChanged((tasks) => set({ tasks: pruneOldTerminal(tasks) }));
    void api.listTasks().then((r) => {
      if (r.ok && r.data) set({ tasks: pruneOldTerminal(r.data) });
    });
    return unsubscribe;
  },

  stopTask: async (id) => {
    const api = window.electronAPI?.terminal;
    if (!api) return;
    await api.stopTask(id);
  },

  clearTasks: async () => {
    const api = window.electronAPI?.terminal;
    if (!api) return;
    await api.clearTasks();
  },
}));

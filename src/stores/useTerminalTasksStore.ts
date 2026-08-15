import { create } from 'zustand';
import type { TerminalTask } from '@/types/electron-api';

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
    const unsubscribe = api.onTasksChanged((tasks) => set({ tasks }));
    void api.listTasks().then((r) => {
      if (r.ok && r.data) set({ tasks: r.data });
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

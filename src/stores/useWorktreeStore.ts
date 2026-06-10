import { create } from 'zustand';

export interface WorktreeState {
  active: boolean;
  sandboxPath: string | null;
  taskId: string | null;
  /** Composer-level run target — front-end entry for the Local/Worktree switch. */
  mode: 'local' | 'worktree';
}

interface WorktreeStore extends WorktreeState {
  setWorktree: (state: Partial<WorktreeState>) => void;
  setMode: (mode: 'local' | 'worktree') => void;
  clear: () => void;
}

export const useWorktreeStore = create<WorktreeStore>((set) => ({
  active: false,
  sandboxPath: null,
  taskId: null,
  mode: 'local',

  setWorktree: (state) => set(state),
  setMode: (mode) => set({ mode }),
  clear: () => set({ active: false, sandboxPath: null, taskId: null }),
}));

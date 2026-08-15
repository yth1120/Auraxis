import { create } from 'zustand';

export interface MemoryItem {
  id: string;
  project_path: string;
  type: 'decision' | 'problem' | 'architecture' | 'preference' | 'progress' | 'context';
  title: string;
  content: string;
  tags: string;
  timestamp: number;
  session_id: string | null;
  importance: number;
  is_active: number;
}

export interface MemoryStore {
  activeMemories: MemoryItem[];
  searchResults: MemoryItem[];
  searchQuery: string;
  isLoading: boolean;

  loadMemories: (projectPath: string) => Promise<void>;
  searchMemories: (projectPath: string, query: string) => Promise<void>;
  archiveMemory: (id: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearSearch: () => void;
}

export const useMemoryStore = create<MemoryStore>()((set, get) => ({
  activeMemories: [],
  searchResults: [],
  searchQuery: '',
  isLoading: false,

  loadMemories: async (projectPath) => {
    if (!projectPath || !window.electronAPI?.memory) return;
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.memory.getByProject(projectPath);
      if (result.ok && result.data) {
        set({ activeMemories: result.data as MemoryItem[] });
      }
    } catch { /* ignore */ }
    set({ isLoading: false });
  },

  searchMemories: async (projectPath, query) => {
    if (!projectPath || !window.electronAPI?.memory) return;
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const result = await window.electronAPI.memory.search(projectPath, query);
      if (result.ok && result.data) {
        set({ searchResults: result.data as MemoryItem[] });
      }
    } catch { /* ignore */ }
  },

  archiveMemory: async (id) => {
    if (!window.electronAPI?.memory) return;
    try {
      await window.electronAPI.memory.archive(id);
      set((s) => ({
        activeMemories: s.activeMemories.filter((m) => m.id !== id),
        searchResults: s.searchResults.filter((m) => m.id !== id),
      }));
    } catch {
      console.error('[useMemoryStore] archiveMemory failed');
    }
  },

  deleteMemory: async (id) => {
    if (!window.electronAPI?.memory) return;
    try {
      await window.electronAPI.memory.delete(id);
      set((s) => ({
        activeMemories: s.activeMemories.filter((m) => m.id !== id),
        searchResults: s.searchResults.filter((m) => m.id !== id),
      }));
    } catch {
      console.error('[useMemoryStore] deleteMemory failed');
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [] }),
}));

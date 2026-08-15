import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSettingsStore } from './useSettingsStore';
import { useChatStore } from './useChatStore';

export interface Project {
  id: string;
  /** Display name — defaults to the directory basename, editable. */
  name: string;
  /** Absolute directory path (the project's identity for matching sessions). */
  path: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectGroupBy = 'workspace' | 'flat';
export type ProjectOrderBy = 'manual' | 'updated';

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  /** 工作区浏览 viewing state (group by workspace / flat; order). */
  view: { groupBy: ProjectGroupBy; orderBy: ProjectOrderBy };
  /** Manual workspace order (project ids); unlisted projects append. */
  workspaceOrder: string[];
  /** Manual session order per workspace key (project path or '__flat__'). */
  sessionOrder: Record<string, string[]>;

  /** Register a project by path without selecting it; returns existing or new. */
  ensureProject: (path?: string | null) => Project | null;
  /** Register (if needed) and select a project by path. */
  addProject: (path: string) => Project;
  /** Select a project and point settings + chat at its directory. */
  selectProject: (id: string | null) => void;
  /** Rename the display label only — never touches the directory. */
  renameProject: (id: string, name: string) => void;
  /** Re-point a project to another directory (选择/更换目录). */
  retargetProject: (id: string, path: string) => void;
  /** Remove from the registry; sessions keep their history. */
  removeProject: (id: string) => void;
  setGroupBy: (mode: ProjectGroupBy) => void;
  setOrderBy: (mode: ProjectOrderBy) => void;
  reorderWorkspace: (id: string, beforeId?: string) => void;
  reorderSession: (key: string, sessionId: string, beforeId?: string) => void;
}

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const seg = trimmed.split(/[\\/]/).pop();
  return (seg && seg.length > 0 ? seg : path) || '项目';
}

function projectId(): string {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function syncActivePath(path: string): void {
  useSettingsStore.getState().setProjectPath(path);
  useChatStore.getState().setCurrentProjectPath(path);
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      view: { groupBy: 'workspace', orderBy: 'manual' },
      workspaceOrder: [],
      sessionOrder: {},

      ensureProject: (path) => {
        const p = path?.trim();
        if (!p) return null;
        const existing = get().projects.find((x) => x.path === p);
        if (existing) return existing;
        const project: Project = {
          id: projectId(),
          name: basename(p),
          path: p,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return project;
      },

      addProject: (path) => {
        const p = path.trim();
        const existing = get().projects.find((x) => x.path === p);
        const project = existing ?? get().ensureProject(p)!;
        get().selectProject(project.id);
        return project;
      },

      selectProject: (id) => {
        const project = id ? get().projects.find((x) => x.id === id) : null;
        if (project) syncActivePath(project.path);
        set({ currentProjectId: project?.id ?? null });
      },

      renameProject: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
          ),
        }));
      },

      retargetProject: (id, path) => {
        const p = path.trim();
        if (!p) return;
        set((s) => ({
          projects: s.projects.map((x) =>
            x.id === id
              ? { ...x, path: p, name: x.name === basename(x.path) ? basename(p) : x.name, updatedAt: Date.now() }
              : x,
          ),
        }));
        if (get().currentProjectId === id) syncActivePath(p);
      },

      removeProject: (id) => {
        set((s) => {
          const remaining = s.projects.filter((x) => x.id !== id);
          const wasCurrent = s.currentProjectId === id;
          const nextId = wasCurrent ? (remaining[0]?.id ?? null) : s.currentProjectId;
          if (wasCurrent) {
            const next = nextId ? remaining.find((x) => x.id === nextId) : null;
            if (next) {
              syncActivePath(next.path);
            } else {
              useSettingsStore.getState().setProjectPath(null);
              useChatStore.getState().setCurrentProjectPath(null);
            }
          }
          return {
            projects: remaining,
            currentProjectId: nextId,
          };
        });
      },

      setGroupBy: (mode) => set((s) => ({ view: { ...s.view, groupBy: mode } })),
      setOrderBy: (mode) => set((s) => ({ view: { ...s.view, orderBy: mode } })),

      reorderWorkspace: (id, beforeId) => set((s) => {
        const ids = s.workspaceOrder.filter((x) => x !== id);
        const at = beforeId === undefined ? ids.length : ids.indexOf(beforeId);
        ids.splice(at < 0 ? ids.length : at, 0, id);
        return { workspaceOrder: ids };
      }),

      reorderSession: (key, sessionId, beforeId) => set((s) => {
        const current = s.sessionOrder[key] ?? [];
        const ids = current.filter((x) => x !== sessionId);
        const at = beforeId === undefined ? ids.length : ids.indexOf(beforeId);
        ids.splice(at < 0 ? ids.length : at, 0, sessionId);
        return { sessionOrder: { ...s.sessionOrder, [key]: ids } };
      }),
    }),
    {
      name: 'auraxis-projects',
    },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InstalledPlugin, Plugin } from '../types/plugin';

export interface PluginStore {
  installedPlugins: InstalledPlugin[];
  activePlugins: Plugin[];

  installPlugin: (info: InstalledPlugin, plugin: Plugin) => void;
  uninstallPlugin: (id: string) => void;
  enablePlugin: (id: string) => void;
  disablePlugin: (id: string) => void;
  setActivePlugins: (plugins: Plugin[]) => void;
}

export const usePluginStore = create<PluginStore>()(
  persist(
    (set, get) => ({
      installedPlugins: [],
      activePlugins: [],

      installPlugin: (info, plugin) =>
        set((s) => ({
          installedPlugins: [...s.installedPlugins.filter((p) => p.id !== info.id), info],
          activePlugins: [...s.activePlugins.filter((p) => p.id !== plugin.id), plugin],
        })),

      uninstallPlugin: (id) =>
        set((s) => ({
          installedPlugins: s.installedPlugins.filter((p) => p.id !== id),
          activePlugins: s.activePlugins.filter((p) => p.id !== id),
        })),

      enablePlugin: (id) =>
        set((s) => {
          if (typeof window !== 'undefined') window.electronAPI?.pluginState?.set(id, true).catch(() => {});
          return {
            installedPlugins: s.installedPlugins.map((p) =>
              p.id === id ? { ...p, enabled: true } : p,
            ),
          };
        }),

      disablePlugin: (id) =>
        set((s) => {
          if (typeof window !== 'undefined') window.electronAPI?.pluginState?.set(id, false).catch(() => {});
          return {
            installedPlugins: s.installedPlugins.map((p) =>
              p.id === id ? { ...p, enabled: false } : p,
            ),
          };
        }),

      setActivePlugins: (plugins) => set({ activePlugins: plugins }),
    }),
    {
      name: 'auraxis-plugin-storage',
      version: 1,
      migrate: (persisted) => persisted as any,
      partialize: (s) => ({ installedPlugins: s.installedPlugins }),
      onRehydrateStorage: () => (state) => {
        // Apply CLI-managed plugin state (userData/plugin-state.json).
        const api = typeof window !== 'undefined' ? window.electronAPI?.pluginState : undefined;
        if (!api || !state?.installedPlugins) return;
        void api.get().then((r) => {
          if (!r?.ok || !Array.isArray(r.data?.enabledIds)) return;
          const enabled = new Set(r.data!.enabledIds);
          usePluginStore.setState({
            installedPlugins: state.installedPlugins.map((p) => ({
              ...p,
              enabled: enabled.has(p.id),
            })),
          });
        }).catch(() => {});
      },
    },
  ),
);

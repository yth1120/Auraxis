import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CostCurrency = 'RMB' | 'USD';

/** Hard sandbox boundary for Agent tasks (mirrors electron SandboxMode). */
export type SandboxMode = 'read' | 'workspace-write' | 'full';

export interface AccountInfo {
  balance: string;
  toppedUp: string;
  currency: string;
}

export interface SettingsStore {
  deepseekApiKey: string;
  defaultModel: string;
  projectPath: string | null;
  notifyOnAgentComplete: boolean;
  /** 回合完成提醒的粒度（通知分级）。 */
  notificationMode: 'never' | 'background' | 'always';
  /** Separate control for permission / question notifications. */
  permissionNotifications: boolean;
  costCurrency: CostCurrency;
  account: AccountInfo | null;
  /** Estimated token price per 1M tokens (0 = cost display disabled). */
  inputPricePerM: number;
  outputPricePerM: number;
  /** UI zoom level (Chromium zoom-level units, 0 = 100%). Restored at startup. */
  zoomLevel: number;
  /** Sidebar frosted-glass transparency (0 = solid, 100 = most transparent). */
  sidebarGlass: number;
  /** Whether the current OS supports native Acrylic background material. */
  sidebarGlassSupported: boolean;
  /** Agent access axis: hard sandbox boundary. Persisted to backend settings. */
  sandboxMode: SandboxMode;
  /** Web search provider for Agent / chat web search （联网搜索）. */
  webSearchProvider: string;
  exaApiKey: string;
  perplexityApiKey: string;

  setApiKey: (key: string) => void;
  setDefaultModel: (model: string) => void;
  setProjectPath: (path: string | null) => void;
  setNotifyOnAgentComplete: (enabled: boolean) => void;
  setNotificationMode: (mode: 'never' | 'background' | 'always') => void;
  setPermissionNotifications: (enabled: boolean) => void;
  setCostCurrency: (currency: CostCurrency) => void;
  setAccount: (info: AccountInfo | null) => void;
  setInputPricePerM: (price: number) => void;
  setOutputPricePerM: (price: number) => void;
  setZoomLevel: (level: number) => void;
  setSidebarGlass: (value: number) => void;
  setSidebarGlassSupported: (supported: boolean) => void;
  setSandboxMode: (mode: SandboxMode) => void;
  setWebSearchProvider: (provider: string) => void;
  setExaApiKey: (key: string) => void;
  setPerplexityApiKey: (key: string) => void;
  clearApiKeys: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      deepseekApiKey: '',
      defaultModel: 'deepseek-v4-flash',
      projectPath: null,
      notifyOnAgentComplete: true,
      notificationMode: 'always' as const,
      permissionNotifications: true,
      costCurrency: 'RMB',
      account: null,
      inputPricePerM: 0,
      outputPricePerM: 0,
      zoomLevel: 0,
      sidebarGlass: 0,
      sidebarGlassSupported: false,
      sandboxMode: 'workspace-write' as SandboxMode,
      webSearchProvider: 'duckduckgo',
      exaApiKey: '',
      perplexityApiKey: '',

      setNotifyOnAgentComplete: (enabled) => set({ notifyOnAgentComplete: enabled }),
      setNotificationMode: (mode) => set({
        notificationMode: mode,
        // Keep the legacy boolean in sync — backend notifications use it today.
        notifyOnAgentComplete: mode !== 'never',
      }),
      setPermissionNotifications: (enabled) => set({ permissionNotifications: enabled }),
      setCostCurrency: (currency) => set({ costCurrency: currency }),
      setAccount: (info) => set({ account: info }),
      setInputPricePerM: (price) => set({ inputPricePerM: Math.max(0, Number(price) || 0) }),
      setOutputPricePerM: (price) => set({ outputPricePerM: Math.max(0, Number(price) || 0) }),
      setZoomLevel: (level) => set({ zoomLevel: level }),

      setSidebarGlass: (value) => {
        const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        set({ sidebarGlass: v });
        // Persist for next boot (the main process reads this at window creation).
        window.electronAPI?.settings?.set?.('sidebarGlass', v)?.catch?.(() => {});
        // Toggle the native window material only when the OS actually supports it.
        if (useSettingsStore.getState().sidebarGlassSupported) {
          window.electronAPI?.setBackgroundMaterial?.(v > 0)?.catch?.(() => {});
        }
      },

      setSidebarGlassSupported: (supported) => set({ sidebarGlassSupported: !!supported }),

      setSandboxMode: (mode) => {
        set({ sandboxMode: mode });
        window.electronAPI?.settings.set('sandboxMode', mode).catch(() => {});
      },

      setWebSearchProvider: (provider) => {
        set({ webSearchProvider: provider });
        window.electronAPI?.settings.set('webSearchProvider', provider).catch(() => {});
      },

      setExaApiKey: (key) => {
        set({ exaApiKey: key });
        window.electronAPI?.settings.set('exaApiKey', key).catch(() => {});
      },

      setPerplexityApiKey: (key) => {
        set({ perplexityApiKey: key });
        window.electronAPI?.settings.set('perplexityApiKey', key).catch(() => {});
      },

      setApiKey: (key) => {
        set({ deepseekApiKey: key });
        window.electronAPI?.settings.setApiKey('deepseek', key).catch(() => {});
      },

      setDefaultModel: (model) => set({ defaultModel: model }),

      setProjectPath: (path) => {
        set({ projectPath: path });
        // Backend-owned consumers (cron jobs, headless CLI) read projectPath
        // from settings.json — keep the two stores in sync.
        if (typeof window !== 'undefined') {
          const api = window.electronAPI?.settings;
          if (api?.set) void api.set('projectPath', path ?? '').catch(() => {});
        }
      },

      clearApiKeys: () => {
        set({ deepseekApiKey: '' });
        const api = window.electronAPI?.settings;
        if (api) {
          api.setApiKey('deepseek', '');
        }
      },
    }),
    {
      name: 'auraxis-settings-storage',
      version: 1,
      migrate: (persisted) => persisted as any,
      partialize: (state) => ({
        defaultModel: state.defaultModel,
        projectPath: state.projectPath,
        notifyOnAgentComplete: state.notifyOnAgentComplete,
        notificationMode: state.notificationMode,
        permissionNotifications: state.permissionNotifications,
        costCurrency: state.costCurrency,
        inputPricePerM: state.inputPricePerM,
        outputPricePerM: state.outputPricePerM,
        zoomLevel: state.zoomLevel,
        sidebarGlass: state.sidebarGlass,
        sandboxMode: state.sandboxMode,
        webSearchProvider: state.webSearchProvider,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && window.electronAPI?.settings) {
          window.electronAPI.settings.getApiKey('deepseek').then((result) => {
            if (result.ok && result.data) {
              useSettingsStore.setState({ deepseekApiKey: result.data });
            }
          }).catch(() => {});
          window.electronAPI.settings.get('sandboxMode').then((result) => {
            const v = result?.data;
            if (v === 'read' || v === 'workspace-write' || v === 'full') {
              useSettingsStore.setState({ sandboxMode: v });
            }
          }).catch(() => {});
          window.electronAPI.settings.get('webSearchProvider').then((result) => {
            const v = result?.data;
            if (typeof v === 'string' && v) useSettingsStore.setState({ webSearchProvider: v });
          }).catch(() => {});
          window.electronAPI.settings.get('exaApiKey').then((result) => {
            if (typeof result?.data === 'string') useSettingsStore.setState({ exaApiKey: result.data });
          }).catch(() => {});
          window.electronAPI.settings.get('perplexityApiKey').then((result) => {
            if (typeof result?.data === 'string') useSettingsStore.setState({ perplexityApiKey: result.data });
          }).catch(() => {});
          window.electronAPI.settings.get('sidebarGlass').then((result) => {
            const v = Number(result?.data);
            if (Number.isFinite(v)) {
              useSettingsStore.setState({ sidebarGlass: Math.max(0, Math.min(100, Math.round(v))) });
            }
          }).catch(() => {});
          // Ask the main process whether Acrylic is available; if it is and the
          // persisted value is non-zero, make sure the material is active.
          if (window.electronAPI.backgroundMaterialSupported) {
            window.electronAPI.backgroundMaterialSupported().then((r) => {
              const supported = !!(r?.ok && r.data);
              useSettingsStore.setState({ sidebarGlassSupported: supported });
              if (supported && useSettingsStore.getState().sidebarGlass > 0) {
                window.electronAPI?.setBackgroundMaterial?.(true)?.catch?.(() => {});
              }
            }).catch(() => {});
          }
        }
      },
    }
  )
);

export function getApiKeyFromStore(): string | null {
  return useSettingsStore.getState().deepseekApiKey || null;
}

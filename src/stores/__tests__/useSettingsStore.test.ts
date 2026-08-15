import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore, getApiKeyFromStore } from '../useSettingsStore';
import type { AccountInfo } from '../useSettingsStore';

// Mock window.electronAPI for all tests (called by setApiKey and clearApiKeys)
vi.stubGlobal('window', {
  electronAPI: {
    settings: {
      setApiKey: vi.fn().mockResolvedValue({ ok: true }),
      getApiKey: vi.fn().mockResolvedValue({ ok: true, data: 'sk-mocked' }),
    },
  },
});

describe('useSettingsStore — initial state', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      deepseekApiKey: '',
      defaultModel: 'deepseek-v4-flash',
      projectPath: null,
      notifyOnAgentComplete: true,
      costCurrency: 'RMB',
      account: null,
    });
  });

  it('初始状态字段默认值正确', () => {
    const state = useSettingsStore.getState();
    expect(state.deepseekApiKey).toBe('');
    expect(state.defaultModel).toBe('deepseek-v4-flash');
    expect(state.projectPath).toBeNull();
    expect(state.notifyOnAgentComplete).toBe(true);
    expect(state.costCurrency).toBe('RMB');
    expect(state.account).toBeNull();
  });
});

describe('useSettingsStore — setters', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      deepseekApiKey: '',
      defaultModel: 'deepseek-v4-flash',
      projectPath: null,
      notifyOnAgentComplete: true,
      costCurrency: 'RMB',
      account: null,
    });
  });

  it('setDefaultModel 更改默认模型', () => {
    useSettingsStore.getState().setDefaultModel('deepseek-v4-pro');
    expect(useSettingsStore.getState().defaultModel).toBe('deepseek-v4-pro');
  });

  it('setProjectPath 设置项目路径', () => {
    useSettingsStore.getState().setProjectPath('/home/project');
    expect(useSettingsStore.getState().projectPath).toBe('/home/project');
  });

  it('setProjectPath 清除项目路径', () => {
    useSettingsStore.getState().setProjectPath('/home/project');
    useSettingsStore.getState().setProjectPath(null);
    expect(useSettingsStore.getState().projectPath).toBeNull();
  });

  it('setNotifyOnAgentComplete 切换通知开关', () => {
    expect(useSettingsStore.getState().notifyOnAgentComplete).toBe(true);
    useSettingsStore.getState().setNotifyOnAgentComplete(false);
    expect(useSettingsStore.getState().notifyOnAgentComplete).toBe(false);
  });

  it('setCostCurrency 切换 RMB / USD', () => {
    useSettingsStore.getState().setCostCurrency('USD');
    expect(useSettingsStore.getState().costCurrency).toBe('USD');
    useSettingsStore.getState().setCostCurrency('RMB');
    expect(useSettingsStore.getState().costCurrency).toBe('RMB');
  });

  it('setAccount 设置账户信息', () => {
    const account: AccountInfo = {
      balance: '100.00',
      toppedUp: '500.00',
      currency: 'CNY',
    };
    useSettingsStore.getState().setAccount(account);
    expect(useSettingsStore.getState().account).toEqual(account);
  });

  it('setAccount 清除账户信息', () => {
    const account: AccountInfo = {
      balance: '100.00',
      toppedUp: '500.00',
      currency: 'CNY',
    };
    useSettingsStore.getState().setAccount(account);
    useSettingsStore.getState().setAccount(null);
    expect(useSettingsStore.getState().account).toBeNull();
  });

  it('clearApiKeys 清空 key', () => {
    useSettingsStore.getState().setApiKey('sk-test-key');
    expect(useSettingsStore.getState().deepseekApiKey).toBe('sk-test-key');
    useSettingsStore.getState().clearApiKeys();
    expect(useSettingsStore.getState().deepseekApiKey).toBe('');
  });
});

describe('getApiKeyFromStore', () => {
  it('从 store 获取当前 key', () => {
    useSettingsStore.setState({ deepseekApiKey: 'sk-abc123' });
    expect(getApiKeyFromStore()).toBe('sk-abc123');
  });

  it('无 key 时返回 null', () => {
    useSettingsStore.setState({ deepseekApiKey: '' });
    expect(getApiKeyFromStore()).toBeNull();
  });
});

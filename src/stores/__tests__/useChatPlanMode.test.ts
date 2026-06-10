import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';
import { useChatStore } from '../useChatStore';

describe('useChatStore — /plan 武装与模式切换联动', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarMode: 'code' });
    useChatStore.setState({
      pendingPlanMode: false,
      messages: [],
      isStreaming: false,
      isDeepThink: false,
      reasoningEffort: 'medium',
      modeThinkingPrefs: {},
    });
  });

  it('切到对话模式会取消已武装的 /plan', () => {
    useChatStore.getState().setPendingPlanMode(true);
    expect(useChatStore.getState().pendingPlanMode).toBe(true);

    useAppStore.getState().setSidebarMode('chat');
    expect(useChatStore.getState().pendingPlanMode).toBe(false);
  });

  it('切回 Agent 模式后可重新武装 /plan，再切对话仍会取消', () => {
    useAppStore.getState().setSidebarMode('chat');
    useAppStore.getState().setSidebarMode('code');
    useChatStore.getState().setPendingPlanMode(true);
    expect(useChatStore.getState().pendingPlanMode).toBe(true);

    useAppStore.getState().setSidebarMode('chat');
    expect(useChatStore.getState().pendingPlanMode).toBe(false);
  });

  it('每个模式记住自己的思考开关与深度，切回时恢复', () => {
    useAppStore.getState().setSidebarMode('chat');
    // 清除 beforeEach 合成切换时留下的 code 快照，模拟“从未进过 Code”。
    useChatStore.setState({ modeThinkingPrefs: {} });
    // Chat：关闭思考，深度调高
    useChatStore.setState({ isDeepThink: false, reasoningEffort: 'high' });

    // 切到 Work：默认思考开启，深度沿用当前值，再调成 low
    useAppStore.getState().setSidebarMode('work');
    expect(useChatStore.getState().isDeepThink).toBe(true);
    useChatStore.setState({ isDeepThink: true, reasoningEffort: 'low' });

    // 切到 Code：默认思考开启，深度沿用 low，再调成 high
    useAppStore.getState().setSidebarMode('code');
    expect(useChatStore.getState().isDeepThink).toBe(true);
    expect(useChatStore.getState().reasoningEffort).toBe('low');
    useChatStore.setState({ reasoningEffort: 'high' });

    // 切回 Chat：恢复 Chat 自己的状态（关闭 + high），而不是继承 Code
    useAppStore.getState().setSidebarMode('chat');
    expect(useChatStore.getState().isDeepThink).toBe(false);
    expect(useChatStore.getState().reasoningEffort).toBe('high');

    // 再回 Work：恢复 Work 自己的状态（开启 + low）
    useAppStore.getState().setSidebarMode('work');
    expect(useChatStore.getState().isDeepThink).toBe(true);
    expect(useChatStore.getState().reasoningEffort).toBe('low');
  });

  it('Chat 无快照时默认思考开启且强度固定为 high', () => {
    useAppStore.getState().setSidebarMode('chat');
    expect(useChatStore.getState().isDeepThink).toBe(true);
    expect(useChatStore.getState().reasoningEffort).toBe('high');
  });
});

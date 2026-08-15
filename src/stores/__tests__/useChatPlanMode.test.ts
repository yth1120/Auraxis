import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';
import { useChatStore } from '../useChatStore';

describe('useChatStore — /plan 武装与模式切换联动', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarMode: 'code' });
    useChatStore.setState({ pendingPlanMode: false, messages: [], isStreaming: false });
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
});

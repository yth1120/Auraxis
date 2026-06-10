// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import GoalBar from '../GoalBar';
import { useChatStore } from '@/stores/useChatStore';
import { useSessionStore } from '@/stores/useSessionStore';

describe('GoalBar — 目标进度按钮', () => {
  beforeEach(() => {
    useChatStore.setState({
      goal: { text: '完成登录', status: 'running', startedAt: Date.now() },
    });
    useSessionStore.setState({ currentSessionId: 's1' });
    (window as any).electronAPI = {
      goal: {
        pause: vi.fn(async () => ({ ok: true })),
        resume: vi.fn(async () => ({ ok: true })),
        clear: vi.fn(async () => ({ ok: true })),
        edit: vi.fn(async () => ({ ok: true })),
      },
    };
  });

  it('pauses the running goal through the pause button', () => {
    const { container } = render(<GoalBar />);
    const buttons = [...container.querySelectorAll('button')];
    fireEvent.click(buttons[0]);
    expect((window as any).electronAPI.goal.pause).toHaveBeenCalledWith('s1');
  });
});

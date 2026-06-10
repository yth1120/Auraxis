// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ContextMeter from '../ContextMeter';
import { useChatStore } from '@/stores/useChatStore';
import { useAgentStore } from '@/stores/useAgentStore';

describe('ContextMeter — 上下文占用圆环', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [], selectedModel: 'deepseek-v4-pro' });
    useAgentStore.setState({ agents: [], currentAgentId: null });
  });

  it('shows a ring reflecting only the system overhead on an empty chat', () => {
    const { getByRole } = render(<ContextMeter />);
    expect(getByRole('button', { name: /上下文占用约 \d+%/ })).toBeTruthy();
  });

  it('opens a heuristic breakdown popover with all three rows', async () => {
    useChatStore.setState({
      messages: [
        { id: 'm1', role: 'user' as const, content: '请帮我重构整个输入区。'.repeat(120), timestamp: Date.now() },
      ],
    });
    const { getByRole } = render(<ContextMeter />);
    fireEvent.click(getByRole('button', { name: /上下文占用/ }));

    await waitFor(() => {
      expect(document.body.textContent).toContain('系统提示 / 指令');
      expect(document.body.textContent).toContain('对话消息');
      expect(document.body.textContent).toContain('工具记录');
      expect(document.body.textContent).toContain('启发式估算');
    });
  });

  it('estimates from the current agent log in code mode', () => {
    useAgentStore.setState({
      currentAgentId: 'a1',
      agents: [
        {
          id: 'a1',
          name: '任务',
          description: '重构输入区'.repeat(80),
          type: 'general-purpose',
          status: 'running',
          priority: 'normal',
          startTime: Date.now(),
          iteration: 1,
          maxIterations: 10,
          toolCallCount: 1,
          messagesCount: 2,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          log: [
            {
              type: 'tool_end',
              timestamp: Date.now(),
              toolName: 'Bash',
              // 120k chars ≈ 40k tokens ≈ 4% of the 1M window — enough to
              // move the rounded percentage off 0% after the 1M upgrade.
              input: { command: 'x'.repeat(120_000) },
              output: { exitCode: 0 },
            },
          ],
        },
      ],
    });
    const { getByRole } = render(<ContextMeter />);
    const label = getByRole('button', { name: /上下文占用约/ }).getAttribute('aria-label') ?? '';
    expect(label).not.toBe('上下文占用约 0%');
  });
});

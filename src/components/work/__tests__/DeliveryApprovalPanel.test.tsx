// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import DeliveryApprovalPanel from '../DeliveryApprovalPanel';
import { useAgentStore } from '@/stores/useAgentStore';
import { useAppStore } from '@/stores/useAppStore';
import type { AgentInfo } from '@/types/agent';

const agent: AgentInfo = {
  id: 'w1',
  name: '写报告',
  description: '生成周报',
  type: 'general-purpose',
  status: 'review',
  priority: 'normal',
  startTime: Date.now(),
  iteration: 3,
  maxIterations: 10,
  toolCallCount: 5,
  messagesCount: 6,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  surface: 'work',
  workTier: 'smart',
  delivery: {
    files: ['C:/proj/report.md', 'C:/proj/summary.txt'],
    result: '报告已完成，共 3 章。',
  },
  log: [],
};

describe('DeliveryApprovalPanel — 交付验收按钮组', () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [agent], currentAgentId: 'w1' });
    (window as any).electronAPI = {
      agent: {
        approveDelivery: vi.fn(async () => ({ ok: true, data: { approved: true } })),
        continue: vi.fn(async () => ({ ok: true, data: { continued: true } })),
      },
    };
    useAppStore.setState({ openFileRequest: null });
  });

  it('renders result, file chips and the three actions', () => {
    const { container } = render(<DeliveryApprovalPanel agent={agent} />);
    expect(container.textContent).toContain('报告已完成');
    expect(container.textContent).toContain('report.md');
    expect(container.textContent).toContain('验收通过');
    expect(container.textContent).toContain('继续执行');
    expect(container.textContent).toContain('打回修订');
  });

  it('approve resolves the task through the store', async () => {
    const { getByText } = render(<DeliveryApprovalPanel agent={agent} />);
    fireEvent.click(getByText('验收通过'));
    await act(async () => {});
    expect(useAgentStore.getState().agents.find((a) => a.id === 'w1')?.status).toBe('completed');
  });

  it('continue sends the extra comment to the same task', async () => {
    const { getByText, getByPlaceholderText } = render(<DeliveryApprovalPanel agent={agent} />);
    fireEvent.change(getByPlaceholderText('补充要求或修改意见（可选）'), {
      target: { value: '补一张架构图' },
    });
    fireEvent.click(getByText('继续执行'));
    await act(async () => {});
    const cont = (window as any).electronAPI.agent.continue as ReturnType<typeof vi.fn>;
    expect(cont).toHaveBeenCalledWith('w1', expect.stringContaining('补一张架构图'), expect.any(String));
  });

  it('file chip opens the file panel', () => {
    const { getByText } = render(<DeliveryApprovalPanel agent={agent} />);
    fireEvent.click(getByText('report.md'));
    expect(useAppStore.getState().openFileRequest?.path).toBe('C:/proj/report.md');
  });
});

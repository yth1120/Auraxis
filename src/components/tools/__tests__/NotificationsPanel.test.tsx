// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import NotificationsPanel from '../NotificationsPanel';
import { useNotificationStore } from '@/stores/useNotificationStore';

describe('NotificationsPanel — 通知面板', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      items: [
        {
          id: 'n1',
          kind: 'agent',
          title: '任务完成：重构输入区',
          detail: '全部测试通过',
          timestamp: Date.now() - 60_000,
          read: false,
          agentId: 'a1',
        },
        {
          id: 'n2',
          kind: 'cron',
          title: '定时任务完成：发版说明',
          timestamp: Date.now() - 120_000,
          read: false,
        },
      ],
    });
  });

  it('renders notifications and marks all read on open', () => {
    const { container } = render(<NotificationsPanel />);
    expect(container.textContent).toContain('任务完成：重构输入区');
    expect(container.textContent).toContain('定时任务完成：发版说明');
    expect(useNotificationStore.getState().items.every((i) => i.read)).toBe(true);
  });

  it('deletes a single notification', () => {
    const { container, getAllByLabelText } = render(<NotificationsPanel />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(getAllByLabelText('删除通知')[0]);
    expect(useNotificationStore.getState().items).toHaveLength(1);
  });

  it('clears the whole list', () => {
    const { getByText } = render(<NotificationsPanel />);
    fireEvent.click(getByText('清空'));
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });

  it('groups notifications into 今天 and 更早', () => {
    useNotificationStore.setState({
      items: [
        {
          id: 'n-today',
          kind: 'agent',
          title: '任务完成：今天',
          timestamp: Date.now() - 60_000,
          read: true,
        },
        {
          id: 'n-earlier',
          kind: 'cron',
          title: '定时任务完成：更早',
          timestamp: Date.now() - 2 * 86_400_000,
          read: true,
        },
      ],
    });
    const { container } = render(<NotificationsPanel />);
    expect(container.textContent).toContain('今天');
    expect(container.textContent).toContain('更早');
    expect(container.textContent).toContain('任务完成：今天');
    expect(container.textContent).toContain('定时任务完成：更早');
  });
});

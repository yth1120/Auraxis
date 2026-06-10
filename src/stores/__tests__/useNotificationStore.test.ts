import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../useNotificationStore';

describe('useNotificationStore — 通知', () => {
  beforeEach(() => {
    useNotificationStore.setState({ items: [] });
  });

  it('pushes notifications newest-first with id/timestamp and unread', () => {
    useNotificationStore.getState().push({ kind: 'agent', title: '任务完成：A', agentId: 'a1' });
    useNotificationStore.getState().push({ kind: 'cron', title: '定时任务完成：B' });
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain('B');
    expect(items[0].read).toBe(false);
    expect(items[0].id).toBeTruthy();
    expect(items.filter((i) => !i.read).length).toBe(2);
  });

  it('markRead / markAllRead / remove / clear behave', () => {
    const s = useNotificationStore.getState();
    s.push({ kind: 'agent', title: 'A' });
    s.push({ kind: 'agent', title: 'B' });
    const [first] = useNotificationStore.getState().items;
    s.markRead(first.id);
    expect(useNotificationStore.getState().items.filter((i) => !i.read).length).toBe(1);
    s.markAllRead();
    expect(useNotificationStore.getState().items.filter((i) => !i.read).length).toBe(0);
    s.remove(first.id);
    expect(useNotificationStore.getState().items).toHaveLength(1);
    s.clear();
    expect(useNotificationStore.getState().items).toHaveLength(0);
  });
});

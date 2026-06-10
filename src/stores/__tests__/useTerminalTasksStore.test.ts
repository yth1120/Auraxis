// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTerminalTasksStore } from '../useTerminalTasksStore';

const taskA = { id: 't1', command: 'npm test', status: 'running' as const, startedAt: 1 };

describe('useTerminalTasksStore — 终端任务列表', () => {
  beforeEach(() => {
    useTerminalTasksStore.setState({ tasks: [] });
  });

  it('subscribe 拉取初始快照并订阅广播，返回退订函数', async () => {
    const unsubscribe = vi.fn(() => {});
    const onTasksChanged = vi.fn(() => unsubscribe);
    (window as any).electronAPI = {
      terminal: {
        onTasksChanged,
        listTasks: vi.fn(async () => ({ ok: true, data: [taskA] })),
        stopTask: vi.fn(),
        clearTasks: vi.fn(),
      },
    };

    const stop = useTerminalTasksStore.getState().subscribe();
    await Promise.resolve();
    expect(onTasksChanged).toHaveBeenCalledTimes(1);
    expect(useTerminalTasksStore.getState().tasks).toEqual([taskA]);

    const cb = (onTasksChanged.mock.calls[0] as any)[0];
    cb([{ ...taskA, id: 't2' }]);
    expect(useTerminalTasksStore.getState().tasks[0].id).toBe('t2');

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('没有 terminal API 时 subscribe/stopTask/clearTasks 安全降级', async () => {
    (window as any).electronAPI = {};
    expect(useTerminalTasksStore.getState().subscribe()).toBeInstanceOf(Function);
    await expect(useTerminalTasksStore.getState().stopTask('x')).resolves.toBeUndefined();
    await expect(useTerminalTasksStore.getState().clearTasks()).resolves.toBeUndefined();
  });

  it('stopTask / clearTasks 转发到主进程', async () => {
    const stopTask = vi.fn(async () => {});
    const clearTasks = vi.fn(async () => {});
    (window as any).electronAPI = {
      terminal: { onTasksChanged: vi.fn(() => () => {}), listTasks: vi.fn(), stopTask, clearTasks },
    };
    await useTerminalTasksStore.getState().stopTask('t1');
    await useTerminalTasksStore.getState().clearTasks();
    expect(stopTask).toHaveBeenCalledWith('t1');
    expect(clearTasks).toHaveBeenCalledTimes(1);
  });
});

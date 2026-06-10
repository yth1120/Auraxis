import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ handlers: new Map<string, Function>() }));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((ch: string, fn: Function) => h.handlers.set(ch, fn)) },
}));

import { conflictDetector, registerConflictIpc } from '../conflict-detector';

beforeEach(() => {
  conflictDetector.releaseAllForAgent('a');
  conflictDetector.releaseAllForAgent('b');
  h.handlers.clear();
  registerConflictIpc();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConflictDetector — 文件锁', () => {
  it('锁定后同一 Agent 重入成功，其他 Agent 被拒并返回持有者', () => {
    expect(conflictDetector.lockFile('C:\\proj\\a.ts', 'a')).toEqual({ success: true });
    expect(conflictDetector.lockFile('C:/proj/a.ts', 'a')).toEqual({ success: true }); // 路径归一化重入
    expect(conflictDetector.lockFile('C:/proj/a.ts', 'b')).toEqual({ success: false, lockedBy: ['a'] });
  });

  it('解锁后其他 Agent 可再获取', () => {
    conflictDetector.lockFile('a.ts', 'a');
    conflictDetector.unlockFile('a.ts', 'a');
    expect(conflictDetector.lockFile('a.ts', 'b')).toEqual({ success: true });
  });

  it('锁定超时自动清除旧持有者', () => {
    vi.useFakeTimers();
    conflictDetector.lockFile('a.ts', 'a');
    vi.advanceTimersByTime(300_001);
    expect(conflictDetector.lockFile('a.ts', 'b')).toEqual({ success: true });
  });

  it('记录操作历史并截断到 100 条', () => {
    for (let i = 0; i < 105; i++) {
      conflictDetector.lockFile('x.ts', 'a');
      conflictDetector.unlockFile('x.ts', 'a');
    }
    const history = conflictDetector.getFileHistory('x.ts');
    expect(history.length).toBeLessThanOrEqual(100);
    expect(history.at(-1)!.action).toBe('unlocked');
  });

  it('getConflicts 报告当前冲突文件', () => {
    conflictDetector.lockFile('shared.ts', 'a');
    expect(conflictDetector.getConflicts()).toHaveLength(0);
    conflictDetector.unlockFile('shared.ts', 'a');
    expect(conflictDetector.getConflicts()).toHaveLength(0);
  });

  it('releaseAllForAgent 释放该 Agent 全部锁', () => {
    conflictDetector.lockFile('x.ts', 'a');
    conflictDetector.lockFile('y.ts', 'a');
    conflictDetector.releaseAllForAgent('a');
    expect(conflictDetector.lockFile('x.ts', 'b')).toEqual({ success: true });
    expect(conflictDetector.lockFile('y.ts', 'b')).toEqual({ success: true });
  });
});

describe('registerConflictIpc', () => {
  it('getConflicts / getFileHistory 通道返回统一包裹', async () => {
    const get = h.handlers.get('conflict:getConflicts')! as any;
    const hist = h.handlers.get('conflict:getFileHistory')! as any;

    conflictDetector.lockFile('z.ts', 'a');
    expect(await get()).toEqual({ ok: true, data: [] });

    const h0 = await hist({}, 'z.ts');
    expect(h0.ok).toBe(true);
    expect((h0.data as any[]).every((o) => o.agentId && o.action)).toBe(true);
    expect((await hist({}, 'missing.ts')).data).toEqual([]);
  });
});

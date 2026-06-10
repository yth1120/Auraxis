import { describe, it, expect, beforeEach, vi } from 'vitest';

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));

vi.mock('electron', () => ({
  app: { getAppPath: () => 'C:/fake-app' },
  ipcMain: { handle: handleMock },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { registerCoverageIpc } from '../coverage-handlers';

function getHandler(): (args?: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const entry = handleMock.mock.calls.find((c) => c[0] === 'coverage:get');
  if (!entry) throw new Error('coverage:get handler not registered');
  return entry[1] as () => Promise<{ ok: boolean; data?: unknown; error?: string }>;
}

describe('coverage-handlers — 覆盖率报告 IPC', () => {
  beforeEach(() => {
    handleMock.mockReset();
    (readFile as any).mockReset();
  });

  it('注册 coverage:get 处理器', () => {
    registerCoverageIpc();
    expect(handleMock).toHaveBeenCalledWith('coverage:get', expect.any(Function));
  });

  it('报告存在时返回解析后的 JSON 摘要', async () => {
    (readFile as any).mockResolvedValue(JSON.stringify({ total: { lines: { pct: 86.08 } } }));
    registerCoverageIpc();
    const res = await getHandler()();
    expect(res.ok).toBe(true);
    expect((res.data as any).total.lines.pct).toBe(86.08);
  });

  it('所有候选位置都读不到时返回 not-found', async () => {
    (readFile as any).mockRejectedValue(new Error('ENOENT'));
    registerCoverageIpc();
    const res = await getHandler()();
    expect(res).toEqual({ ok: false, error: 'not-found' });
  });
});

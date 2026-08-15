import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ handlers: new Map<string, Function>() }));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((ch: string, fn: Function) => h.handlers.set(ch, fn)) },
}));
vi.mock('../memory-db', () => ({
  addMemory: vi.fn(),
  getMemoriesByProject: vi.fn(() => []),
  getMemoriesByType: vi.fn(() => []),
  searchMemories: vi.fn(() => []),
  updateMemory: vi.fn(),
  archiveMemory: vi.fn(),
  getActiveMemories: vi.fn(() => []),
  deleteMemory: vi.fn(),
}));
vi.mock('../memory-extractor', () => ({
  extractMemories: vi.fn(async () => []),
}));
vi.mock('../model-config', () => ({
  resolveApiBase: vi.fn(() => 'https://api.example/v1/chat/completions'),
}));
vi.mock('../settings-store', () => ({
  readSettings: vi.fn(async () => ({})),
}));

import { registerMemoryIpc } from '../memory-ipc';
import {
  addMemory, getActiveMemories, getMemoriesByType, searchMemories,
  archiveMemory, deleteMemory,
} from '../memory-db';
import { extractMemories } from '../memory-extractor';
import { readSettings } from '../settings-store';

const handler = (ch: string) => h.handlers.get(ch)! as any;

beforeEach(() => {
  h.handlers.clear();
  vi.clearAllMocks();
  vi.mocked(getActiveMemories).mockReturnValue([]);
  vi.mocked(getMemoriesByType).mockReturnValue([]);
  vi.mocked(searchMemories).mockReturnValue([]);
  vi.mocked(extractMemories).mockResolvedValue([]);
  vi.mocked(readSettings).mockResolvedValue({});
  delete process.env.DEEPSEEK_API_KEY;
  registerMemoryIpc();
});

describe('registerMemoryIpc — 提取与查询', () => {
  it('未配置 Key 时静默返回空', async () => {
    const r = await handler('memory:extract')({}, { projectPath: 'C:/proj', sessionId: 's', messages: [] });
    expect(r).toEqual({ ok: true, data: [] });
    expect(extractMemories).not.toHaveBeenCalled();
  });

  it('有 Key 时提取并持久化记忆', async () => {
    vi.mocked(readSettings).mockResolvedValue({ defaultModel: 'deepseek-v4-pro', deepseekApiKey: 'sk' });
    vi.mocked(extractMemories).mockResolvedValue([
      { type: 'decision', title: 'T', content: 'C', tags: ['react'], importance: 4 },
    ]);
    vi.mocked(getActiveMemories).mockReturnValue([
      { id: 'e1', title: 'old', content: 'c', type: 'decision', tags: '["x"]', importance: 2 } as any,
    ]);

    const r = await handler('memory:extract')({}, { projectPath: 'C:/proj', sessionId: 's', messages: [] });
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ project_path: 'C:/proj', type: 'decision', tags: '["react"]' });
    expect(addMemory).toHaveBeenCalledTimes(1);
    expect(extractMemories).toHaveBeenCalledWith(
      expect.objectContaining({ existingMemories: [expect.objectContaining({ tags: ['x'] })] }),
      expect.objectContaining({ apiKey: 'sk' }),
    );
  });

  it('环境变量 Key 优先于设置', async () => {
    process.env.DEEPSEEK_API_KEY = 'env-key';
    vi.mocked(readSettings).mockResolvedValue({ defaultModel: 'deepseek-v4-pro', deepseekApiKey: 'settings-key' });
    await handler('memory:extract')({}, { projectPath: 'C:/proj', sessionId: 's', messages: [] });
    expect(extractMemories).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apiKey: 'env-key' }));
  });

  it('提取异常包装为失败响应', async () => {
    vi.mocked(readSettings).mockResolvedValue({ deepseekApiKey: 'sk' });
    vi.mocked(extractMemories).mockRejectedValueOnce(new Error('boom'));
    expect(await handler('memory:extract')({}, { projectPath: 'C:/proj', sessionId: 's', messages: [] })).toEqual({
      ok: false,
      error: 'boom',
    });
  });
});

describe('registerMemoryIpc — 查询与维护通道', () => {
  it('getByProject / getByType / search 返回数据', async () => {
    vi.mocked(getActiveMemories).mockReturnValue([{ id: 'm1' } as any]);
    vi.mocked(getMemoriesByType).mockReturnValue([{ id: 'm2' } as any]);
    vi.mocked(searchMemories).mockReturnValue([{ id: 'm3' } as any]);

    expect(await handler('memory:getByProject')({}, 'C:/proj')).toEqual({ ok: true, data: [{ id: 'm1' }] });
    expect(await handler('memory:getByType')({}, 'C:/proj', 'decision')).toEqual({ ok: true, data: [{ id: 'm2' }] });
    expect(await handler('memory:search')({}, 'C:/proj', 'react')).toEqual({ ok: true, data: [{ id: 'm3' }] });
    expect(searchMemories).toHaveBeenCalledWith('C:/proj', 'react');
  });

  it('archive / delete 通道', async () => {
    expect(await handler('memory:archive')({}, 'm1')).toEqual({ ok: true });
    expect(archiveMemory).toHaveBeenCalledWith('m1');
    expect(await handler('memory:delete')({}, 'm2')).toEqual({ ok: true });
    expect(deleteMemory).toHaveBeenCalledWith('m2');
  });

  it('查询异常包装为失败响应', async () => {
    vi.mocked(getActiveMemories).mockImplementationOnce(() => {
      throw new Error('db down');
    });
    expect(await handler('memory:getByProject')({}, 'C:/proj')).toEqual({ ok: false, error: 'db down' });
  });
});

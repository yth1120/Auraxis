import { describe, it, expect, vi, beforeEach } from 'vitest';

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  app: { getPath: vi.fn(() => '/tmp/auraxis-userdata') },
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMock.handle },
  app: electronMock.app,
}));

vi.mock('../../auth-store', () => ({
  getAuthStatus: vi.fn(async () => ({ phase: 'unlocked', name: 'A', email: 'a@b.com', rememberMe: true })),
  setupAccount: vi.fn(async () => ({ ok: true })),
  loginAccount: vi.fn(async () => ({ ok: true })),
  logoutAccount: vi.fn(async () => {}),
  changeAccountPassword: vi.fn(async () => ({ ok: true })),
  setAccountAvatar: vi.fn(async () => ({ ok: true })),
  changeAccountName: vi.fn(async (params: { name?: string }) =>
    params?.name?.trim() ? { ok: true } : { ok: false, error: '账户名不能为空' }),
}));

import { registerAuthHandlers } from '../auth-handlers';
import { changeAccountName } from '../../auth-store';

type Handler = (event: unknown, ...args: unknown[]) => Promise<any>;

function capture(): Map<string, Handler> {
  electronMock.handle.mockClear();
  registerAuthHandlers();
  const map = new Map<string, Handler>();
  for (const [channel, fn] of electronMock.handle.mock.calls) {
    map.set(channel as string, fn as Handler);
  }
  return map;
}

describe('auth-handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auth:changeName 委托 changeAccountName 并返回结果', async () => {
    const h = capture();
    const r = await h.get('auth:changeName')!({}, { name: '新名字' });
    expect(r).toEqual({ ok: true });
    expect(changeAccountName).toHaveBeenCalledWith({ name: '新名字' });
  });

  it('auth:changeName 空参数返回友好错误', async () => {
    const h = capture();
    const r = await h.get('auth:changeName')!({}, undefined);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('不能为空');
  });
});

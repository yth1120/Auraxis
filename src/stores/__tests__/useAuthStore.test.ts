import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../useAuthStore';

const electronApi = {
  auth: {
    status: vi.fn(async () => ({
      ok: true,
      data: { phase: 'unlocked', name: 'A', email: 'a@b.com', avatar: '', rememberMe: true },
    })),
    changeName: vi.fn(async (name: string): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
  },
};

describe('useAuthStore — 账户名修改', () => {
  beforeEach(() => {
    (globalThis as any).window = { electronAPI: electronApi };
    vi.clearAllMocks();
    useAuthStore.setState({
      ready: false,
      phase: 'locked',
      name: '',
      email: '',
      avatar: '',
      rememberMe: false,
      notice: '',
    });
  });

  it('changeName 成功时 trim 并同步 name', async () => {
    const res = await useAuthStore.getState().changeName('  新名字  ');
    expect(res.ok).toBe(true);
    expect(useAuthStore.getState().name).toBe('新名字');
    expect(electronApi.auth.changeName).toHaveBeenCalledWith('  新名字  ');
  });

  it('changeName 失败时保留原名', async () => {
    vi.mocked(electronApi.auth.changeName).mockResolvedValueOnce({ ok: false, error: '账户名不能为空' });
    const res = await useAuthStore.getState().changeName('B');
    expect(res.ok).toBe(false);
    expect(useAuthStore.getState().name).toBe('');
  });
});

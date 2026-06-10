// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import InlinePermissionCard from '../InlinePermissionCard';
import type { PermissionRequest } from '@/types/advanced';

const request: PermissionRequest = {
  requestId: 'perm-1',
  toolName: 'Bash',
  input: { command: 'npm test' },
  message: '执行命令: npm test',
  timestamp: Date.now(),
  mode: 'ask',
};

describe('InlinePermissionCard — 权限审批按钮组', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      permission: { respond: vi.fn(async () => ({ ok: true })) },
    };
  });

  it('renders allow/deny buttons for a Bash request', () => {
    const { container } = render(<InlinePermissionCard request={request} onResolved={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('Bash');
  });

  it('approving responds true and resolves', async () => {
    const onResolved = vi.fn();
    const { container } = render(<InlinePermissionCard request={request} onResolved={onResolved} />);
    const buttons = [...container.querySelectorAll('button')];
    // 第一个动作按钮是允许
    fireEvent.click(buttons.find((b) => /允许|允许一次/.test(b.textContent ?? '')) ?? buttons[0]);
    await act(async () => {});
    expect((window as any).electronAPI.permission.respond).toHaveBeenCalledWith('perm-1', true);
    expect(onResolved).toHaveBeenCalled();
  });
});

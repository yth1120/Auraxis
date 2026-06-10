// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../SettingsModal';

describe('SettingsModal — 设置面板按钮', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      system: { getVersion: vi.fn(async () => ({ ok: true, data: '1.0.0' })) },
      credentials: { describe: vi.fn(async () => ({ ok: true, data: { configured: false } })) },
    };
  });

  it('opens with the general pane and closes', () => {
    const onClose = vi.fn();
    render(<SettingsModal open onClose={onClose} initialKey="general" />);
    expect(document.body.textContent).toContain('设置');
    const close = document.querySelector('.ant-modal-close') as HTMLElement;
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });

  it('expands 高级 and switches to the cost pane', async () => {
    const { getByText } = render(<SettingsModal open onClose={() => {}} initialKey="general" />);
    fireEvent.click(getByText('高级'));
    fireEvent.click(getByText('成本'));
    await waitFor(() => {
      expect(getByText('输入价格')).toBeTruthy();
    });
  });
});

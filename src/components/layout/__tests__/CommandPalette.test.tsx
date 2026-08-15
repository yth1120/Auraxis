// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import CommandPalette from '../CommandPalette';

describe('CommandPalette — Esc 关闭', () => {
  beforeEach(() => {
    cleanup();
  });

  it('打开时按 Esc 立即关闭，无需等待输入框聚焦', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('关闭状态下按 Esc 不触发关闭', () => {
    const onClose = vi.fn();
    render(<CommandPalette open={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

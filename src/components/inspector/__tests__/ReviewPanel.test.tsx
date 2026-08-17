// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ReviewPanel from '../ReviewPanel';

describe('ReviewPanel — 审查面板按钮', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      diff: { list: vi.fn(async () => ({ ok: true, data: [] })) },
    };
  });

  it('renders review action buttons', () => {
    const { container } = render(<ReviewPanel />);
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(3);
  });
});

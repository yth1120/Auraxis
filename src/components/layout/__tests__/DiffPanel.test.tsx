// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import DiffPanel from '../DiffPanel';

describe('DiffPanel — 变更面板按钮', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      diff: { list: vi.fn(async () => ({ ok: true, data: [] })) },
    };
  });

  it('renders diff action buttons', () => {
    const { container } = render(<DiffPanel tabId="t1" />);
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
  });
});

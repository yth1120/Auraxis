// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ScheduledPanel from '../ScheduledPanel';

describe('ScheduledPanel — 定时任务面板按钮', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      cron: {
        list: vi.fn(async () => ({ ok: true, data: [] })),
      },
      schedule: {
        list: vi.fn(async () => ({ ok: true, data: [] })),
      },
    };
  });

  it('renders with at least one control button', () => {
    const { container } = render(<ScheduledPanel />);
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

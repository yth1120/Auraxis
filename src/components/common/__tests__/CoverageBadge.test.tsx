// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoverageBadge from '../CoverageBadge';

const summary = {
  total: {
    lines: { total: 1200, covered: 1032, skipped: 0, pct: 86 },
    statements: { total: 1500, covered: 1260, skipped: 0, pct: 84 },
    branches: { total: 400, covered: 300, skipped: 0, pct: 75 },
    functions: { total: 200, covered: 170, skipped: 0, pct: 85 },
  },
  'electron/ipc/agent-scheduler.ts': {
    lines: { total: 200, covered: 180, skipped: 0, pct: 90 },
  },
  'src/stores/useChatStore.ts': {
    lines: { total: 100, covered: 60, skipped: 0, pct: 60 },
  },
};

describe('CoverageBadge — 测试覆盖率面板', () => {
  const originalAPI = (window as any).electronAPI;

  beforeEach(() => {
    (window as any).electronAPI = {
      coverage: { get: vi.fn() },
    };
  });

  afterEach(() => {
    if (originalAPI === undefined) {
      delete (window as any).electronAPI;
    } else {
      (window as any).electronAPI = originalAPI;
    }
  });

  it('展示真实覆盖率报告（行/语句/分支/函数与模块明细）', async () => {
    (window as any).electronAPI.coverage.get.mockResolvedValue({ ok: true, data: summary });
    const { container } = render(<CoverageBadge />);
    expect((await screen.findAllByText('86%')).length).toBeGreaterThan(0);
    expect(container.textContent).toContain('84%');
    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('85%');
    expect(container.textContent).toContain('electron/ipc/agent-scheduler.ts');
    expect(container.textContent).toContain('1032/1200');
  });

  it('报告不存在时显示引导提示而不是伪造数字', async () => {
    (window as any).electronAPI.coverage.get.mockResolvedValue({ ok: false, error: 'not-found' });
    const { container } = render(<CoverageBadge />);
    expect(await screen.findByText(/尚未生成覆盖率报告/)).toBeTruthy();
    expect(container.textContent).toContain('npm run test:coverage');
    expect(container.textContent).not.toContain('70.4');
  });
});

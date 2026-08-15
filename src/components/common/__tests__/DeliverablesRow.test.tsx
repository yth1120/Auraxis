// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import DeliverablesRow from '../DeliverablesRow';
import { useAppStore } from '@/stores/useAppStore';

describe('DeliverablesRow — 产物行', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      shell: { openPath: vi.fn().mockResolvedValue({ ok: true }) },
    };
    useAppStore.setState({ openFileRequest: null });
  });

  it('renders nothing for an empty file list', () => {
    const { container } = render(<DeliverablesRow files={[]} />);
    expect(container.textContent ?? '').toBe('');
  });

  it('dedupes paths and opens a chip in the file panel', () => {
    const { container, getByRole } = render(
      <DeliverablesRow files={['C:/proj/a/b.ts', 'C:/proj/a/b.ts', 'C:/proj/a/c.ts']} />,
    );
    expect(container.textContent).toContain('产物');
    expect(container.textContent).toContain('b.ts');
    expect(container.textContent).toContain('c.ts');

    fireEvent.click(getByRole('button', { name: '在面板中打开 b.ts' }));
    expect(useAppStore.getState().openFileRequest?.path).toBe('C:/proj/a/b.ts');
    expect((window as any).electronAPI.shell.openPath).not.toHaveBeenCalled();
  });

  it('opens a chip with the OS through the external action', async () => {
    const { getByRole } = render(<DeliverablesRow files={['C:/proj/a/b.ts']} />);
    fireEvent.click(getByRole('button', { name: '用系统默认应用打开 b.ts' }));
    await waitFor(() => {
      expect((window as any).electronAPI.shell.openPath).toHaveBeenCalledWith('C:/proj/a/b.ts');
    });
  });

  it('caps chips at 8 and shows +N', () => {
    const files = Array.from({ length: 10 }, (_, i) => `C:/proj/f${i}.ts`);
    const { container } = render(<DeliverablesRow files={files} />);
    expect(container.querySelectorAll('button[aria-label^="在面板中打开"]')).toHaveLength(8);
    expect(container.textContent).toContain('+2');
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import MemoryPanel from '../MemoryPanel';
import { useMemoryStore } from '@/stores/useMemoryStore';

describe('MemoryPanel — 记忆面板按钮', () => {
  beforeEach(() => {
    useMemoryStore.setState({ beliefs: [], evidences: [], selectedType: null, loading: false } as any);
    (window as any).electronAPI = {
      memory: {
        getByProject: vi.fn(async () => ({ ok: true, data: [] })),
        search: vi.fn(async () => ({ ok: true, data: [] })),
      },
    };
  });

  it('renders at least one control button', () => {
    const { container } = render(<MemoryPanel />);
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});

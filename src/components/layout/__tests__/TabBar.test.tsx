// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TabBar from '../TabBar';
import { useAppStore } from '@/stores/useAppStore';

describe('TabBar — 工作台标签按钮', () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [
        { id: 't1', type: 'chat', label: '对话1', metadata: {} },
        { id: 't2', type: 'diff', label: '变更', metadata: {}, isDirty: true },
      ],
      activeTabId: 't1',
    });
  });

  it('renders tabs and switches the active tab', () => {
    const { getByText } = render(<TabBar />);
    fireEvent.click(getByText('变更'));
    expect(useAppStore.getState().activeTabId).toBe('t2');
  });

  it('closes a tab through its close button', () => {
    const { container } = render(<TabBar />);
    const close = container.querySelector('[aria-label="remove"]') as HTMLElement;
    fireEvent.click(close);
    expect(useAppStore.getState().tabs).toHaveLength(1);
  });
});

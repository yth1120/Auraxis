// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import WorkbenchActionsButton from '../WorkbenchActionsButton';
import { useAppStore } from '@/stores/useAppStore';

describe('WorkbenchActionsButton — 右侧面板开关', () => {
  beforeEach(() => {
    useAppStore.setState({ showRightPanel: false, rightPanelView: 'none' });
  });

  it('opens the execution panel when hidden', () => {
    const { getByRole } = render(<WorkbenchActionsButton />);
    fireEvent.click(getByRole('button'));
    const s = useAppStore.getState();
    expect(s.showRightPanel).toBe(true);
    expect(s.rightPanelView).toBe('inspector');
  });

  it('hides the panel when already open', () => {
    useAppStore.setState({ showRightPanel: true, rightPanelView: 'inspector' });
    const { getByRole } = render(<WorkbenchActionsButton />);
    fireEvent.click(getByRole('button'));
    expect(useAppStore.getState().showRightPanel).toBe(false);
  });
});

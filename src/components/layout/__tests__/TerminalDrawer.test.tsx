// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TerminalDrawer from '../TerminalDrawer';

describe('TerminalDrawer — 底部终端抽屉', () => {
  it('renders the grabber and terminal surface', () => {
    const { getByLabelText, container } = render(
      <TerminalDrawer height={300} onChange={() => {}} onClose={() => {}} />,
    );
    expect(getByLabelText('拖动调整终端高度')).toBeTruthy();
    expect(container.textContent).toContain('集成终端');
  });

  it('drags to change height with clamping', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <TerminalDrawer height={300} onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.pointerDown(getByLabelText('拖动调整终端高度'), { clientY: 500 });
    fireEvent.pointerMove(window, { clientY: 200 });
    fireEvent.pointerUp(window);
    // 300 + (500 - 200) = 600 → clamped to 560
    expect(onChange).toHaveBeenCalledWith(560);
  });
});

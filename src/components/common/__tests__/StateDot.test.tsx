// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import StateDot from '../StateDot';

describe('StateDot — 状态指示', () => {
  it('renders halo dots for settled states', () => {
    const { container } = render(
      <>
        <StateDot state="done" />
        <StateDot state="error" />
      </>,
    );
    expect(container.querySelectorAll('.ax-state-dot').length).toBe(2);
    expect(container.querySelector('.ax-state-dot[data-state="error"]')).toBeTruthy();
    expect(container.querySelector('.ax-state-dot[data-state="done"]')).toBeTruthy();
  });

  it('renders the 8-cell pixel chase for the ongoing state', () => {
    const { container } = render(<StateDot state="ongoing" />);
    const svg = container.querySelector('svg.ax-state-dot-matrix');
    expect(svg).toBeTruthy();
    expect(svg!.querySelectorAll('rect').length).toBe(8);
  });
});

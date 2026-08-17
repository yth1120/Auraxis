// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ExecutingIndicator from '../ExecutingIndicator';

describe('ExecutingIndicator — 执行中指示', () => {
  it('renders an image indicator', () => {
    const { container } = render(<ExecutingIndicator size={14} />);
    expect(container.querySelector('img')).toBeTruthy();
  });
});

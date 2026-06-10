// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GhostToast from '../GhostToast';

describe('GhostToast — 幽灵提示', () => {
  it('renders the message when visible', () => {
    const { getByText } = render(<GhostToast message="已复制" visible />);
    expect(getByText('已复制')).toBeTruthy();
  });
});

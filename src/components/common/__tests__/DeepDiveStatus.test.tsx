// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DeepDiveStatus from '../DeepDiveStatus';

describe('DeepDiveStatus — 执行中状态', () => {
  it('renders the executing label', () => {
    const { getByText } = render(<DeepDiveStatus />);
    expect(getByText('正在执行…')).toBeTruthy();
  });
});

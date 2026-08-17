// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import CodeBlock from '../CodeBlock';

describe('CodeBlock — 代码块按钮', () => {
  beforeEach(() => {
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
  });

  it('renders code and a copy button', () => {
    const { getByText } = render(<CodeBlock language="typescript" code="const a = 1;" />);
    expect(getByText('const a = 1;')).toBeTruthy();
    fireEvent.click(getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const a = 1;');
  });
});

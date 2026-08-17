// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AgentReadCard } from '../AgentToolCards';

describe('AgentToolCards — Agent 工具卡片按钮', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
  });

  it('renders content and a copy button', () => {
    const { getByText, container } = render(<AgentReadCard label="读取" content="hello" />);
    expect(getByText('hello')).toBeTruthy();
    const btn = container.querySelector('button');
    fireEvent.click(btn!);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

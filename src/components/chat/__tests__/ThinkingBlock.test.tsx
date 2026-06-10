// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThinkingBlock from '../ThinkingBlock';

const blocks = [{ content: 'Analyzing the problem...' }, { content: 'Found a solution.' }];

describe('ThinkingBlock — 折叠 + 流式摘要', () => {
  it('starts collapsed with the stable first-line summary when settled', () => {
    render(<ThinkingBlock blocks={blocks} isStreaming={false} />);
    expect(screen.getByText('Analyzing the problem...')).toBeTruthy();
    expect(document.querySelector('.ax-thinking-body')).toBeNull();
  });

  it('follows the latest line as the moving summary while streaming', () => {
    render(<ThinkingBlock blocks={blocks} isStreaming={true} />);
    expect(screen.getByText('Found a solution.')).toBeTruthy();
    expect(screen.queryByText('Analyzing the problem...')).toBeNull();
    expect(document.querySelector('.ax-thinking-body')).toBeNull();
  });

  it('expands to the full reasoning while streaming', () => {
    render(<ThinkingBlock blocks={blocks} isStreaming={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(document.querySelector('.ax-thinking-body')).toBeTruthy();
    expect(screen.getAllByText(/Analyzing the problem\.\.\./).length).toBeGreaterThan(0);
  });

  it('auto-collapses after streaming ends unless pinned open', () => {
    const { rerender } = render(<ThinkingBlock blocks={blocks} isStreaming={true} />);
    rerender(<ThinkingBlock blocks={blocks} isStreaming={false} />);
    expect(document.querySelector('.ax-thinking-body')).toBeNull();
  });

  it('keeps the row open after settle when the user expanded during streaming', () => {
    const { rerender } = render(<ThinkingBlock blocks={blocks} isStreaming={true} />);
    fireEvent.click(screen.getByRole('button'));
    rerender(<ThinkingBlock blocks={blocks} isStreaming={false} />);
    expect(document.querySelector('.ax-thinking-body')).toBeTruthy();
  });
});

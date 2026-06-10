// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import CompactionRow from '../CompactionRow';

const data = { tokensBefore: 12_000, tokensAfter: 5_000, messagesRemoved: 40, tokensSaved: 7_000 };

describe('CompactionRow — 压缩检查点行', () => {
  it('renders a folded marker with replaced count and token estimate', () => {
    const { container } = render(<CompactionRow data={data} />);
    const text = container.textContent ?? '';
    expect(text).toContain('上下文已压缩');
    expect(text).toContain('替换 40 条');
    expect(text).toContain('释放 ~7,000 tokens');
    expect(text).toContain('12K → 5K');
    expect(text).not.toContain('替换历史记录：40 条');
  });

  it('expands detail lines on click', () => {
    const { container } = render(<CompactionRow data={data} />);
    fireEvent.click(container.querySelector('button')!);
    const text = container.textContent ?? '';
    expect(text).toContain('替换历史记录：40 条');
    expect(text).toContain('上下文：12,000 → 5,000 tokens');
    expect(text).toContain('不删除上方 transcript');
  });

  it('falls back to the before-after delta when tokensSaved is missing', () => {
    const { container } = render(<CompactionRow data={{ tokensBefore: 10_000, tokensAfter: 6_000 }} />);
    expect(container.textContent).toContain('释放 ~4,000 tokens');
  });
});

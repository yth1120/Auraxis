import { describe, it, expect } from 'vitest';
import { thinkingSummary, truncateLine } from '../thinking';

describe('thinkingSummary — Think 行流式摘要', () => {
  it('follows the latest non-empty line while streaming', () => {
    expect(thinkingSummary('先读代码\n再改文件\n最后跑测试', true)).toBe('最后跑测试');
  });

  it('restores the stable first line once settled', () => {
    expect(thinkingSummary('先读代码\n再改文件\n最后跑测试', false)).toBe('先读代码');
  });

  it('collapses whitespace and clamps long lines', () => {
    const long = `${'a'.repeat(100)}\n${'b'.repeat(100)}`;
    const s = thinkingSummary(long, true);
    expect(s.length).toBeLessThanOrEqual(72);
    expect(s.endsWith('…')).toBe(true);
    expect(truncateLine('  a  b  ')).toBe('a b');
  });

  it('falls back to the raw content when there are no lines', () => {
    expect(thinkingSummary('   ', true)).toBe('');
    expect(thinkingSummary('x', false)).toBe('x');
  });
});

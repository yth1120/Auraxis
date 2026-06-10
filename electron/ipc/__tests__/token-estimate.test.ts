import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../token-estimate';

describe('estimateTokens — 上下文占用估算', () => {
  it('counts ASCII at ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('counts CJK characters as one token each', () => {
    expect(estimateTokens('你好')).toBe(2);
    expect(estimateTokens('统一的循环')).toBe(5);
  });

  it('mixes CJK and ASCII', () => {
    expect(estimateTokens('你好 world')).toBe(2 + 2);
  });
});

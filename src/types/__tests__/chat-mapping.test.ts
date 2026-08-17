import { describe, it, expect } from 'vitest';
import { mapThinkingLevelToEffort } from '../chat';

describe('mapThinkingLevelToEffort — UI 三档 → DeepSeek API 三档', () => {
  it('轻度→low、中度→high、深度→max', () => {
    expect(mapThinkingLevelToEffort('low')).toBe('low');
    expect(mapThinkingLevelToEffort('medium')).toBe('high');
    expect(mapThinkingLevelToEffort('high')).toBe('max');
  });
});

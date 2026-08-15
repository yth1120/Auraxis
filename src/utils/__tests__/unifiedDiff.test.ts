import { describe, it, expect } from 'vitest';
import { buildUnifiedDiff, countDiffChanges } from '../unifiedDiff';

describe('buildUnifiedDiff — 跟进任务的紧凑 diff', () => {
  it('marks removed / added lines for a simple change', () => {
    const out = buildUnifiedDiff('src/a.ts', 'const x = 1;\n', 'const x = 2;\n', 120);
    expect(out).toContain('--- src/a.ts');
    expect(out).toContain('- const x = 1;');
    expect(out).toContain('+ const x = 2;');
  });

  it('keeps common lines as context', () => {
    const out = buildUnifiedDiff('a.ts', 'line1\nline2\nline3\n', 'line1\nline2 changed\nline3\n', 120);
    expect(out).toContain('  line1');
    expect(out).toContain('- line2');
    expect(out).toContain('+ line2 changed');
    expect(out).toContain('  line3');
  });

  it('truncates huge diffs with a change-count summary', () => {
    const oldLines = Array.from({ length: 200 }, (_, i) => `old ${i}`).join('\n');
    const newLines = Array.from({ length: 200 }, (_, i) => `new ${i}`).join('\n');
    const out = buildUnifiedDiff('big.ts', oldLines, newLines, 40);
    expect(out).toContain('已截断');
    expect(out).toContain('200 增 / 200 删');
    expect(out.split('\n').length).toBeLessThanOrEqual(50);
  });
});

describe('countDiffChanges — 审查 churn 指标', () => {
  it('counts added and removed lines', () => {
    expect(countDiffChanges('a\nb\nc\n', 'a\nx\nc\nd\n')).toEqual({ added: 2, removed: 1 });
  });

  it('returns zeros for identical content', () => {
    expect(countDiffChanges('same\n', 'same\n')).toEqual({ added: 0, removed: 0 });
  });

  it('counts full-file replacement', () => {
    expect(countDiffChanges('old1\nold2\n', 'new1\nnew2\nnew3\n')).toEqual({ added: 3, removed: 2 });
  });
});

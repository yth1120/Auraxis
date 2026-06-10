import { describe, it, expect } from 'vitest';
import { finalResultFromJsonl } from '../fork-runner';

describe('fork-runner — 结果解析', () => {
  it('从 NDJSON 事件流提取最终结果', () => {
    const stream = [
      JSON.stringify({ type: 'step', text: '中间过程' }),
      JSON.stringify({ type: 'result', result: '最终答案' }),
    ].join('\n');
    expect(finalResultFromJsonl(stream)).toBe('最终答案');
  });

  it('无 JSON 结果时回退到尾部文本', () => {
    const stream = 'line1\nline2\nplain final text';
    expect(finalResultFromJsonl(stream)).toBe('line1\nline2\nplain final text');
  });
});

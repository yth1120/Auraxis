import { describe, it, expect } from 'vitest';
import { resolveSessionRefs } from '../sessionRefs';

const sessions = [
  {
    id: 's1',
    title: '重构 step-engine',
    messages: [
      { role: 'user', content: '把循环统一起来' },
      { role: 'assistant', content: '已完成统一循环重构' },
    ],
  },
  { id: 's2', title: '空会话', messages: [] },
];

describe('resolveSessionRefs', () => {
  it('replaces a session token with a quoted summary', () => {
    const { text, refs } = resolveSessionRefs('继续之前的 @session:s1 工作', sessions);
    expect(text).toContain('【会话引用：重构 step-engine】');
    expect(text).toContain('用户：把循环统一起来');
    expect(text).toContain('助手：已完成统一循环重构');
    expect(text).not.toContain('@session:s1');
    expect(refs).toEqual([{ id: 's1', title: '重构 step-engine' }]);
  });

  it('keeps unknown tokens as-is', () => {
    const { text, refs } = resolveSessionRefs('看看 @session:missing 的结论', sessions);
    expect(text).toContain('@session:missing');
    expect(refs).toHaveLength(0);
  });

  it('falls back to the title for sessions without messages', () => {
    const { text } = resolveSessionRefs('引用 @session:s2', sessions);
    expect(text).toContain('【会话引用：空会话】');
    expect(text).toContain('空会话');
  });
});

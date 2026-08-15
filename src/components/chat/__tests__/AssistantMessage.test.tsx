// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import AssistantMessage from '../AssistantMessage';
import type { Message } from '@/types/chat';

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'a1',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('AssistantMessage — AI 输出渲染', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('渲染 Markdown、代码块、列表与时间', () => {
    const { container } = render(
      <AssistantMessage
        message={msg({
          content: '## 完成情况\n\n- 项一\n- 项二\n\n```ts\nconst ok = true;\n```\n\n**加粗**',
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('完成情况');
    expect(text).toContain('const ok = true;');
    expect(text).toContain('加粗');
    expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.ax-message-time')?.textContent?.length).toBeGreaterThan(0);
  });

  it('提取思考块并渲染思考行', () => {
    const { container } = render(
      <AssistantMessage
        message={msg({
          content: '<thinking>这是推理过程</thinking>\n\n最终答案',
          thinkingBlocks: [{ content: '这是推理过程' }],
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('最终答案');
    expect(text).toContain('思考');
    expect(text).toContain('这是推理过程');
  });

  it('流式内容不会重复渲染已完成的段落', () => {
    const { container } = render(
      <AssistantMessage
        message={msg({
          content: '第一段\n\n第二段',
          isStreaming: true,
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('第一段');
    expect(text).toContain('第二段');
    expect(text.split('第一段')).toHaveLength(2);
    expect(text.split('第二段')).toHaveLength(2);
  });
});

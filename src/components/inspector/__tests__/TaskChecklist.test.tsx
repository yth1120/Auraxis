// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TaskChecklist from '../TaskChecklist';
import type { AgentTask } from '@/types/chat';

const tasks: AgentTask[] = [
  { id: '1', title: '读文件', status: 'done', detail: '' },
  { id: '2', title: '改代码', status: 'running', detail: '' },
  { id: '3', title: '跑测试', status: 'pending', detail: '' },
];

describe('TaskChecklist — 计划清单按钮', () => {
  it('renders progress and redo buttons for unfinished tasks', () => {
    const onRedo = vi.fn();
    const { container, getAllByText } = render(<TaskChecklist tasks={tasks} onRedo={onRedo} />);
    expect(container.textContent).toContain('1/3');
    fireEvent.click(getAllByText('重做此步')[0]);
    expect(onRedo).toHaveBeenCalledWith(tasks[1]);
  });

  it('selects a row when onSelect is provided', () => {
    const onSelect = vi.fn();
    const { getByText } = render(<TaskChecklist tasks={tasks} onSelect={onSelect} />);
    fireEvent.click(getByText('跑测试'));
    expect(onSelect).toHaveBeenCalledWith(tasks[2]);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { toolInertia } from '../tool-inertia';

describe('ToolInertiaGraph（AutoTool）', () => {
  beforeEach(() => toolInertia.reset());

  it('登记同批次工具序列并学习转移', () => {
    toolInertia.observeSequence('s1', ['Grep', 'Read', 'Edit']);
    toolInertia.observeSequence('s1', ['Grep', 'Read', 'Edit']);
    const suggestion = toolInertia.suggestNext('s1', ['Grep']);
    expect(suggestion?.tool).toBe('Read');
    expect(suggestion?.probability).toBe(1);
    expect(suggestion?.confidence).toBe('high');
  });

  it('跨批次衔接：上一批最后工具作为下一批起点', () => {
    toolInertia.observeSequence('s1', ['Read']);
    toolInertia.observeSequence('s1', ['Edit', 'Bash']);
    const suggestion = toolInertia.suggestNext('s1', ['Read']);
    expect(suggestion?.from).toBe('Read');
    expect(suggestion?.tool).toBe('Edit');
  });

  it('概率低于阈值时返回 null', () => {
    toolInertia.observeSequence('s1', ['Read', 'Edit']);
    toolInertia.observeSequence('s1', ['Read', 'Bash']);
    // Read → Edit/Bash 各 50%，minProbability=0.8 时无建议
    expect(toolInertia.suggestNext('s1', ['Read'], { minProbability: 0.8 })).toBeNull();
    expect(toolInertia.suggestNext('s1', ['Read'], { minProbability: 0.5 })?.probability).toBe(0.5);
  });

  it('stats 汇总边与概率', () => {
    toolInertia.observeSequence('s1', ['Grep', 'Read']);
    const stats = toolInertia.stats();
    expect(stats.totalTransitions).toBe(1);
    expect(stats.edges[0]).toMatchObject({ from: 'Grep', to: 'Read', count: 1, probability: 1 });
  });

  it('reset 清空指定或全部 scope', () => {
    toolInertia.observeSequence('s1', ['Read', 'Edit']);
    toolInertia.observeSequence('s2', ['Grep', 'Glob']);
    toolInertia.reset('s1');
    expect(toolInertia.suggestNext('s1', ['Read'])).toBeNull();
    expect(toolInertia.suggestNext('s2', ['Grep'])?.tool).toBe('Glob');
    toolInertia.reset();
    expect(toolInertia.stats().totalTransitions).toBe(0);
  });

  it('同名工具连续出现不产生自环', () => {
    toolInertia.observeSequence('s1', ['Read', 'Read', 'Grep']);
    expect(toolInertia.suggestNext('s1', ['Read'])?.tool).toBe('Grep');
    expect(toolInertia.stats('s1').totalTransitions).toBe(1);
  });

  it('不同 scope 的惯性互不串扰', () => {
    toolInertia.observeSequence('s1', ['Read', 'Edit']);
    toolInertia.observeSequence('s2', ['Read', 'Bash']);
    expect(toolInertia.suggestNext('s1', ['Read'])?.tool).toBe('Edit');
    expect(toolInertia.suggestNext('s2', ['Read'])?.tool).toBe('Bash');
  });

  it('空序列不改变状态', () => {
    toolInertia.observeSequence('s1', []);
    expect(toolInertia.stats().totalTransitions).toBe(0);
    expect(toolInertia.suggestNext('s1')).toBeNull();
  });

  it('stats(scope) 只统计该 scope 的边', () => {
    toolInertia.observeSequence('s1', ['Read', 'Edit']);
    toolInertia.observeSequence('s2', ['Read', 'Bash']);
    const stats = toolInertia.stats('s1');
    expect(stats.edges).toHaveLength(1);
    expect(stats.edges[0]).toMatchObject({ from: 'Read', to: 'Edit' });
  });
});

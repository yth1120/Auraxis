import { describe, it, expect, beforeEach } from 'vitest';
import { useInspectorStore, mapTodosToTasks, selectPendingPlan } from '../useInspectorStore';

describe('mapTodosToTasks', () => {
  it('maps todo statuses to task statuses', () => {
    const tasks = mapTodosToTasks([
      { content: '读取代码', status: 'completed', activeForm: '正在读取代码' },
      { content: '修改文件', status: 'in_progress', activeForm: '正在修改文件' },
      { content: '运行测试', status: 'pending', activeForm: '正在运行测试' },
    ]);
    expect(tasks.map((t) => t.status)).toEqual(['done', 'running', 'pending']);
  });

  it('prefers activeForm as the title while running', () => {
    const [t] = mapTodosToTasks([{ content: '修改文件', status: 'in_progress', activeForm: '正在修改文件' }]);
    expect(t.title).toBe('正在修改文件');
  });

  it('uses content as the title when not running', () => {
    const [t] = mapTodosToTasks([{ content: '修改文件', status: 'pending', activeForm: '正在修改文件' }]);
    expect(t.title).toBe('修改文件');
  });

  it('falls back to pending for unknown statuses', () => {
    const [t] = mapTodosToTasks([{ content: 'x', status: 'weird' }]);
    expect(t.status).toBe('pending');
  });

  it('assigns stable ids by index', () => {
    const tasks = mapTodosToTasks([
      { content: 'a', status: 'pending' },
      { content: 'b', status: 'pending' },
    ]);
    expect(tasks.map((t) => t.id)).toEqual(['task-0', 'task-1']);
  });
});

describe('useInspectorStore — plans', () => {
  beforeEach(() => {
    useInspectorStore.setState({ plans: [] });
  });

  it('removePlan removes by id and keeps the rest', () => {
    useInspectorStore.getState().addPlan({ planId: 'p1', steps: [], status: 'pending' });
    useInspectorStore.getState().addPlan({ planId: 'p2', steps: [], status: 'pending' });
    useInspectorStore.getState().removePlan('p1');
    expect(useInspectorStore.getState().plans.map((p) => p.planId)).toEqual(['p2']);
  });

  it('updatePlan patches fields by id', () => {
    useInspectorStore.getState().addPlan({ planId: 'p1', steps: [], status: 'pending' });
    useInspectorStore.getState().updatePlan('p1', { status: 'approved' });
    expect(useInspectorStore.getState().plans[0].status).toBe('approved');
  });
});

describe('selectPendingPlan — 并发任务计划归属', () => {
  const mkPlan = (planId: string, agentId?: string) => ({ planId, steps: [], status: 'pending' as const, agentId });

  it('当前 Agent 有自己的待批计划时，不被其它任务的计划抢占', () => {
    const plans = [mkPlan('p-other', 'agent-b'), mkPlan('p-mine', 'agent-a')];
    expect(selectPendingPlan(plans, 'agent-a')?.planId).toBe('p-mine');
  });

  it('当前 Agent 没有待批计划时，不显示其它任务的计划', () => {
    const plans = [mkPlan('p-other', 'agent-b')];
    expect(selectPendingPlan(plans, 'agent-a')).toBeUndefined();
  });

  it('未选中任务时回退到无主计划，其次第一条', () => {
    const unowned = [mkPlan('p-free', undefined)];
    expect(selectPendingPlan(unowned, null)?.planId).toBe('p-free');
    const owned = [mkPlan('p-a', 'agent-a')];
    expect(selectPendingPlan(owned, null)?.planId).toBe('p-a');
  });

  it('已批准/拒绝的计划不参与待批选择', () => {
    const approved = { planId: 'p-done', steps: [], status: 'approved' as const, agentId: 'agent-a' };
    expect(selectPendingPlan([approved], 'agent-a')).toBeUndefined();
  });
});

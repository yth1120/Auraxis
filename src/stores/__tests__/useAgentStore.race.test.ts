// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAgentStore } from '../useAgentStore';

// Regression: the backend broadcasts agent:updated from inside startAgent and
// that event typically lands BEFORE the agent:start IPC promise resolves —
// onUpdated inserts the agent first, then startAgent's optimistic push added
// a second copy with the same id ("one task shows twice" in the sidebar).

const AGENT_ID = 'agent-race-test-1';

function backendAgentSnapshot() {
  return {
    id: AGENT_ID,
    name: '↳ 测试',
    description: '测试任务',
    type: 'general-purpose',
    status: 'running',
    priority: 'normal',
    startTime: Date.now(),
    iteration: 0,
    maxIterations: 200,
    toolCallCount: 0,
    messagesCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    log: [],
  };
}

describe('useAgentStore — startAgent 竞态去重', () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [], currentAgentId: null, agentPermissions: {} });
  });

  it('agent:updated 先到再 startAgent resolve → 只有一条任务', async () => {
    (window as any).electronAPI = {
      agent: {
        start: vi.fn(async () => {
          // Simulate the backend broadcast landing before the IPC reply:
          // onUpdated's auto-add path has already inserted the agent.
          useAgentStore.setState((s) => ({
            agents: [...s.agents, backendAgentSnapshot() as any],
          }));
          return { ok: true, data: { agentId: AGENT_ID } };
        }),
      },
    };

    const id = await useAgentStore.getState().startAgent(
      {
        name: '↳ 测试',
        description: '内部包装文本',
        displayDescription: '测试任务',
        type: 'general-purpose',
        model: 'deepseek-v4-flash',
      } as any,
      'C:/proj',
    );

    expect(id).toBe(AGENT_ID);
    const matches = useAgentStore.getState().agents.filter((a) => a.id === AGENT_ID);
    expect(matches).toHaveLength(1);
    // The surviving copy is the backend version (clean displayDescription).
    expect(matches[0].description).toBe('测试任务');
  });

  it('事件未先到时 startAgent 正常插入一条', async () => {
    (window as any).electronAPI = {
      agent: { start: vi.fn(async () => ({ ok: true, data: { agentId: AGENT_ID } })) },
    };

    await useAgentStore.getState().startAgent(
      {
        name: '任务',
        description: '描述',
        type: 'general-purpose',
        model: 'deepseek-v4-flash',
      } as any,
      'C:/proj',
    );

    expect(useAgentStore.getState().agents.filter((a) => a.id === AGENT_ID)).toHaveLength(1);
  });
});

describe('useAgentStore — setPlanFile 归属', () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [
        { id: 'agent-a', name: 'A', status: 'running', log: [] } as any,
        { id: 'agent-b', name: 'B', status: 'running', log: [] } as any,
      ],
      currentAgentId: 'agent-a',
    });
  });

  it('未指定 agentId 时挂到当前任务', () => {
    useAgentStore.getState().setPlanFile('C:/plans/a.md');
    expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-a')?.planFile).toBe('C:/plans/a.md');
    expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-b')?.planFile).toBeUndefined();
  });

  it('指定 agentId 时挂到对应任务，而不是当前任务', () => {
    useAgentStore.getState().setPlanFile('C:/plans/b.md', 'agent-b');
    expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-b')?.planFile).toBe('C:/plans/b.md');
    expect(useAgentStore.getState().agents.find((a) => a.id === 'agent-a')?.planFile).toBeUndefined();
  });
});

describe('useAgentStore — 删除任务防复活', () => {
  beforeEach(() => {
    useAgentStore.setState({ agents: [], currentAgentId: null, agentPermissions: {} });
  });

  it('删除后迟到的 agent:updated 不会把任务加回来', async () => {
    let emit: ((a: any) => void) | null = null;
    (window as any).electronAPI = {
      agent: {
        onUpdated: (cb: any) => {
          emit = cb;
          return () => {};
        },
        remove: vi.fn(async () => ({ ok: true })),
        schedulerRemove: vi.fn(async () => ({ ok: true })),
      },
    };
    useAgentStore.getState().subscribeToUpdates();

    useAgentStore.setState({ agents: [backendAgentSnapshot() as any] });
    await useAgentStore.getState().removeAgent(AGENT_ID);
    expect(useAgentStore.getState().agents).toHaveLength(0);

    // Simulate a terminal broadcast that was already in flight when the user
    // clicked delete — the tombstone guard must swallow it.
    emit!({ ...backendAgentSnapshot(), status: 'completed' });
    expect(useAgentStore.getState().agents).toHaveLength(0);
  });
});

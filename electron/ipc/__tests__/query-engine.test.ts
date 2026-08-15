import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * query-engine.ts — unified ReAct driver tests. runStep is mocked so the
 * driver's own responsibilities (mode normalisation, AGENTS.md injection,
 * turn lifecycle, safety cap, error mapping, permission/tool-result hooks)
 * are what gets measured.
 */

vi.mock('../engine-events', () => ({
  makeTurnId: vi.fn(() => 'turn-1'),
}));
vi.mock('../tool-runner', () => ({
  isDeniedError: vi.fn(() => false),
}));
vi.mock('../step-engine', () => ({
  runStep: vi.fn(async () => ({ status: 'stop' })),
  createStepState: vi.fn(() => ({ iteration: 0, messages: [], allText: '', toolCallCount: 0 })),
}));
vi.mock('../../agent-instructions', () => ({
  loadAgentInstructions: vi.fn(async () => ''),
}));
vi.mock('../stats-handlers', () => ({
  trackMessage: vi.fn(async () => {}),
  trackTokens: vi.fn(async () => {}),
  trackToolCall: vi.fn(async () => {}),
  trackLinesGenerated: vi.fn(async () => {}),
  trackSession: vi.fn(async () => {}),
}));
vi.mock('../context-manager', () => ({
  STATIC_SYSTEM_PROMPT: 'SYS',
  prepareCacheAlignedMessages: vi.fn(({ chatMessages }: any) => chatMessages),
}));

import { runQuery } from '../query-engine';
import { runStep, createStepState } from '../step-engine';
import { loadAgentInstructions } from '../../agent-instructions';
import { trackTokens, trackToolCall, trackLinesGenerated, trackSession } from '../stats-handlers';
import { isDeniedError } from '../tool-runner';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req-1',
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: '你好' }],
    isDeepThink: false,
    projectRoot: 'C:/proj',
    apiKey: 'sk',
    apiBase: 'https://api.example/v1/chat/completions',
    mode: 'ask' as const,
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  const events: any[] = [];
  const req = makeReq(overrides);
  const signal = new AbortController().signal;
  const p = runQuery(req, (e) => events.push(e), signal);
  return { p, events, req, signal };
}

function lastCfg() {
  return vi.mocked(runStep).mock.calls.at(-1)![0] as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runStep).mockResolvedValue({ status: 'stop' } as any);
  vi.mocked(loadAgentInstructions).mockResolvedValue('');
  vi.mocked(createStepState).mockReturnValue({ iteration: 0, messages: [], allText: '', toolCallCount: 0 } as any);
});

describe('runQuery — 生命周期与模式规范化', () => {
  it('完成一轮后发出 turn_start / turn_end / done', async () => {
    const { p, events } = run();
    await p;
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['turn_start', 'turn_end', 'done']),
    );
    const turnEnd = events.find((e) => e.type === 'turn_end');
    expect(turnEnd.reason).toBe('completed');
    expect(vi.mocked(trackSession)).toHaveBeenCalledTimes(1);
  });

  it('非法 mode 归一化为 ask', async () => {
    const { p } = run({ mode: 'bogus' });
    await p;
    expect(lastCfg().mode).toBe('ask');
  });

  it('配置把模型/密钥/计划步骤/沙箱透传给 step-engine', async () => {
    const { p } = run({
      approvedPlanSteps: ['s1'],
      sandboxMode: 'read',
      reasoningEffort: 'max',
      isDeepThink: true,
    });
    await p;
    const cfg = lastCfg();
    expect(cfg).toMatchObject({
      model: 'deepseek-v4-pro',
      apiKey: 'sk',
      systemPrompt: 'SYS',
      projectRoot: 'C:/proj',
      mode: 'ask',
      sandboxMode: 'read',
      approvedPlanSteps: ['s1'],
      isDeepThink: true,
      reasoningEffort: 'max',
      autoApprove: true,
    });
    expect(cfg.signal).toBeInstanceOf(AbortSignal);
  });

  it('注入 AGENTS.md 并发出 context_injected', async () => {
    vi.mocked(loadAgentInstructions).mockResolvedValue('DO THE THING');
    const { p, events } = run();
    await p;
    const injected = events.find((e) => e.type === 'context_injected');
    expect(injected).toMatchObject({ source: 'instructions', producer: 'AGENTS.md' });
    const messages = vi.mocked(createStepState).mock.calls[0][0];
    expect(messages.some((m: any) => String(m.content).includes('DO THE THING'))).toBe(true);
  });

  it('不同模式注入对应模式提示', async () => {
    for (const [mode, keyword] of [
      ['plan', '计划模式'],
      ['afe', '全自动模式'],
      ['ask', '交互模式'],
    ] as const) {
      const { p } = run({ mode });
      await p;
      const messages = vi.mocked(createStepState).mock.calls.at(-1)![0] as any[];
      expect(messages.some((m) => String(m.content).includes(keyword))).toBe(true);
    }
  });

  it('信号已中止时直接结束且不调用 LLM', async () => {
    const events: any[] = [];
    const ctrl = new AbortController();
    ctrl.abort();
    await runQuery(makeReq(), (e) => events.push(e), ctrl.signal);
    expect(vi.mocked(runStep)).not.toHaveBeenCalled();
    expect(events.find((e) => e.type === 'turn_end').reason).toBe('aborted');
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('达到安全迭代上限后强制终止', async () => {
    vi.mocked(runStep).mockResolvedValue({ status: 'continue' } as any);
    const { p, events } = run();
    await p;
    expect(vi.mocked(runStep)).toHaveBeenCalledTimes(200);
    expect(events.some((e) => e.type === 'error' && String(e.error).includes('安全上限'))).toBe(true);
  });
});

describe('runQuery — 错误映射', () => {
  it('401/429/其他状态码与网络错误映射为对应文案', async () => {
    const cases: Array<[any, string]> = [
      [{ name: 'AxiosError', response: { status: 401 } }, 'API Key 无效或已过期'],
      [{ name: 'AxiosError', response: { status: 429 } }, '请求过于频繁，请稍后重试'],
      [{ name: 'AxiosError', response: { status: 500 } }, 'API 错误 (500)'],
      [new Error('network down'), '请求失败: network down'],
    ];
    for (const [err, expected] of cases) {
      vi.mocked(runStep).mockRejectedValueOnce(err);
      const { p, events } = run();
      await p;
      expect(events.some((e) => e.type === 'error' && e.error === expected)).toBe(true);
    }
  });

  it('AbortError / ERR_CANCELED 静默返回', async () => {
    vi.mocked(runStep).mockRejectedValueOnce({ name: 'AbortError' });
    let { p, events } = run();
    await p;
    expect(events.some((e) => e.type === 'error')).toBe(false);

    vi.mocked(runStep).mockRejectedValueOnce({ name: 'AxiosError', code: 'ERR_CANCELED' });
    ({ p, events } = run());
    await p;
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});

describe('runQuery — 权限拦截与工具回调', () => {
  it('afe / autoApprove 直接放行', async () => {
    await run({ mode: 'afe' }).p;
    expect(await lastCfg().preCheckPermission('Bash', {}, 'c1')).toBe(true);
    await run({ autoApprove: true }).p;
    expect(await lastCfg().preCheckPermission('Bash', {}, 'c1')).toBe(true);
  });

  it('ask 模式委托 checkPermission，无回调时拒绝', async () => {
    const checkPermission = vi.fn(async () => true);
    await run({ checkPermission }).p;
    expect(await lastCfg().preCheckPermission('Write', { file_path: 'a.ts' }, 'c1')).toBe(true);
    expect(checkPermission).toHaveBeenCalledWith('Write', { file_path: 'a.ts' }, 'c1');

    await run().p;
    expect(await lastCfg().preCheckPermission('Write', {}, 'c1')).toBe(false);
  });

  it('plan 模式经批准步骤放行到 checkPermission', async () => {
    const checkPermission = vi.fn(async () => false);
    await run({ mode: 'plan', approvedPlanSteps: ['s1'], checkPermission }).p;
    expect(await lastCfg().preCheckPermission('Write', {}, 'c1')).toBe(false);
    expect(checkPermission).toHaveBeenCalled();
  });

  it('onBeforeToolDispatch 为 Agent 工具注入子代理 id 并通知前端', async () => {
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    await run({ win }).p;
    const cfg = lastCfg();
    const tc: any = { name: 'Agent', index: 0, input: { prompt: 'p' } };
    cfg.onBeforeToolDispatch(tc);
    expect(tc.input._agentId).toMatch(/^sub-agent-/);
    expect(send).toHaveBeenCalledWith('agent:updated', expect.objectContaining({ status: 'running' }));

    const read: any = { name: 'Read', index: 1, input: {} };
    cfg.onBeforeToolDispatch(read);
    expect(read.input._agentId).toBeUndefined();
  });

  it('onToolResult 统计工具调用并按类型统计行数', async () => {
    await run().p;
    const cfg = lastCfg();
    cfg.onToolResult(
      { durationMs: 12, output: 'ok', error: undefined },
      { name: 'Write', input: { content: 'a\nb\nc' } },
      'c1',
    );
    expect(vi.mocked(trackToolCall)).toHaveBeenCalledWith(true, 12);
    expect(vi.mocked(trackLinesGenerated)).toHaveBeenCalledWith(3);
    expect(vi.mocked(trackTokens)).not.toHaveBeenCalled();
  });

  it('onToolResult 错误路径不统计成功，被拒绝不算失败', async () => {
    await run().p;
    const cfg = lastCfg();
    cfg.onToolResult({ durationMs: 5, output: null, error: 'boom' }, { name: 'Bash' }, 'c1');
    expect(vi.mocked(trackToolCall)).toHaveBeenCalledWith(false, 5);

    vi.mocked(isDeniedError).mockReturnValueOnce(true);
    cfg.onToolResult({ durationMs: 5, output: null, error: '用户手动中止' }, { name: 'Bash' }, 'c2');
    expect(vi.mocked(trackToolCall)).toHaveBeenCalledTimes(1);
  });

  it('onToolResult 为 Agent 工具更新完成/错误状态', async () => {
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    await run({ win }).p;
    const cfg = lastCfg();
    const tc: any = { name: 'Agent', index: 0, input: {} };
    cfg.onBeforeToolDispatch(tc);

    cfg.onToolResult(
      { durationMs: 10, output: { result: 'r', toolCallCount: 2, iterations: 3 }, error: undefined },
      tc,
      'c1',
    );
    expect(send).toHaveBeenCalledWith('agent:updated', expect.objectContaining({ status: 'completed' }));

    cfg.onToolResult({ durationMs: 1, output: null, error: 'failed' }, tc, 'c2');
    expect(send).toHaveBeenCalledWith('agent:updated', expect.objectContaining({ status: 'error' }));
  });

  it('onUsage 回调累计 token 统计', async () => {
    await run().p;
    lastCfg().onUsage(100, 20);
    expect(vi.mocked(trackTokens)).toHaveBeenCalledWith(100, 20);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'os';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
}));

vi.mock('../permission-profile', () => ({
  evaluateToolProfileGate: vi.fn(async () => ({ allowed: true, reason: '' })),
}));
vi.mock('../../sandbox-policy', () => ({
  enforceSandbox: vi.fn(() => ({ allowed: true, reason: '' })),
  commandMutates: vi.fn(() => ({ mutates: false })),
}));
vi.mock('../../rules', () => ({
  loadRules: vi.fn(async () => []),
  matchRule: vi.fn(() => null),
}));
vi.mock('../../hooks', () => ({
  runHooksFor: vi.fn(async () => null),
}));
vi.mock('../permission-handlers', () => ({
  shouldAutoApprove: vi.fn(() => true),
  requestPermission: vi.fn(async () => true),
}));
vi.mock('../window-ref', () => ({
  getMainWindowRef: vi.fn(() => null),
}));

// 终端/运行时/技能依赖
vi.mock('../pty-tool', () => ({
  runPtyTool: vi.fn(async () => ({ output: {} })),
}));
vi.mock('../../runtime-inspect', () => ({
  inspectRuntime: vi.fn(async () => ({ cpu: 'x' })),
}));
vi.mock('../../skill-store', () => ({
  ensureSkillsDirectory: vi.fn(async () => {}),
  listSkills: vi.fn(async () => []),
  readSkill: vi.fn(async () => ''),
  writeSkill: vi.fn(async () => '/skills/x.md'),
}));
vi.mock('../ask-handlers', () => ({
  askUser: vi.fn(async () => 'answer'),
}));

import { executeToolCall } from '../tool-handlers';
import { runPtyTool } from '../pty-tool';
import { inspectRuntime } from '../../runtime-inspect';
import { writeSkill } from '../../skill-store';
import { askUser } from '../ask-handlers';

function ctx(extra: Record<string, unknown> = {}) {
  return {
    projectRoot: os.tmpdir(),
    requestId: 'term-1',
    mode: 'afe' as const,
    sandboxMode: 'full' as const,
    autoApprove: true,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runPtyTool).mockResolvedValue({ output: { session_id: 's1' } });
  vi.mocked(inspectRuntime).mockResolvedValue({ cpu: 'x' } as any);
  vi.mocked(writeSkill).mockResolvedValue('/skills/x.md');
  vi.mocked(askUser).mockResolvedValue('answer');
});

describe('Pty 工具', () => {
  it('按 action 路由并传递 owner', async () => {
    const r = await executeToolCall('Pty', { action: 'create', command: 'node' }, ctx({ agentId: 'ag-1' }));
    expect(r.output).toEqual({ session_id: 's1' });
    expect(runPtyTool).toHaveBeenCalledWith('create', { action: 'create', command: 'node' }, 'ag-1');
  });

  it('无 agentId 时 owner 回退 chat', async () => {
    await executeToolCall('Pty', { action: 'list' }, ctx());
    expect(runPtyTool).toHaveBeenCalledWith('list', { action: 'list' }, 'chat');
  });

  it('底层错误透传', async () => {
    vi.mocked(runPtyTool).mockResolvedValue({ output: null, error: 'pty 失败' });
    expect((await executeToolCall('Pty', { action: 'read' }, ctx())).error).toBe('pty 失败');
  });
});

describe('Terminal* 终端会话工具', () => {
  it('TerminalOpen 以 owner 创建会话', async () => {
    const r = await executeToolCall('TerminalOpen', { command: 'bash' }, ctx({ agentId: 'a' }));
    expect(r.output).toEqual({ session_id: 's1' });
    expect(runPtyTool).toHaveBeenCalledWith('create', { command: 'bash' }, 'a');
  });

  it('TerminalList 列出 owner 的会话', async () => {
    vi.mocked(runPtyTool).mockResolvedValueOnce({ output: { sessions: ['s1'] } });
    const r = await executeToolCall('TerminalList', {}, ctx({ sessionId: 'sess-9' }));
    expect(r.output).toEqual({ sessions: ['s1'] });
    expect(runPtyTool).toHaveBeenCalledWith('list', {}, 'sess-9');
  });

  it('TerminalRead / TerminalSend / TerminalClose 透传参数', async () => {
    await executeToolCall('TerminalRead', { session_id: 's1', timeout_ms: 100 }, ctx());
    expect(runPtyTool).toHaveBeenLastCalledWith('read', { session_id: 's1', timeout_ms: 100 }, 'term-1');

    await executeToolCall('TerminalSend', { session_id: 's1', data: 'ls', enter: true }, ctx());
    expect(runPtyTool).toHaveBeenLastCalledWith('write', { session_id: 's1', data: 'ls', enter: true }, 'term-1');

    await executeToolCall('TerminalClose', { session_id: 's1' }, ctx());
    expect(runPtyTool).toHaveBeenLastCalledWith('close', { session_id: 's1' }, 'term-1');
  });

  it('TerminalSignal 映射控制字符 / 关闭 / 非法信号', async () => {
    const sigint = await executeToolCall('TerminalSignal', { session_id: 's1', signal: 'sigint' }, ctx());
    expect(sigint.output).toEqual({ signaled: 'SIGINT', session_id: 's1' });
    expect(runPtyTool).toHaveBeenLastCalledWith('write', { session_id: 's1', data: '\x03' }, 'term-1');

    const kill = await executeToolCall('TerminalSignal', { session_id: 's1', signal: 'SIGKILL' }, ctx());
    expect(kill.output).toEqual({ signaled: 'SIGKILL', session_id: 's1', closed: true });
    expect(runPtyTool).toHaveBeenLastCalledWith('close', { session_id: 's1' }, 'term-1');

    const bad = await executeToolCall('TerminalSignal', { session_id: 's1', signal: 'SIGHUP' }, ctx());
    expect(bad.error).toContain('不支持的信号');
  });

  it('底层错误传播为工具错误', async () => {
    vi.mocked(runPtyTool).mockResolvedValueOnce({ output: null, error: '会话不存在' });
    expect((await executeToolCall('TerminalRead', { session_id: 's1' }, ctx())).error).toBe('会话不存在');
  });
});

describe('InspectRuntime / WriteSkill / AskUser', () => {
  it('InspectRuntime 返回运行时快照', async () => {
    const r = await executeToolCall('InspectRuntime', {}, ctx());
    expect(r.output).toEqual({ cpu: 'x' });
  });

  it('InspectRuntime 异常包装', async () => {
    vi.mocked(inspectRuntime).mockRejectedValueOnce(new Error('nope'));
    expect((await executeToolCall('InspectRuntime', {}, ctx())).error).toContain('检视运行时失败');
  });

  it('WriteSkill 校验必填并写入 userData/skills', async () => {
    expect((await executeToolCall('WriteSkill', {}, ctx())).error).toBe('name 与 content 必填');
    const r = await executeToolCall('WriteSkill', { name: 'x', content: 'body' }, ctx());
    expect(r.output).toEqual({ name: 'x', path: '/skills/x.md' });
    expect(writeSkill).toHaveBeenCalledWith(os.tmpdir() + '\\skills', 'x', 'body');
  });

  it('AskUser 空问题拒绝并返回答案', async () => {
    expect((await executeToolCall('AskUser', {}, ctx())).error).toBe('question 不能为空');
    const r = await executeToolCall('AskUser', { question: 'q?', options: ['a', 'b'] }, ctx());
    expect(r.output).toEqual({ question: 'q?', answer: 'answer' });
    expect(askUser).toHaveBeenCalledWith('q?', ['a', 'b'], null);
  });
});

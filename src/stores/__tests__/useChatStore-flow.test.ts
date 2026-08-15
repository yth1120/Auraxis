// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../useChatStore';
import { useSessionStore } from '../useSessionStore';
import { useAppStore } from '../useAppStore';
import { useSettingsStore } from '../useSettingsStore';
import { useInspectorStore } from '../useInspectorStore';

type ChatCallbacks = {
  onChunk?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
  onEvent?: (event: any) => void;
};

const mocks = vi.hoisted(() => ({
  chatStream: vi.fn(),
  sendQuery: vi.fn(),
  getProjectContext: vi.fn(),
  getByProject: vi.fn(),
  chatLogAppend: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electronAPI = {
    ai: { chatStream: mocks.chatStream, sendQuery: mocks.sendQuery },
    context: { getProjectContext: mocks.getProjectContext },
    memory: { getByProject: mocks.getByProject },
    chatLog: { append: mocks.chatLogAppend },
    undo: { revertLast: vi.fn() },
  };
  mocks.getProjectContext.mockResolvedValue({ ok: true, data: { instructionsMd: '', fileTree: '', packageJson: '' } });
  mocks.getByProject.mockResolvedValue({ ok: true, data: [] });
  mocks.chatLogAppend.mockResolvedValue({ ok: true });
  useSessionStore.setState({ sessions: [], currentSessionId: null });
  useChatStore.setState({ messages: [], isStreaming: false, inputValue: '' });
  useAppStore.setState({ sidebarMode: 'chat' });
  useSettingsStore.setState({ projectPath: '' });
  useInspectorStore.setState({ plans: [], systemMessages: [] });
});

describe('useChatStore — sendMessage 聊天路径', () => {
  it('流式分块累积并正常结束', async () => {
    let cb: ChatCallbacks = {};
    mocks.chatStream.mockImplementation((_p: unknown, callbacks: ChatCallbacks) => {
      cb = callbacks;
      return { unsubscribe: vi.fn() };
    });
    useChatStore.setState({ inputValue: '你好' });

    await useChatStore.getState().sendMessage();
    cb.onChunk!('你');
    cb.onChunk!('好');
    cb.onDone!();

    const messages = useChatStore.getState().messages;
    expect(messages[0]).toMatchObject({ role: 'user', content: '你好' });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: '你好' });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(mocks.chatStream).toHaveBeenCalledTimes(1);
  });

  it('后端错误写入助手消息', async () => {
    let cb: ChatCallbacks = {};
    mocks.chatStream.mockImplementation((_p: unknown, callbacks: ChatCallbacks) => {
      cb = callbacks;
      return { unsubscribe: vi.fn() };
    });
    useChatStore.setState({ inputValue: '你好' });

    await useChatStore.getState().sendMessage();
    cb.onError!('未配置 API Key');

    expect(useChatStore.getState().messages[1].content).toBe('Error: 未配置 API Key');
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('IPC 抛异常走 catch 路径', async () => {
    mocks.chatStream.mockImplementation(() => {
      throw new Error('ipc down');
    });
    useChatStore.setState({ inputValue: '你好' });

    await useChatStore.getState().sendMessage();
    expect(useChatStore.getState().messages[1].content).toBe('Error: ipc down');
  });

  it('空输入不发送', async () => {
    useChatStore.setState({ inputValue: '   ' });
    await useChatStore.getState().sendMessage();
    expect(mocks.chatStream).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

describe('useChatStore — sendMessage 统一引擎路径', () => {
  function setupQuery() {
    let cb: ChatCallbacks = {};
    mocks.sendQuery.mockImplementation((_p: unknown, callbacks: ChatCallbacks) => {
      cb = callbacks;
      return { unsubscribe: vi.fn() };
    });
    return {
      getCb: () => cb,
      payload: () => mocks.sendQuery.mock.calls[0][0],
    };
  }

  beforeEach(() => {
    useAppStore.setState({ sidebarMode: 'code' });
    useSettingsStore.setState({ projectPath: 'C:/proj' });
  });

  it('工具/思考/压缩/披露等事件全部落到消息状态', async () => {
    const { getCb, payload } = setupQuery();
    useChatStore.setState({ inputValue: '做点事', currentProjectPath: 'C:/proj' });

    await useChatStore.getState().sendMessage();
    const cb = getCb();

    cb.onEvent!({ type: 'text_chunk', text: '片段' });
    cb.onEvent!({ type: 'tool_start', toolName: 'Read', toolCallId: 'c1', requestId: 'r1', input: { file_path: 'a.ts' }, timestamp: 1 });
    cb.onEvent!({ type: 'tool_progress', toolCallId: 'c1', progress: 'out' });
    cb.onEvent!({ type: 'tool_end', toolName: 'Read', toolCallId: 'c1', requestId: 'r1', output: { x: 1 }, timestamp: 2 });
    cb.onEvent!({ type: 'iteration', iteration: 2, maxIterations: 200 });
    cb.onEvent!({ type: 'thinking_chunk', chunk: '思考', isNewBlock: true });
    cb.onEvent!({ type: 'usage_update', inputTokens: 10, outputTokens: 2, reasoningTokens: 1 });
    cb.onEvent!({ type: 'context_compressed', tokensBefore: 100, tokensAfter: 10, messagesRemoved: 2, tokensSaved: 90 });
    cb.onEvent!({ type: 'context_injected', source: 'instructions', producer: 'AGENTS.md', detail: '注入' });
    cb.onEvent!({ type: 'system_message', content: 'sys', level: 'info' });
    cb.onEvent!({ type: 'plan_generated', planId: 'p1', steps: [], filePath: '/p.md', agentId: null });
    expect(useChatStore.getState().currentIteration).toBe(2); // done 之前可见
    cb.onDone!();

    const state = useChatStore.getState();
    const assistant = state.messages.find((m) => m.role === 'assistant')!;
    expect(assistant.content).toBe('片段');
    expect(assistant.toolCalls![0]).toMatchObject({ id: 'c1', toolName: 'Read', status: 'done', streamOutput: 'out' });
    expect(assistant.thinkingBlocks!.some((b) => String(b.content || '').includes('思考'))).toBe(true);
    expect(state.messages.some((m) => (m as any).compaction)).toBe(true);
    expect(state.messages.some((m) => (m as any).disclosure?.producer === 'AGENTS.md')).toBe(true);
    expect(useInspectorStore.getState().plans).toHaveLength(1);
    expect(useInspectorStore.getState().systemMessages).toHaveLength(1);
    expect(state.isStreaming).toBe(false);
    expect(payload().projectRoot).toBe('C:/proj');
  });

  it('工具错误与中止状态落盘', async () => {
    const { getCb } = setupQuery();
    useChatStore.setState({ inputValue: '做点事' });
    await useChatStore.getState().sendMessage();
    const cb = getCb();

    cb.onEvent!({ type: 'tool_start', toolName: 'Bash', toolCallId: 'c1', requestId: 'r1', input: {}, timestamp: 1 });
    cb.onEvent!({ type: 'tool_error', toolName: 'Bash', toolCallId: 'c1', requestId: 'r1', error: 'boom', timestamp: 2 });
    cb.onDone!();

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant')!;
    expect(assistant.toolCalls![0]).toMatchObject({ status: 'error', error: 'boom' });
  });

  it('error 事件与 onError 双保险', async () => {
    const { getCb } = setupQuery();
    useChatStore.setState({ inputValue: '做点事' });
    await useChatStore.getState().sendMessage();
    const cb = getCb();

    cb.onEvent!({ type: 'error', error: 'x' });
    cb.onError!('x');

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().messages.at(-1)!.content).toContain('x');
  });
});

describe('useChatStore — 记忆与项目指令注入', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarMode: 'code' });
    useSettingsStore.setState({ projectPath: 'C:/proj' });
  });

  it('注入项目指令与跨会话记忆', async () => {
    let cb: ChatCallbacks = {};
    mocks.sendQuery.mockImplementation((_p: unknown, callbacks: ChatCallbacks) => {
      cb = callbacks;
      return { unsubscribe: vi.fn() };
    });
    mocks.getProjectContext.mockResolvedValue({ ok: true, data: { instructionsMd: 'RULES', fileTree: '', packageJson: '' } });
    mocks.getByProject.mockResolvedValue({
      ok: true,
      data: [{ id: 'm1', type: 'decision', title: 'T', content: '使用 React', timestamp: 1, importance: 4 }],
    });
    useChatStore.setState({ inputValue: '做点事', currentProjectPath: 'C:/proj' });

    await useChatStore.getState().sendMessage();

    const sentMessages = mocks.sendQuery.mock.calls[0][0].messages as any[];
    expect(sentMessages.some((m) => String(m.content).includes('RULES'))).toBe(true);
    expect(useChatStore.getState().messages.some((m) => (m as any).disclosure?.source === 'memory')).toBe(true);
    cb.onDone!();
  });
});

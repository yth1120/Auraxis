// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import ChatInput from '../ChatInput';
import { useChatStore } from '@/stores/useChatStore';
import { useAppStore } from '@/stores/useAppStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useInspectorStore } from '@/stores/useInspectorStore';

const mockSendMessage = vi.fn();
const mockStopStreaming = vi.fn();

async function renderChatInput() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ChatInput />);
  });
  return result;
}

describe('ChatInput — 输入区核心交互', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockStopStreaming.mockReset();
    // 模拟真实 sendMessage 的语义：发送后清空输入。
    mockSendMessage.mockImplementation(() => {
      useChatStore.setState({ inputValue: '' });
    });

    useChatStore.setState({
      messages: [],
      inputValue: '',
      isStreaming: false,
      isWebSearch: false,
      isDeepThink: false,
      reasoningEffort: 'medium',
      taskPriority: 'normal',
      pendingPlanMode: false,
      currentProjectPath: null,
      composerFocusTick: 0,
      agentQueue: [],
      goal: null,
      sendMessage: mockSendMessage,
      stopStreaming: mockStopStreaming,
    });
    useAppStore.setState({ sidebarMode: 'chat', theme: 'light' });
    useSettingsStore.setState({ projectPath: null, sandboxMode: 'workspace-write' });
    useAgentStore.setState({ agents: [], currentAgentId: null });
    useSessionStore.setState({ sessions: [] });
    useInspectorStore.setState({ plans: [] });

    (window as any).electronAPI = {
      skills: { list: vi.fn(async () => ({ ok: true, data: { skills: [] } })) },
      context: { getFileStructure: vi.fn(async () => ({ ok: false })) },
      plan: { list: vi.fn(async () => ({ ok: false })) },
      project: { selectDirectory: vi.fn(async () => ({ ok: false })) },
      chatLog: { append: vi.fn(async () => ({ ok: true })) },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders centered hero + chat placeholder and keeps send disabled when empty', async () => {
    const { getByPlaceholderText, getByRole } = await renderChatInput();
    expect(getByPlaceholderText('输入你的问题…')).toBeTruthy();
    expect(getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(true);
  });

  it('typing updates the store value and enables the send button', async () => {
    const { getByPlaceholderText, getByRole } = await renderChatInput();
    const textarea = getByPlaceholderText('输入你的问题…') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '修复登录 bug' } });

    expect(textarea.value).toBe('修复登录 bug');
    expect(useChatStore.getState().inputValue).toBe('修复登录 bug');
    expect(getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(false);
  });

  it('Enter submits in chat mode and clears the composer', async () => {
    const { getByPlaceholderText } = await renderChatInput();
    const textarea = getByPlaceholderText('输入你的问题…') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '修复登录 bug' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().inputValue).toBe('');
  });

  it('Enter with an empty composer never sends', async () => {
    const { getByPlaceholderText } = await renderChatInput();
    const textarea = getByPlaceholderText('输入你的问题…') as HTMLTextAreaElement;

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('while streaming, the textarea is disabled and Enter stops generation', async () => {
    useChatStore.setState({ isStreaming: true, inputValue: '进行中的回复' });
    const { getByPlaceholderText, getByRole } = await renderChatInput();
    const textarea = getByPlaceholderText('输入你的问题…') as HTMLTextAreaElement;

    expect(textarea.disabled).toBe(true);
    expect(getByRole('button', { name: '停止生成' })).toBeTruthy();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(mockStopStreaming).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('typing a slash prefix opens the command dropdown and Enter completes it', async () => {
    const { getByPlaceholderText } = await renderChatInput();
    const textarea = getByPlaceholderText('输入你的问题…') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '/the' } });

    await waitFor(() => {
      expect(document.body.textContent).toContain('切换界面主题');
    });

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(useChatStore.getState().inputValue).toBe('/theme ');
  });

  it('code mode switches to the agent placeholder and launch action', async () => {
    useAppStore.setState({ sidebarMode: 'code' });
    const { getByPlaceholderText, getByRole } = await renderChatInput();
    expect(getByPlaceholderText('描述你的任务…')).toBeTruthy();
    expect(getByRole('button', { name: '启动任务' })).toBeTruthy();
  });
});

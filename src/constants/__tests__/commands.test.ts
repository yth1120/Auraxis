// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message, Modal } from 'antd';
import { executeCommand, SLASH_COMMANDS } from '../commands';
import { useChatStore } from '../../stores/useChatStore';

function ctx() {
  return {
    clearMessages: () => {},
    setSelectedModel: () => {},
    setInputValue: vi.fn(),
    toggleTheme: () => {},
    theme: 'light',
  };
}

describe('executeCommand — /skill', () => {
  beforeEach(() => {
    // Stub antd message/Modal so async command feedback never schedules a
    // React commit after the test environment is torn down.
    vi.spyOn(message, 'error').mockImplementation(() => undefined as any);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as any);
    vi.spyOn(message, 'warning').mockImplementation(() => undefined as any);
    vi.spyOn(message, 'info').mockImplementation(() => undefined as any);
    vi.spyOn(Modal, 'info').mockImplementation(() => undefined as any);
  });

  it('registers /skill in the command list', () => {
    expect(SLASH_COMMANDS.some((c) => c.name === 'skill')).toBe(true);
  });

  it('consumes an unknown skill name without sending it as text', () => {
    const c = ctx();
    expect(executeCommand('skill', '不存在的技能', c)).toBe(true);
    expect(c.setInputValue).toHaveBeenCalledWith('');
  });

  it('launches the matched skill and clears the composer', () => {
    (window as any).electronAPI = {
      agent: { start: vi.fn().mockResolvedValue({ ok: false, error: 'test' }) },
    };
    useChatStore.setState({ inputValue: '/skill 代码审查 ' });
    const c = ctx();
    expect(executeCommand('skill', '代码审查', c)).toBe(true);
    expect(c.setInputValue).toHaveBeenCalledWith('');
  });
});

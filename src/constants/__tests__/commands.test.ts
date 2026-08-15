// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
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

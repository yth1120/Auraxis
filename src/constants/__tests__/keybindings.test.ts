import { describe, it, expect } from 'vitest';
import { matchBinding, isCtrlOrCmd } from '../keybindings';

function ev(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: 'k',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  } as KeyboardEvent;
}

const CTRL_K = { key: 'k', ctrl: true, description: '打开命令面板', category: 'navigation' as const };

describe('matchBinding — Ctrl / Meta 平台语义', () => {
  it('Windows 上 Ctrl+K 匹配，Win+K 不匹配', () => {
    expect(matchBinding(ev({ ctrlKey: true }), CTRL_K, 'Win32')).toBe(true);
    expect(matchBinding(ev({ metaKey: true }), CTRL_K, 'Win32')).toBe(false);
  });

  it('macOS 上 Ctrl+K 与 Cmd+K 都匹配', () => {
    expect(matchBinding(ev({ ctrlKey: true }), CTRL_K, 'MacIntel')).toBe(true);
    expect(matchBinding(ev({ metaKey: true }), CTRL_K, 'MacIntel')).toBe(true);
  });
});

describe('isCtrlOrCmd', () => {
  const isMac = /Mac|iPhone|iPad/.test(typeof navigator !== 'undefined' ? navigator.platform : '');

  it.skipIf(isMac)('Windows/Linux 上只有 Ctrl 算', () => {
    expect(isCtrlOrCmd(ev({ ctrlKey: true }))).toBe(true);
    expect(isCtrlOrCmd(ev({ metaKey: true }))).toBe(false);
  });

  it.skipIf(!isMac)('macOS 上 Ctrl 或 Cmd 都算', () => {
    expect(isCtrlOrCmd(ev({ ctrlKey: true }))).toBe(true);
    expect(isCtrlOrCmd(ev({ metaKey: true }))).toBe(true);
  });
});

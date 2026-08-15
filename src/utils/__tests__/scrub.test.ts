import { describe, it, expect } from 'vitest';
import { scrubSandboxPaths } from '../scrub';

describe('scrubSandboxPaths — 跟进 prompt 沙箱路径清洗', () => {
  it('清洗 Windows 反斜杠路径', () => {
    const input = String.raw`文件保存在 C:\Users\After\AppData\Roaming\auraxis\agent-workspaces\workspace-agent-123-abc\hello.md 中。`;
    const out = scrubSandboxPaths(input);
    expect(out).not.toContain('agent-workspaces');
    expect(out).toContain('（沙箱内部路径）');
    expect(out).toContain('文件保存在');
  });

  it('清洗正斜杠路径', () => {
    const input = '位于 C:/Users/After/AppData/Roaming/auraxis/agent-workspaces/workspace-agent-456/data 内';
    const out = scrubSandboxPaths(input);
    expect(out).not.toContain('agent-workspaces');
  });

  it('中文标点截断路径边界', () => {
    const input = String.raw`路径 C:\x\agent-workspaces\ws-1\a.md，之后是说明。`;
    const out = scrubSandboxPaths(input);
    expect(out).not.toContain('agent-workspaces');
    expect(out).toContain('，之后是说明。');
  });

  it('不碰普通项目路径', () => {
    const input = String.raw`项目在 C:\Users\After\Desktop\my-project\src\index.ts`;
    expect(scrubSandboxPaths(input)).toBe(input);
  });

  it('清洗 POSIX（Linux/macOS）绝对路径', () => {
    const input = '/Users/after/Library/Application Support/auraxis/agent-workspaces/ws-9/hello.md 中';
    const out = scrubSandboxPaths(input);
    expect(out).not.toContain('agent-workspaces');
    expect(out).toContain('（沙箱内部路径）');
    expect(out).toContain('中');
  });

  it('不清洗普通 POSIX 项目路径', () => {
    const input = '/Users/after/Desktop/my-project/src/index.ts';
    expect(scrubSandboxPaths(input)).toBe(input);
  });
});

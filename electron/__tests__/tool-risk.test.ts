import { describe, it, expect } from 'vitest';
import { classifyToolRisk, shouldAskForWorkTier } from '../tool-risk';

describe('tool-risk — Pwsh 与 Bash 同级门禁', () => {
  it('Pwsh 只读命令按 medium，写文件/危险命令按 high', () => {
    expect(classifyToolRisk('Pwsh', { command: 'echo hi' })).toBe('medium');
    expect(classifyToolRisk('Pwsh', { command: 'Set-Content x.txt hi' })).toBe('high');
    expect(classifyToolRisk('Pwsh', { command: 'Remove-Item x.txt' })).toBe('high');
    expect(classifyToolRisk('Bash', { command: 'echo hi' })).toBe('medium');
  });

  it('全自动档位下 Pwsh 危险命令仍需确认，中风险放行', () => {
    expect(shouldAskForWorkTier('full', 'Pwsh', { command: 'Set-Content x.txt hi' })).toBe(true);
    expect(shouldAskForWorkTier('full', 'Pwsh', { command: 'echo hi' })).toBe(false);
  });
});

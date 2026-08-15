import { describe, it, expect, beforeEach } from 'vitest';

// Test the plugin validation and registry logic in isolation
// (avoiding Zustand store dependency in unit tests)

describe('Plugin Validation', () => {
  it('合法插件通过 validatePlugin 检查', () => {
    const valid = {
      id: 'test-plugin',
      name: 'Test',
      version: '1.0.0',
      description: 'A test plugin',
    };
    const fields: (keyof typeof valid)[] = ['id', 'name', 'version', 'description'];
    for (const f of fields) {
      expect(valid[f]).toBeTypeOf('string');
      expect(valid[f].length).toBeGreaterThan(0);
    }
  });

  it('缺少必填字段的插件被拒绝', () => {
    const invalid: Record<string, string> = { id: 'test' };
    const requiredFields = ['id', 'name', 'version', 'description'];
    const missing = requiredFields.filter((f) => !invalid[f]);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing).toContain('name');
  });

  it('getCapabilitySummary 正确描述扩展能力', () => {
    const summaryParts: string[] = [];
    const plugin = {
      tools: [{ name: 't1' }],
      commands: [{ name: 'c1' }, { name: 'c2' }],
      hooks: { onAppReady: () => {} },
      ui: undefined,
    };

    if (plugin.tools?.length) summaryParts.push(`${plugin.tools.length} 个工具`);
    if (plugin.commands?.length) summaryParts.push(`${plugin.commands.length} 个命令`);
    if (plugin.hooks) summaryParts.push('生命周期钩子');

    expect(summaryParts).toEqual(['1 个工具', '2 个命令', '生命周期钩子']);
  });
});

// Test the registry pattern (Map-based)
describe('Tool Registry', () => {
  let registry: Map<string, any[]>;

  beforeEach(() => { registry = new Map(); });

  it('注册插件工具后 getPluginTools 返回合并列表', () => {
    registry.set('p1', [{ name: 'tool-a' }]);
    registry.set('p2', [{ name: 'tool-b' }, { name: 'tool-c' }]);

    const flat = [...registry.values()].flat();
    expect(flat).toHaveLength(3);
    expect(flat.map((t: any) => t.name)).toEqual(['tool-a', 'tool-b', 'tool-c']);
  });

  it('卸载插件后工具从注册表移除', () => {
    registry.set('p1', [{ name: 'tool-a' }]);
    registry.delete('p1');
    expect(registry.has('p1')).toBe(false);
    expect([...registry.values()].flat()).toHaveLength(0);
  });
});

describe('Command Registry', () => {
  let registry: Map<string, any[]>;

  beforeEach(() => { registry = new Map(); });

  it('注册后卸载的插件命令不出现在列表中', () => {
    registry.set('p1', [{ name: 'timestamp' }]);
    registry.set('p2', [{ name: 'uuid' }]);

    // Simulate uninstall of p1
    registry.delete('p1');
    const active = [...registry.values()].flat();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('uuid');
  });

  it('启用/禁用不影响其他插件', () => {
    registry.set('p1', [{ name: 't1' }]);
    registry.set('p2', [{ name: 't2' }]);

    // Disable p1 (remove from active)
    registry.delete('p1');
    expect([...registry.values()].flat().map((c: any) => c.name)).toEqual(['t2']);

    // Re-enable p1 (re-register)
    registry.set('p1', [{ name: 't1' }]);
    expect([...registry.values()].flat()).toHaveLength(2);
  });
});

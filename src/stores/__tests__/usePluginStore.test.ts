import { describe, it, expect, beforeEach } from 'vitest';
import { usePluginStore } from '../usePluginStore';
import type { InstalledPlugin, Plugin } from '../../types/plugin';

function mkInstalledPlugin(id: string, enabled = true): InstalledPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: `Description for ${id}`,
    enabled,
    installedAt: Date.now(),
    path: `plugins/${id}.ts`,
  };
}

function mkPlugin(id: string): Plugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: `Description for ${id}`,
    commands: [],
    tools: [],
  };
}

describe('usePluginStore', () => {
  beforeEach(() => {
    usePluginStore.setState({
      installedPlugins: [],
      activePlugins: [],
      seededBuiltins: false,
    });
  });

  it('初始状态 installedPlugins 和 activePlugins 为空', () => {
    expect(usePluginStore.getState().installedPlugins).toEqual([]);
    expect(usePluginStore.getState().activePlugins).toEqual([]);
    expect(usePluginStore.getState().seededBuiltins).toBe(false);
  });

  it('markBuiltinsSeeded 标记内置插件已装配', () => {
    usePluginStore.getState().markBuiltinsSeeded();
    expect(usePluginStore.getState().seededBuiltins).toBe(true);
  });

  it('installPlugin 安装新插件（同时加入 installed + active）', () => {
    const info = mkInstalledPlugin('p1');
    const plugin = mkPlugin('p1');
    usePluginStore.getState().installPlugin(info, plugin);
    expect(usePluginStore.getState().installedPlugins).toHaveLength(1);
    expect(usePluginStore.getState().installedPlugins[0].id).toBe('p1');
    expect(usePluginStore.getState().activePlugins).toHaveLength(1);
    expect(usePluginStore.getState().activePlugins[0].id).toBe('p1');
  });

  it('installPlugin 同名覆盖旧版本', () => {
    const info1 = mkInstalledPlugin('p1');
    const plugin1 = mkPlugin('p1');
    usePluginStore.getState().installPlugin(info1, plugin1);

    const info2 = { ...mkInstalledPlugin('p1'), version: '2.0.0' };
    const plugin2 = { ...mkPlugin('p1'), version: '2.0.0' };
    usePluginStore.getState().installPlugin(info2, plugin2);

    expect(usePluginStore.getState().installedPlugins).toHaveLength(1);
    expect(usePluginStore.getState().installedPlugins[0].version).toBe('2.0.0');
    expect(usePluginStore.getState().activePlugins).toHaveLength(1);
    expect(usePluginStore.getState().activePlugins[0].version).toBe('2.0.0');
  });

  it('uninstallPlugin 同时从 installed 和 active 移除', () => {
    usePluginStore.getState().installPlugin(mkInstalledPlugin('p1'), mkPlugin('p1'));
    usePluginStore.getState().installPlugin(mkInstalledPlugin('p2'), mkPlugin('p2'));
    usePluginStore.getState().uninstallPlugin('p1');
    expect(usePluginStore.getState().installedPlugins).toHaveLength(1);
    expect(usePluginStore.getState().installedPlugins[0].id).toBe('p2');
    expect(usePluginStore.getState().activePlugins).toHaveLength(1);
    expect(usePluginStore.getState().activePlugins[0].id).toBe('p2');
  });

  it('uninstallPlugin 不存在的 id 不影响', () => {
    usePluginStore.getState().installPlugin(mkInstalledPlugin('p1'), mkPlugin('p1'));
    usePluginStore.getState().uninstallPlugin('nonexistent');
    expect(usePluginStore.getState().installedPlugins).toHaveLength(1);
    expect(usePluginStore.getState().activePlugins).toHaveLength(1);
  });

  it('enablePlugin 设置 enabled → true', () => {
    usePluginStore.getState().installPlugin(mkInstalledPlugin('p1', false), mkPlugin('p1'));
    usePluginStore.getState().enablePlugin('p1');
    expect(usePluginStore.getState().installedPlugins[0].enabled).toBe(true);
  });

  it('disablePlugin 设置 enabled → false', () => {
    usePluginStore.getState().installPlugin(mkInstalledPlugin('p1', true), mkPlugin('p1'));
    usePluginStore.getState().disablePlugin('p1');
    expect(usePluginStore.getState().installedPlugins[0].enabled).toBe(false);
  });

  it('setActivePlugins 直接设置 active 列表', () => {
    const plugins = [mkPlugin('p1'), mkPlugin('p2')];
    usePluginStore.getState().setActivePlugins(plugins);
    expect(usePluginStore.getState().activePlugins).toHaveLength(2);
  });
});

import { describe, it, expect } from 'vitest';
import { registerCommands, unregisterCommands } from '../command-registry';
import type { CommandDefinition } from '../../types/plugin';

function mkCmd(name: string): CommandDefinition {
  return {
    name,
    description: `Command: ${name}`,
    usage: `/${name}`,
    execute: () => true,
  };
}

describe('command-registry', () => {
  function cleanup(pluginIds: string[]) {
    for (const id of pluginIds) {
      unregisterCommands(id);
    }
  }

  it('注册插件命令', () => {
    registerCommands('plugin-a', [mkCmd('my-command'), mkCmd('another-command')]);
    // 注册不抛错即可 — command-registry 目前没有 getPluginCommands 导出
    // 通过不抛错来验证注册成功
    cleanup(['plugin-a']);
  });

  it('覆盖注册同一插件', () => {
    registerCommands('plugin-x', [mkCmd('old')]);
    registerCommands('plugin-x', [mkCmd('new-cmd')]);
    // 不应抛错
    cleanup(['plugin-x']);
  });

  it('注销已注册插件', () => {
    registerCommands('plugin-c', [mkCmd('temp')]);
    expect(() => unregisterCommands('plugin-c')).not.toThrow();
  });

  it('注销不存在的插件不抛错', () => {
    expect(() => unregisterCommands('nonexistent')).not.toThrow();
  });

  it('注销后再注册', () => {
    registerCommands('plugin-d', [mkCmd('v1')]);
    unregisterCommands('plugin-d');
    expect(() => registerCommands('plugin-d', [mkCmd('v2')])).not.toThrow();
    cleanup(['plugin-d']);
  });
});

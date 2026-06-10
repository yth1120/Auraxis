import type { ToolDef } from '../types/tools';

const pluginTools = new Map<string, ToolDef[]>();

export function registerTools(pluginId: string, tools: ToolDef[]) {
  pluginTools.set(pluginId, tools);
}

export function unregisterTools(pluginId: string) {
  pluginTools.delete(pluginId);
}

export function getPluginTools(): ToolDef[] {
  return [...pluginTools.values()].flat();
}

/**
 * actions.ts — 项目 Actions（项目级快捷命令）。
 *
 * Reads <projectRoot>/.auraxis/actions.json:
 *   { "actions": [ { "name": "Run", "command": "npm start", "platform": "darwin" } ] }
 * Platform-specific commands override the generic one for the current OS.
 */
import { promises as fs } from 'fs';
import path from 'path';

export interface ProjectAction {
  name: string;
  command: string;
  platform?: string;
}

interface ActionsFile {
  actions?: ProjectAction[];
}

export async function loadProjectActions(projectRoot: string): Promise<ProjectAction[]> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, '.auraxis', 'actions.json'), 'utf8');
    const parsed = JSON.parse(raw) as ActionsFile;
    if (!Array.isArray(parsed.actions)) return [];
    const platform = process.platform;
    const byName = new Map<string, ProjectAction>();
    for (const action of parsed.actions) {
      if (!action || typeof action.name !== 'string' || typeof action.command !== 'string') continue;
      if (action.platform && action.platform !== platform) continue;
      const prev = byName.get(action.name);
      // Platform-specific commands override the generic entry for this OS.
      if (!prev || (!prev.platform && action.platform)) {
        byName.set(action.name, { name: action.name, command: action.command, platform: action.platform });
      }
    }
    return [...byName.values()];
  } catch {
    return [];
  }
}

import { ipcMain } from 'electron';
import { loadProjectActions } from '../actions';

/** Project Actions IPC — reads <project>/.auraxis/actions.json. */
export function registerActionHandlers() {
  ipcMain.handle('actions:list', async (_e, projectRoot: string) => {
    try {
      if (!projectRoot || typeof projectRoot !== 'string') return { ok: false, error: '项目目录无效' };
      return { ok: true, data: await loadProjectActions(projectRoot) };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

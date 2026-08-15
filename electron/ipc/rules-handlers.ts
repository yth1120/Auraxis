import { ipcMain } from 'electron';
import { loadRules } from '../rules';

/** Rules IPC — surface loaded prefix rules for the settings pane. */
export function registerRulesHandlers() {
  ipcMain.handle('rules:list', async (_e, projectRoot?: string) => {
    try {
      return { ok: true, data: await loadRules(projectRoot) };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

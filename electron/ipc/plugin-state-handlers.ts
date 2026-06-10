/**
 * plugin-state-handlers.ts — shared plugin enabled/disabled state (CLI + UI).
 */

import { ipcMain } from 'electron';
import { getPluginState, setPluginEnabled } from '../plugin-cli';

export function registerPluginStateHandlers(): void {
  ipcMain.handle('pluginState:get', async () => {
    return { ok: true, data: await getPluginState() };
  });
  ipcMain.handle('pluginState:set', async (_e, id: string, enabled: boolean) => {
    const r = await setPluginEnabled(id, enabled);
    return r.ok ? { ok: true, data: { enabledIds: r.enabledIds } } : { ok: false, error: r.error };
  });
}

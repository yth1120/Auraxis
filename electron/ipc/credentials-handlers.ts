import { ipcMain } from 'electron';
import { describeCredential, setCredential, unsetCredential } from '../credentials';

function wrap<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      return { ok: true, data: await fn() };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  };
}

/** Credential IPC — env / .env references, never inline secrets （凭证引用）. */
export function registerCredentialHandlers() {
  ipcMain.handle('credentials:describe', async (_e, name: string, projectRoot?: string) => {
    if (!name || typeof name !== 'string') return { ok: false, error: '凭据名称无效' };
    return wrap(() => describeCredential(name, projectRoot))();
  });
  ipcMain.handle('credentials:set', async (_e, name: string, value: string) => {
    if (!name || typeof name !== 'string') return { ok: false, error: '凭据名称无效' };
    if (typeof value !== 'string') return { ok: false, error: '凭据值无效' };
    return wrap(() => setCredential(name, value))();
  });
  ipcMain.handle('credentials:unset', async (_e, name: string) => {
    if (!name || typeof name !== 'string') return { ok: false, error: '凭据名称无效' };
    return wrap(() => unsetCredential(name))();
  });
}

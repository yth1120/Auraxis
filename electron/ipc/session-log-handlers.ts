import { ipcMain } from 'electron';
import { projectAgentLog, readAgentLog } from '../session-log';

/** Session-log IPC — replay a durable agent run timeline. */
export function registerSessionLogHandlers() {
  ipcMain.handle('sessionLog:read', async (_e, agentId: string) => {
    try {
      if (!agentId || typeof agentId !== 'string') return { ok: false, error: '任务 ID 无效' };
      return { ok: true, data: await readAgentLog(agentId) };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  /** Project an agent run into the shared session shape (replay/diagnostics). */
  ipcMain.handle('sessionLog:project', async (_e, agentId: string) => {
    try {
      if (!agentId || typeof agentId !== 'string') return { ok: false, error: '任务 ID 无效' };
      return { ok: true, data: await projectAgentLog(agentId) };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

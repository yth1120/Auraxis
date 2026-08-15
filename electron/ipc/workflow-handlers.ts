import { ipcMain } from 'electron';
import { listWorkflows, startWorkflow, getWorkflowRun, listWorkflowRuns } from '../workflow-engine';

function wrap<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      return { ok: true, data: await fn() };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  };
}

/** Workflows IPC — script-driven multi-agent orchestration. */
export function registerWorkflowHandlers() {
  ipcMain.handle('workflow:list', async (_e, projectRoot?: string) => wrap(() => listWorkflows(projectRoot))());

  ipcMain.handle('workflow:run', async (_e, payload: { workflowId: string; projectRoot: string }) => {
    try {
      const defs = await listWorkflows(payload?.projectRoot);
      const def = defs.find((d) => d.id === payload?.workflowId || d.name === payload?.workflowId);
      if (!def) return { ok: false, error: `工作流不存在: ${payload?.workflowId}` };
      const runId = await startWorkflow(def, payload.projectRoot);
      return { ok: true, data: { runId } };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('workflow:get', async (_e, runId: string) => wrap(() => getWorkflowRun(runId))());
  ipcMain.handle('workflow:runs', async (_e, workflowId?: string) => wrap(() => listWorkflowRuns(workflowId))());
}

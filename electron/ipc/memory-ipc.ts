/**
 * Memory IPC handlers — bridges the renderer to the memory database.
 */

import { ipcMain } from 'electron';
import { extractMemories } from './memory-extractor';
import {
  addMemory,
  getMemoriesByProject,
  getMemoriesByType,
  searchMemories,
  updateMemory,
  archiveMemory,
  getActiveMemories,
  deleteMemory,
  type MemoryRecord,
} from './memory-db';
import { resolveApiBase } from './model-config';
import { readSettings } from './settings-store';

// ─── Helpers ───────────────────────────────────────────

async function getApiConfig() {
  // Use the already-imported async readSettings — never use sync file I/O
  const settings = await readSettings() as Record<string, unknown>;
  const modelId = (settings.defaultModel as string) || 'deepseek-v4-pro';
  const apiKey = (process.env.DEEPSEEK_API_KEY || settings.deepseekApiKey || '') as string;

  return {
    model: modelId,
    apiKey: apiKey || '',
    apiBase: resolveApiBase(modelId),
  };
}

// ─── Registration ──────────────────────────────────────

export function registerMemoryIpc() {
  ipcMain.handle('memory:extract', async (_event, sessionContext: {
    projectPath: string;
    sessionId: string;
    messages: { role: string; content: string }[];
    planHistory?: { title?: string; todos?: { content: string; status: string }[] }[];
    toolResults?: { toolName: string; summary: string; success: boolean }[];
  }) => {
    try {
      // Get existing memories for dedup
      const existing = getActiveMemories(sessionContext.projectPath).map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content,
        type: m.type,
        tags: JSON.parse(m.tags || '[]'),
        importance: m.importance,
      }));

      const config = await getApiConfig();
      if (!config.apiKey) {
        return { ok: true, data: [] }; // silently skip if no key configured
      }

      const memories = await extractMemories(
        { ...sessionContext, existingMemories: existing },
        config,
      );

      // Persist extracted memories
      const saved: MemoryRecord[] = [];
      for (const mem of memories) {
        const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const record = {
          id,
          project_path: sessionContext.projectPath,
          type: mem.type,
          title: mem.title,
          content: mem.content,
          tags: JSON.stringify(mem.tags),
          timestamp: Date.now(),
          session_id: sessionContext.sessionId,
          importance: mem.importance,
          is_active: 1,
        };
        addMemory(record);
        saved.push(record);
      }

      return { ok: true, data: saved };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('memory:getByProject', async (_event, projectPath: string) => {
    try {
      const memories = getActiveMemories(projectPath);
      return { ok: true, data: memories };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('memory:getByType', async (_event, projectPath: string, type: string) => {
    try {
      const memories = getMemoriesByType(projectPath, type);
      return { ok: true, data: memories };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('memory:search', async (_event, projectPath: string, query: string) => {
    try {
      const memories = searchMemories(projectPath, query);
      return { ok: true, data: memories };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('memory:archive', async (_event, memoryId: string) => {
    try {
      archiveMemory(memoryId);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('memory:delete', async (_event, memoryId: string) => {
    try {
      deleteMemory(memoryId);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

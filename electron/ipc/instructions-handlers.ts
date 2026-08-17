/**
 * instructions-handlers.ts — global & folder-level Instructions (AGENTS.md).
 *
 * Global instructions live in the userData dir (same file loadAgentInstructions
 * reads), folder-level instructions are AGENTS.md files inside the project.
 * All writes stay inside the project root (folder scope) or the userData dir
 * (global scope).
 */
import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import path from 'path';
import { globalInstructionsDir } from '../agent-instructions';
import { isPathInside } from './shared';

const MAX_FOLDER_DEPTH = 4;

async function readFirstExisting(dir: string): Promise<{ name: string; content: string } | null> {
  for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
    try {
      const p = path.join(dir, name);
      await stat(p);
      return { name, content: await readFile(p, 'utf8') };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function walkFolders(root: string, dir: string, depth: number, out: { relPath: string; hasOverride: boolean; hasAgents: boolean }[]): Promise<void> {
  if (depth > MAX_FOLDER_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let hasOverride = false;
  let hasAgents = false;
  for (const e of entries) {
    if (e.isFile() && e.name === 'AGENTS.override.md') hasOverride = true;
    if (e.isFile() && e.name === 'AGENTS.md') hasAgents = true;
  }
  if (hasOverride || hasAgents) {
    out.push({
      relPath: path.relative(root, dir).replace(/\\/g, '/') || '.',
      hasOverride,
      hasAgents,
    });
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    await walkFolders(root, path.join(dir, e.name), depth + 1, out);
  }
}

function resolveFolder(projectRoot: string, relPath: string | undefined): string {
  const root = path.resolve(projectRoot);
  const target = relPath && relPath.trim() && relPath !== '.'
    ? path.resolve(root, relPath.replace(/\\/g, '/'))
    : root;
  if (target !== root && !isPathInside(target, root)) {
    throw new Error('指令文件夹越界：只能编辑项目内的 AGENTS.md');
  }
  return target;
}

export function registerInstructionsHandlers() {
  ipcMain.handle('instructions:getGlobal', async () => {
    try {
      const dir = globalInstructionsDir();
      const hit = await readFirstExisting(dir);
      return {
        ok: true,
        data: { path: path.join(dir, hit?.name ?? 'AGENTS.md'), content: hit?.content ?? '' },
      };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('instructions:setGlobal', async (_event, content: unknown) => {
    try {
      const dir = globalInstructionsDir();
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'AGENTS.md'), String(content ?? ''), 'utf8');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('instructions:listProject', async (_event, projectRoot: string) => {
    try {
      const root = path.resolve(projectRoot);
      const folders: { relPath: string; hasOverride: boolean; hasAgents: boolean }[] = [];
      await walkFolders(root, root, 0, folders);
      folders.sort((a, b) => {
        if (a.relPath === '.') return -1;
        if (b.relPath === '.') return 1;
        return a.relPath.localeCompare(b.relPath);
      });
      return { ok: true, data: folders };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('instructions:get', async (_event, projectRoot: string, relPath?: string) => {
    try {
      const root = path.resolve(projectRoot);
      const dir = resolveFolder(root, relPath);
      const hit = await readFirstExisting(dir);
      return {
        ok: true,
        data: {
          path: path.join(dir, hit?.name ?? 'AGENTS.md'),
          content: hit?.content ?? '',
          relPath: path.relative(root, dir).replace(/\\/g, '/') || '.',
        },
      };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('instructions:set', async (_event, projectRoot: string, relPath: string | undefined, content: unknown) => {
    try {
      const root = path.resolve(projectRoot);
      const dir = resolveFolder(root, relPath);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'AGENTS.md'), String(content ?? ''), 'utf8');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });
}

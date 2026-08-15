import { ipcMain, dialog } from 'electron';
import { readFile, writeFile, readdir, rm, rename, mkdir, stat } from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { normalizeWinPath, isPathInside, isAllowedExtension, assertString } from './shared';
import { estimateTokens } from './token-estimate';

const PREVIEW_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const TOKEN_ESTIMATE_MAX_BYTES = 2 * 1024 * 1024;

function resolveInsideProject(filePath: string, projectRoot?: string): string | null {
  const normalizedPath = path.resolve(normalizeWinPath(filePath));
  if (projectRoot) {
    const root = path.resolve(projectRoot);
    if (!isPathInside(normalizedPath, root)) return null;
  }
  return normalizedPath;
}

export function registerFileHandlers() {
  ipcMain.handle('file:open', async (_event, projectRoot?: string) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '代码文件', extensions: ['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'json', 'md', 'mjs', 'cjs', 'vue', 'svelte'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, data: [] };
      }

      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const mimeType = mime.lookup(filePath) || 'text/plain';
          const content = await readFile(filePath, 'utf-8');
          return {
            name: path.basename(filePath),
            path: filePath,
            content,
            mimeType,
          };
        })
      );

      return { ok: true, data: files };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:read', async (_event, filePath: string, projectRoot?: string) => {
    try {
      const normalizedPath = resolveInsideProject(filePath, projectRoot);
      if (!normalizedPath) return { ok: false, error: '不允许读取项目目录外的文件' };
      const content = await readFile(normalizedPath, 'utf-8');
      return { ok: true, data: content };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:estimateTokens', async (_event, files: string[], projectRoot?: string) => {
    try {
      if (!Array.isArray(files)) return { ok: false, error: 'files 必须是数组' };
      const results: { path: string; bytes: number; tokens: number | null; skipped?: 'binary' | 'too-large' }[] = [];
      for (const raw of files.slice(0, 20)) {
        const filePath = resolveInsideProject(String(raw), projectRoot);
        if (!filePath) continue;
        try {
          const st = await stat(filePath);
          if (!st.isFile()) continue;
          if (st.size > TOKEN_ESTIMATE_MAX_BYTES) {
            results.push({ path: String(raw), bytes: st.size, tokens: null, skipped: 'too-large' });
            continue;
          }
          const text = await readFile(filePath, 'utf-8');
          if (text.includes('\0')) {
            results.push({ path: String(raw), bytes: st.size, tokens: null, skipped: 'binary' });
            continue;
          }
          results.push({ path: String(raw), bytes: st.size, tokens: estimateTokens(text) });
        } catch { /* missing/unreadable — skip */ }
      }
      return { ok: true, data: results };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:readPreview', async (_event, filePath: string, projectRoot?: string) => {
    try {
      const normalizedPath = resolveInsideProject(filePath, projectRoot);
      if (!normalizedPath) return { ok: false, error: '不允许读取项目目录外的文件' };
      const ext = path.extname(normalizedPath).toLowerCase();
      if (!PREVIEW_EXTENSIONS.has(ext)) return { ok: false, error: '不支持预览该文件类型' };
      const st = await stat(normalizedPath);
      if (st.size > PREVIEW_MAX_BYTES) return { ok: false, error: '文件过大，无法预览' };
      const buf = await readFile(normalizedPath);
      const mimeType = ext === '.svg'
        ? 'image/svg+xml'
        : mime.lookup(normalizedPath) || 'application/octet-stream';
      return {
        ok: true,
        data: {
          path: filePath,
          mime: mimeType,
          base64: buf.toString('base64'),
          size: buf.length,
        },
      };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:write', async (_event, filePath: string, content: string, projectRoot?: string) => {
    try {
      assertString(filePath, 'filePath');
      assertString(content, 'content', true);
      const normalizedPath = path.resolve(normalizeWinPath(filePath));

      if (projectRoot) {
        const root = path.resolve(projectRoot);
        if (!isPathInside(normalizedPath, root)) {
          return { ok: false, error: '不允许写入项目目录外的文件' };
        }
      }

      if (!isAllowedExtension(normalizedPath)) {
        return { ok: false, error: `不允许写入该文件类型: ${path.extname(normalizedPath)}` };
      }

      await writeFile(normalizedPath, content, 'utf-8');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:search', async (_event, keyword: string, projectRoot: string) => {
    try {
      if (!keyword || keyword.length < 1) {
        return { ok: true, data: [] };
      }

      const root = path.resolve(projectRoot);
      const results: { name: string; path: string; isDirectory: boolean }[] = [];
      const lowerKeyword = keyword.toLowerCase();

      const searchDir = async (dirPath: string, depth: number): Promise<void> => {
        if (depth > 4 || results.length >= 50) return;

        try {
          const entries = await readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const fullPath = path.join(dirPath, entry.name);

            if (entry.name.toLowerCase().includes(lowerKeyword)) {
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
              });
            }

            if (entry.isDirectory()) {
              await searchDir(fullPath, depth + 1);
            }
          }
        } catch {
          // skip inaccessible directories
        }
      };

      await searchDir(root, 0);
      return { ok: true, data: results };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:delete', async (_event, filePath: string, projectRoot?: string) => {
    try {
      const normalizedPath = path.resolve(normalizeWinPath(filePath));
      if (projectRoot) {
        const root = path.resolve(projectRoot);
        // Reject the project root itself — rm(recursive) would erase everything.
        if (normalizedPath === root || !isPathInside(normalizedPath, root)) {
          return { ok: false, error: '不允许删除项目目录外的文件' };
        }
      }
      await rm(normalizedPath, { recursive: true, force: true });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string, projectRoot?: string) => {
    try {
      const normalizedOld = path.resolve(normalizeWinPath(oldPath));
      const normalizedNew = path.resolve(normalizeWinPath(newPath));
      if (projectRoot) {
        const root = path.resolve(projectRoot);
        // Renaming the project root itself would silently move the whole
        // workspace out from under the app.
        if (normalizedOld === root || normalizedNew === root
          || !isPathInside(normalizedOld, root) || !isPathInside(normalizedNew, root)) {
          return { ok: false, error: '不允许操作项目目录外的文件' };
        }
      }
      await rename(normalizedOld, normalizedNew);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:createFolder', async (_event, dirPath: string, projectRoot?: string) => {
    try {
      const normalizedPath = path.resolve(normalizeWinPath(dirPath));
      if (projectRoot) {
        const root = path.resolve(projectRoot);
        if (!isPathInside(normalizedPath, root)) {
          return { ok: false, error: '不允许在项目目录外创建文件夹' };
        }
      }
      await mkdir(normalizedPath, { recursive: true });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('file:createFile', async (_event, filePath: string, projectRoot?: string) => {
    try {
      const normalizedPath = path.resolve(normalizeWinPath(filePath));
      if (projectRoot) {
        const root = path.resolve(projectRoot);
        if (!isPathInside(normalizedPath, root)) {
          return { ok: false, error: '不允许在项目目录外创建文件' };
        }
      }
      if (!isAllowedExtension(normalizedPath)) {
        return { ok: false, error: `不允许创建该文件类型: ${path.extname(normalizedPath)}` };
      }
      await writeFile(normalizedPath, '', 'utf-8');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

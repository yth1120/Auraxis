/**
 * permission-profile.ts — named permission profiles（命名权限档案）。
 *
 * A profile is a hard boundary layered on top of the ask/plan/afe autonomy
 * mode: file globs (read/write/deny) + network domain allow/deny. Denies are
 * enforced before any prompt; write-grants fall through to the normal mode
 * prompt flow so the built-in "标准" profile preserves current behavior.
 */
import { ipcMain } from 'electron';
import path from 'path';
import { readSettings, writeSettings } from './ipc/settings-store';

export type ToolPolicy = 'ask' | 'plan' | 'afe';
export type FileAccess = 'read' | 'write' | 'deny';
export type NetworkAccess = 'allow' | 'deny';

export interface FileScope {
  pattern: string;
  access: FileAccess;
}

export interface NetworkScope {
  pattern: string;
  access: NetworkAccess;
}

export interface PermissionProfile {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  toolPolicy: ToolPolicy;
  fileScopes: FileScope[];
  networkScopes: NetworkScope[];
}

export const BUILTIN_PROFILES: PermissionProfile[] = [
  {
    id: 'standard',
    name: '标准',
    description: '项目内文件可读写，网络可用，危险操作按运行模式确认。',
    builtin: true,
    toolPolicy: 'ask',
    fileScopes: [{ pattern: '**', access: 'write' }],
    networkScopes: [{ pattern: '*', access: 'allow' }],
  },
  {
    id: 'readonly',
    name: '只读',
    description: '项目只读探索：拒绝一切写文件 / 删除操作，网络可用。',
    builtin: true,
    toolPolicy: 'ask',
    fileScopes: [{ pattern: '**', access: 'read' }],
    networkScopes: [{ pattern: '*', access: 'allow' }],
  },
  {
    id: 'sandbox',
    name: '沙箱',
    description: '文件可写（由工作区沙箱收口），网络默认拒绝。',
    builtin: true,
    toolPolicy: 'afe',
    fileScopes: [{ pattern: '**', access: 'write' }],
    networkScopes: [{ pattern: '*', access: 'deny' }],
  },
];

export async function loadPermissionProfiles(): Promise<{
  profiles: PermissionProfile[];
  activeId: string;
}> {
  const settings = await readSettings();
  const custom = Array.isArray(settings.permissionProfiles)
    ? (settings.permissionProfiles as PermissionProfile[]).filter((p) => p && p.id)
    : [];
  const profiles = [...BUILTIN_PROFILES, ...custom];
  const activeId = typeof settings.activePermissionProfile === 'string'
    ? settings.activePermissionProfile
    : 'standard';
  return { profiles, activeId };
}

export async function getActivePermissionProfile(): Promise<PermissionProfile | null> {
  const { profiles, activeId } = await loadPermissionProfiles();
  return profiles.find((p) => p.id === activeId) ?? null;
}

/** Translate a file glob (`**`, `*`, `?`) into a RegExp over posix paths. */
export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '*') {
      if (normalized[i + 1] === '*') {
        i++;
        if (normalized[i + 1] === '/') {
          i++;
          re += '(?:[^/]+/)*';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesGlob(pattern: string, relPath: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  const rel = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return globToRegExp(p).test(rel);
}

function domainMatches(pattern: string, host: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '');
  const h = host.toLowerCase();
  if (p === '*' || p === h) return true;
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return h === suffix || h.endsWith('.' + suffix);
  }
  return h.endsWith('.' + p);
}

export interface ProfileVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Evaluate a file-scope request. `requested` is 'read' (Read/Grep/Glob) or
 * 'write' (Write/Edit/Delete/NotebookEdit). Last matching rule wins; write
 * defaults to deny, read defaults to allow.
 */
export function evaluateFileProfile(
  profile: PermissionProfile,
  relPath: string,
  requested: 'read' | 'write',
): ProfileVerdict {
  const rel = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  let verdict: FileAccess | null = null;
  let matched: string | null = null;
  for (const scope of profile.fileScopes) {
    if (matchesGlob(scope.pattern, rel)) {
      verdict = scope.access;
      matched = scope.pattern;
    }
  }
  if (verdict === 'deny') {
    return { allowed: false, reason: `权限 Profile 拒绝访问 ${rel}（${matched}）` };
  }
  if (requested === 'write') {
    if (verdict === 'read') {
      return { allowed: false, reason: `权限 Profile 只读：${rel}（${matched ?? '**'}）` };
    }
    if (verdict !== 'write') {
      return { allowed: false, reason: `权限 Profile 未授予写权限：${rel}` };
    }
  }
  return { allowed: true };
}

/**
 * Evaluate a network request. `urlOrHost` is the URL for WebFetch or '*'
 * for WebSearch (only a catch-all rule can match it). Deny is hard-blocked;
 * anything else falls through to the normal prompt flow.
 */
export function evaluateNetworkProfile(
  profile: PermissionProfile,
  urlOrHost: string,
): ProfileVerdict {
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).hostname || urlOrHost;
  } catch { /* already a host or plain text */ }
  let verdict: NetworkAccess | null = null;
  let matched: string | null = null;
  for (const scope of profile.networkScopes) {
    if (domainMatches(scope.pattern, host)) {
      verdict = scope.access;
      matched = scope.pattern;
    }
  }
  if (verdict === 'deny') {
    return { allowed: false, reason: `权限 Profile 拒绝访问 ${host}（${matched}）` };
  }
  return { allowed: true };
}

const FILE_TOOL_READ = new Set(['Read', 'Grep', 'Glob']);
const FILE_TOOL_WRITE = new Set(['Write', 'Edit', 'Delete', 'NotebookEdit']);
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

/** Extract a scoped path from a tool input (file_path or path). */
function inputPath(toolName: string, input: Record<string, unknown>): string | null {
  const raw = typeof input.file_path === 'string' && input.file_path
    ? input.file_path
    : typeof input.path === 'string' && input.path
      ? input.path
      : null;
  return raw;
}

/**
 * Hard-boundary gate for a tool call. Returns { allowed: false } with a reason
 * for profile denies, otherwise lets the existing permission flow continue.
 */
export async function evaluateToolProfileGate(
  toolName: string,
  input: Record<string, unknown>,
  projectRoot?: string,
): Promise<ProfileVerdict> {
  if (!projectRoot) return { allowed: true };
  const profile = await getActivePermissionProfile();
  if (!profile) return { allowed: true };

  if (FILE_TOOL_READ.has(toolName) || FILE_TOOL_WRITE.has(toolName)) {
    const filePath = inputPath(toolName, input);
    if (!filePath) return { allowed: true };
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    const rel = path.relative(path.resolve(projectRoot), abs);
    // Paths outside the project are out of profile scope — keep existing flow.
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { allowed: true };
    return evaluateFileProfile(
      profile,
      rel,
      FILE_TOOL_WRITE.has(toolName) ? 'write' : 'read',
    );
  }

  if (NETWORK_TOOLS.has(toolName)) {
    // WebSearch has no URL — only a catch-all rule can meaningfully match it.
    const target = toolName === 'WebSearch' ? '*' : String(input.url ?? '*');
    return evaluateNetworkProfile(profile, target);
  }

  return { allowed: true };
}

export function registerPermissionProfileIpc() {
  ipcMain.handle('permission:listProfiles', async () => {
    try {
      return { ok: true, data: await loadPermissionProfiles() };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('permission:saveProfiles', async (_event, params: {
    custom: PermissionProfile[];
    activeId: string;
  }) => {
    try {
      const settings = await readSettings();
      settings.permissionProfiles = Array.isArray(params?.custom) ? params.custom : [];
      if (typeof params?.activeId === 'string' && params.activeId) {
        settings.activePermissionProfile = params.activeId;
      }
      await writeSettings(settings);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}

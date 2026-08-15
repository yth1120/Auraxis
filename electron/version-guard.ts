/**
 * version-guard.ts — content version guards for Write/Edit （文件版本守卫）.
 *
 * Read returns a short content hash ("version"); Write/Edit can pass it back
 * so a stale overwrite is rejected when the file changed since it was read.
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export function hashContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export async function fileVersion(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    return hashContent(buf);
  } catch {
    return null; // file missing or unreadable
  }
}

export interface VersionGuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Enforce an optional version guard. `expected`:
 *  - undefined / ''  → no guard, always ok
 *  - 'new'           → file must NOT exist (create-only)
 *  - otherwise       → current content hash must equal `expected`
 */
export async function verifyVersionGuard(
  filePath: string,
  expected: string | undefined,
  projectRoot: string,
): Promise<VersionGuardResult> {
  if (!expected) return { ok: true };
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
  const current = await fileVersion(abs);
  if (expected === 'new') {
    if (current !== null) {
      return { ok: false, error: '版本守卫：文件已存在，拒绝覆盖（创建时请传 version="new"）' };
    }
    return { ok: true };
  }
  if (current === null) {
    return { ok: false, error: '版本守卫：文件不存在，无法按版本写入' };
  }
  if (current !== expected) {
    return {
      ok: false,
      error: `版本守卫：文件已被修改（当前 ${current} ≠ 期望 ${expected}）。请重新 Read 后再写入，避免覆盖他人改动。`,
    };
  }
  return { ok: true };
}

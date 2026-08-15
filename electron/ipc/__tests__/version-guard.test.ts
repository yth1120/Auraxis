import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hashContent, fileVersion, verifyVersionGuard } from '../../version-guard';

let testDir: string;
let fileA: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auraxis-vg-'));
  fileA = path.join(testDir, 'a.ts');
  fs.writeFileSync(fileA, 'v1', 'utf-8');
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('version guard', () => {
  it('hashes content deterministically', () => {
    expect(hashContent('v1')).toBe(hashContent('v1'));
    expect(hashContent('v1')).not.toBe(hashContent('v2'));
    expect(hashContent('v1')).toHaveLength(12);
  });

  it('no expected version → no guard', async () => {
    expect((await verifyVersionGuard(fileA, undefined, testDir)).ok).toBe(true);
    expect((await verifyVersionGuard(fileA, '', testDir)).ok).toBe(true);
  });

  it('matching version passes', async () => {
    const v = await fileVersion(fileA);
    const res = await verifyVersionGuard(fileA, v!, testDir);
    expect(res.ok).toBe(true);
  });

  it('stale version is rejected with a readable message', async () => {
    const v = await fileVersion(fileA);
    fs.writeFileSync(fileA, 'v2-changed', 'utf-8');
    const res = await verifyVersionGuard(fileA, v!, testDir);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('已被修改');
  });

  it('version="new" refuses existing files and allows new ones', async () => {
    const existing = await verifyVersionGuard(fileA, 'new', testDir);
    expect(existing.ok).toBe(false);
    const fresh = path.join(testDir, 'new-file.txt');
    const res = await verifyVersionGuard(fresh, 'new', testDir);
    expect(res.ok).toBe(true);
  });

  it('rejects writes to a missing file when a concrete version is expected', async () => {
    const res = await verifyVersionGuard(path.join(testDir, 'missing.ts'), 'abc123', testDir);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('不存在');
  });

  it('resolves relative paths against the project root', async () => {
    const v = await fileVersion(fileA);
    const res = await verifyVersionGuard('a.ts', v!, testDir);
    expect(res.ok).toBe(true);
  });
});

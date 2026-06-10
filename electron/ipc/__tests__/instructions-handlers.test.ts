import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  app: { getPath: vi.fn(() => '/tmp/auraxis-userdata') },
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMock.handle },
  app: electronMock.app,
}));

import { registerInstructionsHandlers } from '../instructions-handlers';

type Handler = (event: unknown, ...args: unknown[]) => Promise<any>;

function capture(): Map<string, Handler> {
  electronMock.handle.mockClear();
  registerInstructionsHandlers();
  const map = new Map<string, Handler>();
  for (const [channel, fn] of electronMock.handle.mock.calls) {
    map.set(channel as string, fn as Handler);
  }
  return map;
}

describe('instructions-handlers', () => {
  let globalDir: string;
  let projectDir: string;

  beforeEach(async () => {
    globalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-global-instr-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-project-instr-'));
    process.env.AURAXIS_HOME_DIR = globalDir;
  });

  it('reads and writes global instructions', async () => {
    const h = capture();
    const r1 = await h.get('instructions:getGlobal')!({});
    expect(r1.ok).toBe(true);
    expect(r1.data.content).toBe('');
    const w = await h.get('instructions:setGlobal')!({}, '全局规则：不要用中文变量名');
    expect(w.ok).toBe(true);
    const r2 = await h.get('instructions:getGlobal')!({});
    expect(r2.data.content).toContain('全局规则');
    expect(r2.data.path).toContain('AGENTS.md');
  });

  it('lists folders that contain AGENTS files', async () => {
    await fs.writeFile(path.join(projectDir, 'AGENTS.md'), 'root rules', 'utf8');
    await fs.mkdir(path.join(projectDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'docs', 'AGENTS.override.md'), 'docs rules', 'utf8');
    const h = capture();
    const r = await h.get('instructions:listProject')!({}, projectDir);
    expect(r.ok).toBe(true);
    expect(r.data.map((x: { relPath: string }) => x.relPath)).toEqual(expect.arrayContaining(['.', 'docs']));
    const docs = r.data.find((x: { relPath: string }) => x.relPath === 'docs');
    expect(docs.hasOverride).toBe(true);
  });

  it('reads and writes folder-level instructions inside the project', async () => {
    const h = capture();
    const w = await h.get('instructions:set')!({}, projectDir, 'docs', '文档写作规范');
    expect(w.ok).toBe(true);
    const r = await h.get('instructions:get')!({}, projectDir, 'docs');
    expect(r.ok).toBe(true);
    expect(r.data.content).toBe('文档写作规范');
    expect(r.data.relPath).toBe('docs');
  });

  it('rejects folder writes outside the project root', async () => {
    const h = capture();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-outside-'));
    const r = await h.get('instructions:set')!({}, projectDir, path.relative(projectDir, outside), 'x');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('越界');
  });

  it('uses override file when present', async () => {
    await fs.mkdir(path.join(projectDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'sub', 'AGENTS.md'), 'base', 'utf8');
    await fs.writeFile(path.join(projectDir, 'sub', 'AGENTS.override.md'), 'override', 'utf8');
    const h = capture();
    const r = await h.get('instructions:get')!({}, projectDir, 'sub');
    expect(r.data.content).toBe('override');
    expect(r.data.path).toContain('AGENTS.override.md');
  });
});

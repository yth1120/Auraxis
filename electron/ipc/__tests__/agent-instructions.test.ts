import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadGlobalInstructions, loadProjectInstructions, loadAgentInstructions } from '../../agent-instructions';

let home: string;
let projectRoot: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-home-'));
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-instructions-'));
  process.env.AURAXIS_HOME_DIR = home;
});

afterEach(async () => {
  delete process.env.AURAXIS_HOME_DIR;
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(projectRoot, { recursive: true, force: true });
});

describe('agent-instructions', () => {
  it('loads the global AGENTS.md layer', async () => {
    await fs.writeFile(path.join(home, 'AGENTS.md'), '全局规则：先跑测试', 'utf8');
    expect(await loadGlobalInstructions()).toContain('全局规则');
  });

  it('merges root → nested layers with override precedence', async () => {
    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), '根规则', 'utf8');
    const nested = path.join(projectRoot, 'src', 'payments');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'AGENTS.override.md'), '支付模块规则', 'utf8');

    const merged = await loadProjectInstructions(projectRoot, nested);
    expect(merged.indexOf('根规则')).toBeLessThan(merged.indexOf('支付模块规则'));
  });

  it('目录内无 AGENTS.md 时返回空', async () => {
    const merged = await loadProjectInstructions(projectRoot);
    expect(merged).toBe('');
  });

  it('caps the combined size at 32 KiB', async () => {
    const big = 'x'.repeat(40 * 1024);
    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), big, 'utf8');
    const merged = await loadProjectInstructions(projectRoot);
    expect(Buffer.byteLength(merged)).toBeLessThanOrEqual(32 * 1024);
  });

  it('loadAgentInstructions combines global and project layers', async () => {
    await fs.writeFile(path.join(home, 'AGENTS.md'), '全局规则', 'utf8');
    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), '项目规则', 'utf8');
    const combined = await loadAgentInstructions(projectRoot);
    expect(combined).toContain('全局规则');
    expect(combined).toContain('项目规则');
  });
});

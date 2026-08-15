import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { scanPluginDir, setPluginEnabled, getPluginState } from '../../plugin-cli';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-plugin-cli-'));
  process.env.AURAXIS_USER_DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.AURAXIS_USER_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('plugin-cli', () => {
  it('scans directories for .auraxis-plugin/plugin.json manifests', async () => {
    await fs.mkdir(path.join(dir, 'my-plugin', '.auraxis-plugin'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'my-plugin', '.auraxis-plugin', 'plugin.json'),
      JSON.stringify({ id: 'my-plugin', name: '我的插件', version: '1.2.0' }),
      'utf8',
    );
    const found = await scanPluginDir(dir);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'my-plugin', name: '我的插件', version: '1.2.0' });
  });

  it('enable/disable persists the enabled-id set', async () => {
    const first = await setPluginEnabled('alpha', true);
    expect(first.ok).toBe(true);
    await setPluginEnabled('beta', true);
    await setPluginEnabled('alpha', false);
    const state = await getPluginState();
    expect(state.enabledIds).toEqual(['beta']);
  });

  it('rejects empty ids', async () => {
    const r = await setPluginEnabled('', true);
    expect(r.ok).toBe(false);
  });
});

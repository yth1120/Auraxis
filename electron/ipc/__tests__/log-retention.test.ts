import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { runLogRetention } from '../../log-retention';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-retention-'));
  process.env.AURAXIS_LOG_RETENTION_DAYS = '2';
  process.env.AURAXIS_LOG_MAX_FILE_MB = '1';
});

afterEach(async () => {
  delete process.env.AURAXIS_LOG_RETENTION_DAYS;
  delete process.env.AURAXIS_LOG_MAX_FILE_MB;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('log-retention', () => {
  it('removes old and oversized logs, keeps recent small ones', async () => {
    const old = path.join(dir, 'old.jsonl');
    await fs.writeFile(old, 'x', 'utf8');
    await fs.utimes(old, new Date(Date.now() - 3 * 24 * 3600 * 1000), new Date(Date.now() - 3 * 24 * 3600 * 1000));

    const recent = path.join(dir, 'recent.jsonl');
    await fs.writeFile(recent, 'x', 'utf8');

    const big = path.join(dir, 'big.jsonl');
    await fs.writeFile(big, Buffer.alloc(1.5 * 1024 * 1024));

    const result = await runLogRetention({ dirs: [dir] });

    expect(result.removed).toBe(2);
    expect(result.scanned).toBe(3);
    await expect(fs.access(old)).rejects.toThrow();
    await expect(fs.access(big)).rejects.toThrow();
    await fs.access(recent);
  });

  it('keeps everything when nothing exceeds the policy', async () => {
    const file = path.join(dir, 'keep.jsonl');
    await fs.writeFile(file, 'x', 'utf8');
    const result = await runLogRetention({ dirs: [dir] });
    expect(result.removed).toBe(0);
    await fs.access(file);
  });
});

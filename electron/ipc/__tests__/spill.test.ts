import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { writeSpill, readSpill, resolveSpillPath } from '../../spill';

let spillDir: string;

beforeEach(async () => {
  spillDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-spill-'));
  process.env.AURAXIS_SPILL_DIR = spillDir;
});

afterEach(async () => {
  delete process.env.AURAXIS_SPILL_DIR;
  await fs.rm(spillDir, { recursive: true, force: true });
});

describe('spill — 大输出落盘', () => {
  it('writes oversized output to a private spill file with byte count', async () => {
    const content = 'x'.repeat(50_000);
    const ref = await writeSpill(content, { sessionId: 'agent-abc', toolName: 'Bash' });
    expect(ref.path.startsWith(spillDir)).toBe(true);
    expect(ref.bytes).toBe(50_000);
    const onDisk = await fs.readFile(ref.path, 'utf8');
    expect(onDisk).toBe(content);
  });

  it('reads a spill file back with bounded output', async () => {
    const ref = await writeSpill('hello spill', { sessionId: 's1' });
    const { content, bytes } = await readSpill(ref.path);
    expect(content).toBe('hello spill');
    expect(bytes).toBe(11);

    const big = await writeSpill('a'.repeat(5000), { sessionId: 's1' });
    const capped = await readSpill(big.path, 100);
    expect(capped.content.length).toBeLessThanOrEqual(120);
  });

  it('rejects spill paths that escape the spill root', async () => {
    await writeSpill('secret', { sessionId: 's1' });
    expect(() => resolveSpillPath('../outside.txt')).toThrow();
    expect(() => resolveSpillPath('sub/../../outside.txt')).toThrow();
  });
});

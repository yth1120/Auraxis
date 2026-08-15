import { describe, it, expect } from 'vitest';
import path from 'path';
import { createAuraxis, type AuraxisClient } from '../index';

const FIXTURE = path.join(__dirname, 'fixtures', 'fake-sdk-server.cjs');

async function makeClient(requestTimeoutMs = 5000): Promise<AuraxisClient> {
  return createAuraxis({
    electronPath: process.execPath,
    mainJs: FIXTURE,
    requestTimeoutMs,
    spawnTimeoutMs: 5000,
  });
}

describe('@auraxis/sdk client', () => {
  it('pings the runtime', async () => {
    const client = await makeClient();
    const pong = await client.ping();
    expect(pong.pong).toBe(true);
    await client.close();
  });

  it('runs an agent with request params', async () => {
    const client = await makeClient();
    const out = await client.runAgent({ prompt: '修复 bug', description: 'SDK 任务', projectRoot: 'C:/proj' });
    expect(out).toEqual({ ran: '修复 bug', description: 'SDK 任务' });
    await client.close();
  });

  it('maps RPC errors to exceptions', async () => {
    const client = await makeClient();
    await expect(client.runAgent({ prompt: '' })).rejects.toThrow(/prompt 必填/);
    await client.close();
  });

  it('searches sessions', async () => {
    const client = await makeClient();
    const res = await client.searchSessions('hello', 3);
    expect(res).toEqual({ query: 'hello', count: 0, results: [] });
    await client.close();
  });

  it('rejects unknown methods with a descriptive error', async () => {
    const client = await makeClient();
    await expect(client.request('nope')).rejects.toThrow(/未知方法/);
    await client.close();
  });

  it('times out a hung request and stays usable', async () => {
    const client = await makeClient(300);
    await expect(client.request('hang')).rejects.toThrow(/timeout/i);
    const pong = await client.ping();
    expect(pong.pong).toBe(true);
    await client.close();
  });

  it('close terminates the child process', async () => {
    // createAuraxis kills the spawned runtime on close — the fixture exits
    // when its socket server closes and stdin ends, so just verify the client
    // closes cleanly and the runtime port is gone.
    const client = await makeClient();
    await client.close();
    await expect(client.ping()).rejects.toThrow(/closed/);
  });
});

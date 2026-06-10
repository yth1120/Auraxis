/**
 * End-to-end persistence smoke: writes a chat session + agent run through the
 * real IPC-facing log facades, then simulates an app restart (fresh modules /
 * fresh handles) and asserts everything is recoverable — logs, projections,
 * list summaries and FTS index.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({
  app: { getPath: () => process.env.AURAXIS_USER_DATA_DIR || '' },
}));

let dirs: Record<string, string>;

async function setEnv(): Promise<void> {
  dirs = {
    chat: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-chat-')),
    agent: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-agent-')),
    cache: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-cache-')),
    fts: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-fts-')),
    snap: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-snap-')),
    userData: await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-smoke-userdata-')),
  };
  process.env.AURAXIS_CHAT_LOG_DIR = dirs.chat;
  process.env.AURAXIS_SESSION_LOG_DIR = dirs.agent;
  process.env.AURAXIS_SESSION_CACHE_DIR = dirs.cache;
  process.env.AURAXIS_FTS_DIR = dirs.fts;
  process.env.AURAXIS_SNAPSHOT_DIR = dirs.snap;
  process.env.AURAXIS_USER_DATA_DIR = dirs.userData;
}

async function writeChatRun() {
  const chat = await import('../../chat-log');
  await chat.appendChatEvents('smoke-chat', [
    { type: 'user', ts: 1000, data: { text: '帮我修登录 bug' } },
    { type: 'assistant_chunk', ts: 1001, data: { text: '好的，' } },
    { type: 'assistant_chunk', ts: 1002, data: { text: '我先定位问题' } },
    {
      type: 'tool',
      ts: 1003,
      data: { action: 'start', toolName: 'Grep', toolCallId: 'g1', requestId: 'r1', input: { pattern: 'login' } },
    },
    {
      type: 'tool',
      ts: 1004,
      data: { action: 'end', toolName: 'Grep', toolCallId: 'g1', requestId: 'r1', output: 'auth/login.ts' },
    },
  ]);
  await chat.appendChatMeta('smoke-chat', { title: '冒烟会话', model: 'deepseek-v4-pro' });
  const projected = await chat.projectChatSession('smoke-chat');
  expect(projected).not.toBeNull();
  expect(projected!.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(projected!.messages[1].content).toContain('我先定位问题');
  expect(projected!.messages[1].toolCalls).toHaveLength(1);
}

async function writeAgentRun() {
  const agent = await import('../../session-log');
  await agent.appendAgentLog('smoke-agent', [
    { type: 'user', text: '检查项目结构', timestamp: 2000 },
    { type: 'tool_start', toolName: 'Read', toolCallId: 'r1', input: { file_path: 'src/main.ts' }, timestamp: 2001 },
    { type: 'tool_end', toolName: 'Read', toolCallId: 'r1', output: 'export {}', timestamp: 2002 },
    { type: 'text_chunk', text: '结构已经看完了', timestamp: 2003 },
    { type: 'turn_end', turnId: 't1', reason: 'completed', timestamp: 2004 },
  ]);
  const projected = await agent.projectAgentLog('smoke-agent');
  expect(projected).not.toBeNull();
  expect(projected!.kind).toBe('agent');
  expect(projected!.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
}

async function waitForFtsTimers(): Promise<void> {
  // appendChatEvents/appendAgentLog schedule debounced FTS refreshes; let
  // them finish so vitest does not report stray pending timers.
  await new Promise((r) => setTimeout(r, 700));
}

beforeEach(async () => {
  vi.resetModules();
  await setEnv();
});

afterEach(async () => {
  delete process.env.AURAXIS_CHAT_LOG_DIR;
  delete process.env.AURAXIS_SESSION_LOG_DIR;
  delete process.env.AURAXIS_SESSION_CACHE_DIR;
  delete process.env.AURAXIS_FTS_DIR;
  delete process.env.AURAXIS_SNAPSHOT_DIR;
  delete process.env.AURAXIS_USER_DATA_DIR;
  for (const dir of Object.values(dirs)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  vi.resetModules();
});

describe('persistence smoke (write → restart → recover)', () => {
  it('recovers chat + agent sessions and search after a simulated restart', async () => {
    // ── First "app run": write everything through real facades. ──────────
    await writeChatRun();
    await writeAgentRun();
    const ftsFirst = await import('../../fts');
    const indexed = await ftsFirst.rebuildFts();
    expect(indexed).toBeGreaterThanOrEqual(2);
    expect((await ftsFirst.searchFts('登录')).length).toBeGreaterThan(0);
    expect((await ftsFirst.searchFts('结构')).length).toBeGreaterThan(0);

    // ── Restart: fresh module instances, same on-disk state. ─────────────
    vi.resetModules();
    const chat = await import('../../chat-log');
    const agent = await import('../../session-log');
    const fts = await import('../../fts');

    const chatProjected = await chat.projectChatSession('smoke-chat');
    expect(chatProjected).not.toBeNull();
    expect(chatProjected!.title).toBe('冒烟会话');
    expect(chatProjected!.messages[1].content).toContain('我先定位问题');
    expect((await chat.listChatSessions()).map((s) => s.id)).toContain('smoke-chat');

    const agentProjected = await agent.projectAgentLog('smoke-agent');
    expect(agentProjected).not.toBeNull();
    expect(agentProjected!.messages[1].content).toContain('结构已经看完了');
    expect((await agent.listAgentLogs()).map((s) => s.id)).toContain('smoke-agent');

    expect((await fts.searchFts('登录')).some((h) => h.id === 'smoke-chat')).toBe(true);
    expect((await fts.searchFts('结构')).some((h) => h.id === 'agent-smoke-agent')).toBe(true);

    await waitForFtsTimers();
  }, 60_000);
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { appendFeedback, appendMessageFeedback, listMessageFeedback } from '../feedback-handlers';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auraxis-feedback-'));
  process.env.AURAXIS_FEEDBACK_DIR = dir;
});

afterEach(async () => {
  delete process.env.AURAXIS_FEEDBACK_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('feedback — 本地反馈日志', () => {
  it('appends a feedback record as JSONL', async () => {
    const r = await appendFeedback('终端面板很好用');
    expect(r.ok).toBe(true);
    const raw = await fs.readFile(path.join(dir, 'feedback.jsonl'), 'utf8');
    const record = JSON.parse(raw.trim());
    expect(record.text).toBe('终端面板很好用');
    expect(typeof record.ts).toBe('number');
  });

  it('rejects empty feedback', async () => {
    const r = await appendFeedback('   ');
    expect(r.ok).toBe(false);
    await expect(fs.readFile(path.join(dir, 'feedback.jsonl'), 'utf8')).rejects.toThrow();
  });

  it('appends and lists per-message ratings (last write wins)', async () => {
    await appendMessageFeedback({ messageId: 'm1', sessionId: 's1', rating: 'up' });
    await appendMessageFeedback({ messageId: 'm1', sessionId: 's1', rating: 'down' });
    await appendMessageFeedback({ messageId: 'm2', sessionId: 's1', rating: 'up' });
    await appendMessageFeedback({ messageId: 'm2', sessionId: 's2', rating: 'up' });
    const list = await listMessageFeedback('s1');
    expect(list).toHaveLength(2);
    expect(list.find((r) => r.messageId === 'm1')?.rating).toBe('down');
    expect(list.find((r) => r.messageId === 'm2')?.rating).toBe('up');
  });

  it('clears a rating with null', async () => {
    await appendMessageFeedback({ messageId: 'm1', sessionId: 's1', rating: 'up' });
    await appendMessageFeedback({ messageId: 'm1', sessionId: 's1', rating: null });
    expect(await listMessageFeedback('s1')).toHaveLength(0);
  });

  it('rejects invalid message feedback payloads', async () => {
    expect((await appendMessageFeedback({ messageId: '', sessionId: 's', rating: 'up' })).ok).toBe(false);
    expect((await appendMessageFeedback({ messageId: 'm', sessionId: 's', rating: 'wat' as any })).ok).toBe(false);
  });
});

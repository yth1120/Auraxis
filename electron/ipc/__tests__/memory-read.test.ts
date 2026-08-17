import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
}));

import {
  addBelief,
  addBeliefEvidence,
  addEvidence,
  evidenceContentHash,
  updateBeliefStatus,
  setBackendModeForTest,
  type EvidenceRole,
} from '../memory-db';
import { cosineSimilarity, embedText, embeddingsEnabled, getReadTrace, readForQuery } from '../memory-read';

beforeAll(() => {
  setBackendModeForTest('json');
  h.userData = mkdtempSync(path.join(os.tmpdir(), 'auraxis-read-'));
});

function seedEvidence(scope: string, id: string, content: string, ts: number, role: EvidenceRole = 'user') {
  addEvidence({
    id,
    scope,
    session_id: 's1',
    event_id: null,
    role,
    ts,
    content_hash: evidenceContentHash(scope, role, content),
    content,
    metadata: '{}',
    deleted_at: null,
  });
}

function seedBelief(scope: string, id: string, title: string, text: string, ts: number, evidenceIds: string[] = []) {
  const b = addBelief({
    id,
    kind: 'project',
    scope,
    title,
    text,
    status: 'active',
    importance: 4,
    updated_at: ts,
  });
  for (const evId of evidenceIds) {
    addBeliefEvidence({ belief_id: b.id, evidence_id: evId, support_strength: 0.9 });
  }
  return b;
}

describe('readForQuery — 确定性读路径（M3）', () => {
  it('同一 fixture 两次读取 context/facts 完全一致', () => {
    const scope = 'C:/det';
    seedEvidence(scope, 'det-ev1', '项目使用 React Router v6.2.1', Date.now());
    seedBelief(scope, 'det-bel1', '路由方案', '项目使用 React Router v6.2.1', Date.now(), ['det-ev1']);

    const a = readForQuery('React Router', scope, { budgetTokens: 800, now: Date.now() });
    const b = readForQuery('React Router', scope, { budgetTokens: 800, now: Date.now() });
    expect(a.context).toEqual(b.context);
    expect(a.facts).toEqual(b.facts);
    expect(a.diagnostics.deterministic).toBe(true);
    expect(a.readRunId).toMatch(/^run-/);
  });

  it('预算截断按分数排序并正确报告', () => {
    const scope = 'C:/budget';
    for (let i = 0; i < 8; i++) {
      const evId = `b-ev${i}`;
      seedEvidence(scope, evId, `模块 ${i} 使用固定命名规范 ${i}`, Date.now() + i);
      seedBelief(scope, `b-bel${i}`, `规范 ${i}`, `模块 ${i} 使用固定命名规范 ${i}`.repeat(30), Date.now() + i, [evId]);
    }
    const result = readForQuery('模块', scope, { budgetTokens: 300, now: Date.now() });
    expect(result.context.length).toBeGreaterThan(0);
    expect(result.context.length).toBeLessThan(8);
    expect(result.diagnostics.budget.truncated).toBe(true);
    expect(result.diagnostics.budget.used).toBeLessThanOrEqual(result.diagnostics.budget.allocated);
    expect(getReadTrace(result.readRunId)?.results).toHaveLength(result.context.length);
  });
});

describe('五层失败归因（M4）', () => {
  it('缺证据：evidence 为空 → missingEvidence=true', () => {
    const result = readForQuery('anything', 'C:/empty', { now: Date.now() });
    expect(result.diagnostics.missingEvidence).toBe(true);
  });

  it('抽取失真：存在无证据引用的非 legacy 信念 → unsupportedExtraction=true', () => {
    const scope = 'C:/unsupported';
    seedEvidence(scope, 'u-ev1', '证据', Date.now());
    seedBelief(scope, 'u-bel1', '无证据信念', '没有锚点的内容', Date.now());
    const result = readForQuery('无证据', scope, { now: Date.now() });
    expect(result.diagnostics.unsupportedExtraction).toBe(true);
  });

  it('状态过期：存在 superseded 版本 → staleState=true', () => {
    const scope = 'C:/stale';
    seedEvidence(scope, 's-ev1', '旧方案', Date.now());
    const b = seedBelief(scope, 's-bel1', '旧决策', '使用旧方案', Date.now(), ['s-ev1']);
    updateBeliefStatus(b.id, 'superseded', '被新版本替代', 'system');
    const result = readForQuery('旧方案', scope, { now: Date.now() });
    expect(result.diagnostics.staleState).toBe(true);
  });

  it('检索丢失：有证据与旧信念但三路均未命中 → retrievalLoss=true', () => {
    const scope = 'C:/loss';
    const old = Date.now() - 200 * 24 * 60 * 60 * 1000;
    seedEvidence(scope, 'l-ev1', '非常古老的内容关键词', old);
    seedBelief(scope, 'l-bel1', '旧信念', '非常古老的内容关键词', old, ['l-ev1']);
    const result = readForQuery('完全无关的查询词', scope, { now: Date.now() });
    expect(result.diagnostics.retrievalLoss).toBe(true);
    expect(result.context).toEqual([]);
  });

  it('模型行为由 policy 层标记（读路径不误报）', () => {
    const scope = 'C:/model';
    seedEvidence(scope, 'm-ev1', 'React Router v6.2.1', Date.now());
    seedBelief(scope, 'm-bel1', '路由', 'React Router v6.2.1', Date.now(), ['m-ev1']);
    const result = readForQuery('React Router', scope, { now: Date.now() });
    expect(result.diagnostics.modelBehaviorFlagged).toBe(false);
    expect(result.policy.refuseOnUncertain).toBe(true);
    expect(result.policy.requireCitation).toBe(true);
  });
});

describe('R4 向量路由（可选，AURAXIS_MEMORY_EMBEDDINGS=1）', () => {
  it('默认关闭且标记 skipped', () => {
    delete process.env.AURAXIS_MEMORY_EMBEDDINGS;
    expect(embeddingsEnabled()).toBe(false);
    const result = readForQuery('React', 'C:/vec', { now: Date.now() });
    expect(result.diagnostics.routes.find((r) => r.route === 'vector')?.skipped).toBe(true);
  });

  it('开启后命中相关信念且保持确定性', () => {
    process.env.AURAXIS_MEMORY_EMBEDDINGS = '1';
    try {
      const scope = 'C:/vec-on';
      seedEvidence(scope, 'v-ev1', '项目使用 React Router v6.2.1', Date.now());
      seedBelief(scope, 'v-bel1', '路由方案', '项目使用 React Router v6.2.1', Date.now(), ['v-ev1']);
      seedBelief(scope, 'v-bel2', '无关内容', '天气很好', Date.now());

      const a = readForQuery('React Router', scope, { now: Date.now() });
      const b = readForQuery('React Router', scope, { now: Date.now() });
      const route = a.diagnostics.routes.find((r) => r.route === 'vector')!;
      expect(route.skipped).toBe(false);
      expect(route.hits).toBeGreaterThanOrEqual(1);
      expect(a.context.map((c) => c.beliefId)).toEqual(b.context.map((c) => c.beliefId));
      expect(a.diagnostics.deterministic).toBe(true);
    } finally {
      delete process.env.AURAXIS_MEMORY_EMBEDDINGS;
    }
  });

  it('embedText / cosineSimilarity 归一化且无随机', () => {
    const a = embedText('React Router v6.2.1');
    const b = embedText('React Router v6.2.1');
    const c = embedText('完全无关内容');
    expect(a).toEqual(b);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
    expect(cosineSimilarity(a, c)).toBeLessThan(cosineSimilarity(a, b));
  });
});

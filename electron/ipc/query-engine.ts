/**
 * query-engine.ts — Unified single-track agent engine.
 *
 * Principles:
 *   1. All 11 tool schemas are injected on every API call (tool_choice: "auto").
 *      The LLM itself decides whether to use tools — no human toggle gating.
 *   2. Model selection ("deepseek-v4-flash" vs "deepseek-v4-pro") and the
 *      deep-thinking switch (reasoning_effort + thinking.type) are independent
 *      parameters, matching the DeepSeek API spec.
 *   3. A single while(true) ReAct loop with a three-tier PermissionInterceptor
 *      (Ask / Plan / AFE) that governs every tool execution.
 *   4. In deep-thinking mode, reasoning_content is preserved in assistant
 *      messages across tool-call rounds — losing it causes DeepSeek 400 errors.
 */

import crypto from 'crypto';
import type { BrowserWindow } from 'electron';
import type { PermissionMode } from '../types';
import type { SandboxMode } from '../sandbox-policy';
import { makeTurnId, type EngineEvent } from './engine-events';
import type { ContextConfig } from './agent-loop';
import { isDeniedError } from './tool-runner';
import { runStep, createStepState } from './step-engine';
import type { StepEngineConfig } from './step-engine';
import { loadAgentInstructions } from '../agent-instructions';
import { trackMessage, trackTokens, trackToolCall, trackLinesGenerated, trackSession } from './stats-handlers';
import { STATIC_SYSTEM_PROMPT, prepareCacheAlignedMessages } from './context-manager';

// ─── Types ────────────────────────────────────────────────

interface QueryRequest {
  requestId: string;
  /** Model ID — "deepseek-v4-flash" (fast) or "deepseek-v4-pro" (expert). */
  model: string;
  /** Chat messages — content may be string or multimodal content-block array. */
  messages: { role: string; content: any }[];
  /** Independent thinking toggle. When true, reasoning_effort + thinking.type are set. */
  isDeepThink: boolean;
  /** Reasoning effort level: 'high' (default) or 'max'. Mapped from frontend 'low'|'medium'|'high'. */
  reasoningEffort?: 'high' | 'max';
  projectRoot: string;
  apiKey: string;
  apiBase: string;
  checkPermission?: (toolName: string, input: Record<string, unknown>, toolCallId?: string) => Promise<boolean>;
  contextConfig?: ContextConfig;
  autoApprove?: boolean;
  mode: PermissionMode;
  sandboxMode?: SandboxMode;
  approvedPlanSteps?: string[];
  getPendingNudge?: () => string | null;
  win?: BrowserWindow | null;
}

type EventCallback = (event: EngineEvent) => void;

// ─── Constants ─────────────────────────────────────────────

/** Hard fail-safe — prevents infinite loops from runaway tool calls. */
const SAFETY_MAX_ITERATIONS = 200;

/** Token threshold for context compaction (90% trigger for headroom). */
const COMPACT_TOKEN_THRESHOLD = 100_000;

// ─── Permission interceptor (three-tier guard) ─────────────

async function permissionInterceptor(
  toolName: string,
  input: Record<string, unknown>,
  toolCallId: string,
  req: QueryRequest,
): Promise<boolean> {
  // Tier 1: AFE — execute everything, no questions asked
  if (req.mode === 'afe' || req.autoApprove) {
    return true;
  }

  // Tier 2: Plan — approved plan steps auto-pass; others blocked
  if (req.mode === 'plan') {
    // If the tool matches an approved plan step, allow
    if (req.approvedPlanSteps && req.approvedPlanSteps.length > 0) {
      // Plan steps are matched by caller — for query path without a plan,
      // fall through to the permission handler
    }
  }

  // Tier 3: Ask — IPC-based permission dialog
  if (req.checkPermission) {
    return req.checkPermission(toolName, input, toolCallId);
  }

  // Default: deny (shouldn't reach here in normal flow)
  return false;
}

// ─── Tool result append (preserves API protocol) ───────────

function appendToolResults(
  messages: any[],
  results: { toolUseId: string; toolName: string; input: Record<string, unknown>; output: unknown; error?: string }[],
): void {
  for (const tr of results) {
    messages.push({
      role: 'tool' as const,
      tool_call_id: tr.toolUseId,
      content: tr.error ? `Error: ${tr.error}` : JSON.stringify(tr.output),
    });
  }
}

// ─── Context-compression helpers ───────────────────────────

// ─── Main unified while(true) ReAct loop ──────────────────

async function runUnifiedLoop(
  req: QueryRequest,
  emit: EventCallback,
  signal: AbortSignal,
): Promise<void> {
  const instructions = await loadAgentInstructions(req.projectRoot);

  const messages = prepareCacheAlignedMessages({
    platform: process.platform,
    projectRoot: req.projectRoot,
    isDeepThink: req.isDeepThink,
    chatMessages: req.messages,
  });
  if (instructions.trim()) {
    messages.push({
      role: 'user' as const,
      content: `## 项目指令（AGENTS.md）\n${instructions.trim()}\n请严格遵循以上项目指令执行任务。`,
    });
    emit({
      type: 'context_injected',
      source: 'instructions',
      producer: 'AGENTS.md',
      detail: '项目指令已注入对话上下文',
    });
  }
  const modeHint =
    req.mode === 'plan'
      ? '当前为计划模式：先制定执行计划并等待用户批准，批准后再开始执行；未批准前不要调用修改类工具。'
      : req.mode === 'afe'
        ? '当前为全自动模式：可自主决定并执行所有工具，无需向用户请求确认。'
        : '当前为交互模式：写文件、执行命令等风险操作需要先向用户确认。';
  messages.push({ role: 'user' as const, content: modeHint });

  // Shared StepEngine — runStep owns one full ReAct iteration (LLM + tools +
  // stop policy + compaction); this driver owns turn lifecycle + termination.
  const state = createStepState(messages);
  const turnId = makeTurnId(req.requestId);
  emit({ type: 'turn_start', turnId, timestamp: Date.now() });

  const subAgentIds = new Map<number, string>();
  const engineConfig: StepEngineConfig = {
    requestId: req.requestId,
    model: req.model,
    apiKey: req.apiKey,
    apiBase: req.apiBase,
    systemPrompt: STATIC_SYSTEM_PROMPT,
    projectRoot: req.projectRoot,
    mode: req.mode,
    sandboxMode: req.sandboxMode,
    approvedPlanSteps: req.approvedPlanSteps,
    checkPermission: req.checkPermission,
    autoApprove: true,
    signal,
    isDeepThink: req.isDeepThink,
    reasoningEffort: req.reasoningEffort,
    getPendingNudge: req.getPendingNudge,
    emit,
    onUsage: (inputTokens, outputTokens) => {
      trackTokens(inputTokens, outputTokens).catch(() => {});
    },
    preCheckPermission: (toolName, input, toolCallId) => permissionInterceptor(toolName, input, toolCallId, req),
    onBeforeToolDispatch: (tc) => {
      // ── Sub-agent spawn tracking (pre-flight for Agent tools) ──
      if (tc.name === 'Agent') {
        const subAgentId = `sub-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        subAgentIds.set(tc.index, subAgentId);
        tc.input._agentId = subAgentId;
        if (req.win && !req.win.isDestroyed()) {
          req.win.webContents.send('agent:updated', {
            id: subAgentId, agentId: subAgentId,
            name: `${tc.input.subagent_type || 'general-purpose'}: ${tc.input.description || '子任务'}`,
            description: tc.input.prompt || tc.input.description || '',
            type: tc.input.subagent_type || 'general-purpose',
            status: 'running', priority: 'normal', startTime: Date.now(),
            iteration: 0, maxIterations: 25, toolCallCount: 0,
            messagesCount: 0, model: req.model, log: [],
          });
        }
      }
    },

    onToolResult: (r, tc, toolCallId) => {
      const durationMs = r.durationMs;
      const stepGroupId = tc.stepGroupId ?? '';
      const isAbort = r.error === '用户手动中止' || isDeniedError(r.error);
      if (r.error) {
        if (!isAbort) trackToolCall(false, durationMs).catch(() => {});

        if (tc.name === 'Agent' && req.win && !req.win.isDestroyed()) {
          try { req.win.webContents.send('agent:updated', {
            id: subAgentIds.get(tc.index) || '', status: 'error', error: r.error, endTime: Date.now() }); } catch { /* best-effort */ }
        }

      } else {

        // Stats tracking
        trackToolCall(true, durationMs).catch(() => {});
        if (tc.name === 'Write' || tc.name === 'Edit') {
          const content = (tc.input as Record<string, unknown>)?.content as string | undefined;
          const lines = content ? content.split('\n').length : 0;
          trackLinesGenerated(lines).catch(() => {});
        }

        if (tc.name === 'Agent' && req.win && !req.win.isDestroyed()) {
          try { req.win.webContents.send('agent:updated', {
            id: subAgentIds.get(tc.index) || '', status: 'completed',
            result: typeof r.output === 'string' ? r.output : JSON.stringify(r.output).slice(0, 500),
            toolCallCount: (r.output as any)?.toolCallCount || 0,
            iteration: (r.output as any)?.iterations || 0,
            endTime: Date.now() }); } catch { /* best-effort */ }
        }
      }
    },
  };

  // ── Thin driver: termination checks + one step per iteration ──
  while (true) {
    if (signal.aborted) break;

    state.iteration++;
    if (state.iteration > SAFETY_MAX_ITERATIONS) {
      emit({ type: 'error', error: `达到安全上限 ${SAFETY_MAX_ITERATIONS} 次迭代，强制终止。` });
      break;
    }

    const outcome = await runStep(engineConfig, state, crypto.randomUUID());
    if (outcome.status === 'stop' || outcome.status === 'aborted') break;
  }

  emit({ type: 'turn_end', turnId, reason: signal.aborted ? 'aborted' : 'completed', timestamp: Date.now() });
}
// ─── Public entry point ───────────────────────────────────

export async function runQuery(
  req: QueryRequest,
  emit: EventCallback,
  signal: AbortSignal,
): Promise<void> {
  // Normalise permission mode — chat queries are always explicit-ask; plan
  // and afe flows go through per-task agent configs instead.
  if (!req.mode || (req.mode !== 'ask' && req.mode !== 'plan' && req.mode !== 'afe')) {
    req.mode = 'ask';
  }

  try {
    trackSession().catch(() => {});
    await runUnifiedLoop(req, emit, signal);

    if (!signal.aborted) {
      emit({ type: 'done' });
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') return;

    const message = error.response?.status === 401
      ? 'API Key 无效或已过期'
      : error.response?.status === 429
        ? '请求过于频繁，请稍后重试'
        : error.response?.status
          ? `API 错误 (${error.response.status})`
          : `请求失败: ${error.message}`;

    emit({ type: 'error', error: message });
  }
}

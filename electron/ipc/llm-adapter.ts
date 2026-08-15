/**
 * llm-adapter.ts — LLM adapter seam (extracted from agent-loop).
 *
 * The built-in `deepseek` adapter speaks both the OpenAI-compatible format
 * (default) and the Anthropic Messages format (opt-in via apiBase), with a
 * streaming SSE parser that preserves reasoning/thinking content across rounds.
 *
 * Extra providers can be plugged in without touching the loops:
 *
 *   registerLlmAdapter('my-provider', async (params) => { ... });
 *   invokeLlm({ ...params, adapter: 'my-provider' });
 */
import axios from 'axios';
import type { ToolDef } from '../tool-defs';
import { createStreamFilter } from './text-filter';
import type { AssistantMessage, ContentBlock, ToolCall } from './agent-loop';

// ─── LLM types ───────────────────────────────────────────

export type LlmInvokeParams = {
  model: string;
  apiKey: string;
  apiBase: string;
  systemPrompt: string;
  messages: any[];
  tools: ToolDef[];
  isDeepThink?: boolean;
  reasoningEffort?: 'high' | 'max';
  temperature?: number;
  signal: AbortSignal;
  onTextChunk?: (text: string) => void;
  onThinkingChunk?: (chunk: string, isNewBlock: boolean) => void;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
};

export type LlmAdapter = (params: LlmInvokeParams) => Promise<AssistantMessage | null>;

// ─── Adapter registry ────────────────────────────────────

const adapters = new Map<string, LlmAdapter>();

/** Register a named LLM adapter. `invokeLlm({ adapter: id, ... })` selects it. */
export function registerLlmAdapter(id: string, adapter: LlmAdapter): void {
  adapters.set(id, adapter);
}

export function getLlmAdapter(id: string): LlmAdapter | undefined {
  return adapters.get(id);
}

/**
 * Dispatch an LLM invoke. Defaults to the built-in `deepseek` adapter, which
 * auto-detects Anthropic-format endpoints by apiBase. Unknown explicit adapter
 * ids throw so misconfiguration is loud instead of silently falling back.
 */
export async function invokeLlm(
  params: LlmInvokeParams & { adapter?: string },
): Promise<AssistantMessage | null> {
  const id = params.adapter ?? 'deepseek';
  const adapter = adapters.get(id);
  if (adapter) return adapter(params);
  if (id === 'deepseek') return llmClientInvoke(params);
  throw new Error(`未注册的 LLM 适配器: ${id}`);
}

// ─── Format builders ─────────────────────────────────────

export function buildOpenAIFormatTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        ...t.input_schema,
        additionalProperties: t.input_schema.additionalProperties ?? false,
      },
    },
  }));
}

export function buildAnthropicFormatTools(tools: ToolDef[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

export function isAnthropicFormatEndpoint(apiBase: string): boolean {
  return apiBase.includes('/messages') || apiBase.includes('/anthropic/');
}

/**
 * Self-heal tool_calls pairing before every OpenAI-format request.
 * The API hard-rejects (HTTP 400) a history where an assistant message with
 * `tool_calls` is not immediately followed by one `tool` message per id.
 * Pairing breaks in real paths: deviance/anyError user-message injections land
 * between the assistant and its tool replies, Replan results are pushed after
 * injected messages, and compression/follow-up rebuilds can drop replies.
 * Instead of chasing every producer, repair at the gate:
 *  - tool replies separated from their assistant → reordered back adjacent
 *    (interleaved user/system messages are deferred to after the tool block)
 *  - missing tool replies → synthesize an error stub
 *  - orphaned/duplicate tool messages (no pending id) → drop
 */
export function sanitizeToolCallPairing(messages: any[]): any[] {
  const out: any[] = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i];

    if (m.role === 'tool') {
      // Orphan: no preceding assistant declared this id (or already answered) — drop.
      i++;
      continue;
    }

    out.push(m);
    i++;

    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0) continue;

    const pending = new Set<string>(m.tool_calls.map((tc: any) => tc?.id).filter(Boolean));
    const deferred: any[] = [];

    // Scavenge forward for this assistant's tool replies; stop at the next
    // assistant turn (tool replies never cross an assistant boundary).
    while (i < messages.length && pending.size > 0) {
      const n = messages[i];
      if (n.role === 'assistant') break;
      if (n.role === 'tool') {
        if (n.tool_call_id && pending.has(n.tool_call_id)) {
          out.push(n);
          pending.delete(n.tool_call_id);
        }
        // unknown/duplicate id — drop
      } else {
        deferred.push(n);
      }
      i++;
    }

    for (const id of pending) {
      out.push({ role: 'tool', tool_call_id: id, content: 'Error: 工具结果丢失（已自动修补）' });
    }
    out.push(...deferred);
  }

  return out;
}

/**
 * Build a model-visible tool-result content value. A tool result whose output
 * carries a `data:` image (e.g. ReadImage) is converted into an OpenAI-style
 * content array with an `image_url` part plus a compact text summary, so
 * image-capable models actually see the pixels instead of a base64 blob.
 */
export function buildToolResultContent(output: unknown, error?: string): string | Array<Record<string, unknown>> {
  if (error) return `Error: ${error}`;
  const obj = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const image = typeof obj.image === 'string' && obj.image.startsWith('data:image/')
    ? obj.image
    : null;
  if (!image) return JSON.stringify(output);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'image') continue;
    meta[k] = v;
  }
  const text = [
    `[图片] ${String(obj.mime ?? 'image')}`,
    `文件: ${String(obj.file_path ?? obj.attachment_id ?? '')}`,
    `大小: ${Number(obj.bytes) || 0} 字节`,
    ...(Object.keys(meta).length > 0 ? [JSON.stringify(meta)] : []),
  ].filter(Boolean).join(' · ');
  return [
    { type: 'image_url', image_url: { url: image } },
    { type: 'text', text },
  ];
}

/** Heuristic for whether the routed model can consume image parts. */
export function modelSupportsImageInput(model: string): boolean {
  const m = model.toLowerCase();
  if (!m.startsWith('deepseek-')) return true;
  return /(vl|vision|omni|multimodal)/.test(m);
}

/**
 * Provider-specific normalization of content arrays: drop image parts for
 * non-vision DeepSeek routes, and translate OpenAI `image_url` parts into
 * Anthropic image blocks on the Anthropic wire format.
 */
function normalizeProviderContent(m: any, provider: 'openai' | 'anthropic', model: string): any {
  if (!Array.isArray(m.content)) return m;
  let parts: any[] = m.content;
  const hasImage = parts.some((p) => p?.type === 'image_url');
  if (hasImage && !modelSupportsImageInput(model)) {
    parts = parts.filter((p) => p?.type !== 'image_url');
  }
  if (provider === 'anthropic') {
    parts = parts.map((p) => {
      if (p?.type === 'image_url' && p.image_url?.url) {
        const url = String(p.image_url.url);
        const match = /^data:([^;]+);base64,(.*)$/.exec(url);
        return match
          ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
          : { type: 'image', source: { type: 'url', url } };
      }
      if (p?.type === 'text') return { type: 'text', text: String(p.text) };
      return p;
    });
  }
  return { ...m, content: parts };
}

// ─── Built-in adapter ────────────────────────────────────

export async function llmClientInvoke(
  params: LlmInvokeParams,
): Promise<AssistantMessage | null> {
  if (isAnthropicFormatEndpoint(params.apiBase)) {
    return invokeDeepSeekAnthropic(params);
  }
  return invokeDeepSeekOpenAI(params);
}

async function invokeDeepSeekAnthropic(params: LlmInvokeParams): Promise<AssistantMessage | null> {
  const { model, apiKey, apiBase, systemPrompt, messages, tools, isDeepThink, signal, onTextChunk, onThinkingChunk, onUsage } = params;
  // Stateful per-invoke filter — catches XML tool-call rehearsal spanning chunks.
  const streamFilter = createStreamFilter();
  const anthropicTools = buildAnthropicFormatTools(tools);

  // Anthropic Messages API: system must be a top-level field; messages array
  // must only contain user/assistant roles. Strip any system-role message from
  // the array and merge its content into the top-level system field.
  const hasSystemMsg = messages.length > 0 && messages[0].role === 'system';
  const systemContent = hasSystemMsg
    ? String(messages[0].content)
    : systemPrompt;
  const effectiveMessages = sanitizeToolCallPairing(hasSystemMsg ? messages.slice(1) : messages)
    .map((m) => normalizeProviderContent(m, 'anthropic', model));

  const body: Record<string, unknown> = {
    model, max_tokens: 8192, messages: effectiveMessages, stream: true, system: systemContent,
  };

  if (anthropicTools.length > 0) {
    body.tools = anthropicTools;
  }

  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }

  if (isDeepThink && model.startsWith('deepseek-')) {
    body.output_config = { effort: params.reasoningEffort || 'high' };
  }

  const response = await axios.post(apiBase, body, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    responseType: 'stream', signal, timeout: 180000,
  });

  let buffer = '';
  let currentTool: { id: string; name: string; input: string } | null = null;
  let currentText = '';
  let inThinkingBlock = false;
  let thinkingText = '';
  const contentTimeline: AssistantMessage['contentTimeline'] = [];
  const toolCalls: ToolCall[] = [];
  let rawText = '';
  let completionStopReason: string | null = null;

  const decoder = new TextDecoder('utf-8', { fatal: false });
  for await (const chunk of response.data) {
    if (signal.aborted) return null;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const p = JSON.parse(data);
        switch (p.type) {
          case 'content_block_start':
            if (p.content_block?.type === 'tool_use') {
              currentTool = { id: p.content_block.id, name: p.content_block.name, input: '' };
            }
            if (p.content_block?.type === 'thinking') {
              inThinkingBlock = true;
              onThinkingChunk?.('', true);
            }
            break;
          case 'content_block_delta':
            if (p.delta?.thinking && inThinkingBlock) {
              thinkingText += p.delta.thinking;
              onThinkingChunk?.(p.delta.thinking, false);
            }
            if (p.delta?.signature && inThinkingBlock) {
              thinkingText += p.delta.signature;
              onThinkingChunk?.(p.delta.signature, false);
            }
            if (p.delta?.text) {
              const cleaned = streamFilter(p.delta.text);
              if (cleaned) {
                currentText += cleaned;
                rawText += cleaned;
                onTextChunk?.(cleaned);
              }
            }
            if (p.delta?.partial_json && currentTool) {
              currentTool.input += p.delta.partial_json;
            }
            break;
          case 'content_block_stop':
            if (currentText) {
              contentTimeline.push({ type: 'text', text: currentText });
              currentText = '';
            }
            if (inThinkingBlock) {
              inThinkingBlock = false;
            }
            if (currentTool) {
              let toolInput: Record<string, unknown> = {};
              try { toolInput = JSON.parse(currentTool.input); } catch { toolInput = { raw: currentTool.input }; }
              toolCalls.push({ id: currentTool.id, name: currentTool.name, input: toolInput });
              contentTimeline.push({ type: 'tool_use', id: currentTool.id, name: currentTool.name, input: toolInput });
              currentTool = null;
            }
            break;
          case 'message_delta':
            if (p.delta?.stop_reason) {
              completionStopReason = p.delta.stop_reason as string;
            }
            if (p.usage && onUsage) {
              onUsage(p.usage.input_tokens || 0, p.usage.output_tokens || 0);
            }
            break;
        }
      } catch { /* skip malformed SSE */ }
    }
  }

  if (currentText) {
    contentTimeline.push({ type: 'text', text: currentText });
  }

  const finalMarkerRe = /<FINAL_ANSWER>/gi;
  let isFinal = false;
  if (toolCalls.length === 0 && finalMarkerRe.test(rawText)) {
    isFinal = true;
  }
  finalMarkerRe.lastIndex = 0;
  if (finalMarkerRe.test(rawText)) {
    finalMarkerRe.lastIndex = 0;
    rawText = rawText.replace(finalMarkerRe, '').trim();
    for (const b of contentTimeline) {
      if (b.type === 'text') {
        b.text = b.text.replace(finalMarkerRe, '').trim();
      }
    }
  }

  return { contentTimeline, toolCalls, rawText, thinkingText, isFinal, completionStopReason };
}

async function invokeDeepSeekOpenAI(params: LlmInvokeParams): Promise<AssistantMessage | null> {
  const { model, apiKey, apiBase, systemPrompt, messages, tools, isDeepThink, signal, onTextChunk, onThinkingChunk } = params;
  // Stateful per-invoke filter — catches XML tool-call rehearsal spanning chunks.
  const streamFilter = createStreamFilter();
  const formattedTools = buildOpenAIFormatTools(tools);

  // Ensure system prompt is in messages (OpenAI format: system-role message at position 0).
  // Callers may pass systemPrompt separately (e.g. Planning phase); inject it if missing.
  const hasSystemMsg = messages.length > 0 && messages[0].role === 'system';
  const effectiveMessages = sanitizeToolCallPairing(
    hasSystemMsg ? messages : [{ role: 'system', content: systemPrompt }, ...messages],
  ).map((m) => normalizeProviderContent(m, 'openai', model));

  const body: Record<string, unknown> = {
    model, max_tokens: 8192, messages: effectiveMessages, stream: true,
  };

  if (formattedTools.length > 0) {
    body.tools = formattedTools;
    body.tool_choice = 'auto';
  }

  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }

  if (isDeepThink && model.startsWith('deepseek-')) {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = params.reasoningEffort || 'high';
  }

  const response = await axios.post(apiBase, body, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    responseType: 'stream', signal, timeout: 180000,
  });

  let buffer = '';
  const currentTCs = new Map<number, { id: string; name: string; arguments: string }>();
  let rawText = '';
  let thinkingText = '';
  let completionStopReason: string | null = null;
  let inReasoningBlock = false;

  // ── Interleaved contentTimeline builder ──
  // OpenAI SSE delivers delta.content and delta.tool_calls interleaved.
  // We track currentText and flush it to contentTimeline on every text→tool transition,
  // then push completed tool_use blocks on the next tool→text transition (or at end).
  const contentTimeline: AssistantMessage['contentTimeline'] = [];
  let currentText = '';
  let lastSegment: 'text' | 'tool' = 'text'; // what we last pushed or are building

  const decoder = new TextDecoder('utf-8', { fatal: false });
  for await (const chunk of response.data) {
    if (signal.aborted) return null;
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const p = JSON.parse(data);
        const choice = p.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        // ── Reasoning / thinking delta (DeepSeek V4 reasoning_content) ──
        if (delta?.reasoning_content) {
          if (!inReasoningBlock) {
            inReasoningBlock = true;
            onThinkingChunk?.('', true);
          }
          thinkingText += delta.reasoning_content;
          onThinkingChunk?.(delta.reasoning_content, false);
        }

        // ── Text delta ──
        if (delta?.content) {
          if (inReasoningBlock) inReasoningBlock = false;
          const cleaned = streamFilter(delta.content);
          if (cleaned) {
            // Transition tool → text: flush completed tool_use blocks from previous segment
            if (lastSegment === 'tool' && currentTCs.size > 0) {
              for (const [, tc] of currentTCs) {
                let input: Record<string, unknown> = {};
                try { input = JSON.parse(tc.arguments); } catch { input = { raw: tc.arguments }; }
                contentTimeline.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
              }
              currentTCs.clear();
            }
            lastSegment = 'text';
            currentText += cleaned;
            rawText += cleaned;
            onTextChunk?.(cleaned);
          }
        }

        // ── Tool_calls delta ──
        if (delta?.tool_calls) {
          if (inReasoningBlock) inReasoningBlock = false;
          // Transition text → tool: flush accumulated text to contentTimeline
          if (lastSegment === 'text' && currentText) {
            contentTimeline.push({ type: 'text', text: currentText });
            currentText = '';
          }
          lastSegment = 'tool';
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!currentTCs.has(idx)) {
              currentTCs.set(idx, { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' });
            }
            const e = currentTCs.get(idx)!;
            if (tc.id) e.id = tc.id;
            if (tc.function?.name) e.name = tc.function.name;
            if (tc.function?.arguments) e.arguments += tc.function.arguments;
          }
        }

        // Capture finish_reason (OpenAI equivalent of stop_reason)
        if (choice.finish_reason) {
          const fr = choice.finish_reason as string;
          if (fr === 'tool_calls') {
            completionStopReason = 'tool_use';
          } else if (fr === 'stop') {
            completionStopReason = 'end_turn';
          } else if (fr === 'length') {
            completionStopReason = 'max_tokens';
          } else {
            completionStopReason = fr;
          }
        }
      } catch { /* skip */ }
    }
  }

  // ── Flush trailing segments ──
  if (lastSegment === 'text' && currentText) {
    contentTimeline.push({ type: 'text', text: currentText });
    currentText = '';
  }
  if (lastSegment === 'tool' && currentTCs.size > 0) {
    for (const [, tc] of currentTCs) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments); } catch { input = { raw: tc.arguments }; }
      contentTimeline.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const b of contentTimeline) {
    if (b.type === 'tool_use') {
      toolCalls.push({ id: b.id, name: b.name, input: b.input });
    }
  }

  // Detect <FINAL_ANSWER> — only valid when no tool calls were made
  // Case-insensitive with global flag: handles both multiple occurrences and
  // lowercase variants (e.g. <final_answer>) that models sometimes emit.
  const finalMarkerRe = /<FINAL_ANSWER>/gi;
  let isFinal = false;
  if (toolCalls.length === 0 && finalMarkerRe.test(rawText)) {
    isFinal = true;
  }
  // Always strip <FINAL_ANSWER> from rawText and contentTimeline, even in
  // non-terminal rounds. If the model hallucinates the marker mid-execution,
  // we must not leak it into the next round's message history.
  if (finalMarkerRe.test(rawText)) {
    finalMarkerRe.lastIndex = 0;
    rawText = rawText.replace(finalMarkerRe, '').trim();
    for (const b of contentTimeline) {
      if (b.type === 'text') {
        b.text = b.text.replace(finalMarkerRe, '').trim();
      }
    }
  }

  return { contentTimeline, toolCalls, rawText, thinkingText, isFinal, completionStopReason };
}

// Built-in adapter is the default dispatch target.
registerLlmAdapter('deepseek', llmClientInvoke);

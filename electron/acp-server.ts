/**
 * acp-server.ts — minimal Agent Client Protocol server （ACP 协议）.
 *
 * Exposes Auraxis agents to ACP clients (Zed, VS Code, etc.) over newline-
 * delimited JSON-RPC 2.0 on stdio. Supported methods:
 *   initialize / session/new / session/prompt / session/cancel /
 *   session/delete / shutdown
 * Server notifications: session/update (running/idle), request/agent_message,
 * request/error. Text prompts only; no plan/diff/file capabilities yet.
 */
import { createInterface } from 'readline';

export interface AcpRunAgentParams {
  prompt: string;
  sessionId: string;
  projectRoot?: string;
  signal?: AbortSignal;
}

export interface AcpDeps {
  runAgent: (params: AcpRunAgentParams) => Promise<{ output?: unknown; error?: string }>;
  /** Called after a `shutdown` request so the host can exit. */
  onShutdown?: () => void;
}

export interface AcpRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: unknown;
  error?: { code: number; message: string };
}

interface AcpSession {
  id: string;
  seq: number;
  abort: AbortController;
  projectRoot?: string;
}

function finalText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    for (const k of ['result', 'answer', 'output', 'text']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
  }
  return JSON.stringify(output, null, 2);
}

export class AcpServer {
  private sessions = new Map<string, AcpSession>();

  constructor(
    private deps: AcpDeps,
    private send: (msg: AcpRpcMessage) => void,
  ) {}

  handle(raw: unknown): void {
    const msg = raw as AcpRpcMessage;
    if (!msg || msg.jsonrpc !== '2.0') {
      this.send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }
    try {
      switch (msg.method) {
        case 'initialize': {
          const params = msg.params ?? {};
          const clientVersion = params.protocolVersion ?? { major: 0, minor: 1 };
          this.send({
            jsonrpc: '2.0',
            id: msg.id ?? null,
            result: {
              protocolVersion: clientVersion,
              agentCapabilities: {
                transcriptTypes: ['text'],
                promptTypes: ['text'],
                fileTypes: [],
                capabilities: [],
              },
              agentInfo: {
                name: 'auraxis',
                description: 'Auraxis coding agent',
                version: '0.0.1',
                url: '',
              },
            },
          });
          return;
        }
        case 'session/new': {
          const id = `acp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          this.sessions.set(id, {
            id,
            seq: 0,
            abort: new AbortController(),
            projectRoot: typeof msg.params?.cwd === 'string' ? msg.params.cwd : undefined,
          });
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, result: { sessionId: id } });
          return;
        }
        case 'session/prompt': {
          const p = msg.params ?? {};
          const session = this.sessions.get(String(p.sessionId ?? ''));
          if (!session) {
            this.send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32001, message: 'Session not found' } });
            return;
          }
          const text = typeof p.prompt?.text === 'string' ? p.prompt.text : '';
          if (!text.trim()) {
            this.send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32602, message: 'prompt.text is required' } });
            return;
          }
          session.seq += 1;
          const sequenceId = session.seq;
          const sessionId = session.id;
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, result: { sessionId, sequenceId } });
          void this.runPrompt(session, sequenceId, text);
          return;
        }
        case 'session/cancel': {
          const p = msg.params ?? {};
          const session = this.sessions.get(String(p.sessionId ?? ''));
          if (session) session.abort.abort();
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, result: {} });
          return;
        }
        case 'session/delete': {
          const p = msg.params ?? {};
          const session = this.sessions.get(String(p.sessionId ?? ''));
          if (session) {
            session.abort.abort();
            this.sessions.delete(session.id);
          }
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, result: {} });
          return;
        }
        case 'shutdown':
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, result: {} });
          this.deps.onShutdown?.();
          return;
        default:
          this.send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32601, message: `Method not found: ${msg.method}` } });
      }
    } catch (e: any) {
      this.send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: e?.message ?? String(e) } });
    }
  }

  private async runPrompt(session: AcpSession, sequenceId: number, text: string): Promise<void> {
    this.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: session.id, state: 'running' },
    });
    try {
      const res = await this.deps.runAgent({
        prompt: text,
        sessionId: session.id,
        projectRoot: session.projectRoot,
        signal: session.abort.signal,
      });
      if (session.abort.signal.aborted) {
        this.send({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: session.id, state: 'idle' },
        });
        return;
      }
      if (res.error) {
        this.send({
          jsonrpc: '2.0',
          method: 'request/error',
          params: { sessionId: session.id, sequenceId, error: { code: 1, message: res.error } },
        });
      } else {
        this.send({
          jsonrpc: '2.0',
          method: 'request/agent_message',
          params: {
            sessionId: session.id,
            sequenceId,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: finalText(res.output) }],
            },
          },
        });
      }
    } catch (e: any) {
      this.send({
        jsonrpc: '2.0',
        method: 'request/error',
        params: { sessionId: session.id, sequenceId, error: { code: -32000, message: e?.message ?? String(e) } },
      });
    } finally {
      this.send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { sessionId: session.id, state: 'idle' },
      });
    }
  }
}

export function startAcpServer(deps: AcpDeps): () => void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const server = new AcpServer(deps, (msg) => {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      server.handle({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    server.handle(raw);
  });
  return () => rl.close();
}

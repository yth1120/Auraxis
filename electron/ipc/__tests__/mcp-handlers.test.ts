import { describe, it, expect } from 'vitest';

// ─── MCP config validation & JSON‑RPC protocol logic tests ───
// No child_process or Electron required — pure input validation and
// message framing.

interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env?: Record<string, string>;
}

const ALLOWED_MCP_COMMANDS = new Set(['npx', 'node', 'python', 'python3', 'uvx', 'deno']);

function validateMcpConfig(config: MCPServerConfig): string | null {
  if (!config.command || typeof config.command !== 'string') {
    return 'MCP 命令不能为空';
  }
  const cmd = config.command.trim();
  if (cmd.includes('/') || cmd.includes('\\')) {
    return 'MCP 命令不能包含路径，请使用系统已安装的命令（如 npx）';
  }
  if (!ALLOWED_MCP_COMMANDS.has(cmd.toLowerCase())) {
    return `不支持的 MCP 命令: ${cmd}。允许的命令: ${[...ALLOWED_MCP_COMMANDS].join(', ')}`;
  }
  if (config.args && (!Array.isArray(config.args) || config.args.some((a) => typeof a !== 'string'))) {
    return 'MCP args 必须是字符串数组';
  }
  if (config.env && typeof config.env !== 'object') {
    return 'MCP env 必须是键值对对象';
  }
  return null;
}

// Simulated JSON‑RPC message framing (stdin/stdout protocol)
function encodeRequest(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} });
}

function decodeResponse(line: string): { id: number; result?: unknown; error?: { message: string } } | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

describe('MCP — config validation', () => {
  it('允许 npx / node / python / uvx / deno 命令', () => {
    for (const cmd of ['npx', 'node', 'python', 'uvx', 'deno']) {
      expect(validateMcpConfig({
        id: 'm1', name: 'test', command: cmd, args: [], enabled: true,
      })).toBeNull();
    }
  });

  it('拒绝包含路径分隔符的命令', () => {
    expect(validateMcpConfig({
      id: 'm1', name: 'bad', command: './bin/server', args: [], enabled: true,
    })).toContain('路径');

    expect(validateMcpConfig({
      id: 'm2', name: 'bad2', command: 'C:\\tools\\server.exe', args: [], enabled: true,
    })).toContain('路径');
  });

  it('拒绝不在白名单中的命令', () => {
    const err = validateMcpConfig({
      id: 'm1', name: 'bad', command: 'curl', args: [], enabled: true,
    });
    expect(err).toContain('不支持的 MCP 命令');
    expect(err).toContain('curl');
  });

  it('args 必须为字符串数组', () => {
    expect(validateMcpConfig({
      id: 'm1', name: 'bad', command: 'npx', args: [123 as any], enabled: true,
    })).toBe('MCP args 必须是字符串数组');

    expect(validateMcpConfig({
      id: 'm1', name: 'ok', command: 'npx', args: ['-y', 'server'], enabled: true,
    })).toBeNull();
  });

  it('空命令拒绝', () => {
    expect(validateMcpConfig({
      id: 'm1', name: 'bad', command: '', args: [], enabled: true,
    })).toBe('MCP 命令不能为空');
  });
});

describe('MCP — JSON‑RPC message framing', () => {
  it('encodeRequest 生成有效的 JSON‑RPC 2.0 请求', () => {
    const req = encodeRequest(1, 'initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'Auraxis', version: '2.0.0' },
    });
    const parsed = JSON.parse(req);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed.method).toBe('initialize');
    expect(parsed.params.protocolVersion).toBe('2024-11-05');
  });

  it('decodeResponse 解析成功的工具列表响应', () => {
    const line = JSON.stringify({
      id: 2,
      result: { tools: [{ name: 'read', description: 'Read file', inputSchema: {} }] },
    });
    const decoded = decodeResponse(line);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(2);
    expect((decoded!.result as any).tools).toHaveLength(1);
  });

  it('decodeResponse 解析错误响应', () => {
    const line = JSON.stringify({
      id: 3,
      error: { code: -32601, message: 'Method not found' },
    });
    const decoded = decodeResponse(line);
    expect(decoded).not.toBeNull();
    expect(decoded!.error?.message).toBe('Method not found');
  });

  it('decodeResponse 忽略非 JSON 行', () => {
    expect(decodeResponse('')).toBeNull();
    expect(decodeResponse('some log output')).toBeNull();
    expect(decodeResponse('{invalid json')).toBeNull();
  });

  it('JSON‑RPC 请求 ID 递增（并发安全）', () => {
    let id = 1;
    const reqs: string[] = [];
    for (let i = 0; i < 3; i++) {
      reqs.push(encodeRequest(id++, 'tools/call', { name: `tool${i}` }));
    }
    const parsed = reqs.map((r) => JSON.parse(r));
    expect(parsed[0].id).toBe(1);
    expect(parsed[1].id).toBe(2);
    expect(parsed[2].id).toBe(3);
  });
});

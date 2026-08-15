/**
 * sessionRefs.ts — resolve `@session:<id>` tokens into inline context.
 *
 * Picked from the @-mention menu, a token becomes a quoted block with the
 * session title and a summary of its recent messages before the turn is sent,
 * so the model gets the referenced context without a separate tool call.
 */

export interface SessionRefSource {
  id: string;
  title: string;
  messages?: { role: string; content: unknown }[];
}

export interface SessionRefResolution {
  text: string;
  refs: { id: string; title: string }[];
}

const MAX_REF_CHARS = 1500;

function summarizeSession(session: SessionRefSource): string {
  const msgs = (session.messages ?? []).slice(-6);
  if (msgs.length === 0) return session.title;
  const lines = msgs.map((m) => {
    const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : '系统';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${role}：${content}`;
  });
  return lines.join('\n').slice(0, MAX_REF_CHARS);
}

export function resolveSessionRefs(text: string, sessions: SessionRefSource[]): SessionRefResolution {
  const refs: { id: string; title: string }[] = [];
  const out = text.replace(/@session:([A-Za-z0-9_-]+)/g, (token, id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return token;
    refs.push({ id, title: session.title });
    return `\n【会话引用：${session.title}】\n${summarizeSession(session)}\n`;
  });
  return { text: out, refs };
}

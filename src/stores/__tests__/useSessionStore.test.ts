import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../useSessionStore';
import type { Message } from '../../types/chat';

function mkMsg(id: string, content = 'hello'): Message {
  return { id, role: 'user', content, timestamp: Date.now() };
}

function seedSession(id: string, messages: Message[]) {
  const now = Date.now();
  useSessionStore.setState({
    sessions: [
      {
        id,
        title: `Session ${id}`,
        created: now,
        updated: now,
        model: 'deepseek-v4-flash',
        messageCount: messages.length,
        messages,
      },
    ],
    currentSessionId: id,
  });
}

describe('useSessionStore.forkSession', () => {
  beforeEach(() => {
    // Reset store to a clean slate between tests
    useSessionStore.setState({ sessions: [], currentSessionId: null });
  });

  it('forks the entire session when messageId is omitted', () => {
    seedSession('s1', [mkMsg('m1'), mkMsg('m2'), mkMsg('m3')]);
    const newId = useSessionStore.getState().forkSession('s1');
    expect(newId).toBeTruthy();
    const fork = useSessionStore.getState().sessions.find((s) => s.id === newId);
    expect(fork?.messages.length).toBe(3);
    expect(fork?.branchedFrom?.sessionId).toBe('s1');
    expect(fork?.branchedFrom?.messageId).toBe('');
  });

  it('forks up to and including the named message when messageId is given', () => {
    seedSession('s1', [mkMsg('m1'), mkMsg('m2'), mkMsg('m3'), mkMsg('m4')]);
    const newId = useSessionStore.getState().forkSession('s1', 'm2');
    const fork = useSessionStore.getState().sessions.find((s) => s.id === newId);
    expect(fork?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(fork?.branchedFrom?.messageId).toBe('m2');
  });

  it('returns null when the source session does not exist', () => {
    seedSession('s1', [mkMsg('m1')]);
    const newId = useSessionStore.getState().forkSession('does-not-exist');
    expect(newId).toBeNull();
  });

  it('returns null when the messageId does not exist in the source session', () => {
    seedSession('s1', [mkMsg('m1'), mkMsg('m2')]);
    const newId = useSessionStore.getState().forkSession('s1', 'm999');
    expect(newId).toBeNull();
  });

  it('preserves the original session (fork is a copy, not a move)', () => {
    seedSession('s1', [mkMsg('m1'), mkMsg('m2')]);
    useSessionStore.getState().forkSession('s1');
    const original = useSessionStore.getState().sessions.find((s) => s.id === 's1');
    expect(original?.messages.length).toBe(2);
  });

  it('switches currentSessionId to the new fork', () => {
    seedSession('s1', [mkMsg('m1')]);
    const newId = useSessionStore.getState().forkSession('s1');
    expect(useSessionStore.getState().currentSessionId).toBe(newId);
  });

  it('clears isStreaming flag on cloned messages', () => {
    const msg: Message = { id: 'm1', role: 'assistant', content: 'partial', timestamp: Date.now(), isStreaming: true };
    seedSession('s1', [msg]);
    const newId = useSessionStore.getState().forkSession('s1');
    const fork = useSessionStore.getState().sessions.find((s) => s.id === newId);
    expect(fork?.messages[0].isStreaming).toBe(false);
  });

  it('allows forking a non-current session from the sidebar use case', () => {
    // Sidebar fork scenario: user is in session A, clicks fork on session B.
    seedSession('sA', [mkMsg('a1')]);
    useSessionStore.setState((s) => ({
      sessions: [
        ...s.sessions,
        {
          id: 'sB',
          title: 'B',
          created: 0,
          updated: 0,
          model: 'm',
          messageCount: 2,
          messages: [mkMsg('b1'), mkMsg('b2')],
        },
      ],
    }));
    const newId = useSessionStore.getState().forkSession('sB');
    const fork = useSessionStore.getState().sessions.find((s) => s.id === newId);
    expect(fork?.branchedFrom?.sessionId).toBe('sB');
    expect(fork?.messages.map((m) => m.id)).toEqual(['b1', 'b2']);
  });
});

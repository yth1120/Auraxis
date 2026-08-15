import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../useChatStore';

describe('useChatStore — agent queue （排队消息）', () => {
  beforeEach(() => {
    useChatStore.setState({ agentQueue: [] });
  });

  it('enqueue trims and appends FIFO', () => {
    useChatStore.getState().enqueueAgentMessage('  first  ');
    useChatStore.getState().enqueueAgentMessage('second');
    const queue = useChatStore.getState().agentQueue;
    expect(queue).toHaveLength(2);
    expect(queue.map((q) => q.text)).toEqual(['first', 'second']);
    expect(queue[0].id).toBeTruthy();
    expect(queue[0].createdAt).toBeGreaterThan(0);
  });

  it('ignores empty enqueue', () => {
    useChatStore.getState().enqueueAgentMessage('   \n  ');
    expect(useChatStore.getState().agentQueue).toHaveLength(0);
  });

  it('dequeue removes by id and preserves order', () => {
    useChatStore.getState().enqueueAgentMessage('a');
    useChatStore.getState().enqueueAgentMessage('b');
    const [first] = useChatStore.getState().agentQueue;
    useChatStore.getState().dequeueAgentMessage(first.id);
    expect(useChatStore.getState().agentQueue.map((q) => q.text)).toEqual(['b']);
  });

  it('edit updates text and keeps order', () => {
    useChatStore.getState().enqueueAgentMessage('a');
    useChatStore.getState().enqueueAgentMessage('b');
    const [first] = useChatStore.getState().agentQueue;
    useChatStore.getState().editAgentQueueItem(first.id, 'a2');
    expect(useChatStore.getState().agentQueue.map((q) => q.text)).toEqual(['a2', 'b']);
  });

  it('edit ignores blank text', () => {
    useChatStore.getState().enqueueAgentMessage('a');
    const [first] = useChatStore.getState().agentQueue;
    useChatStore.getState().editAgentQueueItem(first.id, '   ');
    expect(useChatStore.getState().agentQueue[0].text).toBe('a');
  });

  it('clear empties the queue', () => {
    useChatStore.getState().enqueueAgentMessage('a');
    useChatStore.getState().enqueueAgentMessage('b');
    useChatStore.getState().clearAgentQueue();
    expect(useChatStore.getState().agentQueue).toHaveLength(0);
  });
});

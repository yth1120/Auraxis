import { useEffect } from 'react';
import { useAgentStore } from '@/stores/useAgentStore';
import { useNotificationStore } from '@/stores/useNotificationStore';

const ACTIVE: ReadonlySet<string> = new Set(['running', 'paused', 'queued']);
const lastAgentStatus = new Map<string, string>();
const lastCronRun = new Map<string, string>();

/** Wire agent completion + cron runs into the in-app notification store. */
export function useNotificationsSource(): void {
  useEffect(() => {
    const push = useNotificationStore.getState().push;

    const unsub = useAgentStore.subscribe((state, prev) => {
      for (const a of state.agents) {
        const prevStatus = lastAgentStatus.get(a.id) ?? prev.agents.find((p) => p.id === a.id)?.status;
        lastAgentStatus.set(a.id, a.status);
        if (prevStatus === a.status || !prevStatus) continue;
        if (!ACTIVE.has(prevStatus) || ACTIVE.has(a.status)) continue;
        const name = a.name || '任务';
        if (a.status === 'completed') {
          push({
            kind: 'agent',
            title: `任务完成：${name}`,
            detail: (a.result || '').slice(0, 180) || undefined,
            agentId: a.id,
          });
        } else if (a.status === 'error') {
          push({
            kind: 'agent',
            title: `任务失败：${name}`,
            detail: (a.error || '').slice(0, 180) || undefined,
            agentId: a.id,
          });
        } else if (a.status === 'stopped') {
          push({ kind: 'agent', title: `任务已停止：${name}`, agentId: a.id });
        }
      }
    });

    const pollCron = async () => {
      const api = window.electronAPI?.cron;
      if (!api) return;
      const r = await api.list();
      if (!r?.ok || !r.data) return;
      const jobs = r.data as {
        id: string;
        name: string;
        lastRun?: { at: number; status: 'running' | 'success' | 'error'; result?: string; error?: string };
      }[];
      for (const job of jobs) {
        if (!job.lastRun) continue;
        const sig = `${job.id}:${job.lastRun.at}:${job.lastRun.status}`;
        if (lastCronRun.get(job.id) === sig) continue;
        lastCronRun.set(job.id, sig);
        const title =
          job.lastRun.status === 'success'
            ? `定时任务完成：${job.name}`
            : job.lastRun.status === 'error'
              ? `定时任务失败：${job.name}`
              : `定时任务执行中：${job.name}`;
        push({
          kind: 'cron',
          title,
          detail: (job.lastRun.result || job.lastRun.error || '').slice(0, 180) || undefined,
        });
      }
    };

    void pollCron();
    const timer = setInterval(() => void pollCron(), 30_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);
}

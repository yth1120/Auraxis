import clsx from 'clsx';
import { useMemo } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import type { AgentInfo } from '../../types/agent';
import { useT } from '../../i18n';

/** Shared 全部 / 失败 / 文本 segmented control for agent execution views. */
export default function AgentViewFilter({ agent }: { agent: AgentInfo }) {
  const t = useT();
  const agentErrorsOnly = useAppStore((s) => s.agentErrorsOnly);
  const setAgentErrorsOnly = useAppStore((s) => s.setAgentErrorsOnly);
  const agentTextOnly = useAppStore((s) => s.agentTextOnly);
  const setAgentTextOnly = useAppStore((s) => s.setAgentTextOnly);
  const agentRunningOnly = useAppStore((s) => s.agentRunningOnly);
  const setAgentRunningOnly = useAppStore((s) => s.setAgentRunningOnly);
  const agentRunningFollow = useAppStore((s) => s.agentRunningFollow);
  const setAgentRunningFollow = useAppStore((s) => s.setAgentRunningFollow);

  const { failed, text, running } = useMemo(() => {
    let failed = 0;
    let text = 0;
    let running = 0;
    for (const e of agent.log) {
      if (e.type === 'tool_error') failed += 1;
      else if (e.type === 'text' || e.type === 'thinking') text += 1;
      else if (e.type === 'tool_start') running += 1;
    }
    return { failed, text, running };
  }, [agent.log]);

  return (
    <div className="flex items-center rounded-full bg-[var(--color-bg-inset)] p-0.5">
      {([
        ['all', t('agentFilter.all')],
        ['errors', `${t('agentFilter.errors')}${failed > 0 ? ` (${failed})` : ''}`],
        ['text', `${t('agentFilter.text')}${text > 0 ? ` (${text})` : ''}`],
        ['running', `${t('agentFilter.running')}${running > 0 ? ` (${running})` : ''}`],
      ] as const).map(([key, label]) => {
        const active = key === 'errors'
          ? agentErrorsOnly
          : key === 'text'
            ? agentTextOnly
            : key === 'running'
              ? agentRunningOnly
              : !agentErrorsOnly && !agentTextOnly && !agentRunningOnly;
        return (
          <button
            key={key}
            type="button"
            className={clsx(
              'h-6 px-2.5 rounded-full text-xs font-medium border-none cursor-pointer transition-colors duration-150',
              active
                ? key === 'errors'
                  ? 'bg-danger-soft text-danger'
                  : key === 'text'
                    ? 'bg-primary-soft text-primary'
                    : key === 'running'
                      ? 'bg-[var(--color-primary-strong)] text-primary'
                      : 'bg-[var(--color-bg-elevated)] text-text-primary shadow-sm'
                : 'text-text-muted bg-transparent hover:text-text-secondary',
            )}
            onClick={() => {
              setAgentErrorsOnly(key === 'errors');
              setAgentTextOnly(key === 'text');
              setAgentRunningOnly(key === 'running');
            }}
            title={key === 'errors' ? t('agentFilter.title.errors') : key === 'text' ? t('agentFilter.title.text') : key === 'running' ? t('agentFilter.title.running') : t('agentFilter.title.all')}
          >
            {label}
          </button>
        );
      })}
      {agentRunningOnly && (
        <>
          <span className="w-px h-4 bg-[var(--color-border-default)] mx-1" aria-hidden />
          <button
            type="button"
            className={clsx(
              'h-6 px-2.5 rounded-full text-xs font-medium border-none cursor-pointer transition-colors duration-150',
              agentRunningFollow
                ? 'bg-primary-soft text-primary'
                : 'text-text-muted bg-transparent hover:text-text-secondary',
            )}
            onClick={() => setAgentRunningFollow(!agentRunningFollow)}
            title={t('agentFilter.followTip')}
          >
            {t('agentFilter.follow')}
          </button>
        </>
      )}
    </div>
  );
}

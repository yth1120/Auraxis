import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ExecutingIndicator from './ExecutingIndicator';
import { useT, type I18nKey } from '../../i18n';

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string;

/** 回合状态时钟: whole seconds, localized (`2分03秒` / `2m 03s`). */
function formatRunDuration(ms: number, t: Translate): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0
    ? t('duration.minutes', { minutes, seconds: String(seconds).padStart(2, '0') })
    : t('duration.seconds', { seconds });
}

interface DeepDiveStatusProps {
  /** Turn start time; absent falls back to the mount time. */
  startTime?: number;
  className?: string;
}

/**
 * Execution-waiting status — 执行等待状态: the user-provided
 * executing loop leads a shimmering brand-gradient label; a quiet clock joins
 * once the turn has been running for 15s.
 */
export default function DeepDiveStatus({ startTime, className }: DeepDiveStatusProps) {
  const t = useT();
  const [mountedAt] = useState(() => Date.now());
  const anchor = startTime ?? mountedAt;
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor));

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - anchor));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [anchor]);

  const showClock = elapsedMs >= 15_000;

  return (
    <span className={clsx('ax-deep-dive-status', className)} role="status" aria-live="polite">
      <ExecutingIndicator size={20} />
      <span className="ax-deep-dive-text">{t('status.deepDiving')}</span>
      {showClock && (
        <span className="ax-deep-dive-clock" aria-hidden>
          {formatRunDuration(elapsedMs, t)}
        </span>
      )}
    </span>
  );
}

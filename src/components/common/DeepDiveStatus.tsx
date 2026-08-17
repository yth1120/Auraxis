import clsx from 'clsx';
import ExecutingIndicator from './ExecutingIndicator';
import { useT } from '../../i18n';

interface DeepDiveStatusProps {
  /** Turn start time; absent falls back to the mount time. */
  startTime?: number;
  className?: string;
}

/** 执行中状态：只保留 spinner + 文案，不叠加第二套计时。 */
export default function DeepDiveStatus({ className }: DeepDiveStatusProps) {
  const t = useT();
  return (
    <span className={clsx('ax-deep-dive-status', className)} role="status" aria-live="polite">
      <ExecutingIndicator size={20} />
      <span className="ax-deep-dive-text">{t('status.deepDiving')}</span>
    </span>
  );
}

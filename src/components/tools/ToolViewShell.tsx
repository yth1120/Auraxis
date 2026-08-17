import type { ReactNode } from 'react';
import { X } from '@/components/common/icons';
import { useT } from '../../i18n';

interface ToolViewShellProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Header actions rendered right before the close button. */
  actions?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: number;
}

/**
 * Shared tool-view skeleton (通知/插件中心/定时任务): an icon chip + title +
 * one-line description header, then a centered content column. The old pattern
 * of a separate ChatArea tool bar + in-panel h2 title is gone — the panel owns
 * its full header, including the close action.
 */
export default function ToolViewShell({
  icon,
  title,
  description,
  actions,
  onClose,
  children,
  maxWidth = 760,
}: ToolViewShellProps) {
  const t = useT();
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-2.5 px-3 pt-2.5 pb-2 border-b border-[var(--color-border-dim)]">
        <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--color-bg-inset)] text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-sm font-semibold leading-5 text-[var(--color-text-primary)]">{title}</h2>
          {description && (
            <p className="m-0 mt-[1px] text-xs leading-[1.5] text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        {onClose && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-text-muted)] cursor-pointer border-none bg-transparent transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            onClick={onClose}
            aria-label={t('shell.close')}
            title={t('shell.back')}
          >
            <X size={14} />
          </button>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto flex justify-center">
        <div className="w-full box-border flex flex-col" style={{ maxWidth }}>
          <div className="px-3 pt-3 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

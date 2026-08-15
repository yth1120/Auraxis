import { useState } from 'react';
import { Dropdown, App } from 'antd';
import { CaretDown, Check as CheckIcon, Eye, PencilSimple, ShieldCheck } from '@/components/common/icons';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '../../i18n';
import type { SandboxMode } from '../../stores/useSettingsStore';

/**
 * Access axis — the hard sandbox boundary for Agent tasks.
 *   · read            — read project + safe commands only.
 *   · workspace-write — read/write project files; risky commands confirmed.
 *   · full            — any file / any command, no sandbox (confirmed on switch).
 * Persisted to backend settings so the scheduler enforces it on every task.
 */
export type AccessMode = SandboxMode;

const ACCESS_ICON: Record<AccessMode, ReactNode> = {
  read: <Eye size={16} />,
  'workspace-write': <PencilSimple size={16} />,
  full: <ShieldCheck size={16} />,
};

const ACCESS_MODES: AccessMode[] = ['read', 'workspace-write', 'full'];

interface AccessSelectorProps {
  accessMode: AccessMode;
  onChangeAccess: (m: AccessMode) => void;
}

const Check = () => (
  <CheckIcon size={16} className="shrink-0 text-text-primary" />
);

/**
 * One compact pill in the composer toolbar: the agent's access boundary.
 * The popup mirrors the model-switch panel (single pane, radio rows + check).
 */
export default function AccessSelector({
  accessMode,
  onChangeAccess,
}: AccessSelectorProps) {
  const { modal } = App.useApp();
  const t = useT();
  const [open, setOpen] = useState(false);

  const label = (m: AccessMode) =>
    m === 'read' ? t('access.read') : m === 'workspace-write' ? t('access.workspaceWrite') : t('access.full');
  const desc = (m: AccessMode) =>
    m === 'read' ? t('access.read.desc') : m === 'workspace-write' ? t('access.workspaceWrite.desc') : t('access.full.desc');

  const selectMode = (m: AccessMode) => {
    if (m === accessMode) {
      setOpen(false);
      return;
    }
    if (m === 'full') {
      setOpen(false);
      modal.confirm({
        title: t('access.full.confirmTitle'),
        content: t('access.full.confirmBody'),
        okText: t('access.full.ack'),
        cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk: () => onChangeAccess('full'),
      });
      return;
    }
    setOpen(false);
    onChangeAccess(m);
  };

  const optionCls =
    'flex items-center gap-2 w-full min-h-[32px] px-2 py-[3px] border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]';

  const panel = (
    <div className="w-[248px] p-1 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border-dim)] shadow-[var(--shadow-md)]">
      <div className="px-2 pt-[4px] pb-[2px] text-text-muted text-xs leading-[18px] font-medium">
        {t('access.title')}
      </div>
      {ACCESS_MODES.map((m) => {
        const active = m === accessMode;
        return (
          <button
            key={m}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className={optionCls}
            onClick={() => selectMode(m)}
          >
            <span
              className={clsx(
                'flex flex-none w-5 items-center justify-center',
                active ? 'text-primary' : 'text-text-muted',
              )}
            >
              {ACCESS_ICON[m]}
            </span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-5 font-medium text-text-primary">
                {label(m)}
              </span>
              <span className="text-xs leading-[18px] text-text-muted break-words">
                {desc(m)}
              </span>
            </span>
            <span className="flex flex-none w-[18px] items-center justify-center">
              {active ? <Check /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      menu={{ items: [] }}
      popupRender={() => panel}
      trigger={['click']}
      placement="topLeft"
    >
      <button
        type="button"
        className="flex items-center gap-1 h-8 px-2.5 min-w-0 border-none bg-transparent text-xs text-text-secondary rounded-full cursor-pointer transition-[background,color] duration-fast hover:bg-[var(--color-hover)] hover:text-text-primary"
        aria-label={t('access.title')}
        title={`${t('access.title')}：${label(accessMode)}`}
      >
        {ACCESS_ICON[accessMode]}
        <span className="max-w-[76px] overflow-hidden text-ellipsis whitespace-nowrap">{label(accessMode)}</span>
        <CaretDown className="text-2xs" />
      </button>
    </Dropdown>
  );
}

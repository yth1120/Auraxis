import { useState } from 'react';
import { Dropdown, App } from 'antd';
import {
  CaretRight,
  Gauge,
  Key,
  ListChecks,
  SlidersHorizontal,
} from '@/components/common/icons';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useT, type I18nKey } from '../../i18n';
import { useAppStore } from '../../stores/useAppStore';
import { WORK_AUTONOMY_TIERS, type WorkAutonomyTier } from '../../types/advanced';

interface WorkTierSelectorProps {
  /** 输入框居中时向下弹，贴底时向上弹（默认 up）。 */
  popDirection?: 'up' | 'down';
}

const TIER_ICON: Record<WorkAutonomyTier, ReactNode> = {
  plan: <ListChecks size={16} />,
  smart: <Gauge size={16} />,
  full: <Key size={16} />,
};

const TIER_LABEL_KEY: Record<WorkAutonomyTier, I18nKey> = {
  plan: 'work.tier.plan',
  smart: 'work.tier.smart',
  full: 'work.tier.full',
};

const TIER_DESC_KEY: Record<WorkAutonomyTier, I18nKey> = {
  plan: 'work.tier.plan.desc',
  smart: 'work.tier.smart.desc',
  full: 'work.tier.full.desc',
};

/** Shared row geometry — mirrors PermissionSelector（运行权限面板）。 */
const optionCls =
  'flex items-center gap-2 w-full min-h-[40px] px-1.5 py-0.5 border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]';

/**
 * Work 模式执行档位：计划确认 / 智能放行 / 全自动。
 * 选择只作用于 Work 任务；Code 仍走全局权限预设。
 */
export default function WorkTierSelector({ popDirection = 'up' }: WorkTierSelectorProps) {
  const { modal } = App.useApp();
  const t = useT();
  const [open, setOpen] = useState(false);
  const tier = useAppStore((s) => s.workAutonomyTier);
  const setTier = useAppStore((s) => s.setWorkAutonomyTier);

  const selectTier = (next: WorkAutonomyTier) => {
    if (next === tier) {
      setOpen(false);
      return;
    }
    if (next === 'full') {
      setOpen(false);
      modal.confirm({
        title: t('work.tier.full.confirmTitle'),
        content: t('work.tier.full.confirmBody'),
        okText: t('work.tier.full.ack'),
        cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk: () => setTier('full'),
      });
      return;
    }
    setOpen(false);
    setTier(next);
  };

  const panel = (
    <div
      role="menu"
      aria-label={t('work.tier.title')}
      className={clsx(
        'flex flex-col w-[280px] p-1 gap-0.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border-dim)] rounded-2xl shadow-[var(--shadow-lg)] opacity-0 translate-y-1',
        popDirection === 'down'
          ? 'animate-[smartPanelInDown_0.18s_ease_forwards]'
          : 'animate-[smartPanelInUp_0.18s_ease_forwards]',
      )}
    >
      {/* Header：标题 + 当前档位（与运行权限面板的 Profile 徽标同构） */}
      <div className="px-2 pt-1 pb-1 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="flex flex-none items-center justify-center w-7 h-7 text-text-secondary">
              <SlidersHorizontal size={14} />
            </span>
            <span className="text-sm leading-[20px] font-semibold text-text-primary tracking-[0.01em]">
              {t('work.tier.title')}
            </span>
          </span>
          <span
            className="inline-flex items-center h-[20px] max-w-[110px] px-1.5 rounded-md bg-border-dim text-2xs leading-none text-text-secondary truncate shrink-0"
            title={t(TIER_DESC_KEY[tier])}
          >
            {t(TIER_LABEL_KEY[tier])}
          </span>
        </div>
      </div>

      <div className="mx-2 h-px bg-[var(--color-border-dim)]" />

      {WORK_AUTONOMY_TIERS.map((p) => {
        const active = p === tier;
        return (
          <button
            key={p}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            title={t(TIER_DESC_KEY[p])}
            className={clsx(optionCls, active && 'bg-primary-soft')}
            onClick={() => selectTier(p)}
          >
            <span
              className={clsx(
                'flex flex-none items-center justify-center w-7 h-7',
                active ? 'text-primary' : 'text-text-muted',
              )}
            >
              {TIER_ICON[p]}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-[18px] font-medium text-text-primary">
                {t(TIER_LABEL_KEY[p])}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[16px] text-text-muted">
                {t(TIER_DESC_KEY[p])}
              </span>
            </span>
            <span
              className={clsx(
                'flex flex-none items-center justify-center w-4 h-4 rounded-full border-2 transition-colors duration-150',
                active ? 'border-primary' : 'border-[var(--color-border-strong)]',
              )}
              aria-hidden="true"
            >
              {active && <span className="w-[6px] h-[6px] rounded-full bg-primary" />}
            </span>
          </button>
        );
      })}

      <div className="mx-2 my-1 h-px bg-[var(--color-border-dim)]" />

      <button
        type="button"
        role="menuitem"
        className="flex items-center gap-2 w-full min-h-[36px] px-1.5 py-1 border border-[var(--color-border-dim)] rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)] hover:border-[var(--color-border-strong)]"
        onClick={() => {
          setOpen(false);
          useAppStore.getState().setSettingsInitialKey('permissions');
          useAppStore.getState().setShowSettings(true);
        }}
      >
        <span className="flex flex-none items-center justify-center w-7 h-7 text-text-muted">
          <SlidersHorizontal size={16} />
        </span>
        <span className="flex-1 min-w-0 text-sm leading-5 font-medium text-text-primary truncate">
          {t('access.more')}
        </span>
        <span className="flex flex-none items-center justify-center text-text-muted">
          <CaretRight size={14} />
        </span>
      </button>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      menu={{ items: [] }}
      popupRender={() => panel}
      trigger={['click']}
      placement={popDirection === 'down' ? 'bottomLeft' : 'topLeft'}
    >
      <button
        type="button"
        title={t('work.tier.title')}
        className={clsx(
          'ax-icon-button',
          open && '!bg-primary-soft !text-primary',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {TIER_ICON[tier]}
      </button>
    </Dropdown>
  );
}

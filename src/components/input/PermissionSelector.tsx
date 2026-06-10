import { useCallback, useEffect, useState } from 'react';
import { Dropdown, App } from 'antd';
import {
  CaretDown,
  CaretRight,
  Eye,
  Gauge,
  Key,
  ShieldCheck,
  SlidersHorizontal,
} from '@/components/common/icons';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useT, type I18nKey } from '../../i18n';
import { useAppStore } from '../../stores/useAppStore';
import { PERMISSION_PRESET_IDS, type PermissionPreset } from '../../types/advanced';

const PRESET_ICON: Record<PermissionPreset, ReactNode> = {
  ask: <ShieldCheck size={16} />,
  auto: <Gauge size={16} />,
  full: <Key size={16} />,
  readonly: <Eye size={16} />,
};

const PRESET_LABEL_KEY: Record<PermissionPreset, I18nKey> = {
  ask: 'access.ask',
  auto: 'access.auto',
  full: 'access.full',
  readonly: 'access.read',
};

const PRESET_DESC_KEY: Record<PermissionPreset, I18nKey> = {
  ask: 'access.ask.desc',
  auto: 'access.auto.desc',
  full: 'access.full.desc',
  readonly: 'access.read.desc',
};

interface PermissionSelectorProps {
  preset: PermissionPreset;
  onChangePreset: (preset: PermissionPreset) => void;
  /** 输入框居中时向下弹，贴底时向上弹（默认 up）。 */
  popDirection?: 'up' | 'down';
}

/** Shared row geometry — mirrors the model-switch panel (ModeToggler) so the
 *  composer dropdowns share one rhythm: 32px rows, 14/12px type, 17/18px
 *  leading, single-line descriptions with ellipsis. */
const optionCls =
  'flex items-center gap-2 w-full min-h-[40px] px-1.5 py-0.5 border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]';

/**
 * One compact pill in the composer toolbar: "how much should I let the agent
 * do?". Each preset maps 1:1 to sandboxMode + mode + autoApprove (see
 * electron/contracts/permission.ts); named profiles layer hard scopes on top
 * and are managed from Settings → 权限.
 */
export default function PermissionSelector({
  preset,
  onChangePreset,
  popDirection = 'up',
}: PermissionSelectorProps) {
  const { modal } = App.useApp();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);

  const refreshProfile = useCallback(() => {
    window.electronAPI?.permissionProfile
      ?.list()
      .then((r) => {
        if (!r?.ok || !r.data) return;
        const data = r.data;
        const active = data.profiles.find((p) => p.id === data.activeId);
        setProfileName(active ? active.name : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const openProfiles = () => {
    setOpen(false);
    useAppStore.getState().setSettingsInitialKey('permissions');
    useAppStore.getState().setShowSettings(true);
  };

  const selectPreset = (p: PermissionPreset) => {
    if (p === preset) {
      setOpen(false);
      return;
    }
    if (p === 'full') {
      setOpen(false);
      modal.confirm({
        title: t('access.full.confirmTitle'),
        content: t('access.full.confirmBody'),
        okText: t('access.full.ack'),
        cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk: () => onChangePreset('full'),
      });
      return;
    }
    setOpen(false);
    onChangePreset(p);
  };

  const panel = (
    <div
      role="menu"
      aria-label={t('access.title')}
      className={clsx(
        'flex flex-col w-[280px] p-1 gap-0.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border-dim)] rounded-2xl shadow-[var(--shadow-lg)] opacity-0 translate-y-1',
        popDirection === 'down'
          ? 'animate-[smartPanelInDown_0.18s_ease_forwards]'
          : 'animate-[smartPanelInUp_0.18s_ease_forwards]',
      )}
    >
      {/* Header: title + active named profile (orthogonal hard-scope layer) */}
      <div className="px-2 pt-1 pb-1 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="flex flex-none items-center justify-center w-7 h-7 text-text-secondary">
              <ShieldCheck size={14} />
            </span>
            <span className="text-sm leading-[20px] font-semibold text-text-primary tracking-[0.01em]">{t('access.title')}</span>
          </span>
          {profileName && (
            <span
              className="inline-flex items-center h-[20px] max-w-[110px] px-1.5 rounded-md bg-border-dim text-2xs leading-none text-text-secondary truncate shrink-0"
              title={t('access.profile', { name: profileName })}
            >
              {profileName}
            </span>
          )}
        </div>
        <p className="m-0 pl-9 text-2xs leading-[16px] text-text-muted">{t('access.subtitle')}</p>
      </div>

      <div className="mx-2 h-px bg-[var(--color-border-dim)]" />

      {PERMISSION_PRESET_IDS.map((p) => {
        const active = p === preset;
        return (
          <button
            key={p}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            title={t(PRESET_DESC_KEY[p])}
            className={clsx(optionCls, active && 'bg-primary-soft')}
            onClick={() => selectPreset(p)}
          >
            <span
              className={clsx(
                'flex flex-none items-center justify-center w-7 h-7',
                active ? 'text-primary' : 'text-text-muted',
              )}
            >
              {PRESET_ICON[p]}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-[18px] font-medium text-text-primary">
                {t(PRESET_LABEL_KEY[p])}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[16px] text-text-muted">
                {t(PRESET_DESC_KEY[p])}
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
        onClick={openProfiles}
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

      <div className="px-2 pb-1 pt-0.5 text-2xs leading-[16px] text-text-faint">
        {t('access.applyNext')}
      </div>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refreshProfile();
      }}
      menu={{ items: [] }}
      popupRender={() => panel}
      trigger={['click']}
      placement={popDirection === 'down' ? 'bottomLeft' : 'topLeft'}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 h-8 px-2.5 min-w-0 border-none rounded-full bg-transparent text-xs leading-5 font-medium text-text-secondary cursor-pointer whitespace-nowrap transition-[background,color] duration-150 ease-out hover:bg-[var(--color-hover)] hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        aria-label={t('access.title')}
        title={`${t('access.title')}：${t(PRESET_LABEL_KEY[preset])}`}
      >
        <span className="shrink-0">{PRESET_ICON[preset]}</span>
        <span className="max-w-[88px] overflow-hidden text-ellipsis whitespace-nowrap">
          {t(PRESET_LABEL_KEY[preset])}
        </span>
        <CaretDown className="shrink-0 text-2xs text-text-muted" />
      </button>
    </Dropdown>
  );
}

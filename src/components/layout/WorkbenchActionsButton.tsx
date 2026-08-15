import { PanelRight } from '@/components/common/icons';
import { useAppStore } from '@/stores/useAppStore';
import clsx from 'clsx';
import { useT } from '../../i18n';

/**
 * One-click workbench panel toggle. The right panel's in-panel tabs
 * (检查器 / 时间线 / 审查) handle view switching — the entry stays a simple
 * on/off switch, matching the VSCode panel-toggle pattern.
 */
export default function WorkbenchActionsButton() {
  const t = useT();
  const showRightPanel = useAppStore((s) => s.showRightPanel);
  const rightPanelView = useAppStore((s) => s.rightPanelView);
  const active = showRightPanel && rightPanelView !== 'none';

  const togglePanel = () => {
    const store = useAppStore.getState();
    if (store.showRightPanel && store.rightPanelView !== 'none') {
      store.toggleRightPanel();
      return;
    }
    if (store.rightPanelView === 'none') store.setRightPanelView('inspector');
    if (!store.showRightPanel) store.toggleRightPanel();
  };

  return (
    <button
      type="button"
      className={clsx('ax-header-action text-sm', active && '!bg-primary-soft !text-primary')}
      onClick={togglePanel}
      aria-label={t('workbench.actions')}
      aria-pressed={active}
      title={t('workbench.actions')}
    >
      <PanelRight weight={active ? 'fill' : 'regular'} />
    </button>
  );
}

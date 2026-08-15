import { t } from '../i18n';
import { useAppStore } from '../stores/useAppStore';
import type { WorkbenchTab, WorkbenchTabType } from '../types/chat';

const TAB_LABELS: Record<WorkbenchTabType, string> = {
  chat: t('nav.newChat'),
  'file-tree': t('tab.fileTree'),
  diff: t('tab.diff'),
  browser: t('tab.browser'),
};

/** Open a workbench tab by type — activate the existing one or create a new one. */
export function openWorkbenchTab(type: WorkbenchTabType, metadata?: WorkbenchTab['metadata']): void {
  const st = useAppStore.getState();
  const existing = st.tabs.find((tab) => tab.type === type);
  if (existing) {
    if (metadata) st.updateTab(existing.id, { metadata: { ...existing.metadata, ...metadata } });
    st.setActiveTab(existing.id);
    return;
  }
  st.addTab({ type, label: TAB_LABELS[type], metadata });
}

/**
 * Global singleton for Agent-view keyboard shortcuts. Registered once so
 * multiple panels can never double-toggle the same action.
 */
import { useAppStore } from '../stores/useAppStore';

let registered = false;

export function ensureAgentViewShortcuts(): void {
  if (registered) return;
  registered = true;

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (!e.shiftKey) return;
    const key = e.key.toLowerCase();
    const store = useAppStore.getState();
    if (key === 'e') {
      e.preventDefault();
      store.setAgentErrorsOnly(!store.agentErrorsOnly);
      if (!store.agentErrorsOnly) {
        store.setAgentTextOnly(false);
        store.setAgentRunningOnly(false);
      }
    } else if (key === 't') {
      e.preventDefault();
      const next = !store.agentTextOnly;
      store.setAgentTextOnly(next);
      if (next) store.setAgentErrorsOnly(false);
      if (next) store.setAgentRunningOnly(false);
    } else if (key === 'r') {
      e.preventDefault();
      const next = !store.agentRunningOnly;
      store.setAgentRunningOnly(next);
      if (next) {
        store.setAgentErrorsOnly(false);
        store.setAgentTextOnly(false);
      }
    } else if (key === 'a') {
      e.preventDefault();
      store.toggleAllAgentTurns();
    } else if (key === 'l') {
      e.preventDefault();
      store.requestAgentRawLog();
    } else if (key === 'n') {
      e.preventDefault();
      store.requestAgentErrorNav(1);
    } else if (key === 'p') {
      e.preventDefault();
      store.requestAgentErrorNav(-1);
    }
  };

  window.addEventListener('keydown', onKeyDown);
}

import { useAppStore } from '@/stores/useAppStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useChatStore } from '@/stores/useChatStore';

/**
 * Backfill the composer with a follow-up instruction and focus it.
 * Used by the right panel (diff 继续改 / 质量门错误修复): the user reviews the
 * text and presses Enter — ChatInput's follow-up path then continues the
 * selected task with the prior result carried over.
 */
export function backfillComposer(instruction: string, agentId?: string): void {
  const app = useAppStore.getState();
  if (app.sidebarMode !== 'code') app.setSidebarMode('code');
  if (agentId) {
    useAgentStore.getState().setCurrentAgent(agentId);
  }
  useChatStore.getState().setInputValue(instruction);
  useChatStore.getState().requestComposerFocus();
}

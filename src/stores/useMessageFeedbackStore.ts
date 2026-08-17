/**
 * useMessageFeedbackStore — per-message up/down ratings（消息评分）。
 * Ratings persist through the main-process JSONL feedback log.
 */

import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

interface MessageFeedbackStore {
  ratings: Record<string, 'up' | 'down'>;
  loadedSessions: string[];
  load: (sessionId: string) => Promise<void>;
  rate: (messageId: string, sessionId: string, rating: 'up' | 'down') => Promise<void>;
}

export const useMessageFeedbackStore = create<MessageFeedbackStore>((set, get) => ({
  ratings: {},
  loadedSessions: [],

  load: async (sessionId) => {
    if (!sessionId || get().loadedSessions.includes(sessionId)) return;
    const api = window.electronAPI?.feedback?.messageList;
    if (!api) return;
    try {
      const r = await api(sessionId);
      if (!r?.ok || !r.data) return;
      const ratings: Record<string, 'up' | 'down'> = {};
      for (const rec of r.data) {
        if (rec.rating === 'up' || rec.rating === 'down') ratings[rec.messageId] = rec.rating;
      }
      set((s) => ({
        ratings: { ...s.ratings, ...ratings },
        loadedSessions: [...s.loadedSessions, sessionId],
      }));
    } catch {
      /* keep local state */
    }
  },

  rate: async (messageId, sessionId, rating) => {
    const current = get().ratings[messageId];
    const next = current === rating ? undefined : rating;
    set((s) => {
      const ratings = { ...s.ratings };
      if (next) ratings[messageId] = next;
      else delete ratings[messageId];
      return { ratings };
    });
    const api = window.electronAPI?.feedback?.message;
    if (api) {
      void api({
        messageId,
        sessionId,
        rating: next ?? null,
        projectPath: useSettingsStore.getState().projectPath || undefined,
      }).catch(() => {});
    }
  },
}));

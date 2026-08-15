/**
 * i18n — lightweight app-chrome translation.
 *
 * Scope: application shell (sidebar / header / workbench / composer / common
 * controls). Message content, tool descriptions, and settings panes remain
 * Chinese-first for now; the dictionary is typed so new keys are compile-checked.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCallback } from 'react';
import { zhCN, type I18nKey } from './zh-CN';
import { enUS } from './en-US';

export type Locale = 'zh-CN' | 'en-US';
export type { I18nKey };

const dictionaries: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: 'zh-CN',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'auraxis-locale' },
  ),
);

function translate(locale: Locale, key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? zhCN;
  let text: string = dict[key] ?? zhCN[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  return translate(useI18nStore.getState().locale, key, vars);
}

/** Reactive translator hook — components re-render on locale change. */
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  return useCallback(
    (key: I18nKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}

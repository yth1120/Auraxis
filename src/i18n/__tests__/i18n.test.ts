import { describe, it, expect, beforeEach } from 'vitest';
import { t, useI18nStore } from '../index';

beforeEach(() => {
  useI18nStore.setState({ locale: 'zh-CN' });
});

describe('i18n', () => {
  it('defaults to Chinese and translates to English after switching', () => {
    expect(t('nav.chat')).toBe('对话');
    expect(t('nav.newTask')).toBe('新建任务');
    useI18nStore.getState().setLocale('en-US');
    expect(t('nav.chat')).toBe('Chat');
    expect(t('nav.newTask')).toBe('New task');
  });

  it('substitutes variables', () => {
    expect(t('composer.sendAfterStop')).toBe('停止并发送');
    expect(t('composer.placeholder.followup', { name: '修复登录' })).toContain('修复登录');
  });

  it('falls back to the key for unknown entries', () => {
    expect((t as (k: string) => string)('missing.key')).toBe('missing.key');
  });
});

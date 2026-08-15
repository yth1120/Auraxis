import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';

let app: ElectronApplication;
let page: Page;
const pageErrors: string[] = [];

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'auraxis-e2e-'));

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(process.cwd(), 'dist-electron', 'main.js')],
    cwd: process.cwd(),
    env: {
      ...process.env,
      AURAXIS_FORCE_PRODUCTION: '1',
      // 隔离持久化数据，避免污染真实用户配置
      AURAXIS_USER_DATA_DIR: dataDir,
      AURAXIS_CHAT_LOG_DIR: path.join(dataDir, 'chat-logs'),
      AURAXIS_SESSION_LOG_DIR: path.join(dataDir, 'session-logs'),
      AURAXIS_SESSION_CACHE_DIR: path.join(dataDir, 'session-cache'),
      AURAXIS_FTS_DIR: path.join(dataDir, 'fts'),
      AURAXIS_FEEDBACK_DIR: path.join(dataDir, 'feedback'),
      AURAXIS_SNAPSHOT_DIR: path.join(dataDir, 'agent-snapshots'),
      AURAXIS_HOOKS_DIR: path.join(dataDir, 'hooks'),
    },
  });
  page = await app.firstWindow();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.ax-composer-textarea').waitFor({ state: 'visible', timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test('应用启动并渲染主外壳', async () => {
  await expect(page).toHaveTitle('Auraxis');
  await expect(page.locator('.ax-composer-textarea')).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: '设置' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '对话' })).toBeVisible();
});

test('对话 / Agent 模式切换', async () => {
  const chatTab = page.getByRole('tab', { name: '对话' });
  const agentTab = page.getByRole('tab', { name: 'Agent' });

  await agentTab.click();
  await expect(agentTab).toHaveAttribute('aria-selected', 'true');

  await chatTab.click();
  await expect(chatTab).toHaveAttribute('aria-selected', 'true');
});

test('Agent 首页渲染快捷功能卡片', async () => {
  await page.getByRole('tab', { name: 'Agent' }).click();
  await expect(page.locator('section button[aria-label*="："]').first()).toBeVisible();
  expect(await page.locator('section button[aria-label*="："]').count()).toBeGreaterThanOrEqual(6);
  await page.getByRole('tab', { name: '对话' }).click();
});

test('对话模式发送消息并渲染用户气泡', async () => {
  const composer = page.locator('.ax-composer-textarea');
  await composer.fill('E2E 你好');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(
    page.locator('.ax-message-user').filter({ hasText: 'E2E 你好' }),
  ).toBeVisible({ timeout: 15_000 });

  // 测试环境未配置 API Key：助手应返回明确错误而不是静默失败
  await expect(page.getByText(/API Key/).first()).toBeVisible({ timeout: 20_000 });
});

test('设置面板打开并切换主题', async () => {
  // 回归：浮动输入 Dock 曾遮挡侧边栏底部，导致真实鼠标点击打不到设置按钮
  await page.locator('nav button').filter({ hasText: '设置' }).first().click();
  await expect(page.locator('.ant-modal-content')).toBeVisible();

  await page.getByText('外观', { exact: true }).click();
  await expect(page.getByText('主题模式', { exact: true })).toBeVisible();

  await page.getByText('深色主题', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

  await page.getByText('浅色主题', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
});

test('整个会话无未捕获页面异常', () => {
  expect(pageErrors).toEqual([]);
});

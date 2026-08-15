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

  // 会话开始后顶部分割线应常驻显示（任务结束也不消失）
  await expect(page.locator('[data-divider="on"]')).toBeVisible();
});

test('设置面板打开并切换主题', async () => {
  // 回归：浮动输入 Dock 曾遮挡侧边栏底部，导致真实鼠标点击打不到设置按钮
  await page.locator('nav button').filter({ hasText: '设置' }).first().click();
  const settingsModal = page.locator('.ant-modal-content:visible');
  await expect(settingsModal).toBeVisible();

  await page.getByText('外观', { exact: true }).click();
  await expect(page.getByText('主题模式', { exact: true })).toBeVisible();

  await page.getByText('深色主题', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);

  await page.getByText('浅色主题', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);

  // 关闭设置弹窗，避免残留遮挡后续测试
  await settingsModal.locator('.ant-modal-close').click();
  await expect(page.locator('.ant-modal-content:visible')).toBeHidden();
});

test('Agent 模式顶部工具面板可开合且不被遮挡', async () => {
  await page.getByRole('tab', { name: 'Agent' }).click();

  // 通知面板：打开 -> 标题可见 -> 再次点击关闭
  await page.getByRole('button', { name: '通知' }).click();
  await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
  await page.getByRole('button', { name: '通知' }).click();
  await expect(page.getByRole('heading', { name: '通知' })).toBeHidden();

  // 终端抽屉：打开 -> 标题可见 -> 再次点击关闭
  const terminalBtn = page.locator('button[title^="终端"]');
  await terminalBtn.click();
  await expect(page.getByText('集成终端', { exact: true }).first()).toBeVisible();
  await terminalBtn.click();
  await expect(page.getByText('集成终端', { exact: true }).first()).toBeHidden();

  // 工作台面板：打开右侧面板 -> 面板 Tab 可见 -> 再次点击关闭
  await page.getByRole('button', { name: '工作台面板' }).click();
  const panelTabs = page.getByRole('tablist', { name: '工作台面板' });
  await expect(panelTabs.getByRole('tab', { name: '文件' })).toBeVisible();
  await expect(panelTabs.getByRole('tab', { name: '概览' })).toBeVisible();
  await expect(panelTabs.getByRole('tab', { name: '时间线' })).toBeVisible();
  await page.getByRole('button', { name: '工作台面板' }).click();
  await expect(panelTabs.getByRole('tab', { name: '文件' })).toBeHidden();
});

test('Agent 模式右侧工作台面板 Tab 切换', async () => {
  await page.getByRole('tab', { name: 'Agent' }).click();
  await page.getByRole('button', { name: '工作台面板' }).click();

  const panelTabs = page.getByRole('tablist', { name: '工作台面板' });
  const tabs = ['文件', '概览', '时间线', '审查', '预览'];
  for (const name of tabs) {
    const tab = panelTabs.getByRole('tab', { name });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  await page.getByRole('button', { name: '工作台面板' }).click();
});

test('Agent 模式侧边栏工具面板可打开', async () => {
  await page.getByRole('tab', { name: 'Agent' }).click();
  const sidebar = page.locator('nav.ax-sidebar');

  // 插件中心
  await sidebar.getByRole('button', { name: '插件中心' }).click();
  await expect(page.getByRole('heading', { name: '插件中心' })).toBeVisible();
  await sidebar.getByRole('button', { name: '插件中心' }).click();
  await expect(page.getByRole('heading', { name: '插件中心' })).toBeHidden();

  // 定时任务
  await sidebar.getByRole('button', { name: '定时任务' }).click();
  await expect(page.getByRole('heading', { name: '定时任务' })).toBeVisible();
  await sidebar.getByRole('button', { name: '定时任务' }).click();
  await expect(page.getByRole('heading', { name: '定时任务' })).toBeHidden();

  // 技能目录
  await sidebar.getByRole('button', { name: '技能' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('输入区模型选择与思考深度面板联动', async () => {
  await page.getByRole('tab', { name: 'Agent' }).click();

  const modelTrigger = page.getByRole('button', { name: '切换模型' });
  await modelTrigger.click();
  await expect(page.getByRole('radiogroup', { name: '思考深度' })).toBeVisible();
  await expect(page.getByRole('menuitemradio').first()).toBeVisible();

  // 选择 Flash 模型后面板关闭，触发按钮展示新模型名
  await page.getByRole('menuitemradio', { name: /DeepSeek V4 Flash/ }).click();
  await expect(page.getByRole('radiogroup', { name: '思考深度' })).toBeHidden();
  await expect(modelTrigger).toContainText('DeepSeek V4 Flash');

  // 访问权限面板
  const accessBtn = page.getByRole('button', { name: '访问权限' });
  await accessBtn.click();
  await expect(page.getByRole('menuitemradio', { name: /只读/ })).toBeVisible();
  await page.getByRole('menuitemradio', { name: /工作区写入/ }).click();
  await expect(accessBtn).toContainText('工作区写入');
});

test('顶部搜索与侧边栏搜索按钮联动', async () => {
  const input = page.locator('#global-search-input');
  await input.click();
  await expect(page.getByText('↑↓ 选择')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('↑↓ 选择')).toBeHidden();

  // 侧边栏搜索按钮应聚焦顶部搜索框并弹出面板
  await page.getByRole('button', { name: '全局搜索' }).click();
  await expect(input).toBeFocused();
  await expect(page.getByText('↑↓ 选择')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('命令面板快捷键打开并可关闭', async () => {
  await page.keyboard.press('Control+Shift+P');
  await expect(page.locator('.command-palette-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-palette-modal')).toBeHidden();
});

test('设置面板各分区导航无异常', async () => {
  await page.locator('nav button').filter({ hasText: '设置' }).first().click();
  const settingsModal = page.locator('.ant-modal-content:visible');
  await expect(settingsModal).toBeVisible();

  const sections: [string, string][] = [
    ['外观', '主题模式'],
    ['快捷键', '恢复默认'],
    ['权限', '权限 Profile'],
    ['关于', 'Auraxis'],
  ];
  for (const [nav, content] of sections) {
    await settingsModal.getByRole('button', { name: nav }).click();
    await expect(settingsModal.getByText(content).first()).toBeVisible();
  }

  await settingsModal.locator('.ant-modal-close').click();
  await expect(page.locator('.ant-modal-content:visible')).toBeHidden();
});

test('整个会话无未捕获页面异常', () => {
  expect(pageErrors).toEqual([]);
});

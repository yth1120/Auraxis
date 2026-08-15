import { defineConfig } from '@playwright/test';

/**
 * 端到端测试：启动编译后的真实 Electron 应用（生产渲染层 dist/），
 * 通过窗口 UI 验证关键用户路径。运行前需先构建：
 *   npm run test:e2e   # electron:compile + vite build + playwright test
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    exclude: ['dist-electron/**', 'dist/**', 'packages/auraxis-sdk/dist/**', 'release/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      // 校准后的「真实且会守住」门槛：当前实际 56.1% 行/语句、76.8% 分支、
      // 70.1% 函数（含 scheduler/query-engine/ai-handlers/tool 各族与工作树/LSP/Review 补测）。
      // 行/语句已越过 50% 目标，取整锁定；分支/函数留足余量。
      thresholds: { lines: 50, branches: 60, functions: 60, statements: 50 },
      include: ['electron/ipc/**/*.ts', 'src/stores/**/*.ts', 'src/core/**/*.ts'],
      exclude: ['dist-electron/**', 'dist/**', '**/__tests__/**', '**/*.test.*', '**/node_modules/**'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

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
      // 校准后的「真实且会守住」门槛：当前实际 71.9% 行/语句、78.2% 分支、
      // 77.4% 函数（补测 useChatStore/useAgentStore 关键路径与端到端链路后）。
      // 行/语句显著越过 50% 目标，取整锁定；分支/函数留足余量。
      thresholds: { lines: 65, branches: 65, functions: 65, statements: 65 },
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

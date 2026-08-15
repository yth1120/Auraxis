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
      // 校准后的「真实且会守住」门槛：当前实际 86.3% 行/语句、79.3% 分支、
      // 84.4% 函数（补测 context-manager 摘要/截断链路与 Bash 内部执行后）。
      // 行/语句已达实际天花板区间，取整锁定；分支/函数留足余量。
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
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

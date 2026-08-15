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
      // 校准后的「真实且会守住」门槛：当前实际 82.7% 行/语句、79.0% 分支、
      // 83.0% 函数（补测 agent-handlers/terminal/mcp/permission/bash-session/
      // plugin-manager/undo/session-store/tool 杂项后）。
      // 行/语句接近实际天花板，取整锁定；分支/函数留足余量。
      thresholds: { lines: 75, branches: 70, functions: 75, statements: 75 },
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

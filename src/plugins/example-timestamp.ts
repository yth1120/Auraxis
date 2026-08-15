/**
 * Example Plugin: /timestamp command
 * Inserts the current ISO timestamp into the chat input.
 */

import type { Plugin } from '../types/plugin';

const plugin: Plugin = {
  id: 'example-timestamp',
  name: '时间戳工具',
  version: '1.0.0',
  description: '添加 /timestamp 命令，在输入框中插入当前 ISO 时间戳',
  author: 'Auraxis',
  permissions: [],

  commands: [
    {
      name: 'timestamp',
      description: '插入当前时间戳',
      usage: '/timestamp',
      execute(_args, ctx) {
        const ts = new Date().toISOString();
        ctx.setInputValue(ctx.theme === 'dark' ? `当前时间: ${ts}` : `当前时间: ${ts}`);
        return true;
      },
    },
  ],
};

export default plugin;

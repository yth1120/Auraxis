/**
 * Example Plugin: /uuid command
 * Generates a random UUID v4 and inserts it into the chat input.
 */

import type { Plugin } from '../types/plugin';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const plugin: Plugin = {
  id: 'example-uuid',
  name: 'UUID 生成器',
  version: '1.0.0',
  description: '添加 /uuid 命令，生成随机 UUID 并插入输入框',
  author: 'Auraxis',
  permissions: [],

  commands: [
    {
      name: 'uuid',
      description: '生成随机 UUID',
      usage: '/uuid',
      execute(_args, ctx) {
        const uuid = generateUUID();
        ctx.setInputValue(uuid);
        return true;
      },
    },
  ],

  hooks: {
    afterSessionEnd: () => {
      // Cleanup hook example — could log session stats
    },
  },
};

export default plugin;

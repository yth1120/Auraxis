# @auraxis/sdk

TypeScript 客户端 SDK，通过 stdio JSON-RPC 驱动 Auraxis runtime（）。

## 用法

```ts
import { createAuraxis } from '@auraxis/sdk';

const client = await createAuraxis(); // 默认使用仓库内 electron + dist-electron/main.js
// 也可指定：createAuraxis({ electronPath, mainJs })

const pong = await client.ping();
console.log(pong); // { pong: true, time }

const result = await client.runAgent({
  prompt: '修复登录 bug',
  description: 'SDK 任务',
  subagentType: 'general-purpose',
  projectRoot: 'C:/my-project',
});
console.log(result);

const hits = await client.searchSessions('登录', 5);
console.log(hits);

await client.close();
```

## 运行方式

`createAuraxis()` 会以 `--sdk` 参数无头启动 Electron 主进程（独立临时 Chromium profile，读取桌面设置），
与正在运行的桌面 App 互不干扰。运行时支持的环境变量：

- `AURAXIS_ELECTRON` — Electron 可执行文件路径
- `AURAXIS_MAIN_JS` — 编译后的主进程入口（默认 `dist-electron/main.js`）

## 协议

换行分隔的 JSON-RPC 2.0，方法：`ping`、`agent.run`、`session.search`。
传输走 127.0.0.1 回环 TCP（Electron 主进程在 Windows 上无法读取管道 stdin），
runtime 启动后通过 stdout 输出 `AURAXIS_SDK_PORT=<port>` 供客户端连接。

## 构建与测试

```sh
npm run sdk:build
npm run sdk:test
```

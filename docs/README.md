# Auraxis 项目架构与开发文档

相关文档：[TS SDK](../packages/auraxis-sdk/README.md) · [Python SDK](../python/auraxis_sdk/README.md) · [工程规范](../AGENTS.md)

## 一、项目概述
Auraxis v2.0.0 是一款基于 Electron 的桌面端 Agentic 编程助手，融合了统一 ReAct 步进引擎、多智能体调度、Code Mode 工具编排、插件扩展和持久化项目记忆。执行语义遵循通用约定（`end_turn` 即回合结束，无剧本/强制门），ReviewArtifact 作为可选验证工具。后端 LLM 默认为 DeepSeek API（兼容 OpenAI / Anthropic 格式），联网搜索支持 DuckDuckGo / Exa / Perplexity / DeepSeek 官方搜索多 provider。

- **主进程**：Electron 主进程（`electron/`），负责窗口管理、IPC 通信、工具执行、智能体调度
- **渲染进程**：React 18 + Vite（`src/`），负责 UI 渲染、状态管理、用户交互
- **进程通信**：通过 Electron IPC（`contextBridge` + `ipcMain/ipcRenderer`）进行双向通信

### 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron 43（Node 24，内置 `node:sqlite`），无边框窗口，`contextIsolation: true` |
| 前端 | React 18 + TypeScript 5.5 + Vite 7 |
| UI 组件库 | Ant Design 5，自定义深色/浅色主题 |
| 状态管理 | Zustand 4；会话/设置/插件状态以主进程为权威，localStorage 仅作渲染层缓存 |
| 存储与检索 | 会话/Agent 统一 JSONL 事件日志 + SQLite 投影缓存 + FTS5 全文搜索 + 长期记忆（better-sqlite3，JSON 回退） |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight + rehype-katex + mermaid |
| AI API | axios（SSE 流式请求），支持 DeepSeek/OpenAI 格式和 Anthropic 格式；MCP、AGENTS.md、生命周期 hooks 协议 |
| 测试 | Vitest + @testing-library/react + jsdom（渲染进程），node 环境（主进程） |
| 构建 | Vite + electron-builder 26（NSIS/DMG/AppImage；原生依赖需 Python/VS 环境重编译） |

### 基础设施

- **headless CLI**：`npm run cli -- --run "<任务>"`（模型/项目/权限/沙箱/JSON 输出），另有 `--sdk` / `--acp` / `--plugin list|scan|enable|disable`
- **对外 SDK**：TypeScript（`packages/auraxis-sdk`，TCP JSON-RPC）与 Python（`python/auraxis_sdk`）
- **Code Mode**：`RunCode` 的 TypeScript 程序在工作线程中 `await tools.Name(args)` 编排工具，子调用回穿完整权限管线（8 路并发重叠、硬超时）
- **图片输入**：`ReadImage` + 内容寻址附件存储，多模态结果自动转 OpenAI `image_url` / Anthropic `image` block，非视觉模型降级为文本
- **后台任务**：`Task*` / `Job*` 统一管理后台 bash、终端任务与子 Agent；`Schedule*` 支持 after/at/every 会话内跟进
- **终端**：底部可拖拽终端抽屉 + `Terminal*` 六件套模型工具 + PTY 持久会话 + SSH
- **原生沙箱**：Windows restricted token / AppContainer、Linux、macOS 四种后端 + worktree 隔离 + read-before-write 观测硬门
- **工作流隔离**：模型编排脚本运行在 worker thread，超时可强杀
- **会话标题**：LLM 生成 + 规则回退；**逐消息评分**、**附件画廊/灯箱**、**图片草稿栏**
- **外观设置**：主题模式（跟随系统/浅/深）、中英双语、侧边栏透明度（Windows 11 原生 Acrylic 磨砂透出桌面）；设置面板内置真实测试覆盖率报告（`coverage/coverage-summary.json`）
- **遥测**：opt-in（`AURAXIS_TELEMETRY_MODE`），严格白名单脱敏，NDJSON 上报

---

## 二、进程模型与目录结构

### 2.1 双进程架构

```
Electron Main Process (electron/)            Renderer Process (src/)
┌──────────────────────────────────┐    ┌──────────────────────────────┐
│ main.ts — 窗口创建, CSP, 单实例锁  │    │ main.tsx → App.tsx            │
│ preload.ts — contextBridge API   │◄──►│ React 18 + Ant Design 5       │
│                                      │    │                              │
│ ipc/index.ts — 注册 30+ 模块处理器 │IPC │ Zustand Stores (17个)         │
│ ipc/step-engine.ts — 统一ReAct步进 │    │                              │
│ ipc/query-engine.ts — 聊天驱动     │    │ src/core/ — 插件管理器        │
│ ipc/agent-loop.ts — Agent 驱动     │    │   工具/命令注册表              │
│ ipc/agent-scheduler.ts — 调度器    │    │   工具/命令注册表              │
│ ipc/agent-handlers.ts — Agent CRUD │   │                              │
│ ipc/tool-handlers.ts — 63个工具执行│   │ src/components/ — UI 组件     │
 │ tool-defs.ts — 63 个工具定义     │    │    chat/, input/, layout/,    │
│ ipc/permission-*.ts — 权限系统    │    │    settings/, agent/,         │
│ ipc/mcp-handlers.ts — MCP 协议    │    │    permissions/, preview/     │
│ ipc/memory-*.ts — 持久化记忆      │    │                              │
│ ipc/model-config.ts — 模型配置    │    │ @/ 别名 → src/               │
│ ipc/settings-store.ts — 加密存储   │    │                              │
│ ipc/conflict-detector.ts — 冲突检测│    │                              │
│ ipc/undo-manager.ts — 撤销管理    │    │                              │
│ ipc/plan-handlers.ts — 计划审批    │    │                              │
│ code-mode.ts — Code Mode 程序执行 │    │                              │
│ attachments.ts — 内容寻址附件     │    │                              │
│ session-store.ts — 统一事件日志   │    │                              │
│ sandbox-runner.ts — 原生沙箱      │    │                              │
│ sdk-server / acp-server / headless │   │                              │
└──────────────────────────────────┘    └──────────────────────────────┘
```

### 2.2 目录结构

```
Auraxis/
├── electron/                    # 主进程代码（Node.js 环境）
│   ├── main.ts                  # 应用入口：窗口创建、CSP、单实例锁
│   ├── preload.ts               # contextBridge 暴露 API 给渲染进程
│   ├── types.ts                 # 共享类型（PermissionMode, IpcResponse, ModelDefinition 等）
│   ├── tool-defs.ts             # 63 个 AI 工具的定义（名称、描述、入参 schema）
│   ├── contracts/               # 跨进程类型单一事实源（core/tools/advanced/session-types）
│   ├── advanced-defs.ts         # MCP/Agent/Permission 高级类型
│   └── ipc/                     # IPC 处理器模块
│       ├── index.ts             # registerIpcHandlers() 总入口
│       ├── ai-handlers.ts       # 聊天流、查询引擎、中断、测试连接
│       ├── query-engine.ts      # 聊天模式的 ReAct 循环（含 3 次 API 重试）
│       ├── step-engine.ts       # 统一 ReAct 步进（聊天与 Agent 共用，策略钩子注入）
│       ├── agent-loop.ts        # Agent 驱动（规划/偏差检测/上下文压缩/停止策略）
│       ├── agent-handlers.ts    # Agent CRUD + 3 个内置 Agent 定义 + 子 Agent 父子关系
│       ├── agent-scheduler.ts   # 多 Agent 并发调度器（优先级队列、并发控制、暂停/恢复）
│       ├── tool-handlers.ts     # 63 个工具的实际执行逻辑 + 权限守卫 + 结构化输出摘要
│       ├── permission-handlers.ts # 权限检查、规则管理、对话框请求
│       ├── mcp-handlers.ts      # MCP 协议客户端（JSON-RPC、工具发现、安全验证）
│       ├── model-config.ts      # 模型解析（内置 + 环境变量 + 持久化）
│       ├── memory-db.ts         # 长期记忆持久化（SQLite + JSON 后备）
│       ├── memory-extractor.ts  # LLM 驱动的对话记忆提取
│       ├── memory-ipc.ts        # 记忆 CRUD 的 IPC 桥接
│       ├── context-handlers.ts  # 项目上下文（项目指令文件、文件树、package.json）
│       ├── file-handlers.ts     # 文件操作（打开/读取/写入/搜索）
│       ├── project-handlers.ts  # 项目操作（文件树、目录选择、代码应用/预览）
│       ├── system-handlers.ts   # 系统信息（统计、Git 分支、版本）
│       ├── settings-store.ts    # 加密持久化设置（API Key 使用 safeStorage）
│       ├── coverage-handlers.ts # 测试覆盖率报告读取（coverage/coverage-summary.json）
│       ├── conflict-detector.ts # 多 Agent 文件锁防并发写入冲突
│       ├── undo-manager.ts      # 文件级撤销（快照 + 恢复）
│       ├── plan-handlers.ts     # 计划审批流（发送→前端→等待用户确认→超时）
│       ├── shared.ts            # 路径验证、安全扩展名、排除目录
│       ├── text-filter.ts       # 模型产物剥离（thinking 标签、零宽字符等）
│       ├── code-mode.ts         # Code Mode：TS 程序 + 工具绑定 + 并发子调用（worker）
│       ├── attachments.ts       # 内容寻址附件存储（ReadImage 底层）
│       ├── fork-runner.ts       # one-shot 分叉子代理（无头子进程）
│       ├── schedule-store.ts    # 会话内跟进任务（after/at/every）
│       ├── session-store.ts     # 聊天/Agent 统一 JSONL 事件日志
│       ├── sandbox-runner.ts    # 原生沙箱调度（restricted/AppContainer/linux/macos）
│       ├── acp-server.ts / sdk-server.ts / headless-run.ts  # ACP / JSON-RPC SDK / 无头执行
 │       └── __tests__/           # 主进程测试（全仓 166 个测试文件 / 1347 用例）
│
├── src/                         # 渲染进程代码（浏览器环境）
│   ├── main.tsx                 # React 入口
│   ├── App.tsx                  # 根组件：布局、主题、权限对话框、命令面板
│   ├── components/              # UI 组件
│   │   ├── chat/                # 聊天相关（消息列表、消息气泡、Markdown 渲染、输入框）
│   │   ├── layout/              # 布局组件（侧边栏、顶部栏、右侧面板、导航）
│   │   ├── settings/            # 设置面板
│   │   ├── permissions/         # 权限对话框
│   │   ├── agent/               # Agent 管理面板 + 执行流程视图 + 图式工作流可视化
│   │   ├── memory/              # 记忆管理面板
│   │   ├── preview/             # 文件树面板、预览浏览器
│   │   └── common/              # 通用组件
│   ├── stores/                  # Zustand 状态管理（17 个 Store）
│   │   ├── useChatStore.ts      # 聊天消息、流、重试、项目上下文、记忆注入
│   │   ├── useSettingsStore.ts   # API Key、默认模型、通知
│   │   ├── useAppStore.ts       # 主题、侧边栏、右侧面板、导航历史
│   │   ├── useAgentStore.ts     # Agent CRUD、优先级、并发（持久化，模块层订阅 agent:event 流并做 RAF 节流）
│   │   ├── useSessionStore.ts   # 会话保存/加载/删除/导出/分叉（最多 40 个）
 │   │   ├── useProjectStore.ts   # 项目注册表、当前项目、工作区排序
│   │   ├── usePluginStore.ts    # 已安装插件、启用/禁用
│   │   ├── useMemoryStore.ts    # 活跃/搜索记忆（从主进程加载）
│   │   ├── useFileTreeStore.ts  # 文件树、展开路径
│   │   ├── useUndoStore.ts      # 撤销条目跟踪
│   │   ├── useInspectorStore.ts # 计划、系统消息、活跃工具计数（数据层，无独立 UI）
│   │   ├── useWorktreeStore.ts  # Worktree 沙箱状态（激活/沙箱路径）
│   │   ├── useAdvancedStore.ts  # MCP 服务器、Agent 旧设置
│   │   ├── useTerminalTasksStore.ts # 终端任务列表（后台 bash 运行状态）
│   │   ├── useNotificationStore.ts  # 通知列表/未读计数
│   │   ├── useMessageFeedbackStore.ts # 逐消息评分持久化
│   │   └── useKeybindingsStore.ts # 快捷键覆盖
│   ├── core/                    # 核心逻辑
│   │   ├── plugin-manager.ts    # 插件安装/卸载/启用/禁用
│   │   ├── plugin-loader.ts     # 动态加载 + 安全扫描
│   │   ├── tool-registry.ts     # 插件工具注册表
│   │   ├── command-registry.ts  # 插件命令注册表
│   │   └── __tests__/           # 核心逻辑测试（4 个测试文件：plugin-manager、plugin-loader、tool-registry、command-registry）
│   ├── services/                # AI 服务（浏览器端回退方案）
│   ├── types/                   # 渲染进程类型（re-export electron/contracts）
│   ├── plugins/                 # 内置示例插件
│   ├── styles/                  # 主题配置（深色/浅色）
│   ├── hooks/                   # 自定义 React Hooks
│   └── constants/               # 快捷键、扩展颜色常量
│
├── scripts/                     # 开发脚本
│   └── electron-dev.js          # 清除 ELECTRON_RUN_AS_NODE 后启动 Electron
├── docs/                        # 文档
│   └── README.md                # 项目架构与开发文档
├── package.json
├── tsconfig.json                # 渲染进程 TS 配置（ESNext/bundler, @/* → src/*）
├── tsconfig.node.json           # Vite 配置专用（composite project reference）
├── tsconfig.electron.json       # 主进程 TS 配置（CommonJS → dist-electron/, rootDir: electron/）
├── vite.config.mts              # Vite 构建配置
├── vitest.config.ts             # 测试配置（覆盖率阈值：80% 行 / 70% 分支 / 80% 函数）
├── electron-builder.yml         # 打包配置（NSIS/DMG/AppImage）
└── .env.example                 # 环境变量模板
```

### 2.3 TypeScript 配置要点

项目有三个 `tsconfig` 文件，其中 `tsconfig.electron.json` 设置 `rootDir: "electron/"`，这导致主进程代码**无法 import 来自 `src/` 的类型**。因此需要在两处重复定义中间类型：

- **跨进程契约单一事实源**：`electron/contracts/`（`core.ts` / `tools.ts` / `advanced.ts` / `session-types.ts`）是唯一定义处；`electron/types.ts`、`electron/advanced-defs.ts`、`src/types/*` 全部 re-export，**不再双向镜像维护**。

`tsconfig.electron.json` 仍保持 `rootDir: "electron/"`（CommonJS 输出到 `dist-electron/`），新增共享类型必须放进 `contracts/` 并让两端 re-export，禁止把类型再复制到 `src/`。

---

## 三、IPC 通信体系

### 3.1 通信流程

```
渲染进程 (React)                    主进程 (Electron)
─────────────────                   ─────────────────
window.electronAPI.ai.sendQuery()   
  → ipcRenderer.invoke()    ──→    ipcMain.handle('ai:sendQuery', ...)
                                      ↓
                                   query-engine.ts 执行 ReAct 循环
                                      ↓
                                   mainWindow.webContents.send('ai:queryEvent:${id}', ...)
  ← ipcRenderer.on()        ←──        ↓
  → callback.onEvent(data)           (每步工具执行、文本块、错误等)
```

### 3.2 IPC 通道命名规范

**格式**：`domain:action`（kebab-case 命名空间 + 冒号分隔符）

### 3.3 IPC 响应规范

所有处理程序统一返回：
```typescript
interface IpcResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

### 3.4 流式通信

流请求使用**独立的事件通道**：
- 聊天流：`ai:chunk:${requestId}`
- 查询流：`ai:queryEvent:${requestId}`
- Agent 事件：`agent:event:${agentId}`

每个通道在请求创建时注册监听器，在收到 `done`/`error` 事件或调用 `abort` 时自动清理。

### 3.5 完整 IPC 通道表

| 域 | 通道 | 方向 | 说明 |
|---|------|------|------|
| **window** | `window:minimize` | 渲染→主 | 最小化窗口 |
| | `window:maximize` | 渲染→主 | 最大化/还原窗口 |
| | `window:close` | 渲染→主 | 关闭窗口 |
| | `window:focus` | 渲染→主 | 聚焦窗口（通知点击） |
| | `window:isMaximized` | 渲染→主 | 查询最大化状态 |
| | `window:maximize-changed` | 主→渲染 | 最大化状态变更事件 |
| | `window:setBackgroundMaterial` / `window:backgroundMaterialSupported` | 渲染→主 | 侧边栏 Acrylic 磨砂材质切换与支持检测（Windows 11） |
| **shell** | `shell:openExternal` | 渲染→主 | 在默认浏览器打开 URL（仅 http/https） |
| | `shell:openInVSCode` | 渲染→主 | 在 VS Code 中打开项目 |
| **file** | `file:open` | 渲染→主 | 打开文件对话框 |
| | `file:read` | 渲染→主 | 读取文件内容 |
| | `file:write` | 渲染→主 | 写入文件 |
| | `file:search` | 渲染→主 | 按关键词搜索文件 |
| **project** | `project:getTree` | 渲染→主 | 获取项目文件树 |
| | `project:applyCode` | 渲染→主 | 应用代码到文件 |
| | `project:previewCode` | 渲染→主 | 预览代码（HTML/图片等） |
| | `project:selectDirectory` | 渲染→主 | 选择项目目录 |
| **context** | `context:getProjectContext` | 渲染→主 | 获取项目上下文（指令文件、文件树、package.json） |
| | `context:getFileStructure` | 渲染→主 | 获取文件结构概览 |
| | `context:readFile` | 渲染→主 | 读取文件（上下文用） |
| **ai** | `ai:chatStream` | 渲染→主 | 发起聊天流（纯对话，无工具） |
| | `ai:sendQuery` | 渲染→主 | 发起查询（完整的 ReAct 循环） |
| | `ai:testConnection` | 渲染→主 | 测试 API 连接 |
| | `ai:abortStream` / `ai:abortQuery` | 渲染→主 | 中止流/查询 |
| | `ai:abortTool` | 渲染→主 | 中止单个工具执行 |
| | `ai:retryTool` | 渲染→主 | 重试工具执行 |
| | `ai:chunk:${requestId}` | 主→渲染 | 聊天流的文本块事件 |
| | `ai:queryEvent:${requestId}` | 主→渲染 | 查询流的所有事件（工具开始/结束/文本等） |
| **memory** | `memory:extract` | 渲染→主 | 从对话提取记忆 |
| | `memory:getByProject` | 渲染→主 | 按项目获取记忆 |
| | `memory:getByType` | 渲染→主 | 按类型获取记忆 |
| | `memory:search` | 渲染→主 | 搜索记忆 |
| | `memory:archive` / `memory:delete` | 渲染→主 | 归档/删除记忆 |
| **agent** | `agent:create` / `agent:start` | 渲染→主 | 创建/启动 Agent |
| | `agent:stop` / `agent:schedulerStop` | 渲染→主 | 停止 Agent |
| | `agent:pause` / `agent:resume` | 渲染→主 | 暂停/恢复 Agent |
| | `agent:setPriority` | 渲染→主 | 设置优先级 |
| | `agent:getQueue` | 渲染→主 | 获取待执行队列 |
| | `agent:setMaxConcurrent` | 渲染→主 | 设置最大并发数 |
| | `agent:getAll` / `agent:list` / `agent:get` | 渲染→主 | 查询 Agent 列表/详情 |
| | `agent:remove` / `agent:clear` | 渲染→主 | 移除/清空 Agent |
| | `agent:updated` | 主→渲染 | Agent 状态更新事件 |
| | `agent:event:${agentId}` | 主→渲染 | Agent 执行事件（工具调用等） |
| **mcp** | `mcp:getServers` / `mcp:setServers` | 渲染→主 | MCP 服务器配置 |
| | `mcp:connect` / `mcp:disconnect` | 渲染→主 | 连接/断开 MCP 服务器 |
| | `mcp:getStatuses` | 渲染→主 | 获取所有服务器状态 |
| | `mcp:listTools` / `mcp:callTool` | 渲染→主 | 列出/调用 MCP 工具 |
| **permission** | `permission:respond` | 渲染→主 | 用户对权限请求的回复 |
| | `permission:addRule` | 渲染→主 | 添加权限规则 |
| | `permission:getRules` | 渲染→主 | 获取所有规则 |
| | `permission:request` | 主→渲染 | 权限请求事件 |
| **plan** | `plan:approve` / `plan:reject` | 渲染→主 | 批准/拒绝计划 |
| | `plan:generated` | 主→渲染 | 计划生成事件 |
| **undo** | `undo:getHistory` / `undo:getList` | 渲染→主 | 获取撤销历史 |
| | `undo:execute` / `undo:revert` / `undo:revertLast` | 渲染→主 | 执行撤销/恢复 |
| | `undo:getSessionDiffs` / `undo:revertSessionFile` / `undo:revertSessions` | 渲染→主 | 按会话查看/回滚文件变更（右舱「变更」视图） |
| **conflict** | `conflict:getConflicts` | 渲染→主 | 获取冲突列表 |
| | `conflict:getFileHistory` | 渲染→主 | 获取文件修改历史 |
| **snapshot** | `snapshot:create` / `list` / `restore` / `delete` | 渲染→主 | 命名快照管理 |
| **system** | `system:getStats` | 渲染→主 | 获取系统统计 |
| | `system:getGitBranches` | 渲染→主 | 获取 Git 分支列表 |
| | `system:getVersion` | 渲染→主 | 获取应用版本 |
| | `system:getAccountInfo` | 渲染→主 | 查询 DeepSeek 账户余额（/user/balance） |
| **settings** | `settings:get` / `settings:set` | 渲染→主 | 读写设置 |
| | `settings:getApiKey` / `api:setKey` | 渲染→主 | API Key 管理 |
| | `settings:setPermissionMode` / `settings:getPermissionMode` | 渲染→主 | 权限模式管理 |
| **coverage** | `coverage:get` | 渲染→主 | 读取测试覆盖率报告（coverage/coverage-summary.json） |
| **model** | `model:getAll` | 渲染→主 | 获取所有可用模型 |
| **app** | `app:error` | 主→渲染 | 未捕获异常/未处理 Promise 拒绝 |
| **cron** | `cron:create` / `cron:delete` / `cron:list` | 渲染→主 | 定时任务的创建/删除/列出 |
| **worktree** | `worktree:getStatus` | 渲染→主 | 查询 Agent worktree 沙箱状态 |
| | `worktree:changed` | 主→渲染 | worktree 激活/失活事件 |

---

## 四、AI 核心系统

### 4.1 两条执行路径

Auraxis 有**两条驱动、一套循环**：聊天与 Agent 的每次 LLM 步进都委托给统一的 `step-engine.ts`（重试、工具批处理、停止策略、压缩全部收敛于此），两条驱动只保留各自的编排职责（聊天直接执行；Agent 增加规划/审批/偏差检测/暂停恢复）。

#### 路径 A：聊天查询（query-engine.ts）

用于主聊天 UI。流程：

```
用户输入 → buildSystemPrompt() → prepareMessages()
    ↓
ReAct 循环（最多 500 次迭代，业务上限 200 + 安全硬上限 500）：
    1. LLM 调用（llmClientInvoke，3 次重试，指数退避 2s/4s/8s/16s max）
    2. 如果无工具调用 → 检查 <FINAL_ANSWER> → 停止
    3. 如果有工具调用 → executeToolCall() → 结构化 summary → 追加结果 → 返回步骤 1
    4. 上下文压缩（token > 100K 时触发）
    5. 停止策略评估（stopPolicyEvaluate）
    6. 迭代摘要 emit（toolsThisIteration, llmLatencyMs）
    ↓
返回结果给聊天 UI
```

**特点**：
- **无规划阶段**：直接执行 ReAct 循环
- **API 重试**：429/5xx/网络错误自动重试 3 次指数退避
- **上下文压缩**：基于规则的压缩，token 阈值约 100K
- **停止信号**：`<FINAL_ANSWER>` + `stop_reason` 检查；ReviewArtifact 是可选验证工具，不设强制质量门
- **业务迭代上限**：200 次（可配置），安全硬上限：500 次
- **结构化摘要**：9 种工具输出携带 `summary` 供前端类型化卡片渲染
- **暴露方式**：`ai:sendQuery` IPC

#### 路径 B：子 Agent（agent-loop.ts → agent-handlers.ts）

用于侧边栏 Agent 和 `Agent` 工具。流程：

```
Agent 创建 → 获取任务描述
    ↓
规划阶段（可选）：
    LLM 生成 JSON 任务计划（TaskPlan），包含依赖关系
    ↓
Agent 驱动（agentLoopRun，步进委托 step-engine）：
    1. LLM 调用
    2. 工具执行（executeToolCall）
    3. 偏差检测（DevianceDetector）：
       - L1: 工具执行失败 → 标记 blocked
       - L2: 连续停滞 → 建议重规划
       - L3: 触发 Replan 工具 → LLM 生成新子计划
    4. 上下文管理（ContextManager）：基于回合/Token 的压缩
    5. 停止策略评估
    ↓
返回结果
```

**特点**：
- **完整规划能力**：LLM 生成结构化 JSON 任务计划（含依赖关系 + 关键词匹配）
- **计划审批**：`plan` 模式生成计划后等待用户审批（5 分钟超时），仅执行已批准步骤
- **质量验证（可选）**：ReviewArtifact 可按需运行 build/test/typecheck/lint
- **偏差检测**：三级检测（工具失败 L1、停滞 L2、重规划 L3）
- **上下文管理**：支持 LLM 摘要和基于规则的回退
- **新项目检测**：自动检测空目录/无 package.json，注入初始化指引
- **暂停/恢复**：完整状态捕获（messages/plan/iteration/toolCallCount），满容量自动重入队列
- **最大递归深度**：3（Agent 工具可嵌套调用子 Agent，记录父子关系）
- **暴露方式**：`agent:create` IPC 和 `runSubAgent()` 函数

#### 路径 C：Code Mode（code-mode.ts）

`RunCode` 工具在 `language=typescript` 时把程序体放进 worker thread 执行，`await tools.Name(args)` 的每个子调用都回穿 `executeToolCall` 全权限管线；并发安全工具最多 8 路重叠、变异工具串行，硬超时与中止可终止 worker。只有 print/return 的内容返回给模型。子代理分叉后端（`Agent` 的 `backend=fork`）另见 `fork-runner.ts`（无头子进程 one-shot）。

### 4.2 系统提示词构建

`query-engine.ts` 中的 `buildSystemPrompt()` 函数构建中文系统提示词，包含：

- 工具使用能力声明
- **任务完成信号**：`<FINAL_ANSWER>` 标记（必须大写，必须在最后一行）
- **两阶段工作流**：阶段 1 探索（Glob/Grep/Read）→ 阶段 2 执行（Write/Edit/Bash）
- 平台感知的 Shell 提示（Windows → Git Bash，macOS/Linux → 标准 Unix）
- 深度思考模式（`isDeepThink`）时追加思考指令

### 4.3 工具系统

工具定义在 `electron/tool-defs.ts`（[查看文件](../electron/tool-defs.ts)），共 **63 个内置工具**。下表列出核心 24 个，其余按能力族补充在表后：

| # | 工具 | 类别 | 说明 |
|---|------|------|------|
| 1 | **Bash** | 危险 | 在项目目录执行 Shell 命令。默认超时 120s，最大 600s。Windows 支持 Git Bash/cmd/PowerShell |
| 2 | **Read** | 安全 | 读取文件内容，支持行偏移/限制，路径穿越检查。输出含 `summary`（文件路径、行数、大小） |
| 3 | **Write** | 危险 | 创建/覆盖文件，扩展名白名单，Windows 保留名称检查，撤销前备份。输出含 `summary`（路径、字节数） |
| 4 | **Edit** | 危险 | 文件内查找替换，需唯一匹配，撤销前备份 |
| 5 | **Delete** | 危险 | 删除文件或目录（递归需确认），路径穿越检查，撤销前备份 |
| 6 | **Grep** | 安全 | 正则搜索（最大深度 5 层，最多 50 结果）。输出含 `summary`（匹配数） |
| 7 | **Glob** | 安全 | 文件模式匹配（最大深度 6 层，最多 100 文件）。输出含 `summary`（匹配数） |
| 8 | **WebFetch** | 危险 | URL 内容获取（15s 超时），拦截本地/内网地址 |
| 9 | **WebSearch** | 危险 | 通过 DuckDuckGo HTML 搜索（无需 API Key） |
| 10 | **TodoWrite** | 安全 | 任务清单管理（pending/in_progress/completed），同一时间仅一个 in_progress |
| 11 | **Agent** | 危险 | 启动子 Agent（Explore/Plan/general-purpose），递归深度限制 3，记录父子关系 |
| 12 | **Replan** | 安全 | 生成新子计划（仅 Agent 循环可用，查询引擎会跳过） |
| 13 | **CronCreate** | 危险 | 创建周期/一次性定时任务（5 字段 cron），应用运行时触发 |
| 14 | **CronDelete** | 安全 | 按 ID 取消定时任务 |
| 15 | **CronList** | 安全 | 列出所有活跃定时任务 |
| 16 | **TaskOutput** | 安全 | 读取后台任务/子 Agent 的累积输出（不阻塞） |
| 17 | **TaskStop** | 危险 | 按 ID 停止运行中的工具/子 Agent |
| 18 | **EnterPlanMode** | 安全 | 进入计划模式，生成实现计划交用户审批 |
| 19 | **ExitPlanMode** | 安全 | 用户批准后退出计划模式，开始实现 |
| 20 | **NotebookEdit** | 危险 | 读/写/插入/删除 Jupyter Notebook（.ipynb）单元格 |
| 21 | **EnterWorktree** | 危险 | 创建隔离的 Git worktree 沙箱，后续工具调用自动重定向到沙箱路径 |
| 22 | **LSP** | 安全 | 代码智能：definition / references / diagnostics（tsc --noEmit） |
| 23 | **ReviewArtifact** | 危险 | 可选验证工具：运行 build/test/typecheck/lint |
| 24 | **GitCommit** | 危险 | 暂存所有变更并创建 Git 提交，返回 commit hash |

> 上表「类别」为按行为的直观归类；某工具是否实际触发权限对话框，以 `tool-handlers.ts` 中的危险工具集合为准。

**其余 39 个工具（按能力族）**：

- **编排/自省**：RunWorkflow、Ralph、ListAgents / SendMessage / InterruptAgent / Report、GetGoal / CreateGoal / UpdateGoal、InspectRuntime、MountPlugin / UnmountPlugin
- **文件**：StrReplaceEditor（view/create/str_replace/insert）、ReadImage、NotebookEdit 相关
- **终端**：TerminalOpen / TerminalList / TerminalRead / TerminalSend / TerminalSignal / TerminalClose、Pty、Pwsh
- **后台/调度**：JobList / JobOutput / JobKill、ScheduleCreate / ScheduleDelete / ScheduleList
- **会话检索**：SessionQuery、SessionEventSearch / SessionEventRead / SessionTrace（含事件级 lineage）、ReadSpill
- **能力加载**：ListSkills / ReadSkill / WriteSkill、LSP、ReviewArtifact、GitCommit、EnterWorktree

**工具分类**：
- **危险工具集合**：`['Bash', 'Write', 'Edit', 'Delete', 'WebFetch', 'WebSearch', 'CronCreate', 'TaskStop', 'EnterWorktree', 'ReviewArtifact', 'GitCommit']` — 触发权限对话框
- **文件修改工具**：`['Write', 'Edit', 'NotebookEdit', 'Delete']` — 触发撤销备份和冲突检测文件锁
- **只读工具**：`['Read', 'Grep', 'Glob']` — 在 `ask` 和 `plan` 模式下自动批准

`Replan` 工具在聊天查询路径中不可用（查询引擎会跳过），仅在 Agent 循环中可用。

### 4.4 权限系统

三种模式（`electron/types.ts` → `src/types/`）：

| 模式 | 行为 |
|------|------|
| `ask`（默认） | 每次危险工具调用弹出权限对话框。只读工具（Read/Grep/Glob）自动批准 |
| `plan` | 计划审批步骤中明确批准的工具自动执行。不在计划内的工具按 `ask` 模式处理 |
| `afe`（全自动） | 无需确认批准所有工具。安全检查仍执行（路径检查、扩展名白名单、被拦截 URL），但不显示对话框 |

权限规则存储在 `permission-handlers.ts` 中，作用域分为：
- `once` — 仅本次有效
- `session` — 当前会话有效
- `always` — 永久有效

### 4.5 上下文压缩

`ContextManager` 类（`agent-loop.ts`）管理长对话的上下文压缩：

- **触发条件**：基于 token 估算（`maxTokensBeforeCompress`，默认 ~100K）或回合数（`maxRounds`）
- **压缩策略**：LLM 摘要（默认）→ 失败时回退到基于规则的压缩
- **压缩比**：默认压缩最旧 50% 的对话轮次

### 4.6 停止策略

`stopPolicyEvaluate()` 函数评估是否应停止执行：

- **质量验证（可选）**：ReviewArtifact 供模型在需要时运行验证命令
- **主要检查**：`<FINAL_ANSWER>` 标记检测（解析 LLM 输出中的结束信号）
- **max_tokens 保护**：当 API 返回 `stop_reason: 'max_tokens'` 时强制继续
- **计划完成确认**：所有计划任务 `completed` 才允许停止
- **连续纯文本检测**：连续 5 轮无工具调用强制停止
- **空响应检测**：连续 2 次空响应停止

---

## 五、多 Agent 调度系统

### 5.1 三层架构

```
Agent 管理 (agent-handlers.ts)
    ↓ 创建/配置
Agent 调度器 (agent-scheduler.ts) — 单例 AgentScheduler
    ↓ 调度执行
Agent 循环 (agent-loop.ts) — agentLoopRun()
    ↓ 执行中
工具执行 (tool-handlers.ts) / 子 Agent (递归)
```

### 5.2 Agent 类型

定义在 `agent-handlers.ts`（[查看文件](../electron/ipc/agent-handlers.ts)），三种内置类型：

| 类型 | 能力 | 禁用工具 |
|------|------|---------|
| **Explore** | 只读探索：搜索文件、阅读代码、Web 获取/搜索 | Write, Edit, Agent |
| **Plan** | 只读架构师：设计实现方案，输出结构化计划 | Write, Edit, Bash, Agent（工具白名单强制限制） |
| **general-purpose** | 全能力：编码、调试、重构 | 无限制（全部 63 个工具可用） |

### 5.3 AgentScheduler 调度器

单例 `AgentScheduler`（`agent-scheduler.ts`）管理多 Agent 的并行执行：

- **优先级队列**：high（权重 3）> normal（2）> low（1）
- **默认最大并发数**：3（可通过 `agent:setMaxConcurrent` IPC 调节）
- **Agent 状态机**：`idle → queued → running → completed/error/stopped/paused`
- **实时通知**：每次状态变更通过 `agent:updated` 频道广播给前端
- **200 次迭代上限**：每个 Agent 最多 200 次迭代（可通过 `maxIterations` 配置，硬安全闸 200）

### 5.4 工作区隔离

工作区隔离在 `tool-handlers.ts`（`worktreeSessions`）中实现：

- **仅 Git 仓库**：`EnterWorktree` 用 `git worktree` 在 `.auraxis-sandbox/task-<id>` 创建隔离分支（非 Git 目录会直接拒绝）
- **路径重定向**：进入 worktree 后，后续文件/命令工具自动重定向到沙箱路径
- **沙箱垃圾回收**：启动时清理无主沙箱目录（crash/taskkill 跳过 `before-quit` 后的孤儿）
- **原生沙箱**：命令级隔离另由 `sandbox-runner.ts` 提供（Windows restricted token / AppContainer、Linux、macOS 四后端）

### 5.5 冲突检测

`conflict-detector.ts` 防止多 Agent 并发写入同一文件：

- 在 Write/Edit 操作前获取文件锁
- 跟踪文件修改历史（哪个 Agent、何时修改）
- 通过 `conflict:getConflicts` 暴露冲突信息给前端

---

## 六、MCP 协议支持

`mcp-handlers.ts` 实现了 MCP（Model Context Protocol）客户端：

- **通信协议**：JSON-RPC over stdio
- **安全命令验证**：连接前验证服务器命令
- **工具发现**：`mcp:listTools` 列出远程 MCP 服务器的工具
- **工具调用**：`mcp:callTool` 调用远程工具（`mcp__serverName__toolName`）
- **状态管理**：`mcp:connect` / `mcp:disconnect` / `mcp:getStatuses`

---

## 七、插件系统

### 7.1 扩展点

插件（`src/core/plugin-manager.ts`）提供以下扩展点：

| 扩展点 | 说明 |
|--------|------|
| **commands** | 斜杠命令（`/example`），可操作聊天输入 |
| **tools** | AI 工具（合并到工具注册表，LLM 可调用） |
| **hooks** | 生命周期钩子：`onToolExecute`, `onAgentStart`, `onAgentEnd` |
| **ui** | UI 扩展：`settingsPanel`（设置面板）, `statusBarItem`（状态栏） |

### 7.2 安全模型

插件运行在渲染进程中，安装流程包含多层安全检查：

1. **源代码扫描**（`plugin-loader.ts`）：检测 8 种危险模式
   - `eval()`、`new Function()` — 任意代码执行
   - `require('child_process')` — 系统进程
   - `require('fs')` — 文件系统访问
   - `fetch()` 到非本地地址 — 网络请求
   - `require('net')`、`require('os')`、`require('path')`
2. **结构验证**：检查必填字段（id, name, version, description），工具 schema 验证
3. **路径白名单**：只允许从 `plugins/` 或 `userData/plugins/` 加载
4. **用户确认**：安装时展示能力清单和风险，用户确认后安装
5. **API Key 隔离**：插件无法访问 `safeStorage` 中加密的 API 密钥
6. **权限遵循**：插件工具执行与内置工具遵循相同的权限弹窗检查

### 7.3 内置示例插件

- `src/plugins/example-timestamp.ts` — `/timestamp` 命令，插入 ISO 时间戳
- `src/plugins/example-uuid.ts` — `/uuid` 命令 + `onToolExecute` 钩子

---

## 八、持久化系统

### 8.1 Zustand Store 持久化

使用 `zustand/middleware/persist` 中间件，存储至 `localStorage`：

| Store | localStorage Key | 持久化内容 |
|-------|-----------------|-----------|
| useChatStore | `auraxis-chat-storage` | 最近 40 条消息 |
| useSettingsStore | `auraxis-settings-storage` | API Key、默认模型、项目路径、通知设置、侧边栏透明度 |
| useAppStore | `auraxis-app-storage` | 主题、侧边栏状态、面板宽度、右侧面板视图 |
| useAgentStore | `auraxis-agent-storage` | Agent 列表、优先级、并发设置 |
| useSessionStore | `auraxis-session-storage` | 会话列表（最多 40 个） |
| useProjectStore | `auraxis-projects` | 项目注册表、当前项目、工作区/会话排序 |
| usePluginStore | `auraxis-plugin-storage` | 已安装插件、启用状态 |
| useAdvancedStore | `auraxis-advanced-storage` | MCP 服务器、Agent 旧设置 |
| useKeybindingsStore | `auraxis_keybindings` | 快捷键覆盖 |

> **注意**：localStorage key 使用 `auraxis-` 统一前缀，`auraxis_keybindings` 例外。

### 8.2 长期记忆（Memory）

`memory-db.ts` + `memory-extractor.ts` 实现 LLM 驱动的对话记忆：

- **存储后端**：优先 SQLite（better-sqlite3），回退到 JSON 文件
- **记忆提取**：每次对话完成后，通过 LLM 分析对话内容，提取关键信息
- **去重**：检测并跳过与已有记忆重复的信息
- **类型分类**：user（用户偏好）、feedback（反馈）、project（项目）、reference（外部引用）
- **项目隔离**：按项目路径（`projectPath`）隔离记忆
- **注入**：新对话开始时，自动注入相关记忆作为上下文

### 8.3 会话管理

`useSessionStore.ts` 管理对话会话：

- **自动保存**：流式完成后通过 `saveSession()` 自动保存
- **容量限制**：最多保存 40 个会话
- **操作**：保存、加载、删除、导出、分叉（fork）

### 8.4 加密设置存储

`settings-store.ts` 使用 Electron `safeStorage` API 加密存储 API Key：

- 设置文件：用户数据目录下的 JSON 文件
- API Key：使用 `safeStorage.encryptString()` → Base64 编码
- 读取时自动解密：`safeStorage.decryptString()`
- API Key 不会在 `settings:get` 返回中暴露
- 旧版明文 Key 首次启动读取时自动迁移为加密存储（一次性、写回后删除明文）
- 加密不可用时保留原值；解密失败时丢弃该 Key 而不是暴露损坏数据

### 8.5 日志保留与缓存清理

桌面端启动时执行 best-effort 维护（`log-retention.ts` + 各 store 的 `prune()`）：

- **日志保留**：聊天/Agent JSONL 日志默认保留 180 天或 256MB，可通过 `AURAXIS_LOG_RETENTION_DAYS` / `AURAXIS_LOG_MAX_FILE_MB` 覆盖
- **投影缓存清理**：删除没有对应 JSONL 日志的 `session-cache` 孤儿行（SQLite 后端）
- **FTS 重建**：启动时全量重建索引，之后每次追加日志按会话 600ms 防抖增量刷新

SQLite 投影缓存与 FTS 索引均带 `PRAGMA user_version = 1`，后续结构变更可走版本迁移。

### 8.6 文件撤销

`undo-manager.ts` 实现文件级撤销：

- **触发**：Write/Edit 工具执行前自动备份
- **快照存储**：`.auraxis-snapshots/` 目录
- **操作**：撤销（undo）、恢复（revert）、获取历史

---

## 九、模型配置

### 9.1 模型解析链路

`model-config.ts` 中的 `getAllModels()` 函数按以下优先顺序解析：

```
1. 内置模型 (deepseek-v4-flash, deepseek-v4-pro)
   ↓
2. AURAXIS_MODELS 环境变量（JSON 数组）
   ↓
3. 持久化自定义模型（用户通过 UI 添加的）
```

### 9.2 环境变量

参见 `.env.example`（[查看文件](../.env.example)）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 无（必填） |
| `DEEPSEEK_BASE_URL` | OpenAI 格式端点 | `https://api.deepseek.com/v1/chat/completions` |
| `DEEPSEEK_ANTHROPIC_BASE_URL` | Anthropic 格式端点 | `https://api.deepseek.com/anthropic/v1/messages` |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 无 |
| `ANTHROPIC_BASE_URL` | Anthropic 端点 | `https://api.anthropic.com/v1/messages` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 无 |
| `OPENAI_BASE_URL` | OpenAI 端点 | `https://api.openai.com/v1/chat/completions` |
| `AURAXIS_MODELS` | 自定义模型（JSON 数组） | 无 |


### 9.3 自定义模型格式

```json
[
  {
    "id": "my-model",
    "name": "My Custom Model",
    "apiBase": "https://my-api.example.com/v1/chat/completions",
    "apiKey": "sk-xxx"
  }
]
```

### 9.4 双 API 格式支持

模型可以指定使用 OpenAI 兼容格式或 Anthropic 格式。默认使用 OpenAI 格式（`DEEPSEEK_BASE_URL`）。当设置了 `DEEPSEEK_ANTHROPIC_BASE_URL` 时，`deepseek-v4-flash` 等模型使用 Anthropic 格式端点。每个模型可以通过 `apiBase` 字段单独覆盖。

---

## 十、主窗口配置

`main.ts`（[查看文件](../electron/main.ts)）配置：

- **窗口**：1200×800，最小 600×500，无边框（`frame: false`），macOS 隐藏标题栏
- **CSP（内容安全策略）**：
  - 开发模式：允许 `unsafe-inline`（Vite HMR 需求）
  - 生产模式：严格 CSP，仅允许 `'self'`
  - `connect-src` 允许 `localhost:*`（开发）、`api.deepseek.com`、`html.duckduckgo.com`、`https://*`（MCP/自定义端点）
- **单实例锁**：`app.requestSingleInstanceLock()` 防止多开
- **全局错误处理**：`uncaughtException` 和 `unhandledRejection` 通过 `app:error` 频道发送到渲染进程
- **安全**：仅允许 `https://` / `http://` 外部链接

---

## 十一、构建与部署

### 11.1 构建流程

```
源代码
  ├── electron/ ──→ tsc (tsconfig.electron.json) ──→ dist-electron/
  └── src/ ──────→ Vite build ────────────────────→ dist/

dist-electron/ + dist/ ──→ electron-builder ──→ release/
```

### 11.2 打包配置

`electron-builder.yml` 支持三个平台：
- **Windows**：NSIS 安装程序
- **macOS**：DMG（x64 + arm64）
- **Linux**：AppImage

### 11.3 环境变量加载

应用使用 `dotenv` 从项目根目录的 `.env` 文件加载环境变量。运行 `npm run electron:dev` 前需创建 `.env` 文件（参考 `.env.example`）。

---

## 十二、开发约定与注意事项

### 12.1 代码风格

- **语言**：用户界面文本、内联注释、文档使用**中文**
- **IPC 处理程序**：全部异步，返回 `IpcResponse<T>` 格式
- **状态管理**：全局状态仅使用 Zustand Store，不使用 Redux 或 React Context
- **组件**：功能组件 + Hooks，UI 组件库统一使用 Ant Design 5

### 12.2 测试

- **测试框架**：Vitest（`describe`, `it`, `expect`, `vi` 通过 globals 注入）
- **主进程测试**：`electron/**/__tests__/`，node 环境，依赖 `electron` 的模块用 `vi.mock('electron', ...)` 隔离
- **渲染进程测试**：`src/**/__tests__/`，jsdom 环境（@testing-library/react）
- **测试总数**：166 个测试文件 / 1347 个用例通过（另有 3 例环境性跳过）
- **覆盖率口径**：门槛统计范围仅为 `electron/ipc/`、`src/stores/`、`src/core/`；UI 组件（`src/components/`）与主进程入口（`main.ts` / `preload.ts` 等）不计入该门槛，另有组件级测试与 Playwright 端到端测试（`npm run test:e2e`）覆盖
- **覆盖率阈值**：行/语句 80%，分支 70%，函数 80%（scope: `electron/ipc/`, `src/stores/`, `src/core/`；当前实际 86.20% 行/语句、79.37% 分支、84.32% 函数）
- **覆盖率报告**：`npm run test:coverage` 同时输出 `coverage/coverage-summary.json`（gitignore 的开发期产物）；设置面板「测试覆盖率」页经 `coverage:get` IPC 实时读取，纯浏览器 dev 由 Vite 中间件提供同一路径，生产构建将其拷入 `dist/coverage/`。报告缺失时面板提示运行命令，不显示伪造数字。
- **端到端测试**：13 条 Playwright UI 链路通过（真实 Electron）
- **运行命令**：`npm test`（全量）、`npm run test:backend`（主进程）、`npm run test:frontend`（渲染进程）、`npm run test:coverage`（覆盖率报告）

### 12.3 类型契约

跨进程共享类型只定义在 `electron/contracts/`，`electron/types.ts`、`electron/advanced-defs.ts` 与 `src/types/*` 一律 re-export，禁止在渲染层再镜像一份。

### 12.4 前端布局架构

当前布局为单一模式（无 split/fullscreen 切换）：

```
┌─ Top Bar (标题栏 + 窗口控制) ──────────────────────────────┐
├─ Tab Bar (多 tab 时显示) ──────────────────────────────────┤
├─────────────────────────────────────────────────────────────┤
│ Sider │ 浮动头栏（模式切换 / 压缩 / 分叉 / 会话日志）        │
│ (Nav) │ ─────────────────────────────────────────────────── │
│       │ 消息区（占满整个主聊天区，上下延伸到悬浮层背后）    │
│       │                                                    │
│       │ [悬浮输入 Dock：context 行 + 输入框 + 工具栏]       │
└───────┴────────────────────────────────────────────────────┘
```

- **主内容区**始终显示 Chat（默认）或通过 tab 切换到其他视图
- **右侧面板**通过工作台下拉菜单打开，不覆盖主内容
- **导航历史**（back/forward）记录 tab 切换，支持浏览器式前进/返回
- **消息区满幅 + 悬浮层**：输入 Dock 与顶部头栏都是悬浮层，消息从上下穿过时经渐变淡出；列表首尾垫出与悬浮层等高的滚动空间
- **顶部分隔线**：对话执行中显示，窗口最大化时隐藏
- **Token/Model 状态**内联在输入 Dock 上方，无独立 Inspector 面板

### 12.5 已知限制

- **持久化 key 前缀**：已统一为 `auraxis-`，`auraxis_keybindings` 例外
- **硬编码限制**：
  - Agent 业务迭代上限 200 次（可配置），安全硬上限 500 次
  - 调度器最大并发数 3
  - 会话最多 40 个
  - Agent 日志最多 500 条
  - 会话消息持久化仅保留最后 40 条
  - 语音输入在 Electron 环境通常不可用（`webkitSpeechRecognition` 受限）

### 12.6 设计系统

Aura 设计系统 —「Black is the Axis，White is the Structure，Purple is the Aura」：
- **品牌色**：Auraxis Black `#111216`（深底）/ Ivory `#F1F1EE`（浅底文字）+ Aura 紫灰 `#8C8AA8` 仅作约 3% 强调；**禁止蓝色与大面积彩色渐变**
- **圆角六档**：5 / 6 / 8 / 12 / 14 / 9999，禁用 3/4/7/9/10px 碎角
- **hairline 边框**：`--color-border-dim` 统一发丝线，不加深色实线、不加硬阴影堆叠
- **零位移动画**：按钮/弹窗无 hover 位移缩放与开合动画，只保留功能性旋转与数据驱动动画
- **选中态**：背景高亮（`bg-primary-soft`），**禁止左侧色条**
- **字重**：正文 400 / 条目按钮 500 / 标题激活 600；控件统一 36px 高；内容宽度 748px
- **图标**：`lucide-react` 经 `src/components/common/icons.tsx` 兼容层；**禁用 AntD 图标与 @phosphor-icons/react**
- **字体**：系统 UI 栈（`-apple-system, Segoe UI, PingFang SC, Microsoft YaHei`）+ 等宽栈（`SF Mono, JetBrains Mono, Fira Code, Consolas`）
- **动画**：`prefers-reduced-motion` 适配；执行等待用品牌 GIF（`src/assets/executing.gif`）+ 渐变流光文字
- **侧边栏透明度**：设置 → 外观 → 侧边栏透明度（0–100%）；仅 Windows 11 启用原生 Acrylic（`backgroundMaterial: 'acrylic'`），非 Win11 自动禁用滑杆；最透明保留约 12% 底色保证文字可读，顶部栏保持不透明。

### 12.7 IDE 别名

Vite 和 TypeScript 均配置 `@/` 别名映射到 `src/`：
```typescript
// 等价于 src/components/chat/MessageBubble.tsx
import { MessageBubble } from '@/components/chat/MessageBubble';
```

---

## 附录：快速参考

### 常用命令

```bash
npm run electron:dev     # 完整开发环境
npm run dev              # 仅前端（Vite HMR，无 Electron）
npm run electron:compile # 仅编译主进程
npm test                 # 运行所有测试
npm run test:backend     # 后端测试
npm run test:frontend    # 前端测试
npm run test:coverage    # 覆盖率测试
npm run build            # 生产构建
```

### 关键文件索引

| 文件 | 职责 |
|------|------|
| [electron/main.ts](../electron/main.ts) | 应用入口 |
| [electron/preload.ts](../electron/preload.ts) | IPC 桥接 |
| [electron/ipc/index.ts](../electron/ipc/index.ts) | IPC 注册总入口 |
| [electron/tool-defs.ts](../electron/tool-defs.ts) | 工具定义 |
| [electron/ipc/step-engine.ts](../electron/ipc/step-engine.ts) | 统一 ReAct 步进引擎 |
| [electron/ipc/query-engine.ts](../electron/ipc/query-engine.ts) | 聊天驱动 |
| [electron/ipc/agent-loop.ts](../electron/ipc/agent-loop.ts) | Agent 驱动（规划/审批/偏差/停止策略） |
| [electron/ipc/agent-scheduler.ts](../electron/ipc/agent-scheduler.ts) | 多 Agent 调度 |
| [electron/ipc/tool-handlers.ts](../electron/ipc/tool-handlers.ts) | 工具执行 |
| [electron/ipc/permission-handlers.ts](../electron/ipc/permission-handlers.ts) | 权限控制 |
| [electron/code-mode.ts](../electron/code-mode.ts) | Code Mode（TS 工具编排） |
| [electron/contracts/](../electron/contracts/) | 跨进程类型契约 |
| [electron/session-store.ts](../electron/session-store.ts) | 统一事件日志 |
| [src/App.tsx](../src/App.tsx) | React 根组件 |
| [src/stores/useChatStore.ts](../src/stores/useChatStore.ts) | 聊天状态 |
| [src/core/plugin-manager.ts](../src/core/plugin-manager.ts) | 插件管理 |
| [src/styles/theme.ts](../src/styles/theme.ts) | 主题配置 |

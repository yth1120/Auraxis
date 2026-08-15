# Auraxis

桌面端 Agentic 编程助手（Electron + React 18 + TypeScript + Zustand）。

Auraxis 采用自研 Electron 单体架构，覆盖业界主流 Agent 能力面：统一 ReAct 步进引擎、63 个模型工具、多智能体调度、Code Mode 工具编排、原生沙箱、持久化会话事件流、项目记忆与全文检索，并内置 Aura 设计系统。除调用 LLM API 外，核心能力均可本地离线运行。

## 功能特性

- **统一 Agent 循环**：聊天与 Agent 共享 ReAct 步进引擎，停止策略 / 上下文压缩 / 质量门以策略钩子注入
- **63 个模型工具**：文件读写、代码搜索、终端 / PTY、SSH、Web 搜索与抓取、任务调度、MCP、LSP、Git、图片输入等
- **多智能体调度**：优先级队列、并发控制、暂停 / 恢复、子 Agent 分叉、文件冲突锁
- **Code Mode**：TypeScript 程序在工作线程中编排工具，子调用回穿完整工具执行与权限管线
- **权限与安全**：ask / plan / afe 三模式、权限 Profile、read-before-write 观测、原生沙箱（Windows / Linux / macOS）
- **持久化会话**：聊天与 Agent 统一 append-only JSONL 事件日志，SQLite 投影缓存 + FTS5 全文检索 + 长期记忆
- **集成终端与远程**：底部可拖拽终端、PTY 持久会话、SSH、后台任务与定时跟进
- **可扩展**：插件系统（命令 / 工具 / 钩子 / UI 扩展点）、MCP 客户端、TS / Python 双 SDK、ACP、headless CLI
- **双主题 Aura 设计系统**：品牌黑 / 象牙白深色主题，零位移动画，悬浮输入 Dock，消息时间轴导航

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 43（Node 22.12+，内置 `node:sqlite`），`contextIsolation: true` |
| 前端 | React 18 + TypeScript 5.5 + Vite 7 |
| UI | Ant Design 5 + 自定义 Aura 主题 |
| 状态管理 | Zustand 4（17 个 Store） |
| 存储与检索 | JSONL 事件日志 + SQLite 投影缓存 + FTS5 + 长期记忆（better-sqlite3 可选，缺失时 JSON 回退） |
| AI API | axios SSE 流式，兼容 DeepSeek / OpenAI / Anthropic 格式 |
| 测试 | Vitest + @testing-library/react + jsdom；Playwright + 真实 Electron 端到端 |
| 构建 | Vite + electron-builder 26（NSIS / DMG / AppImage） |

## 快速开始

### 环境要求

- Node.js 22.12+（本项目在 Node 24 上验证）
- npm 10+
- 打包原生依赖（better-sqlite3 / node-pty）需要本机 Python 与 C++ 工具链；仅开发运行可不装 better-sqlite3（自动回退 JSON）

### 安装与运行

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# 在 .env 中至少填写一个模型 API Key（默认 DeepSeek）
npm run electron:dev        # 开发：主进程编译 + Vite + Electron
```

### 生产构建

```bash
npm run build               # 主进程编译 + 类型检查 + Vite 构建 + 安装包
```

### 无头 CLI

```bash
npm run cli -- --run "<任务>" --project <路径> --mode afe
npm run cli -- --sdk        # 启动 SDK 服务（JSON-RPC over 回环 TCP）
npm run cli -- --acp        # 启动 ACP 服务
npm run cli -- --plugin list
```

## 测试与质量

```bash
npm test                    # 全量测试
npm run test:backend        # 主进程测试（electron/）
npm run test:frontend       # 渲染进程测试（src/）
npm run test:coverage       # 覆盖率门禁
npm run test:smoke          # 真实 Electron 启动 + IPC 探测 + 输入区交互
npm run test:e2e            # Playwright 端到端：真实 Electron + UI 关键链路
```

当前基线（v2.0.0，实测）：

- 163 个测试文件 / 1336 个用例通过（另有 2 例环境性跳过）
- 覆盖率：行 / 语句 86.33%、分支 79.28%、函数 84.35%（门槛：行 / 语句 ≥ 80%、分支 ≥ 70%、函数 ≥ 80%）
- 覆盖率统计范围为 `electron/ipc/`、`src/stores/`、`src/core/`；UI 组件另有组件级测试（如 ChatInput 7 例）
- 端到端：Playwright 启动真实 Electron，覆盖启动、对话 / Agent 模式切换、消息发送与气泡渲染、Agent 快捷卡片、设置面板与主题切换
- 双端类型检查（`tsc --noEmit` + `electron:compile`）、生产构建与打包烟雾测试通过

## 文档导航

- [架构与开发文档](docs/README.md)
- [毕业设计文档](docs/毕设文档.md)
- [工程与 UI 规范](AGENTS.md)
- [第三方声明](docs/THIRD_PARTY_NOTICES.md)
- [TS SDK](packages/auraxis-sdk/README.md)
- [Python SDK](python/auraxis_sdk/README.md)

## 目录结构

```text
Auraxis/
├── electron/          # 主进程：窗口、IPC、工具执行、权限、沙箱、会话日志、SDK/ACP
├── src/               # 渲染进程：React 组件、Zustand Store、样式
├── packages/          # TypeScript SDK
├── python/            # Python SDK
├── docs/              # 架构文档、毕设文档、第三方声明
├── scripts/           # 开发与烟雾测试脚本
└── .github/workflows/ # 三平台构建与发布
```

## 环境变量

见 [.env.example](.env.example)：`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`（默认）、`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`（可选）、`AURAXIS_MODELS`（自定义模型 JSON）、`AURAXIS_TELEMETRY_MODE`（遥测，默认关闭）。

## 许可

本项目采用 [MIT License](LICENSE)。运行依赖的第三方开源组件及许可声明见 [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md)。

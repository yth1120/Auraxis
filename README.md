# Auraxis

桌面端 Agentic 编程助手（Electron + React 18 + TypeScript + Zustand）。采用自研 Electron 单体架构，覆盖业界主流 Agent 功能面：统一 ReAct 步进引擎、63 个模型工具、多智能体调度、Code Mode 工具编排、原生沙箱、持久化会话事件流与 Aura 设计系统。

## 快速开始

```bash
npm install
npm run electron:dev   # 开发（主进程 + Vite + Electron）
npm test               # 全量测试（1166 用例）
npm run test:coverage  # 覆盖率门禁
npm run build          # 生产构建 + 打包
npm run cli -- --run "<任务>"  # 无头 CLI
```

## 文档

- [架构与开发文档](docs/README.md)
- [工程与 UI 规范](AGENTS.md)
- [第三方声明](docs/THIRD_PARTY_NOTICES.md)
- [毕业设计文档](docs/毕设文档.md)
- [TS SDK](packages/auraxis-sdk/README.md) · [Python SDK](python/auraxis_sdk/README.md)

## 许可

本项目采用 [MIT License](LICENSE)，版权归 Auraxis Contributors 所有。依赖的第三方开源组件及归属声明见 [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md)。

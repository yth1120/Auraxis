# Auraxis 官方网站开发提示词

> 用法：将本文件整体复制给 AI 编码助手（或作为开发者任务书）执行。所有品牌规范与数据均来自 `docs/README.md` 与 `AGENTS.md`，执行前请先阅读这两份文档。

## 角色设定

你是一位资深前端工程师兼品牌视觉设计师，为 **Auraxis**（桌面端 Agentic 编码助手，v3.0.0，MIT 开源）设计并实现官方网站。输出需要同时满足：开发者极客的信任感（产品面向开发者）与 Aura 品牌气质——**「Black is the Axis，White is the Structure，Purple is the Aura」**：克制、精密、不花哨。

## 项目背景（素材事实，写页面时引用，不得编造）

Auraxis 是 Electron + React 18 + TypeScript + Zustand 构建的桌面 Agentic 编程助手，核心能力：

- **统一 ReAct 步进引擎**：聊天与多 Agent 共用一套循环，重试 / 上下文压缩 / 停止策略收敛一处
- **71 个内置 AI 工具**：Bash、Read/Write/Edit、Grep/Glob、WebSearch、终端六件套（Terminal*）、LSP、NotebookEdit、Cron、GitCommit、RunWorkflow、SessionQuery、ReadDocument/WriteDocument（Word/Excel/PPT/PDF）、Slack/Drive/Notion 连接器工具等
- **多 Agent 调度**：优先级队列（high/normal/low）、并发控制、三级偏差检测（L1 失败 / L2 停滞 / L3 重规划）、计划审批（5 分钟超时）、暂停/恢复、最大递归深度 3
- **Code Mode**：`RunCode` 的 TypeScript 程序在 worker 线程执行，`await tools.Name(args)` 子调用回穿完整权限管线（并发安全工具最多 8 路重叠、变异工具串行、硬超时）
- **原生沙箱四后端**：Windows restricted token / AppContainer、Linux、macOS
- **审批三策略**：`ask`（默认，每次危险工具弹窗）/ `plan`（计划内自动批准）/ `auto`（全自动）；read-before-write 硬门、路径边界、扩展名白名单
- **记忆与会话**：LLM 提取长期记忆（项目隔离、自动注入）；统一 JSONL 事件流 + SQLite 投影缓存 + FTS5 全文检索；会话事件级 lineage 追踪
- **工作区隔离**：EnterWorktree 创建 Git worktree 沙箱，文件/命令自动重定向
- **扩展生态**：MCP 协议客户端、插件系统（commands / tools / hooks / ui 四类扩展点）、headless CLI、TypeScript SDK（TCP JSON-RPC）、Python SDK、ACP 协议
- **其他**：终端抽屉（PTY/SSH）、后台任务（Task*/Job*/Schedule*）、图片输入（ReadImage + 附件画廊）、逐消息评分、撤销快照、冲突检测、中英双语界面

## 一、设计语言（品牌一致性红线，必须严格遵守）

### 1. 色彩
- 品牌黑 `#111216`：页面主底色（深色即默认）
- 象牙白 `#F1F1EE`：文字/浅色模式底色
- Aura 紫灰 `#8C8AA8`：**仅约 3% 强调**——焦点环、选中态、状态点、极少量高光词
- **禁止**：蓝色、大面积紫色、彩色渐变作为主视觉；仅允许极克制的黑→透明单色渐变（光晕/遮罩）

### 2. 圆角
- 仅六档：`5 / 6 / 8 / 12 / 14 / 9999`（pill）；**禁止** 3/4/7/9/10px 等碎角

### 3. 边框
- 统一 hairline（白 ~8–10% 透明度的发丝线）；分隔线最浅；**禁止**深色实线与硬阴影堆叠

### 4. 动效（零位移原则，官网同样适用）
- 按钮/卡片**禁止** hover/active 位移、缩放弹跳；折叠面板禁开合动画
- 只允许：颜色/透明度过渡（≤200ms ease）、功能性旋转（spinner）、数据驱动动画（计数器）、克制的 scroll-reveal（淡入 + 至多 8px 上移、一次成型不循环）
- 首屏禁止入场动画堆砌；`prefers-reduced-motion` 时禁用 scroll-reveal 与所有过渡

### 5. 字体与字重
- 系统 UI 栈：`-apple-system, Segoe UI, PingFang SC, Microsoft YaHei`
- 等宽栈（代码/数据/架构图）：`SF Mono, JetBrains Mono, Fira Code, Consolas`
- 字重：正文 400、条目/按钮 500、标题/激活 600；大标题可用 `clamp()` 但保持 600
- 字号档位：9/10/11/12/13/14/15/16 体系；正文 14–16

### 6. 图标
- 使用 `lucide-react`（细描边，strokeWidth 1.5–2）；**禁止**彩色图标、Emoji 充当图标

### 7. 布局
- 内容最大宽度 1080px（官网可比应用宽），段落行宽 ≤ 68ch；Hero 可全宽
- 网格留白充足，信息密度克制

## 二、页面结构（单页 Landing；如需可加次级页）

### 导航（固定顶栏）
- 毛玻璃黑（≈12% 透明度 + 模糊）+ hairline 底边
- Logo（品牌黑底/白字 + Aura 紫灰状态点）｜链接：特性、下载、文档、开源 ｜右侧 pill「下载」按钮

### Hero
- 眉题：`开源 · MIT · v3.0.0`
- 主标题：Auraxis —— 桌面端 Agentic 编码助手（「Agentic」可用 Aura 紫灰高光，约 3% 用量）
- 副标题（一句话定位）：一条统一 ReAct 引擎，71 个内置工具，多 Agent 并行、原生沙箱与 Code Mode 编排，让模型在你的项目里真正干活。
- CTA：「下载」（Windows/macOS/Linux 三平台）+「查看文档」
- 视觉：产品截图或执行 GIF 占位（标注「替换为真实截图」），底部黑→紫灰 3% 光晕

### 数据条（诚实数字，来源 docs/README.md）
`63` 内置工具 · `1` 运行权限（4 档预设）· `4` 沙箱后端 · `3` 内置 Agent 类型 · `2` 条 SDK（TS / Python）· `1` 统一步进引擎

### 核心特性（卡片网格，每卡：lucide 图标 + 标题 + 两行描述）
1. **统一步进引擎** — 聊天与 Agent 共用一套 ReAct 循环：API 重试、上下文压缩、停止策略收敛一处
2. **多 Agent 调度** — 优先级队列与并发控制，三级偏差检测、计划审批、暂停/恢复
3. **Code Mode** — worker 线程里用 TypeScript 编排工具，每个子调用回穿完整权限管线（8 路并发、硬超时）
4. **原生沙箱** — Windows restricted token / AppContainer、Linux、macOS 四后端命令级隔离
5. **审批三策略** — ask / plan / auto，read-before-write 硬门与可持久化权限规则
6. **记忆与会话** — LLM 提取长期记忆自动注入；JSONL 事件流 + FTS5 全文检索，事件级溯源
- 第二行（可选）：MCP 协议、插件系统、终端/PTY/SSH、后台与定时任务、图片输入、撤销与冲突检测

### 架构示意（开发者气质点）
- 用等宽字体 + hairline 框绘制双进程架构图（ASCII/CSS 风格，**不要**引入 mermaid/echarts 等重型库）：

```
Electron Main (electron/)                     Renderer (src/)
  step-engine.ts ── ReAct 步进 ──┐            React 18 + AntD 5
  tool-runner.ts ── 全权限管线 ──┤   IPC      Zustand ×17
  executeToolCall ── 沙箱/审批 ──┴─◄─────►    window.electronAPI
  session-store ── JSONL 事件流                MessageList / Dock
```

### 工具能力矩阵（表格，等宽字体）
按能力族列出代表工具：文件（Read/Write/Edit/Delete/Glob/Grep）、检索（SessionQuery/EventSearch/Trace）、终端（Terminal* 六件套、Pty、Pwsh）、后台（Task*/Job*/Schedule*）、编排（RunWorkflow、Ralph、Goal*）、安全（EnterWorktree、ReviewArtifact、GitCommit）

### 安全章节（开发者最关心，两栏对比）
- 审批三策略行为对比表（ask 弹窗 / plan 计划内批准 / auto 全自动，安全检查仍生效）
- 沙箱四后端 + 路径边界 + 扩展名白名单 + read-before-write + 撤销快照 + 冲突检测文件锁

### 开发者生态（4 卡片）
- **Headless CLI** — `npm run cli -- --run "任务"`，模型/权限/沙箱/JSON 输出
- **TypeScript SDK** — `packages/auraxis-sdk`，TCP JSON-RPC
- **Python SDK** — `python/auraxis_sdk`
- **插件系统** — commands / tools / hooks / ui 四类扩展点，源码扫描安全模型

### 下载章节
- Windows（NSIS）/ macOS（DMG，x64 + arm64）/ Linux（AppImage）三卡片，标注版本 v3.0.0 与安装说明

### FAQ（5–7 条）
- 是否需要 API Key？支持哪些模型？（DeepSeek 默认，兼容 OpenAI/Anthropic 格式）
- 与 IDE 插件/CLI 的区别？权限模式怎么选？沙箱隔离到什么程度？数据存在哪里？是否开源？

### Footer
- MIT License · GitHub · 文档 · 「Black is the Axis，White is the Structure，Purple is the Aura」

## 三、技术实现要求

- **技术栈（推荐）**：Vite + React 18 + TypeScript + Tailwind CSS 4 + lucide-react（与产品同栈，品牌 token 可复用）；备选 Astro（内容站更优，需自带图标方案）。二选一，不混框架
- **品牌 token 集中定义**（CSS variables 或 Tailwind theme）：`--color-brand-bg` / `--color-ivory` / `--color-aura` / `--color-border-dim` / 圆角档位 / 字号档位
- 深色为默认；浅色模式切换（可选）
- **中英双语**：轻量 i18n（react-i18next 或自研字典），默认中文，可切换 EN
- **响应式**：375px 可用；导航折叠为菜单；卡片网格 1→2→3 列
- **可访问性**：语义化标签、焦点可见（Aura 紫灰焦点环）、对比度 AA、`prefers-reduced-motion`
- **SEO**：title/description/OG/Twitter 卡片/favicon（品牌黑底 + Aura 紫灰点）/sitemap
- **性能**：首屏无重型依赖；图片懒加载；Lighthouse Performance ≥ 90
- **部署**：静态产物 `dist/`，可部署 GitHub Pages / Vercel / Netlify

## 四、验收标准

1. 无蓝色、无大面积紫色、无彩色渐变主视觉；紫色用量肉眼 ≈ 3%
2. 圆角仅六档；边框均为 hairline；无位移/缩放/弹跳动画；`prefers-reduced-motion` 生效
3. 中英双语切换可用，默认中文；所有文案与产品文档口径一致
4. Lighthouse：Performance ≥ 90、Accessibility ≥ 95、SEO ≥ 95
5. 375px / 768px / 1440px 三档无破版
6. 所有数据（71 工具、v3.0.0、命令示例）与 `docs/README.md` 一致，不编造
7. `npx tsc --noEmit` 与生产构建零错误

## 五、交付物

- 完整项目：`package.json`、`vite.config.*`、`src/`、`public/`、`README.md`
- 品牌 token 文件、i18n 字典、组件划分清晰
- README 含：`npm i && npm run dev` 本地运行、`npm run build` 构建、部署说明
- 如能提供，附真实产品截图替换 Hero 占位

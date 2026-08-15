# AGENTS.md — Auraxis 工程与 UI 规范

桌面端 AI Agent 编码助手（Electron + React 18 + TypeScript + Zustand）。本项目是**普通桌面客户端**：功能与工具面覆盖业界主流 Agent 能力，架构与开发细节见 `docs/README.md`。

## 常用命令

```sh
npm run electron:dev     # 编译主进程 + Vite + Electron（开发）
npm run electron:compile # 仅编译 electron/ → dist-electron/
npm run build            # 全量构建 + electron-builder
npm run test             # vitest 全量
npm run sdk:build        # packages/auraxis-sdk 编译
npm run sdk:test         # SDK 测试
```

- 主进程改动必须重启 Electron 才生效；渲染层改动走 Vite HMR。
- `dist/`、`dist-electron/`、`release/`、`packages/auraxis-sdk/dist/` 都是可再生构建产物，禁止手改、禁止当作源码；清理时直接删除即可重建。

## 架构约定

- **进程边界**：Node 能力只允许在主进程（`electron/`）执行；渲染层（`src/`）经 `preload.ts` 的 `window.electronAPI` 走 IPC，禁止在渲染层 require Node 模块。
- **类型单一事实源**：跨进程类型放 `electron/contracts/`（core/tools/advanced/session-types），`electron/types.ts`、`src/types/*` 一律 re-export，禁止三处各写一份。
- **统一循环**：LLM 步进只允许走 `step-engine.ts`（聊天与 Agent 共用），停止策略/压缩/重试/质量门做成策略钩子，禁止在 query-engine / agent-loop 里另写一套循环。
- **工具执行管线**：所有工具经 `tool-runner.ts` → `executeToolCall`，权限 profile → 沙箱门 → 审批 → 执行顺序不可绕过；新增后端或子调用必须回穿这条管线。
- **会话事实源**：聊天与 Agent 共用 append-only 事件流（词表 `electron/contracts/session-types.ts`，存储 `electron/session-store.ts` / chat-log / session-log），禁止再开私有持久化格式。
- **能力 seam**：已有 `SessionStore`、`ShellExecutor`、`LlmAdapter` 三个可替换接口；换实现走 seam，不直接改消费方。

## 模型工具开发约定

- 新增工具必须**同时**改三处：`electron/tool-defs.ts` 的 `TOOL_DEFINITIONS`（schema + `isConcurrencySafe`）、`electron/ipc/tool-handlers.ts` 的 `toolRegistry`（处理器）、必要时 `electron/permission-profile.ts` 的门禁。漏注册会出现「模型看得到工具但调用失败」。
- `Replan` 是**例外**：不进 registry，由 loop 驱动的 `interceptTool` 合成缝处理（`agent-loop.ts` 的 `tc.name !== 'Replan'` 分支）。
- **read-before-write**：存在文件的 Write/Edit 必须先 Read（或携带其 `version`）；Read/Write/Edit 成功都会登记会话级观测。`autoApprove` 无头流程按惯例豁免。
- Code Mode（`RunCode` 的 `language=typescript`）：程序体在 worker 线程执行，`await tools.Name(args)` 子调用必须回穿 `executeToolCall` 全管线，并发安全工具最多 8 路重叠、变异工具串行；实现见 `electron/code-mode.ts`。
- 文件类工具必须过 `resolveToolPath` / `isPathInside` 的路径边界与 `isSafeExtension` 检查，除非 `autoApprove`。

## UI 视觉规范（严格遵守）

- 主色：品牌黑 `#111216`（深底）/ 象牙白 `#F1F1EE`（浅底文字）+ Aura 紫灰 `#8C8AA8` 仅作约 3% 强调（焦点/选中/状态点）；**禁止蓝色、大面积紫色与渐变作为主色**。
- 圆角六档：5 / 6（rounded-md）/ 8（rounded-lg）/ 12（rounded-xl）/ 14（rounded-2xl）/ 9999（rounded-full）。禁止 3px、4px、7px、9px、10px 等碎角。
- 边框统一 hairline（`--color-border-dim`）；结构分隔线保留但必须最浅；不新增深色实线。
- 任何按钮/选中项**禁止左侧色条**；选中态一律用背景高亮（`bg-primary-soft` / `bg-border-dim`）。
- 零位移动画：按钮禁 hover/active 位移与缩放、弹窗禁开合动画；只允许功能性旋转（spinner）与数据驱动动画（模式滑块、工作流边）。
- 字重：正文 400、条目/按钮 500、标题/激活 600。字号档位：`text-4xs`(9) / `3xs`(10) / `2xs`(11) / `xs`(12) / `sm`(13) / `base`(14) / `md`(15) / `lg`(16)。
- 控件高度统一 36px（antd `controlHeight: 36`，见 `src/styles/theme.ts`）。
- 内容宽度：消息流/输入框 `--content-max-width: 748px`（`src/styles/tokens.css`）；首页快捷卡片可单独 1080px。

## 聊天区布局约定

- 消息区占满整个主聊天区；**输入 Dock（含上下文行）与顶部头栏都是悬浮层**，消息从上下两端穿过后自然淡出（上/下各一条渐变遮罩）。
- 消息列表必须用 Virtuoso `Header`/`Footer` 垫出与悬浮层等高的滚动空间，保证首尾消息能完整滚出遮挡区。
- `Header`/`Footer` 组件身份必须稳定：高度经 ResizeObserver 测好后存 **ref**，禁止把测量值放进 `useCallback` 依赖（否则 Virtuoso 每次重挂列表）。
- 顶部分隔线只在「对话执行中」显示，且窗口最大化时隐藏（还原后恢复）。

## 图标规范

- 全部按钮图标使用 `lucide-react`（经 `src/components/common/icons.tsx` 兼容层导出，统一 `weight→strokeWidth` 语义）；**禁用 AntD 图标**；不再使用 `@phosphor-icons/react`。
- 权重→描边：`regular`=1.5、`bold`=1.75、`fill`=2（细描边风格）。
- 尺寸档位：micro 12 / small 14 / medium 16 / card 20；禁止 11/13/15/17/18/22 等中间值。
- 着色：默认 `text-muted`，hover/激活 `text-primary`；成功/失败/警告色仅用于语义状态。
- 唯一允许保留的 SVG：ContextMeter 进度环、VS Code 品牌标。

## 测试与验证

- 新增/改动必须过：`npx tsc --noEmit`（渲染层）、`npm run electron:compile`（主进程）、`npx vitest run`（全量）、`npx vite build`（构建）。
- 测试覆盖门槛：lines/statements ≥ 65%、branches ≥ 65%、functions ≥ 65%（`vitest.config.ts`，校准后的可守住水平；当前实际 71.9% 行/语句、78.2% 分支、77.4% 函数）；只允许有意上调、不允许跌破当前门槛。
- 覆盖率统计范围：`electron/ipc/`、`src/stores/`、`src/core/`（不含 `src/components/` 与主进程入口）；UI 由组件级测试覆盖，桌面端到端链路由 `npm run test:smoke` 覆盖。
- 端到端：`npm run test:e2e`（Playwright 启动真实 Electron，覆盖启动/模式切换/发消息/快捷卡片/设置主题）；改动渲染层或主进程启动链路后必须重跑。
- 主进程模块依赖 `electron` 的测试需 `vi.mock('electron', ...)`；纯逻辑优先抽成可测函数。

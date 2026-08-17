# Auraxis 更新日志

## v3.0.0（2026-08-18）

> 本次为从 v2.0.0 以来的大版本：包含 Work 模式对齐 Claude Cowork、专业文档技能、云连接器、溯源记忆、论文驱动模块、缓存对齐、UI 视觉规范整改与大量基础设施升级。

### 产品形态与模式

- **Chat / Work / Code 三模式**：统一 ReAct 引擎下的三种产品形态；模式切换组件改为 DeepSeek 风格，切换不互相污染状态，每模式保存独立的思考/联网/档位偏好快照
- **Work 模式对齐 Claude Cowork**：
  - 默认「开工前先澄清」：任务存在歧义时先用 AskUser 提问，可设置 → Agent 运行 关闭
  - 仅文档/非代码文件硬边界：Write / Edit / Bash / PowerShell 改写代码文件一律拒绝，代码只读
  - 执行自主度档位（plan / smart / full）+ 交付审批流
  - 项目目录与本地工作区接入、任务看板、执行流程视图、Work 侧边栏
- **Code 模式**：RunCode 的 TypeScript 程序在工作线程中编排工具（8 路并发重叠、硬超时、子调用回穿完整权限管线）；首页功能卡片重排为四列；右侧工作台、检查器、快照、diff 视图
- **Chat 模式**：会话事件时间轴、逐消息评分、附件画廊/灯箱、图片草稿栏、对话前缀续写（继续写）、FIM 补全、LLM 标题生成

### 专业文档与云连接器

- **ReadDocument / WriteDocument**：读取与生成 Word（.docx）、Excel（.xlsx）、PPT（.pptx）、PDF（.pdf）
  - Word 读取 mammoth / 生成 docx；Excel 读写作 SheetJS；PPT 生成 PptxGenJS + 读取 XML 文本；PDF 读取 pdf-parse、生成 PDFKit 并自动嵌入系统中文字体
- **内置 5 个开箱技能**：Word 文档 / Excel 表格 / PPT 演示文稿 / PDF 文档 / 云连接器
- **云连接器**：Slack（SlackListChannels / SlackPostMessage）、Google Drive（DriveList / DriveRead）、Notion（NotionSearch / NotionCreatePage），Token 在 设置 → 连接器 配置并经 safeStorage 加密
- **分层 Instructions 面板**：全局 / 项目根 / 嵌套文件夹 AGENTS.md 三级编辑，优先级与读取链路一致

### 记忆与论文驱动模块

- **Eywa 溯源长期记忆（M1–M4）**：证据先于信念、不可变证据、规则化信号、硬锚点验证、确定性零 LLM 读路径、信念审计/擦除留痕
- **MAP-Graph（M5）**：多 Agent 共享记忆授权、来源信任与风险门控
- **AGORA 步骤级上下文压缩**：免推理整步保留/丢弃，永不拆散工具调用与结果
- **SWE-Touch 工作区漂移感知**：用户改代码后定向验证
- **Oversight 审批疲劳守卫**：倒 U 型监督，自动放行计入疲劳统计
- **AutoTool 工具惯性图**：观测 + 预测层降低推理开销
- **Verifier-as-Gatekeeper 技能门禁**：技能入库 pre-commit 校验
- **缓存对齐四件套**：规范历史重放（RadixAttention 客户端适配）、稳定块组织（Prompt Cache）、动态内容尾部化（Cache-Aware Prompt Compression）、记忆块字节级去重

### 引擎、工具与权限

- **统一 step-engine**：聊天与 Agent 共用一套 ReAct 步进循环，策略钩子注入；停止策略、压缩、重试、质量门统一
- **工具系统 63 → 71**：新增 ReadDocument / WriteDocument / SlackListChannels / SlackPostMessage / DriveList / DriveRead / NotionSearch / NotionCreatePage；修复工具注册总量上限
- **权限体系**：运行权限四档（每次确认 / 自动代批 / 完全访问 / 只读）、命名权限档案（文件/网络 scope）、原生沙箱门禁（Windows restricted token / AppContainer、Linux、macOS）、read-before-write 观测硬门、文件级撤销
- **多 Agent 调度**：优先级队列、并发控制、暂停/恢复、子 Agent 递归（3 层）、计划审批、目标模式、后台任务与定时任务（Cron / Schedule）
- **终端**：底部可拖拽终端抽屉、Terminal* 六件套、PTY 持久会话、SSH（密钥认证）、后台命令任务
- **MCP 协议客户端、插件系统（安装/启用/卸载）、TS/Python SDK、ACP 服务、headless CLI**
- **会话体系**：统一 JSONL 事件流 + SQLite 投影缓存 + FTS5 全文检索 + 会话分叉/导出/删除
- **DeepSeek 官方能力**：思考强度 low/high/max、strict tools、计划 JSON 模式、流式 usage 与缓存命中展示、user_id 隔离、最大输出 384K、官方离线 tokenizer

### 账户、设置与 UI

- **本地账户系统**：首启注册 → 登录门 → 登出/改密；密码仅存 scrypt 哈希；头像上传；注册流程可直接填 DeepSeek API Key
- **设置面板重构**：账户、自定义模型、连接器、分层指令、MCP、插件、权限档案、规则文件、Actions、Workflows、统计、测试覆盖率实时报告
- **UI 视觉规范整改**：圆角六档、图标尺寸档位与描边规范、按钮/图标透明底、侧边栏透明度（Windows 11 Acrylic）、搜索/权限/工作台面板重设计、顶部模式切换导轨、左侧/右侧边栏折叠动画、聊天区悬浮头栏与输入 Dock

### 质量与发布

- 全量单测：235 个测试文件 / 1734 个用例通过（另有 3 例环境性跳过）
- 覆盖率：行/语句 85.43%、分支 79.03%、函数 86.61%
- E2E（Playwright 真实 Electron）：15/15 通过
- 压测：200 会话冷启动约 1.4s；18/30 Agent 并发全部完成；默认 3 并发无卡顿
- 发布物：Windows NSIS 安装包（x64）+ blockmap + latest.yml，v3.0.0 标签已推送

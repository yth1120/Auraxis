# Auraxis 可信记忆项目实施方案（Eywa + MAP-Graph）

> 版本：v0.2（2026-08-16）
> 状态：M1–M5 已实现并通过全量验证；增强项（实时证据钩子、R4 本地向量路由、MAP-Graph 运行时绑定、INO 纠错闭环、擦除审计）已全部落地（2026-08-16）
> 依据论文：
> - #1 [Eywa: Provenance-Grounded Long-Term Memory for AI Agents](https://arxiv.org/abs/2605.30771)（arXiv:2605.30771）
> - #2 [MAP-Graph: Provenance-Aware Shared Memory for Multi-Agent Workflows](https://arxiv.org/abs/2608.10509)（arXiv:2608.10509）
> 范围：用户已确认只做这两篇，合为一个「可信记忆」项目，按里程碑逐个完成并验收。

## 一、项目定位

把 Auraxis 现有「LLM 抽取 → 去重 → 注入」的扁平记忆，升级为**证据先于信念（evidence before belief）**的可审计、可授权、可归因记忆系统：

1. 原始会话证据不可变保存，信念只是「可审阅、可修订、可删除的索引」；
2. 信念必须能追溯到证据，不支持则不得提升为正式记忆；
3. 检索路径确定性、零 LLM 调用，记忆上下文与答案策略分离；
4. 多 Agent 场景下，证据按 Agent 角色与动作风险决定可读性与信任度（MAP-Graph）；
5. 每个答案都能回答「错在哪一层」：缺证据 / 抽取失真 / 状态过期 / 检索丢失 / 模型行为。

## 二、总体架构

```text
写路径（离线/会话结束）：
  session-log 事件 ──► Evidence（不可变）──► Signal（类型化检测）──► Belief（LLM 派生 + 硬锚点验证）
                                                                    │
                                                                    ▼
                                                    belief_evidence（来源支持）/ belief_revisions（修订链）

读路径（在线，零 LLM）：
  query ──► 多路确定性检索（FTS5 / 实体时间 / 观测流 / 可选向量）
         ──► 授权过滤（MAP-Graph：agent 角色 + 证据信任）──► 融合排序 + token 预算
         ──► { context, policy, diagnostics } ──► answer model（策略与上下文分离）
```

### 核心数据对象

| 对象 | 定义 | 约束 |
|---|---|---|
| Evidence | 原始消息/工具观测/纠错，含 scope、role、ts、hash | 不可变，仅整条删除（用户擦除） |
| Signal | 日期、实体、URL、版本、决策、纠错、批准/拒绝 | 优先规则检测，LLM 可选 |
| Belief | 用户/反馈/项目/参考四类记忆 | 必须引用 ≥1 evidence；rejected 不入库 |
| 授权边 | agent / action 对证据的可读性 | 硬授权与分级信任分离（M5） |

## 三、里程碑总览

| 里程碑 | 内容 | 关键产出 | 验收标准 |
|---|---|---|---|
| **M1 证据地基** | evidence 表结构（SQLite+JSON）、内容哈希去重、不可变语义；会话证据捕获；查询通道；旧接口兼容 | memory-db / memory-evidence / memory-ipc | 三组 vitest 全绿；electron:compile；tsc；覆盖率不降 |
| **M2 信号与信念** | 规则化信号检测；belief 表 + belief_evidence + belief_revisions；LLM 抽取改造 + 硬锚点验证；生命周期 | signal-rules（新）/ memory-extractor / memory-db | 支持/不支持/引用不存在三态测试；纠错双证据测试；拒绝理由可审计 |
| **M3 确定性读路径** | 多路检索（复用 FTS5）；readForQuery 返回 context+policy+diagnostics；注入替换 | memory-read（新）/ context-handlers / useChatStore | 两次读取结果一致；预算截断正确；旧注入逻辑移除 |
| **M4 审计与归因** | MemoryPanel 证据链 UI；beliefAudit / readTrace / erase；五层失败归因测试 | memory-ipc / useMemoryStore / MemoryPanel | 五类故障可被 diagnostics 指认；e2e 记忆面板链路 |
| **M5 MAP-Graph 授权门控** | 类型化执行图；按角色授权过滤；路径信任；风险敏感动作门控；审计血缘 | memory-graph（新）/ permission-profile / agent-scheduler | 权限拒绝、信任降级、风险门控三类测试 |

## 四、里程碑详细设计

### M1 证据地基（已完成编码，待验证）

**改动文件**

| 文件 | 改动 |
|---|---|
| `electron/ipc/memory-db.ts` | evidence 表（SQLite）/ evidence 数组（JSON）；`evidenceContentHash`（sha256）；`addEvidence / listEvidence / getEvidenceById / findEvidenceByHash / deleteEvidence`；JSON 格式升级为 `{ memories, evidence }` 并兼容旧数组 |
| `electron/ipc/memory-evidence.ts`（新增） | `captureEvidenceFromSession`：消息/工具结果 → EvidenceRecord，同 scope+role+content 去重，零 LLM |
| `electron/ipc/memory-ipc.ts` | `memory:extract` 在 LLM 抽取前先捕获证据；新增 `memory:evidenceList` / `memory:evidenceDetail` |
| `electron/preload.ts` | memory.evidenceList / evidenceDetail 桥接 |
| `src/types/electron-api.ts` | 对应类型声明 |
| `electron/ipc/__tests__/memory-db.test.ts` | 证据用例（哈希稳定性、倒序、按 id、去重、删除） |
| `electron/ipc/__tests__/memory-evidence.test.ts`（新增） | 消息/工具捕获、去重、空输入忽略 |
| `electron/ipc/__tests__/memory-ipc.test.ts` | 证据通道、extract 先捕获证据断言 |

**已验证**：`npm run electron:compile` ✅

**待验证**（环境恢复后）：

```sh
npx tsc --noEmit -p tsconfig.json
npx vitest run electron/ipc/__tests__/memory-db.test.ts electron/ipc/__tests__/memory-evidence.test.ts electron/ipc/__tests__/memory-ipc.test.ts
npx vitest run
npm run test:coverage
```

### M2 信号与信念

- 新增 `electron/signal-rules.ts`：日期、版本号、URL、实体关键词、纠错句式（“不对/应该是/更正”）、批准/拒绝句式的确定性检测；`AURAXIS_MEMORY_LLM_SIGNALS=1` 时才追加 LLM 检测。
- `memory-extractor.ts` 改造：prompt 要求「候选信念 + 引用 evidence id」；硬锚点验证：
  1. 引用的 evidence id 必须存在；
  2. 信念中的关键实体/日期/数值能在对应 evidence 中归一化匹配；
  3. 纠错类信念必须引用「原始陈述」与「纠正陈述」两条 evidence。
- 新增 `beliefs` / `belief_evidence` / `belief_revisions` 表；状态机 `draft → promoted → active → superseded / rejected / deleted`。
- 旧记忆迁移为 `legacy=1, evidence=[]`，审计视图明确标注「无证据支持」。

### M3 确定性读路径

- 新增 `electron/ipc/memory-read.ts`：多路检索
  - R1 关键词/FTS5（复用 `fts.ts`，同时搜 evidence.content 与 beliefs.text）；
  - R2 实体/时间过滤（SQL 条件 + 近期优先）；
  - R3 最近观测流兜底；
  - R4 向量（可选，未配置 embedding 时跳过）。
- 融合规则（确定性）：`score = 0.5*route + 0.3*support_strength + 0.2*recency`，按 token 预算截断。
- 新增 `memory:readForQuery` 返回：

```ts
interface MemoryReadResult {
  context: MemoryContextItem[];   // { beliefId, text, evidenceIds[], ts }
  policy: AnswerPolicy;           // 引用要求、不确定拒答、scope 规则
  facts: string[];
  diagnostics: ReadDiagnostics;   // 每路命中、预算、延迟、缺失证据标记
}
```

- 注入替换：`useChatStore` / `context-handlers` 的旧 `getByProject` 注入改为 `readForQuery`。

### M4 审计与归因

- 新增 IPC：`memory:beliefAudit`（belief 的 evidence 链 + signals + revisions）、`memory:readTrace`（逐路结果）、`memory:erase`（按 scope 级联擦除 evidence/beliefs/read traces）。
- `MemoryPanel.tsx`：来源证据展开、支持强度、状态与修订历史、读路径诊断视图。
- 五层失败归因测试：缺证据 / 抽取失真 / 状态过期 / 检索丢失 / 模型行为，断言 diagnostics 逐一指认。

### M5 MAP-Graph 授权门控

- 类型化执行图：agents / sources / memories / claims / actions 节点与血缘边。
- 授权过滤：按 Agent 角色（Explore / Plan / general-purpose）与动作类型决定证据可读性；硬授权（permission）与分级信任（trust）分离。
- 路径信任：来源可信度 × 派生路径的乘法信任评分，重排可读记忆。
- 风险敏感动作门控：高危险动作（Write/Edit/Bash 等）要求更高证据标准与更强的来源信任，接入现有 `permission-profile.ts` 与 `tool-runner.ts` 管线，保留受影响的 lineage 供审计。

## 五、环境阻塞与修复（必须先做）

现象：命令执行报 `windows sandbox: helper_unknown_error: setup refresh had errors`；改为 `unelevated` 后命令能跑，但 Node 子进程全部被拦（`spawn EPERM`），vitest/vite/esbuild 无法运行。

**修复**：修改 `C:\Users\After\.codex\config.toml`：

```toml
[windows]
sandbox = "danger-full-access"
```

保存后完全退出并重新打开 Codex。

> ⚠️ 不要删除整个 `.codex` 文件夹：会丢失 DeepSeek/OpenAI/Anthropic API Key、模型提供商配置、`models.json`、插件与 marketplace、技能、登录状态；且删除后默认沙箱大概率仍失败。如需重置，请先改名备份（`.codex-backup`）。

## 六、质量门槛（每个里程碑都必须过）

```sh
npx tsc --noEmit -p tsconfig.json   # 渲染层
npm run electron:compile            # 主进程
npx vitest run                      # 全量
npm run test:coverage               # 覆盖率：行/语句 ≥80%、分支 ≥70%、函数 ≥80%
npx vite build                      # 构建
npm run test:e2e                    # 渲染层/主进程启动链路改动后必跑
```

覆盖率统计范围：`electron/ipc/`、`src/stores/`、`src/core/`；新增代码必须补测试，不得跌破当前门槛（85.50% 行 / 79.27% 分支 / 86.44% 函数）。

## 七、风险与决策点

1. **存储增长**：evidence 全量保存，沿用 `log-retention.ts` 保留策略（默认 180 天 / 256MB），content 可压缩、hash 去重。
2. **better-sqlite3 可选依赖**：JSON 回退必须实现相同不可变语义；两后端都测。
3. **LLM 成本**：Signal 默认规则化；Belief 抽取仅在会话结束/显式触发；读路径永不含 LLM（可加测试断言）。
4. **隐私**：`memory:erase` 按 scope 级联，evidence 硬删 + 审计事件，与 safeStorage 设置隔离。
5. **旧数据**：迁移标记 `legacy=1`，不静默当作已验证。
6. **确定性**：读路径禁 LLM 与随机；embedding 默认关闭，开启后只影响排序不影响证据链。
7. **权限双源冲突**：M5 的授权门控必须与现有 `permission-profile.ts` 职责分明（profile 管动作执行权，MAP-Graph 管记忆可读性），避免两套权限互相打架。

## 八、待办顺序

1. ✅ 修复环境（`danger-full-access`）并验证 M1（编译 + 记忆测试全绿）；
2. ✅ M2 信号与信念：`signal-rules.ts` / `belief-validation.ts` / beliefs 表 + 硬锚点验证；
3. ✅ M3 确定性读路径：`memory-read.ts` + `memory:readForQuery` + 聊天注入替换；
4. ✅ M4 审计与归因：beliefAudit / readTrace / erase / MemoryPanel 三视图 + 五层归因测试；
5. ✅ M5 MAP-Graph：`memory-graph.ts` 角色授权 / 路径信任 / 风险门控（`AURAXIS_MEMORY_RISK_GATE=1` 启用）；
6. ✅ 全量验证：tsc / electron:compile / vitest 174 文件 1415 用例 / 覆盖率 85.24%·79.43%·82.59% / vite build / e2e 14 条。
7. ✅ 增强：chat-log / session-log 写入后实时捕获 user + 工具终态证据（`captureEvidenceFromEvents`）；R4 本地确定性向量路由（`AURAXIS_MEMORY_EMBEDDINGS=1` 启用，零 LLM）。
8. ✅ 闭环：MAP-Graph 运行时 agent/action 节点 + 角色自动绑定（scheduler / sub-agent 传 agentName）；INO 纠错即证据（down 评分/备注 → evidence + correction 信号 + feedback 信念）；擦除审计事件（erase_audits 表，`memory:erase` 返回 auditId）。
9. ✅ 全面检查与补测：SQLite 后端（node:sqlite）真测、memory-ipc 全通道异常分支、useMemoryStore 新动作、step-engine 默认风险门控链路；修复 SQLite legacy 迁移 INSERT 占位符缺失与 step-engine `require` 兼容两个真实缺陷。
10. ✅ 复验：vitest 183 文件 1508 用例 / 覆盖率 87.16%·79.23%·86.10% / e2e 14 条全过。
11. ✅ 验收复验：vitest 229 文件 1687 用例通过（3 例环境性跳过）/ 覆盖率 85.49%·79.25%·86.44% / e2e 15 条全过 / DeepSeek 真实 API：Chat 流式、Code 自动代批 Bash、Code 每次确认权限卡、Work 智能放行执行流、Work 计划审批面板全部跑通；沙箱脚本直启 main.js 增加 cwd 回退。
12. ✅ Work 仅文档边界：新增 `electron/work-docs-policy.ts` 硬门禁（Work 模式 Write/Edit/NotebookEdit/StrReplaceEditor/Delete 禁止代码文件，并拦截 Bash/Pwsh 改写代码文件）+ 系统提示规则 + 「仅文档」UI 标识；真实 Electron + mock LLM 验证代码文件被拒、文档文件成功创建；vitest 230 文件 1695 用例通过 / 覆盖率 85.50%·79.27%·86.44% / e2e 15 条全过。

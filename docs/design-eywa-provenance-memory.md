# Eywa 溯源记忆落地方案（Provenance-Grounded Memory for Auraxis）

> 依据论文：Eywa: Provenance-Grounded Long-Term Memory for AI Agents（arXiv:2605.30771，2026-05）
> 状态：已落地 v1.0（2026-08-16），按 PLAN 实现 M1–M5；读路径已替换聊天注入；增强项（实时证据钩子、R4 本地向量路由、MAP-Graph 运行时绑定、INO 纠错闭环、擦除审计）已全部接入

## 一、目标

把 Auraxis 现有「LLM 抽取 → 去重 → 注入」的扁平记忆，升级为 **证据先于信念（evidence before belief）** 的溯源记忆：

1. 原始会话证据不可变保存，抽取出的信念只是「可审阅、可修订、可删除的索引」。
2. 信念必须能追溯到证据（source support），不支持则不得提升为正式记忆。
3. 检索路径确定性、零 LLM 调用，记忆上下文与答案策略分离。
4. 每个答案都能回答「错在哪一层」：缺证据 / 抽取失真 / 状态过期 / 检索丢失 / 模型行为。

## 二、Auraxis 现状盘点

### 已有资产（可以直接复用）

| 能力 | 现状 | 对应 Eywa 概念 |
|---|---|---|
| 会话事件流 | `session-store.ts` / `session-log.ts` 统一 append-only JSONL | 最理想的 Evidence 来源 |
| 全文检索 | `fts.ts` FTS5 + 增量索引 | 读路径的确定性检索路由之一 |
| 投影缓存 | `session-projection-cache.ts`，`PRAGMA user_version=1` | 可扩展为溯源图/投影 |
| 记忆存储 | `memory-db.ts`（better-sqlite3，JSON 回退） | Belief 存储（需扩展） |
| 记忆抽取 | `memory-extractor.ts` LLM 驱动 | 写路径的 Belief 生成（需加验证） |
| 记忆 IPC | `memory-ipc.ts`：extract/getByProject/getByType/search/archive/delete | 保持兼容并新增溯源接口 |
| 用户反馈 | `useMessageFeedbackStore` + `feedback-handlers.ts` 逐消息评分 | 纠错型 Evidence（后续接 INO） |
| 上下文预算 | `context-manager.ts` token 估算 | 检索结果上下文打包预算 |
| 权限/审计 | 权限弹窗、审批记录、session-log | Erasure 与审计的既有载体 |

### 与 Eywa 的差距

1. 只存「抽取结果」，不存不可变源证据；抽取失真后无法修复。
2. 没有 typed signal（日期、实体、决策、纠错、审批等硬锚点）检测层。
3. 抽取出的记忆没有「来源支持校验」，无法区分支持/不支持。
4. 注入路径语义不明确，检索是否确定性、是否有预算/诊断未知（需核对 `context-handlers.ts` 与 store 注入逻辑）。
5. 没有逐问题 trace 产物（每条记忆的 evidence 链、每次读取的路由命中与延迟）。
6. 没有按用户/项目作用域的可审计擦除语义。

## 三、核心数据模型

三个对象分层，严格保持「证据不可变」：

```text
Evidence（不可变源材料）
  ├─ 原始消息/工具观测/纠错内容 + role + ts + sessionId + eventId
  ├─ 按 scope（projectPath / 用户）隔离
  └─ 仅可整条删除（用户擦除），不可修改

Signal（类型化检测，证据上的索引）
  ├─ 日期、实体（人/组织/项目）、URL、版本号
  ├─ 决策、纠错（“不对/应该是/更正”）、批准、拒绝
  └─ 优先规则/正则确定性检测；LLM 检测为可选开关

Belief（LLM 派生信念，可修订索引）
  ├─ kind: user / feedback / project / reference（兼容现有四类）
  ├─ status: draft → promoted → active → superseded / rejected / deleted
  ├─ 必须至少引用 1 条 evidence（legacy 记忆除外，标记 unverified）
  └─ revision 链保留历史版本
```

### SQLite 表（`memory-db.ts` 内扩展，沿用 user_version 迁移）

```sql
evidence(
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,            -- projectPath 或用户级 scope
  session_id TEXT, event_id TEXT, -- 回指 session-log
  role TEXT, ts TEXT,
  content_hash TEXT NOT NULL,     -- 去重/完整性
  content TEXT NOT NULL,          -- 不可变原文
  metadata TEXT,                  -- JSON：来源文件、工具名等
  deleted_at TEXT
);

signals(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  signal_type TEXT NOT NULL,
  value TEXT,
  confidence REAL,
  detector TEXT                   -- rule | llm
);

beliefs(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- user | feedback | project | reference
  scope TEXT NOT NULL,
  text TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  legacy INTEGER DEFAULT 0,       -- 旧记忆迁移：evidence=null
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

belief_evidence(
  belief_id TEXT NOT NULL REFERENCES beliefs(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  support_strength REAL,          -- 硬锚点命中数 / 信号覆盖度
  PRIMARY KEY (belief_id, evidence_id)
);

belief_revisions(
  id TEXT PRIMARY KEY, belief_id TEXT NOT NULL,
  prev_status TEXT, next_status TEXT,
  reason TEXT, actor TEXT, ts TEXT
);

read_runs(
  id TEXT PRIMARY KEY, query_hash TEXT, scope TEXT,
  budget_tokens INTEGER, latency_ms INTEGER, ts TEXT
);

read_results(
  id TEXT PRIMARY KEY, read_run_id TEXT NOT NULL,
  belief_id TEXT, evidence_ids TEXT,
  route TEXT, rank INTEGER, score REAL
);
```

JSON 回退（better-sqlite3 未安装时）：按 scope 生成 `evidence.jsonl` + `beliefs.json` + `read-traces.jsonl`，保证与 SQLite 相同的不可变语义（evidence 只追加、整条删除）。

## 四、写路径（Evidence → Signal → Belief）

### 4.1 Evidence 捕获

- 在 `session-log.ts` / `chat-log.ts` 写入事件后挂一个 best-effort 钩子（或由 `memory-ipc.ts` 的 extract 触发补采）。
- 捕获对象：用户消息、assistant 提案、工具观测结果、用户纠错、审批/拒绝事件。
- 去重：`content_hash = sha256(scope + role + ts + content)`，重复则复用现有 evidence。

### 4.2 Signal 检测（确定性优先）

- 规则表放在 `electron/rules.ts` 旁新增 `electron/signal-rules.ts`：日期/版本/URL/实体关键词/纠错与批准拒绝句式。
- 输出 `signals` 行，`detector='rule'`；`AURAXIS_MEMORY_LLM_SIGNALS=1` 时才追加 LLM 检测。

### 4.3 Belief 抽取与硬锚点验证

- `memory-extractor.ts` 的 prompt 改为「给出候选信念 + 引用 evidence id」。
- 验证规则（硬门，任一不满足则 `status=rejected` 并记录原因）：
  1. 候选信念引用的 evidence id 必须真实存在；
  2. 信念中的关键实体/日期/数值必须能在对应 evidence 中找到（归一化匹配）；
  3. 纠错类信念必须引用「原始陈述」与「纠正陈述」两条 evidence。
- 通过后 `promoted`，与现有去重逻辑合并（重复 → 保留原 belief，追加 evidence 引用；冲突 → 新版本 + revision 记录，旧版 `superseded`）。

## 五、读路径（确定性、零 LLM）

`memory:readForQuery(query, scope, opts)` 内部按固定顺序执行多路检索，**任何一路不调 LLM**：

| 路由 | 实现 | 说明 |
|---|---|---|
| R1 关键词/FTS | 复用 `fts.ts` | 同时搜 evidence.content 与 beliefs.text |
| R2 实体/时间 | SQL 过滤 | entity scope + 时间窗口，近期优先 |
| R3 观测流 | 最近 N 条 observations | 兜底短期上下文 |
| R4 向量 | 可选 | 未配置 embedding 时跳过，不阻塞 |

融合规则（确定性）：`score = 0.5*route_confidence + 0.3*support_strength + 0.2*recency`，同 belief 去重，按 token 预算（复用 `context-manager.ts` 估算）截断。

返回结构（与答案策略分离）：

```ts
interface MemoryReadResult {
  context: MemoryContextItem[];   // { beliefId, text, evidenceIds[], ts }
  policy: AnswerPolicy;           // 引用要求、不确定时拒答、scope 规则
  facts: string[];                // 供模型引用的紧凑事实串
  diagnostics: ReadDiagnostics;   // 每路命中数、预算、延迟、缺失证据标记
}
```

## 六、IPC 接口（`memory-ipc.ts`，全部保持 `IpcResponse<T>`）

新增（向后兼容旧通道）：

| 通道 | 方向 | 说明 |
|---|---|---|
| `memory:evidenceList` | 渲染→主 | 按 scope/类型列出 evidence |
| `memory:evidenceDetail` | 渲染→主 | evidence 原文 + signals |
| `memory:beliefAudit` | 渲染→主 | belief 的 evidence 链、signals、revision 历史 |
| `memory:readForQuery` | 渲染→主 | 新注入入口，返回 context+policy+diagnostics |
| `memory:readTrace` | 渲染→主 | 按 read_run_id 返回逐路结果（评测用） |
| `memory:erase` | 渲染→主 | 按 scope 擦除 evidence + 派生 beliefs + read traces |
| `memory:reindex` | 渲染→主 | 从已有 evidence 重建 signals/beliefs（迁移用） |

旧通道 `memory:getByProject` / `getByType` / `search` / `archive` / `delete` 映射到新模型上，迁移期不删。

## 七、渲染层改动

- `useMemoryStore.ts`：新增 beliefAudit / readTrace / erase 动作。
- `MemoryPanel.tsx`：每条记忆展示来源证据（可展开原文）、支持强度、状态与修订历史；新增「读路径诊断」视图。
- `context-handlers.ts`（或 store 注入逻辑）：新对话注入改走 `memory:readForQuery`，把 `policy` 与上下文分开传给 `query-engine` / `agent-loop` 的 prompt 组装。

## 八、测试与验证计划

### 单元/集成（vitest，`electron/ipc/__tests__/memory-provenance.test.ts` 等）

1. Signal 规则：纠错句式、日期、版本号、URL 的命中与误报。
2. 硬锚点验证：支持 / 不支持 / 引用不存在的 evidence，三态断言。
3. 确定性：同一 fixture 两次 `readForQuery` 结果逐字节一致（读路径禁 LLM/随机）。
4. 预算：超预算时按 score 截断，`diagnostics.budget` 正确。
5. Erasure：擦除 scope 后 evidence/beliefs/read_results 全部失效，且留下审计事件。
6. JSON 回退：SQLite 与 JSON 两后端行为一致。
7. 兼容：旧 `memory:getByProject` 等在新模型上仍通过；legacy 记忆 `status=active, legacy=1, evidence=[]`。

### 五层失败归因测试（对应论文核心卖点）

构造同一多会话 fixture，注入五类故障，断言 diagnostics 能指认：

| 故障 | 断言 |
|---|---|
| 缺证据 | evidence 表为空 → `missing_evidence=true` |
| 抽取失真 | belief 无 evidence 引用 → `unsupported_extraction=true` |
| 状态过期 | 存在 superseded 版本且被错误引用 → `stale_state=true` |
| 检索丢失 | 有证据但 R1/R2/R3 均未命中 → `retrieval_loss=true` |
| 模型行为 | context 完整但答案错误 → 由 answer policy 层标记（QA 评测） |

### 质量门

- `npx tsc --noEmit`、`npm run electron:compile`、`npx vitest run`、`npx vite build`。
- 覆盖率范围沿用 `electron/ipc/`，不得跌破当前阈值（85.50% 行 / 79.27% 分支 / 86.44% 函数）。
- E2E：`test:e2e` 增加「记忆面板查看来源证据」链路；`test:smoke` 保持通过。

## 九、里程碑

| 阶段 | 内容 | 预计改动 |
|---|---|---|
| M1 | 表结构 + Evidence 捕获 + 旧 API 兼容 | memory-db、session-log 钩子、contracts |
| M2 | Signal 检测 + 硬锚点验证 + Belief 生命周期 | signal-rules、memory-extractor、revision |
| M3 | 确定性多路读 + readForQuery + 注入替换 | memory-ipc、context-handlers、useMemoryStore |
| M4 | 审计 UI + 五层失败归因测试 + trace 导出 | MemoryPanel、测试套件 |
| M5（可选） | 纠错即证据（INO 闭环）、图记忆（AriadneMem） | feedback-handlers、图结构扩展 |

## 十、风险与决策点

1. **存储增长**：evidence 全量保存，需沿用 `log-retention.ts` 的保留策略（默认 180 天 / 256MB），content 可压缩，hash 去重。
2. **better-sqlite3 可选依赖**：JSON 回退必须实现同样的不可变语义，测试双后端。
3. **LLM 成本**：Signal 默认规则化；Belief 抽取仅在会话结束/显式触发时执行；读路径永不含 LLM。
4. **隐私**：`memory:erase` 按 scope 级联，evidence 硬删（软删标记 + 审计事件），与 safeStorage 设置隔离。
5. **旧数据**：迁移时旧记忆导入为 `legacy=1, evidence=[]`，审计视图明确标注「无证据支持」，不静默当作已验证。
6. **确定性**：读路径禁用 LLM 与随机；embedding 路由默认关闭，开启后仍只影响排序不影响证据链。

## 十一、待核对清单（shell 恢复后）

- [x] `memory-db.ts` 表结构：evidence / signals / beliefs / belief_evidence / belief_revisions / belief_rejections / read_runs / read_results（双后端）
- [x] `memory-extractor.ts` prompt 增加 evidence_ids 引用与硬锚点说明
- [x] `memory-ipc.ts` 新旧通道：getByProject 映射 beliefs，新增 readForQuery / beliefAudit / readTrace / erase / reindex / graph
- [x] 会话注入位置：`src/stores/useChatStore.ts` 已改为 `memory:readForQuery`
- [x] 证据捕获：`memory-evidence.ts` 在 extract 前补采；`chat-log.ts` / `session-log.ts` 写入后实时捕获 user + 工具终态证据（best-effort）
- [x] 检索：`memory-read.ts` 关键词/信号/观测流多路确定性检索 + R4 本地确定性向量路由（`AURAXIS_MEMORY_EMBEDDINGS=1` 启用，默认跳过）

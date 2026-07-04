# P1 设计：会话压缩 + 长期记忆

- **日期**：2026-07-04
- **状态**：待评审
- **范围**：qiming-agent 项目的第二个子项目（P1）
- **依赖**：P0（基础骨架 + 多 Provider 抽象层）已合并到 main

---

## 1. 项目背景

### 1.1 P1 在路线图中的位置

| 子项目 | 内容 | 状态 |
|---|---|---|
| P0 | 基础骨架 + 多 Provider 抽象层 | ✅ 已合并 |
| **P1** | **会话与上下文管理（压缩 + 长期记忆）** | **本文档** |
| P2 | 本地执行能力 + 工具系统（文件/shell/MCP） | 待开始 |
| P3 | Skill 加载器 + 高级 UI | 待开始 |

### 1.2 已确认的 P1 决策

| 维度 | 决策 |
|---|---|
| 上下文压缩触发 | **自动阈值压缩**（token 超阈值时自动摘要旧消息） |
| 压缩组织方式 | **单摘要累加**（旧 summary + 新待压 → 新 summary） |
| 记忆形态 | **向量检索记忆** |
| Embedding 来源 | **LLM provider API**（复用已配厂商） |
| 向量存储 | **SQLite 存向量 + 内存余弦相似度检索** |
| 记忆写入 | **LLM 自动提取 + 设置页手动管理** |
| 记忆去重 | **入库前去重**（余弦 > 0.9 视为重复，合并/跳过） |
| 记忆注入 | **按当前问题检索 top-K**，拼到 system prompt |

### 1.3 继承自 P0 的技术栈

Electron + electron-vite + React 18 + TypeScript + Vite + zustand + Tailwind CSS + 古风令牌（gufeng-design-tokens/motion-engine）+ Vercel AI SDK + keytar + better-sqlite3 + pnpm workspace。

---

## 2. P1 必须先修的 P0 衔接债

P0 调研发现 3 个衔接问题，是 P1 功能的前置依赖，必须在 P1.0 task 修复：

### 2.1 衔接债清单

| # | 衔接债 | P0 现状 | P1 修复 | 为何必须 |
|---|---|---|---|---|
| ① | assistant tokens 永久 NULL | `run.ts` 不消费 `result.usage`，`appendMessage` 不传 tokens，DB 里 assistant 消息 tokens=null | 从 `result.usage.completionTokens` 取值写入 `appendMessage` 的 tokens 参数 | 压缩的预算计算依赖 tokens 列 |
| ② | content 语义不一致 | `session.ts` 注释说 content 是 JSON `{text}`，实际存纯文本 string | 统一为纯文本，修正 shared/session.ts 注释 | 避免压缩/记忆处理时 parse 错误 |
| ③ | 无 migration 框架 | schema.sql 全 IF NOT EXISTS，无 ALTER 路径，无版本号 | 新增 `store/migration.ts` + `schema_version` 表，启动时按版本号跑增量迁移 | P1 要加 memories 表 + messages 加列，必须能迁移老 DB |

### 2.2 Migration 框架设计

```typescript
// store/migration.ts
/** 版本化迁移。getDb() 启动时调用 runMigrations(db)。
 *  每个 migration 是幂等的（IF NOT EXISTS / ALTER 重复执行安全）。 */
const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial',
    sql: readFileSync(...schema.sql),  // P0 的原始 schema
  },
  {
    version: 2,
    name: 'p1-memories-and-kind',
    sql: `
      CREATE TABLE IF NOT EXISTS memories (...);
      ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'message';
    `,
  },
  // 后续 P2/P3 在此追加 version 3, 4...
];

export function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT, applied_at INTEGER)`);
  const current = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {v: number | null}).v ?? 0;
  for (const m of migrations) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
    }
  }
}
```

**设计要点**：
- 版本号单调递增，跳号不允许
- 每个 migration 包裹在 `db.exec` 内（better-sqlite3 的 exec 是事务性的）
- 老的 P0 DB（无 schema_version 表）首次跑会从 version 0 开始，依次执行 version 1（建表，IF NOT EXISTS 幂等）+ version 2（P1 新增）
- P0 的 `getDb()` 改为调 `runMigrations(db)` 替代直接 `db.exec(schema)`

---

## 3. 整体架构

### 3.1 模块布局

```
apps/desktop/src/main/
├── chat/
│   └── run.ts              # 改造：接入压缩 + 记忆检索 + 记忆提取
├── context/                # 新：压缩引擎
│   ├── tokenCounter.ts     # token 估算（纯函数）
│   ├── budget.ts           # 预算规划（纯函数）
│   └── compressor.ts       # LLM 摘要生成
├── memory/                 # 新：记忆引擎
│   ├── embedder.ts         # 调 provider 生成 embedding
│   ├── vectorStore.ts      # SQLite 向量存取 + cosine 检索
│   ├── retriever.ts        # top-K 检索 + system prompt 拼装
│   └── extractor.ts        # LLM 自动提取 + 去重
├── store/
│   ├── schema.sql          # 扩展：加 memories 表
│   ├── migration.ts        # 新：版本化迁移
│   ├── sessions.ts         # 扩展：appendMessage 加 kind 参数
│   └── memories.ts         # 新：记忆 CRUD
└── ipc/handlers/
    └── memory.ts           # 新：记忆管理 IPC
```

### 3.2 一轮对话的完整数据流

```
用户发消息 → runTurn(sessionId, userMessage)
   │
   ├─ 1. appendMessage('user', userMessage)  [记 tokens via estimateTokens]
   │
   ├─ 2. 【新】检索记忆：
   │     if (cfg.embeddingModel):
   │       queryVec = embedTexts(cfg, [userMessage])
   │       memories = vectorStore.search(queryVec, k=3)
   │       过滤 score < 0.3
   │       → 拼成 system prompt 片段
   │
   ├─ 3. 【新】预算规划 + 压缩：
   │     all = messages(sessionId)  // 按 kind 分组
   │     summaries = all.filter(kind==='summary')
   │     raw = all.filter(kind==='message')
   │     plan = planBudget(contextWindow, reservedForReply, memoryTokens, summaries, raw, keepRecent=6)
   │     if (plan.toCompress.length >= 4):
   │       summary = compressMessages(model, plan.toCompress + plan.summaries)
   │       appendMessage('assistant', summary.text, summary.tokens, kind='summary')
   │       重新 plan（summaries 现在含新 summary）
   │
   ├─ 4. 拼上下文：
   │     [system: 记忆片段] + plan.summaries + plan.recent
   │
   ├─ 5. streamText({ model, system, messages: recent, abortSignal })
   │     → 流式推送 delta
   │
   ├─ 6. appendMessage('assistant', finalText, result.usage.completionTokens)
   │
   └─ 7. 【新】后台（fire-and-forget，不 await）：
         extractAndStore(cfg, userMessage, finalText)
           → LLM 提取事实
           → 去重（每条事实 embed 后检索 cosine>0.9 合并/跳过）
           → 存 memories
```

**关键时序约束**：
- 记忆检索（步骤2）在压缩（步骤3）之前：先确定 system prompt 占用，再算剩余预算
- 压缩同步执行：必须在本轮 streamText 前完成，否则上下文仍是臃肿的
- 记忆提取（步骤7）异步后台：不阻塞用户下一轮

---

## 4. 数据模型

### 4.1 memories 表（新增）

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,              -- 记忆文本
  embedding TEXT NOT NULL,            -- JSON float[] 向量
  source TEXT,                        -- 'manual' | 'auto'
  enabled INTEGER NOT NULL DEFAULT 1, -- 0=禁用，不参与检索
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);
```

### 4.2 messages 表扩展（迁移加列）

```sql
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'message';
-- kind: 'message'(普通对话) | 'summary'(压缩摘要)
```

### 4.3 shared 类型扩展

```typescript
// shared/session.ts
export type MessageKind = 'message' | 'summary';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;          // 统一为纯文本（修正 P0 注释）
  tokens: number | null;
  kind: MessageKind;        // 新增，默认 'message'
  createdAt: number;
}

// shared/provider.ts 扩展
export interface ProviderConfig {
  // ...P0 原有字段
  embeddingModel?: string;     // 新增：embedding 模型名（如 'text-embedding-3-small'）
  contextWindow?: number;      // 新增：上下文窗口大小（如 128000）
}

// shared/memory.ts（新文件）
export interface Memory {
  id: string;
  content: string;
  embedding: number[];        // 运行时从 DB 的 JSON 解析
  source: 'manual' | 'auto';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MemoryInput = Pick<Memory, 'content'>;

export interface ScoredMemory {
  memory: Memory;
  score: number;              // 余弦相似度 0-1
}
```

### 4.4 IPC 扩展（shared/ipc.ts）

IPC 对象新增通道：

```typescript
// 追加到 IPC 常量对象
MEMORY_LIST: 'memory:list',
MEMORY_ADD: 'memory:add',
MEMORY_UPDATE: 'memory:update',
MEMORY_DELETE: 'memory:delete',
MEMORY_REEMBED: 'memory:reembed',
```

ExposedApi 新增 memory 命名空间：

```typescript
interface ExposedApi {
  // ...provider/session/chat/window（P0）
  memory: {
    list(): Promise<Memory[]>;
    add(content: string): Promise<Memory>;       // 自动 embed
    update(id: string, input: { content?: string; enabled?: boolean }): Promise<Memory>;
    delete(id: string): Promise<void>;
    reembed(): Promise<{ updated: number }>;      // 换 embedding 模型后全量重建
  };
}
```

CHAT_DONE payload 扩展，带预算快照供 UI 进度条：

```typescript
export interface ChatDonePayload {
  sessionId: string;
  message: Message;
  usage?: { contextWindow: number; usedTokens: number };  // 新增
}
```

---

## 5. 上下文压缩引擎

### 5.1 tokenCounter.ts（纯函数）

```typescript
/** 估算文本 token 数。
 *  优先用已存的准确值（assistant 来自 provider usage）；
 *  无则启发式估算（CJK 1字≈1token，其余 4字符≈1token）。 */
export function estimateTokens(text: string, stored?: number | null): number;

/** 计算消息列表总 token（每条 +4 overhead） */
export function totalTokens(messages: Message[]): number;
```

**不引入 tokenizer 库的理由**：准确 tokenizer 依赖具体模型且多为 WASM（体积/ABI 风险）；启发式 + provider usage 准确值 + 20% 安全余量已足够。

### 5.2 budget.ts（纯函数，可单测）

```typescript
export interface BudgetPlan {
  summaries: Message[];      // 保留的摘要
  recent: Message[];         // 保留的最近原始消息
  toCompress: Message[];     // 待压缩的旧消息
}

export function planBudget(opts: {
  contextWindow: number;
  reservedForReply: number;
  memoryTokens: number;
  summaries: Message[];
  messages: Message[];       // 原始消息（kind='message'），时间升序
  keepRecent: number;
}): BudgetPlan;
```

**策略**：从最新消息向前贪心保留，至少保 keepRecent 条（默认 6 = 3 轮），超预算的旧消息进 toCompress。

### 5.3 compressor.ts（LLM 调用）

```typescript
/** 把旧消息（+已有摘要）压缩成单条 summary。
 *  单摘要累加策略：输入含已有 summaries，输出替换它们的新 summary。 */
export async function compressMessages(
  model: LanguageModel,
  toCompress: Message[],
  existingSummaries: Message[],
  signal?: AbortSignal,
): Promise<{ text: string; tokens: number }>;
```

**单摘要累加**：prompt 同时喂入 existingSummaries 的内容 + toCompress 的对话记录，LLM 输出**整合后的新摘要**。旧 summaries 在 run.ts 里逻辑上被新 summary 取代（DB 保留，不下发）。

### 5.4 run.ts 接入（改造点）

```typescript
// chat/run.ts 的 runTurn 改造（关键片段）
const cfg = provider;  // 当前会话绑定的 ProviderConfig
const contextWindow = cfg.contextWindow ?? 8000;  // 默认 fallback

// 步骤2：记忆检索（见 §6.4）
const memorySystemPrompt = await retrieveMemories(cfg, userMessage);
const memoryTokens = memorySystemPrompt ? estimateTokens(memorySystemPrompt) : 0;

// 步骤3：预算 + 压缩
const all = sessions().messages(sessionId);
const summaries = all.filter((m) => m.kind === 'summary');
const raw = all.filter((m) => m.kind === 'message').filter((m) => m.role !== 'system');
let plan = planBudget({
  contextWindow,
  reservedForReply: 4096,
  memoryTokens,
  summaries,
  messages: raw,
  keepRecent: 6,
});

if (plan.toCompress.length >= 4) {
  const summary = await compressMessages(model, plan.toCompress, plan.summaries, controller.signal);
  const savedSummary = sessions().appendMessage(sessionId, 'assistant', summary.text, summary.tokens, 'summary');
  // 重新规划：新 summary 加入，旧 summaries 不再下发
  plan = planBudget({
    ...arguments[0],
    summaries: [savedSummary],
    messages: raw.filter((m) => !plan.toCompress.find((tc) => tc.id === m.id)),
  });
}

// 步骤4：拼上下文
const result = streamText({
  model,
  system: memorySystemPrompt ?? undefined,  // 记忆注入
  messages: [...plan.summaries, ...plan.recent].map((m) => ({ role: m.role, content: m.content })),
  abortSignal: controller.signal,
});
```

---

## 6. 长期记忆引擎

### 6.1 embedder.ts

```typescript
/** 用 provider 的 embedding 模型批量生成向量。
 *  复用 ProviderConfig，走各 SDK 的 textEmbedding 工厂。 */
export async function embedTexts(
  cfg: ProviderConfig,
  texts: string[],
): Promise<number[][]>;

/** 单文本便捷封装 */
export async function embedText(cfg: ProviderConfig, text: string): Promise<number[]>;
```

**实现**：类似 `buildModel`，按 `cfg.kind` switch：
- openai/openai-compatible → `createOpenAI({...}).textEmbedding(cfg.embeddingModel)`
- anthropic → Anthropic 暂无 embedding API，抛错提示（claude 无 embedding）
- google → `createGoogleGenerativeAI({...}).textEmbedding(cfg.embeddingModel)`

**降级**：若 provider 无 embedding 能力，记忆功能跳过（不崩溃），设置页提示用户配置支持 embedding 的 provider。

### 6.2 vectorStore.ts

```typescript
export function createMemoryStore(db: Database) {
  return {
    add(content: string, embedding: number[], source: 'manual' | 'auto'): Memory;
    list(): Memory[];                                    // 含禁用的
    listEnabled(): Memory[];                             // 仅 enabled=1
    get(id: string): Memory | null;
    update(id: string, input: { content?: string; enabled?: boolean }): Memory | null;
    delete(id: string): void;
    search(queryVec: number[], k: number): ScoredMemory[];  // 内存余弦 top-K
    replaceEmbedding(id: string, embedding: number[]): void;
  };
}
```

**向量的 DB 序列化**：`JSON.stringify(number[])` 存 TEXT 字段。检索时全量加载 enabled 记忆，parse 后内存算 cosine。

**性能**：1536 维 × 1000 条，全量余弦约 1-2ms。P1 记忆量级足够。

### 6.3 余弦相似度（纯函数，单测）

```typescript
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}
```

### 6.4 retriever.ts（注入）

```typescript
/** 检索 top-K 记忆，格式化成 system prompt 片段。
 *  无配置 embedding 或无相关记忆时返回 null。 */
export async function retrieveMemories(
  cfg: ProviderConfig,
  userMessage: string,
  k = 3,
  minScore = 0.3,
): Promise<string | null>;
```

输出格式（注入 system prompt）：
```
以下是关于用户的长期记忆，供参考：
- 用户偏好函数式编程风格
- 用户在开发 Go 微服务
```

### 6.5 extractor.ts（自动提取 + 去重）

```typescript
/** LLM 从一轮对话提取事实，去重后存库。
 *  后台异步调用，失败静默（记日志）。 */
export async function extractAndStore(
  cfg: ProviderConfig,
  userMessage: string,
  assistantReply: string,
): Promise<void>;
```

**流程**：
1. LLM 提取事实（每行一条，无则回复"无"）
2. 批量 embed 提取出的 facts
3. **去重**：每条 fact 的向量在现有 memories 中检索
   - cosine > 0.9：视为重复，**跳过**（P1 选跳过不合并，避免 LLM 合并的额外调用）
   - 否则：存库（source='auto'）

**去重阈值 0.9 的理由**：语义高度相似才判重，避免误杀相关但不同的记忆。

### 6.6 run.ts 接入

- 步骤2（检索）：`const memSys = await retrieveMemories(cfg, userMessage)`
- 步骤7（提取，fire-and-forget）：`void extractAndStore(cfg, userMessage, finalText).catch((e) => log(e))`

---

## 7. UI 扩展

### 7.1 token 预算进度条（ChatPage 顶栏）

provider/model 下拉旁加古风进度条：

- 朱砂色填充（`--accent-cinnabar`），超 80% 变 `--accent-cinnabar-hover` 警示
- 数据来自 CHAT_DONE payload 的 usage（contextWindow + usedTokens）
- 进度条样式走 gufeng 令牌（圆角 `--radius-full`，高度 `--space-2`）

### 7.2 MessageBubble 区分 kind

| kind | 样式 | 来源 |
|---|---|---|
| `message` | P0 默认（用户绢布 / 助手宣纸） | 普通对话 |
| `summary` | **竹简卷轴样式**：左侧竖条 `--texture-bamboo`，标题"前情提要"，默认展开，可折叠 | 压缩摘要 |

竹简样式走 gufeng 令牌（竹纹纹理 + 古铜色边框 + 淡墨文字）。

### 7.3 记忆管理设置页

设置页（SettingsPage）新增第二个区域"记忆管理 · 脑海拾遗"：

- 记忆列表卡片：内容 + 来源标签（auto=自动拾得 / manual=亲笔记下）+ 编辑/启用禁用/删除
- 新增按钮：输入文本 → 自动 embed → 存库
- 统计：共 N 条（X 启用 / Y 禁用）
- 来源标签用古风徽记样式（`--accent-gold` 边框）

### 7.4 ProviderForm 扩展

ProviderForm 新增两个可选字段：
- `embeddingModel`：文本输入（如 `text-embedding-3-small`），留空则该 provider 不支持记忆功能
- `contextWindow`：数字输入（如 `128000`），用于压缩预算

预置模板（templates.ts）补充这两个字段的推荐值。

---

## 8. P1 范围与验收

### 8.1 task 分解

| 顺序 | task | 内容 | 依赖 |
|---|---|---|---|
| **P1.0** | P0 衔接债修复 | tokens 落库 + content 注释 + migration 框架 | 无 |
| **P1.1** | 数据模型扩展 | memories 表 + messages.kind 列迁移 + shared 类型 + ProviderConfig 字段 | P1.0 |
| **P1.2** | 压缩引擎 | tokenCounter + budget + compressor + 单测 | P1.1 |
| **P1.3** | 压缩接入 run.ts | run.ts 改造（预算检查 + 触发压缩 + system 拼装） | P1.2 |
| **P1.4** | 记忆存储 + embedder | embedder + vectorStore + cosine + 单测 | P1.1 |
| **P1.5** | 记忆检索 + 注入 | retriever + run.ts 接入 system prompt | P1.3, P1.4 |
| **P1.6** | 记忆提取 + 去重 | extractor + run.ts 后台接入 | P1.4 |
| **P1.7** | UI：进度条 + summary 渲染 | ChatPage 顶栏 + MessageBubble kind 区分 | P1.3 |
| **P1.8** | UI：记忆管理 + ProviderForm 扩展 | 设置页记忆区域 + IPC + ProviderForm 字段 + 端到端验证 | P1.5, P1.6 |

### 8.2 P1 验收标准

**衔接债修复**：
- ✅ assistant 消息 tokens 正确落库（来自 provider usage）
- ✅ migration 框架：老 P0 DB 升级到 P1 schema 不丢数据，version 1→2 正确执行
- ✅ content 注释与实际一致（纯文本）

**上下文压缩**：
- ✅ 长会话（超过 contextWindow 80%）自动触发压缩，对话不中断
- ✅ summary 消息以竹简样式显示，可折叠
- ✅ token 进度条实时反映占用，超阈值警示色
- ✅ 压缩后历史可追溯（原始消息仍在 DB）

**长期记忆**：
- ✅ 设置页可手动新增/编辑/启用禁用/删除记忆
- ✅ 自动提取在对话后后台执行，设置页可见 auto 标签记忆
- ✅ 去重生效（同一事实不重复入库）
- ✅ 对话时注入的 top-K 记忆语义相关（手动验证）
- ✅ provider 无 embedding 能力时降级提示（不崩溃）

### 8.3 P1 明确不做

- ❌ 工具调用 / 文件读写（P2）
- ❌ MCP 客户端（P2）
- ❌ Skill 加载（P3）
- ❌ 跨设备记忆同步
- ❌ 记忆冲突合并（P1 仅跳过重复，不智能合并）
- ❌ 跨会话的会话级摘要（P1 只做会话内压缩）

---

## 9. 测试策略

| 层 | 策略 |
|---|---|
| tokenCounter | 单测：CJK/英文/混合文本估算；空串；stored 优先 |
| budget | 单测：预算充足时全保留；超预算时 toCompress 正确；keepRecent 保底 |
| cosine | 单测：相同向量=1；正交=0；近似向量中间值 |
| vectorStore | 单测：内存 SQLite，CRUD + search top-K 正确性 |
| compressor | mock generateText，验证 prompt 含 toCompress + summaries |
| embedder | mock embedMany，验证按 kind 调对应 SDK |
| extractor | mock generateText + embedTexts，验证去重逻辑（cosine>0.9 跳过） |
| migration | 单测：模拟 version 0 DB，跑迁移后 schema_version=2 且表结构正确 |
| run.ts | mock，验证压缩触发条件 + system prompt 含记忆 |
| IPC / UI | 手动集成验证 |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Anthropic Claude 无 embedding API | embedder 对 anthropic kind 抛友好错误，设置页提示用户用 OpenAI/Gemini 做 embedding；记忆功能降级 |
| 启发式 token 估算误差大 | 保留 20% 安全余量；assistant tokens 用 provider 准确值；压缩触发阈值设 80% 留缓冲 |
| 自动提取产生噪音 | 阈值过滤（score<0.3 不注入）+ 去重（cosine>0.9 跳过）+ 设置页手动管理可删 |
| 压缩摘要质量不稳定 | LLM prompt 明确保留"主题/事实/决策/未解问题"；keepRecent=6 保证当前话题连续 |
| migration 在生产 DB 上失败 | 每个 migration 幂等（IF NOT EXISTS）；better-sqlite3 exec 事务性，失败回滚不污染 |
| better-sqlite3 ABI 冲突（P0 遗留） | 延续 P0 处理：测试前 rebuild --runtime=node，运行时 Electron ABI；CI 分 test/build job |
| 记忆向量随 provider 变化失配 | 提供 reembed IPC：换 embedding 模型后全量重新 embed |

---

## 11. P1 完成后的衔接

- **P2**：在 run.ts 的 streamText 加 `tools` 参数接入本地工具与 MCP；记忆系统可为工具提供"用户偏好"上下文。
- **P3**：Skill 加载器可注册"压缩策略 Skill"和"提取策略 Skill"，让用户自定义 prompt。

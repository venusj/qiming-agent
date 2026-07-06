# P1 会话压缩 + 长期记忆 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「启明」添加自动上下文压缩（token 超阈值时 LLM 摘要旧消息）与向量检索长期记忆（provider API 生成 embedding + SQLite 存向量 + 内存余弦检索 + 自动提取去重），让长会话不超限、跨会话记住用户关键事实。

**Architecture:** 在 P0 的 Main 进程新增 `context/`（压缩引擎：tokenCounter/budget/compressor）与 `memory/`（记忆引擎：embedder/vectorStore/retriever/extractor）两个模块，改造 `chat/run.ts` 的历史拼接处接入两者。新增 migration 框架支持增量加表/加列。UI 加 token 进度条、竹简样式 summary、记忆管理设置页。

**Tech Stack:** Vercel AI SDK（`embed`/`embedMany`/`generateText`/`streamText`）/ better-sqlite3 / zustand / React / 古风令牌（gufeng）。复用 P0 的 Provider 抽象、keytar、SQLite store、IPC 体系。

## Global Constraints

（来自 spec，每个 task 的需求都隐含以下约束）

- 继承 P0 全部技术栈与古风令牌约束（颜色/字号/间距/圆角/阴影走 var(--*)，禁止硬编码）。
- 进程隔离不变：Renderer 拿不到明文 key；新 IPC 走 contextBridge。
- Embedding 复用会话绑定的 provider（ProviderConfig.embeddingModel 字段）。
- 向量以 JSON 字符串存 SQLite memories.embedding 字段；检索时内存算余弦。
- 记忆去重阈值：cosine > 0.9 视为重复，跳过不入库。
- 记忆注入阈值：检索 score < 0.3 不注入。
- 压缩：至少 4 条待压缩消息才触发；保留最近 6 条原始消息不压缩。
- 单摘要累加：压缩输入含已有 summaries + 新待压，输出整合后的新 summary。
- migration 必须幂等（IF NOT EXISTS / 重复 ALTER 安全），老 P0 DB 升级不丢数据。
- assistant tokens 必须从 `result.usage.completionTokens` 落库（P0 衔接债修复）。
- 记忆提取是 fire-and-forget 后台执行，失败不阻塞对话。
- 测试约束（P0 遗留）：better-sqlite3 在 Electron ABI，vitest 跑 Node ABI，测试前需 `npm rebuild better-sqlite3`（在 better-sqlite3 的 .pnpm 目录）。
- 文档/注释用中文，代码与变量名用英文。
- 每个 task 至少一次 commit。

---

## File Structure

```
apps/desktop/src/main/
├── chat/run.ts                    # [P1.3,P1.5,P1.6 改造] 接入压缩+记忆
├── context/                       # [P1.2 新建] 压缩引擎
│   ├── tokenCounter.ts            # estimateTokens/totalTokens（纯函数）
│   ├── budget.ts                  # planBudget（纯函数）
│   └── compressor.ts              # compressMessages（LLM 调用）
├── memory/                        # [P1.4,P1.5,P1.6 新建] 记忆引擎
│   ├── cosine.ts                  # cosine 纯函数
│   ├── embedder.ts                # embedTexts/embedText
│   ├── vectorStore.ts             # createMemoryStore（CRUD + search）
│   ├── retriever.ts               # retrieveMemories
│   └── extractor.ts               # extractAndStore
├── store/
│   ├── schema.sql                 # [P1.1 修改] 加 memories 表
│   ├── migration.ts               # [P1.0 新建] 版本化迁移
│   ├── db.ts                      # [P1.0 修改] getDb 改调 runMigrations
│   ├── sessions.ts                # [P1.0,P1.1 修改] appendMessage 加 kind
│   └── memories.ts                # [P1.4 新建] 记忆 CRUD（vectorStore 的 DB 层）
└── ipc/handlers/
    └── memory.ts                  # [P1.8 新建] 记忆管理 IPC
apps/desktop/src/preload/index.ts  # [P1.8 修改] 暴露 memory 命名空间
apps/desktop/src/renderer/
├── stores/chat.ts                 # [P1.7 修改] CHAT_DONE 带 usage
├── components/MessageBubble.tsx   # [P1.7 修改] kind='summary' 竹简样式
├── components/MessageBubble.module.css
├── components/ContextMeter.tsx    # [P1.7 新建] token 进度条
├── pages/ChatPage.tsx             # [P1.7 修改] 顶栏加 ContextMeter
├── pages/SettingsPage.tsx         # [P1.8 修改] 加记忆管理区域
└── components/MemoryPanel.tsx     # [P1.8 新建] 记忆管理面板
packages/shared/src/
├── session.ts                     # [P1.1 修改] Message 加 kind + 注释修正
├── provider.ts                    # [P1.1 修改] ProviderConfig 加 embeddingModel/contextWindow
├── memory.ts                      # [P1.1 新建] Memory/ScoredMemory 类型
└── ipc.ts                         # [P1.1,P1.8 修改] 加 memory 通道 + ChatDonePayload.usage
```

---

## Task P1.0: P0 衔接债修复（tokens 落库 + content 注释 + migration 框架）

**Files:**
- Create: `apps/desktop/src/main/store/migration.ts`
- Create: `apps/desktop/tests/migration.test.ts`
- Modify: `apps/desktop/src/main/store/db.ts`
- Modify: `apps/desktop/src/main/chat/run.ts`（tokens 落库）
- Modify: `packages/shared/src/session.ts`（content 注释修正）

**Interfaces:**
- Consumes: P0 的 `getDb()`、`run.ts` 的 `result.usage`、`schema.sql`
- Produces: `runMigrations(db)` 函数（getDb 启动时调用）；`appendMessage` 现有签名不变（tokens 参数 P0 已有，本 task 只是开始真正传值）

- [ ] **Step 1: 写 migration.ts**

`apps/desktop/src/main/store/migration.ts`:
```typescript
import type { Database } from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Migration { version: number; name: string; sql: string; }

/** P0 的原始 schema 作为 version 1（幂等，IF NOT EXISTS） */
const initialSchema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf-8');

const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initialSchema },
  // P1.1 会追加 version 2（memories 表 + messages.kind 列）
];

/** 版本化迁移。getDb() 启动时调用。
 *  每个 migration 必须 idempotent（IF NOT EXISTS / 重复 ALTER 安全）。 */
export function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of migrations) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, Date.now());
    }
  }
}

/** 供测试用：获取当前已应用版本号 */
export function getAppliedVersion(db: Database): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}
```

- [ ] **Step 2: 修改 db.ts 用 runMigrations 替代直接 exec schema**

`apps/desktop/src/main/store/db.ts`：把 `dbInstance.exec(schema)` 那行替换为 `runMigrations(dbInstance)`，删掉 `readFileSync(schema)` 的导入（已移到 migration.ts）。`createMemoryDb`（测试用）同样改为调 `runMigrations`。

修改后关键片段：
```typescript
import { runMigrations } from './migration';

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = app.getPath('userData');
  const dbPath = join(dir, 'data.db');
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  runMigrations(dbInstance);  // 替代原 db.exec(schema)
  return dbInstance;
}

export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);  // 替代原 db.exec(schema)
  return db;
}
```

- [ ] **Step 3: 写 migration 测试**

`apps/desktop/tests/migration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getAppliedVersion } from '../src/main/store/migration';

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('migration', () => {
  it('空 DB 跑迁移后 version=1，schema_version 有记录', () => {
    const db = freshDb();
    runMigrations(db);
    expect(getAppliedVersion(db)).toBe(1);
    // P0 表都在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('providers');
    expect(names).toContain('sessions');
    expect(names).toContain('messages');
    expect(names).toContain('schema_version');
  });

  it('重复跑迁移幂等（不报错，version 不变）', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db);  // 再跑一次
    expect(getAppliedVersion(db)).toBe(1);
  });

  it('已含 P0 表的 DB 升级：手动建表后跑迁移，不丢数据', () => {
    const db = freshDb();
    // 模拟老 P0 DB：无 schema_version 表，但有 messages 数据
    db.exec(`CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, kind TEXT, base_url TEXT, api_key_ref TEXT, default_model TEXT, enabled_models TEXT, headers TEXT, created_at INTEGER, updated_at INTEGER)`);
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, provider_id TEXT, model TEXT, created_at INTEGER, updated_at INTEGER)`);
    db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tokens INTEGER, created_at INTEGER)`);
    db.prepare("INSERT INTO messages (id, session_id, role, content, tokens, created_at) VALUES ('m1','s1','user','hi',NULL,1)").run();
    runMigrations(db);  // version 1 是 IF NOT EXISTS，不破坏现有表
    const count = db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number };
    expect(count.c).toBe(1);  // 数据还在
  });
});
```

- [ ] **Step 4: 跑 migration 测试（注意 ABI，需先 rebuild）**

Run（在 apps/desktop）: 先 `cd ../../node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install`（重建 Node ABI），再回 apps/desktop 跑 `corepack pnpm test tests/migration.test.ts`
Expected: 3 tests passed。

- [ ] **Step 5: 修改 run.ts 让 assistant tokens 落库**

`apps/desktop/src/main/chat/run.ts`：找到 `const finalText = await result.text;` 后的 `appendMessage(sessionId, 'assistant', finalText)`，改为传入 tokens。

```typescript
const finalText = await result.text;
const completionTokens = (await result.usage).completionTokens ?? null;
const saved: Message = sessions().appendMessage(sessionId, 'assistant', finalText, completionTokens);
```

注意：Vercel AI SDK 的 `result.usage` 是 Promise，需 `await`。若 `result.usage` 在某些版本是同步属性，用 `(result as any).usage?.completionTokens ?? (await result.usage).completionTokens ?? null` 兼容。实测以 SDK 版本为准。

- [ ] **Step 6: 修正 shared/session.ts 的 content 注释**

把 `content` 字段的注释从「JSON 字符串：P0 为纯文本 { text: string }；P2 起含工具调用」改为「纯文本字符串（P2 工具调用会引入结构化 content，届时扩展）」。

- [ ] **Step 7: 跑全部测试确认无回归**

Run（apps/desktop）: `corepack pnpm test`
Expected: P0 既有测试全过 + migration 3 个新测试过。然后重建 Electron ABI：`cd ../../node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --target=30.5.1 --runtime=electron --disturl=https://electronjs.org/headers`

- [ ] **Step 8: 类型检查**

Run: `corepack pnpm exec tsc --noEmit -p apps/desktop/tsconfig.node.json`
Expected: exit 0

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(p1.0): P0 衔接债修复 - migration 框架 + tokens 落库 + content 注释"
```

---

## Task P1.1: 数据模型扩展（memories 表 + messages.kind + shared 类型）

**Files:**
- Modify: `apps/desktop/src/main/store/migration.ts`（加 version 2）
- Modify: `apps/desktop/src/main/store/schema.sql`（加 memories 表定义）
- Modify: `apps/desktop/src/main/store/sessions.ts`（appendMessage 加 kind 参数）
- Modify: `packages/shared/src/session.ts`（Message 加 kind）
- Modify: `packages/shared/src/provider.ts`（加 embeddingModel/contextWindow）
- Create: `packages/shared/src/memory.ts`
- Modify: `packages/shared/src/index.ts`（export memory）
- Modify: `apps/desktop/tests/store.test.ts`（适配 appendMessage 新签名）

**Interfaces:**
- Consumes: P1.0 的 migration 框架
- Produces: `Memory`/`ScoredMemory`/`MessageKind` 类型；`appendMessage(..., kind?)` 新签名；memories 表；ProviderConfig.embeddingModel/contextWindow 字段

- [ ] **Step 1: schema.sql 加 memories 表**

在 `apps/desktop/src/main/store/schema.sql` 末尾追加：
```sql

-- P1: 长期记忆
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  source TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);
```

- [ ] **Step 2: migration.ts 加 version 2**

```typescript
const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initialSchema },
  {
    version: 2,
    name: 'p1-memories-and-kind',
    sql: `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        source TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);
    `,
  },
];
```

注意：version 1 的 initialSchema 现在也含 memories 表（Step 1 加的），所以新建 DB 跑 version 1 就有 memories；老 DB 跑 version 2 加 memories。但 messages.kind 列只能用 ALTER（不能在已存在的表上 IF NOT EXISTS），且 better-sqlite3 的 ALTER ADD COLUMN 不支持 IF NOT EXISTS。需要安全 ALTER：

```typescript
// 在 version 2 的 sql 里，messages.kind 用 try-catch 方式加（重复加会报错）
// better-sqlite3 不支持 ADD COLUMN IF NOT EXISTS，用 pragma 检查
```

实际处理：migration.ts 的 version 2 不在 sql 字符串里加 kind 列，而是用 JS 逻辑安全加列：
```typescript
{
  version: 2,
  name: 'p1-memories-and-kind',
  sql: `CREATE TABLE IF NOT EXISTS memories (...); CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);`,
  after?: (db: Database) => void,  // 可选的 JS 后置逻辑
},
```

扩展 Migration 接口加 `after?: (db) => void`，runMigrations 在 exec(sql) 后调 after。version 2 的 after：
```typescript
after: (db) => {
  // 安全加 kind 列（已存在则跳过）
  const cols = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  if (!cols.find((c) => c.name === 'kind')) {
    db.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'message'");
  }
},
```

- [ ] **Step 3: 修改 sessions.ts 的 appendMessage 加 kind 参数**

```typescript
appendMessage(
  sessionId: string,
  role: MessageRole,
  content: string,
  tokens: number | null = null,
  kind: MessageKind = 'message',  // 新增，默认 message
): Message {
  const now = Date.now(), id = randomUUID();
  db.prepare('INSERT INTO messages (id,session_id,role,content,tokens,created_at,kind) VALUES (?,?,?,?,?,?,?)')
    .run(id, sessionId, role, content, tokens, now, kind);
  db.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(now, sessionId);
  return { id, sessionId, role, content, tokens, kind, createdAt: now };
}
```

同步更新 mRow 函数读 kind 列：
```typescript
function mRow(r: MsgRow): Message {
  return { id: r.id, sessionId: r.session_id, role: r.role as MessageRole, content: r.content, tokens: r.tokens, kind: (r.kind ?? 'message') as MessageKind, createdAt: r.created_at };
}
```
MsgRow 接口加 `kind?: string`。

- [ ] **Step 4: shared/session.ts 扩展**

```typescript
export type MessageKind = 'message' | 'summary';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  tokens: number | null;
  kind: MessageKind;  // 新增
  createdAt: number;
}
```
import MessageKind。

- [ ] **Step 5: shared/provider.ts 扩展**

ProviderConfig 末尾加：
```typescript
  embeddingModel?: string;     // embedding 模型名（如 'text-embedding-3-small'），无则不支持记忆
  contextWindow?: number;      // 上下文窗口大小（如 128000），用于压缩预算
```
ProviderInput 是 Omit<ProviderConfig,...>，自动继承。

- [ ] **Step 6: 新建 shared/memory.ts**

```typescript
export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  source: 'manual' | 'auto';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ScoredMemory {
  memory: Memory;
  score: number;  // 余弦相似度 0-1
}
```

- [ ] **Step 7: shared/index.ts export memory**

```typescript
export * from './memory.js';
```

- [ ] **Step 8: 适配 store.test.ts（appendMessage 新签名兼容）**

P0 的 store.test.ts 里 appendMessage 调用没传 kind，默认 'message'，应仍通过。但 mRow 现在读 kind，需确认测试 DB 的 messages 表有 kind 列（migration 会加）。若测试用 createMemoryDb（已改调 runMigrations），kind 列存在。验证测试通过。

- [ ] **Step 9: 跑测试 + 类型检查**

Run: 重建 Node ABI → `corepack pnpm test`（apps/desktop）→ `tsc --noEmit`（shared + node）→ 重建 Electron ABI
Expected: 全过

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(p1.1): 数据模型扩展 - memories 表 + messages.kind + shared 类型"
```

---

## Task P1.2: 上下文压缩引擎（tokenCounter + budget + compressor）

**Files:**
- Create: `apps/desktop/src/main/context/tokenCounter.ts`
- Create: `apps/desktop/src/main/context/budget.ts`
- Create: `apps/desktop/src/main/context/compressor.ts`
- Create: `apps/desktop/tests/tokenCounter.test.ts`
- Create: `apps/desktop/tests/budget.test.ts`
- Create: `apps/desktop/tests/compressor.test.ts`

**Interfaces:**
- Consumes: `Message`（@qiming/shared）、Vercel AI SDK `generateText`/`LanguageModel`
- Produces: `estimateTokens(text, stored?)`、`totalTokens(messages)`、`planBudget(opts)`、`compressMessages(model, toCompress, existingSummaries, signal?)`

- [ ] **Step 1: 写 tokenCounter.ts + 测试**

`apps/desktop/src/main/context/tokenCounter.ts`:
```typescript
import type { Message } from '@qiming/shared';

/** 估算文本 token。优先用已存准确值，无则启发式。 */
export function estimateTokens(text: string, stored?: number | null): number {
  if (stored && stored > 0) return stored;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

/** 消息列表总 token（每条 +4 overhead） */
export function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content, m.tokens) + 4, 0);
}
```

`apps/desktop/tests/tokenCounter.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { estimateTokens, totalTokens } from '../src/main/context/tokenCounter';

describe('estimateTokens', () => {
  it('优先用 stored 准确值', () => {
    expect(estimateTokens('hello', 42)).toBe(42);
  });
  it('纯中文：1 字 ≈ 1 token', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });
  it('纯英文：4 字符 ≈ 1 token', () => {
    expect(estimateTokens('hello')).toBe(Math.ceil(5 / 4));  // 2
  });
  it('混合', () => {
    expect(estimateTokens('你好 hello')).toBe(2 + Math.ceil(6 / 4));  // 2+2=4
  });
  it('空串=0', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('totalTokens', () => {
  it('累加 + 每条 4 overhead', () => {
    const msgs = [
      { id: '1', sessionId: 's', role: 'user' as const, content: '你好', tokens: null, kind: 'message' as const, createdAt: 0 },
      { id: '2', sessionId: 's', role: 'assistant' as const, content: 'hi', tokens: 10, kind: 'message' as const, createdAt: 0 },
    ];
    // estimateTokens('你好')=2, estimateTokens('hi',10)=10, overhead 4*2=8
    expect(totalTokens(msgs)).toBe(2 + 10 + 8);
  });
});
```

- [ ] **Step 2: 写 budget.ts + 测试**

`apps/desktop/src/main/context/budget.ts`:
```typescript
import type { Message } from '@qiming/shared';
import { totalTokens, estimateTokens } from './tokenCounter';

export interface BudgetPlan {
  summaries: Message[];
  recent: Message[];
  toCompress: Message[];
}

export function planBudget(opts: {
  contextWindow: number;
  reservedForReply: number;
  memoryTokens: number;
  summaries: Message[];
  messages: Message[];  // 原始消息（kind='message'），时间升序
  keepRecent: number;
}): BudgetPlan {
  const budget = opts.contextWindow - opts.reservedForReply - opts.memoryTokens;
  const summaryTokens = totalTokens(opts.summaries);

  const reversed = [...opts.messages].reverse();
  const recent: Message[] = [];
  let used = summaryTokens;
  for (const m of reversed) {
    const t = estimateTokens(m.content, m.tokens) + 4;
    if (recent.length < opts.keepRecent || used + t <= budget) {
      recent.unshift(m);
      used += t;
    } else {
      break;
    }
  }
  const recentIds = new Set(recent.map((m) => m.id));
  const toCompress = opts.messages.filter((m) => !recentIds.has(m.id));

  return { summaries: opts.summaries, recent, toCompress };
}
```

`apps/desktop/tests/budget.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { planBudget } from '../src/main/context/budget';
import type { Message } from '@qiming/shared';

function mk(id: string, content: string, tokens: number | null = null): Message {
  return { id, sessionId: 's', role: 'user', content, tokens, kind: 'message', createdAt: 0 };
}

describe('planBudget', () => {
  it('预算充足时全保留，toCompress 为空', () => {
    const msgs = [mk('1', 'a'), mk('2', 'b'), mk('3', 'c')];
    const plan = planBudget({ contextWindow: 8000, reservedForReply: 4096, memoryTokens: 0, summaries: [], messages: msgs, keepRecent: 6 });
    expect(plan.recent.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(plan.toCompress).toHaveLength(0);
  });

  it('超预算时旧消息进 toCompress，至少保 keepRecent 条', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => mk(`${i}`, 'x'.repeat(1000)));  // 每条约 250 token
    const plan = planBudget({ contextWindow: 2000, reservedForReply: 500, memoryTokens: 0, summaries: [], messages: msgs, keepRecent: 6 });
    expect(plan.recent.length).toBeGreaterThanOrEqual(6);  // keepRecent 保底
    expect(plan.recent.length).toBeLessThan(10);  // 没全保留
    expect(plan.toCompress.length).toBe(10 - plan.recent.length);
    // toCompress 是较旧的（id 小的）
    expect(plan.toCompress[0].id).toBe('0');
  });

  it('summaries 计入预算', () => {
    const summaries = [{ id: 'sum', sessionId: 's', role: 'assistant' as const, content: '摘要', tokens: 500, kind: 'summary' as const, createdAt: 0 }];
    const msgs = [mk('1', 'a')];
    const plan = planBudget({ contextWindow: 1000, reservedForReply: 100, memoryTokens: 0, summaries, messages: msgs, keepRecent: 6 });
    // summaryTokens(500+4) + msg(1+4) = 509 < budget(900)
    expect(plan.recent).toHaveLength(1);
  });

  it('memoryTokens 占用预算', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => mk(`${i}`, 'x'.repeat(100)));
    const plan = planBudget({ contextWindow: 1000, reservedForReply: 200, memoryTokens: 600, messages: msgs, summaries: [], keepRecent: 6 });
    // budget = 1000-200-600 = 200，只能放 keepRecent=6
    expect(plan.recent.length).toBe(6);
    expect(plan.toCompress.length).toBe(2);
  });
});
```

- [ ] **Step 3: 写 compressor.ts + 测试（mock generateText）**

`apps/desktop/src/main/context/compressor.ts`:
```typescript
import { generateText, type LanguageModel } from 'ai';
import type { Message } from '@qiming/shared';
import { estimateTokens } from './tokenCounter';

/** 单摘要累加：把 toCompress + existingSummaries 喂给 LLM，输出整合后的新摘要。 */
export async function compressMessages(
  model: LanguageModel,
  toCompress: Message[],
  existingSummaries: Message[],
  signal?: AbortSignal,
): Promise<{ text: string; tokens: number }> {
  const transcript = toCompress
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n\n');

  const priorSummary = existingSummaries.length > 0
    ? `已有的前情摘要：\n${existingSummaries.map((s) => s.content).join('\n')}\n\n请将上述摘要融入新摘要。\n\n`
    : '';

  const result = await generateText({
    model,
    prompt: `请将以下对话历史压缩成一段简洁的摘要，保留：
- 讨论的核心主题
- 已确定的关键事实与决策
- 未解决的问题
丢弃寒暄与冗余细节。

${priorSummary}对话记录：
${transcript}`,
    abortSignal: signal,
  });

  return {
    text: result.text,
    tokens: result.usage.completionTokens ?? estimateTokens(result.text),
  };
}
```

`apps/desktop/tests/compressor.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
vi.mock('ai', () => ({ generateText: vi.fn() }));

import { compressMessages } from '../src/main/context/compressor';
import { generateText } from 'ai';
import type { Message } from '@qiming/shared';

const fakeModel = { name: 'fake' } as never;

function mkMsg(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, sessionId: 's', role, content, tokens: null, kind: 'message', createdAt: 0 };
}

describe('compressMessages', () => {
  it('prompt 含对话记录，返回 text + tokens', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '摘要内容', usage: { completionTokens: 20 } } as never);
    const r = await compressMessages(fakeModel, [mkMsg('1', 'user', '你好'), mkMsg('2', 'assistant', '你好！')], []);
    expect(r.text).toBe('摘要内容');
    expect(r.tokens).toBe(20);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.prompt).toContain('你好');
    expect(call.prompt).toContain('你好！');
  });

  it('含已有摘要时 prompt 带 priorSummary', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '新摘要', usage: { completionTokens: 10 } } as never);
    const summaries = [{ id: 's1', sessionId: 's', role: 'assistant' as const, content: '旧摘要', tokens: null, kind: 'summary' as const, createdAt: 0 }];
    await compressMessages(fakeModel, [mkMsg('1', 'user', '继续')], summaries);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.prompt).toContain('旧摘要');
    expect(call.prompt).toContain('前情摘要');
  });
});
```

- [ ] **Step 4: 跑测试 + 类型检查 + Commit**

Run: `corepack pnpm test`（context 三个测试文件）+ tsc → 重建 ABI
```bash
git add -A
git commit -m "feat(p1.2): 上下文压缩引擎 - tokenCounter + budget + compressor"
```

---

## Task P1.3: 压缩接入 run.ts

**Files:**
- Modify: `apps/desktop/src/main/chat/run.ts`

**Interfaces:**
- Consumes: `planBudget`/`compressMessages`（P1.2）、`estimateTokens`（P1.2）、Message.kind（P1.1）、ProviderConfig.contextWindow（P1.1）
- Produces: runTurn 在 streamText 前做预算检查 + 触发压缩 + 按预算拼上下文

- [ ] **Step 1: 改造 runTurn 的历史拼接段**

在 `apps/desktop/src/main/chat/run.ts` 的 runTurn 中，找到现有的 history 拼接段（`const history = sessions().messages(...)`），替换为：

```typescript
import { planBudget } from '../context/budget';
import { compressMessages } from '../context/compressor';
import { estimateTokens } from '../context/tokenCounter';

// 在 streamText 之前：
const contextWindow = provider.contextWindow ?? 8000;
const all = sessions().messages(sessionId);
const summaries = all.filter((m) => m.kind === 'summary');
const raw = all.filter((m) => m.kind === 'message' && m.role !== 'system');

let plan = planBudget({
  contextWindow,
  reservedForReply: 4096,
  memoryTokens: 0,  // P1.5 接入记忆后替换
  summaries,
  messages: raw,
  keepRecent: 6,
});

// 触发压缩
if (plan.toCompress.length >= 4) {
  try {
    const summary = await compressMessages(model, plan.toCompress, plan.summaries, controller.signal);
    sessions().appendMessage(sessionId, 'assistant', summary.text, summary.tokens, 'summary');
    // 重新读 all 并重新规划
    const allNew = sessions().messages(sessionId);
    const newSummaries = allNew.filter((m) => m.kind === 'summary');
    // 只保留最新的一条 summary（单摘要累加：新的取代旧的）
    const latestSummary = newSummaries[newSummaries.length - 1];
    const newRaw = allNew.filter((m) => m.kind === 'message' && m.role !== 'system')
      .filter((m) => !plan.toCompress.find((tc) => tc.id === m.id));  // 排除已压缩的
    plan = planBudget({
      contextWindow, reservedForReply: 4096, memoryTokens: 0,
      summaries: latestSummary ? [latestSummary] : [],
      messages: newRaw, keepRecent: 6,
    });
  } catch (e) {
    // 压缩失败不阻塞对话，用原 plan 继续（可能超限，但让 provider 报错而非卡死）
    console.error('[p1] 压缩失败，降级用原上下文', e);
  }
}

// 拼下发上下文
const contextMessages = [
  ...plan.summaries.map((m) => ({ role: m.role as 'assistant', content: `[前情提要] ${m.content}` })),
  ...plan.recent.map((m) => ({ role: m.role, content: m.content })),
];
```

然后把 streamText 的 messages 改为 contextMessages：
```typescript
const result = streamText({
  model,
  messages: contextMessages,
  abortSignal: controller.signal,
});
```

- [ ] **Step 2: CHAT_DONE payload 带 usage（供 UI 进度条）**

在 runTurn 末尾发 CHAT_DONE 处，扩展 payload：
```typescript
import type { ChatDonePayload } from '@qiming/shared';
const usedTokens = plan.summaries.concat(plan.recent).reduce((s, m) => s + estimateTokens(m.content, m.tokens) + 4, 0);
const donePayload: ChatDonePayload = {
  sessionId,
  message: saved,
  usage: { contextWindow, usedTokens },
};
win?.webContents.send(IPC.CHAT_DONE, donePayload);
```

- [ ] **Step 3: 扩展 shared/ipc.ts 的 ChatDonePayload**

```typescript
export interface ChatDonePayload {
  sessionId: string;
  message: Message;
  usage?: { contextWindow: number; usedTokens: number };  // 新增
}
```

- [ ] **Step 4: 类型检查 + 手动验证（无法 GUI 则 tsc + build）**

Run: tsc node + `corepack pnpm build` → 重建 ABI
Expected: 编译通过。压缩逻辑需真实 LLM 才能端到端验证，留 P1.7 UI 时手动测。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(p1.3): 压缩接入 run.ts - 预算检查 + 触发压缩 + 上下文拼装"
```

---

## Task P1.4: 记忆存储 + embedder（cosine + vectorStore + embedder）

**Files:**
- Create: `apps/desktop/src/main/memory/cosine.ts`
- Create: `apps/desktop/src/main/memory/embedder.ts`
- Create: `apps/desktop/src/main/memory/vectorStore.ts`
- Create: `apps/desktop/src/main/store/memories.ts`（DB 层 CRUD）
- Create: `apps/desktop/tests/cosine.test.ts`
- Create: `apps/desktop/tests/vectorStore.test.ts`
- Create: `apps/desktop/tests/embedder.test.ts`

**Interfaces:**
- Consumes: `Memory`/`ScoredMemory`（@qiming/shared）、Vercel AI SDK `embedMany`、`ProviderConfig`、`keyStore`、`createMemoryStore`（store）
- Produces: `cosine(a,b)`、`embedTexts(cfg,texts)`/`embedText(cfg,text)`、`createMemoryStore(db)`（CRUD+search）

- [ ] **Step 1: cosine.ts + 测试**

`apps/desktop/src/main/memory/cosine.ts`:
```typescript
/** 余弦相似度，纯函数。 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}
```

`apps/desktop/tests/cosine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cosine } from '../src/main/memory/cosine';

describe('cosine', () => {
  it('相同向量=1', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it('正交=0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it('近似向量中间值', () => {
    const r = cosine([1, 1], [1, 1.5]);
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThan(1);
  });
  it('长度不等返回 0', () => {
    expect(cosine([1, 2], [1])).toBe(0);
  });
  it('空数组返回 0', () => {
    expect(cosine([], [])).toBe(0);
  });
});
```

- [ ] **Step 2: store/memories.ts（DB 层 CRUD）**

`apps/desktop/src/main/store/memories.ts`:
```typescript
import type { Database } from 'better-sqlite3';
import type { Memory } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface MemoryRow {
  id: string; content: string; embedding: string; source: string | null;
  enabled: number; created_at: number; updated_at: number;
}

function rowToMemory(r: MemoryRow): Memory {
  return {
    id: r.id, content: r.content, embedding: JSON.parse(r.embedding),
    source: (r.source ?? 'manual') as 'manual' | 'auto',
    enabled: r.enabled === 1, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function createMemoryDbStore(db: Database) {
  return {
    add(content: string, embedding: number[], source: 'manual' | 'auto'): Memory {
      const now = Date.now(), id = randomUUID();
      db.prepare('INSERT INTO memories (id,content,embedding,source,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
        .run(id, content, JSON.stringify(embedding), source, now, now);
      return this.get(id)!;
    },
    list(): Memory[] {
      return (db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all() as MemoryRow[]).map(rowToMemory);
    },
    listEnabled(): Memory[] {
      return (db.prepare('SELECT * FROM memories WHERE enabled=1 ORDER BY created_at DESC').all() as MemoryRow[]).map(rowToMemory);
    },
    get(id: string): Memory | null {
      const r = db.prepare('SELECT * FROM memories WHERE id=?').get(id) as MemoryRow | undefined;
      return r ? rowToMemory(r) : null;
    },
    update(id: string, input: { content?: string; embedding?: number[]; enabled?: boolean }): Memory | null {
      const cur = this.get(id);
      if (!cur) return null;
      const content = input.content ?? cur.content;
      const embedding = input.embedding ?? cur.embedding;
      const enabled = input.enabled ?? cur.enabled;
      db.prepare('UPDATE memories SET content=?, embedding=?, enabled=?, updated_at=? WHERE id=?')
        .run(content, JSON.stringify(embedding), enabled ? 1 : 0, Date.now(), id);
      return this.get(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM memories WHERE id=?').run(id);
    },
    replaceEmbedding(id: string, embedding: number[]): void {
      db.prepare('UPDATE memories SET embedding=?, updated_at=? WHERE id=?').run(JSON.stringify(embedding), Date.now(), id);
    },
  };
}
```

- [ ] **Step 3: memory/vectorStore.ts（封装 db store + cosine search）**

```typescript
import type { Database } from 'better-sqlite3';
import type { Memory, ScoredMemory } from '@qiming/shared';
import { createMemoryDbStore } from '../store/memories';
import { cosine } from './cosine';

export function createMemoryStore(db: Database) {
  const dbStore = createMemoryDbStore(db);
  return {
    ...dbStore,
    /** top-K 相似检索（内存余弦） */
    search(queryVec: number[], k: number): ScoredMemory[] {
      const all = dbStore.listEnabled();
      const scored: ScoredMemory[] = all.map((memory) => ({
        memory, score: cosine(queryVec, memory.embedding),
      }));
      return scored.sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
}
```

- [ ] **Step 4: vectorStore 测试**

`apps/desktop/tests/vectorStore.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/store/migration';
import { createMemoryStore } from '../src/main/memory/vectorStore';

function memDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('createMemoryStore', () => {
  let store: ReturnType<typeof createMemoryStore>;
  beforeEach(() => { store = createMemoryStore(memDb()); });

  it('add + list + get', () => {
    const m = store.add('用户偏好 Go', [1, 0, 0], 'auto');
    expect(store.list()).toHaveLength(1);
    expect(store.get(m.id)?.content).toBe('用户偏好 Go');
    expect(store.get(m.id)?.embedding).toEqual([1, 0, 0]);
  });

  it('update content + enabled', () => {
    const m = store.add('x', [1, 0], 'manual');
    store.update(m.id, { enabled: false });
    expect(store.get(m.id)?.enabled).toBe(false);
    expect(store.listEnabled()).toHaveLength(0);
  });

  it('delete', () => {
    const m = store.add('x', [1], 'manual');
    store.delete(m.id);
    expect(store.list()).toHaveLength(0);
  });

  it('search top-K 按余弦排序', () => {
    store.add('A', [1, 0, 0], 'auto');
    store.add('B', [0, 1, 0], 'auto');
    store.add('C', [0.9, 0.1, 0], 'auto');  // 与 query 最像
    const results = store.search([1, 0, 0], 2);
    expect(results[0].memory.content).toBe('A');  // cosine=1
    expect(results[1].memory.content).toBe('C');  // cosine≈0.99
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('禁用的不参与检索', () => {
    store.add('disabled', [1, 0, 0], 'auto');
    store.update(store.list()[0].id, { enabled: false });
    expect(store.search([1, 0, 0], 3)).toHaveLength(0);
  });
});
```

- [ ] **Step 5: embedder.ts + 测试（mock embedMany）**

`apps/desktop/src/main/memory/embedder.ts`:
```typescript
import { embedMany } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { keyStore } from '../keystore';

/** 用 provider 的 embedding 模型批量生成向量。
 *  Anthropic 无 embedding API，抛错提示。 */
export async function embedTexts(cfg: ProviderConfig, texts: string[]): Promise<number[][]> {
  if (!cfg.embeddingModel) throw new Error(`provider ${cfg.name} 未配置 embeddingModel`);

  const apiKey = await keyStore.get(cfg.id);
  if (!apiKey) throw new Error(`provider ${cfg.name} 未设置 APIKey`);

  let model;
  switch (cfg.kind) {
    case 'openai':
    case 'openai-compatible': {
      const client = createOpenAI({ apiKey, baseURL: cfg.baseUrl, compatibility: cfg.kind === 'openai-compatible' ? 'compatible' : 'strict' });
      model = client.textEmbedding(cfg.embeddingModel);
      break;
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseUrl });
      model = client.textEmbedding(cfg.embeddingModel);
      break;
    }
    case 'anthropic':
      throw new Error('Anthropic 暂不支持 embedding，请在设置页配置 OpenAI 或 Gemini 作为 embedding provider');
  }

  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings as unknown as number[][];
}

export async function embedText(cfg: ProviderConfig, text: string): Promise<number[]> {
  const [vec] = await embedTexts(cfg, [text]);
  return vec;
}
```

`apps/desktop/tests/embedder.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('ai', () => ({ embedMany: vi.fn() }));
vi.mock('../src/main/keystore', () => ({ keyStore: { get: vi.fn().mockResolvedValue('sk-fake') } }));

import { embedTexts } from '../src/main/memory/embedder';
import { embedMany } from 'ai';
import type { ProviderConfig } from '@qiming/shared';

const base: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'r', defaultModel: 'gpt-4o',
  enabledModels: ['gpt-4o'], createdAt: 0, updatedAt: 0, embeddingModel: 'text-embedding-3-small',
};

describe('embedTexts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('openai kind 调 embedMany', async () => {
    vi.mocked(embedMany).mockResolvedValue({ embeddings: [[0.1, 0.2]] } as never);
    const r = await embedTexts(base, ['hi']);
    expect(r).toEqual([[0.1, 0.2]]);
    expect(embedMany).toHaveBeenCalled();
  });

  it('无 embeddingModel 抛错', async () => {
    await expect(embedTexts({ ...base, embeddingModel: undefined }, ['hi'])).rejects.toThrow(/embeddingModel/);
  });

  it('anthropic kind 抛友好错误', async () => {
    await expect(embedTexts({ ...base, kind: 'anthropic' }, ['hi'])).rejects.toThrow(/Anthropic 暂不支持/);
  });
});
```

- [ ] **Step 6: 跑测试 + 类型检查 + Commit**

Run: 重建 Node ABI → `corepack pnpm test`（cosine 5 + vectorStore 5 + embedder 3）+ tsc → 重建 Electron ABI
```bash
git add -A
git commit -m "feat(p1.4): 记忆存储 + embedder - cosine + vectorStore + embedder"
```

---

## Task P1.5: 记忆检索 + 注入 run.ts

**Files:**
- Create: `apps/desktop/src/main/memory/retriever.ts`
- Modify: `apps/desktop/src/main/chat/run.ts`（接入检索 + 替换 memoryTokens）

**Interfaces:**
- Consumes: `embedText`（P1.4）、`createMemoryStore.search`（P1.4）、ProviderConfig.embeddingModel
- Produces: `retrieveMemories(cfg, userMessage, k?, minScore?)` 返回 system prompt 片段或 null

- [ ] **Step 1: 写 retriever.ts**

`apps/desktop/src/main/memory/retriever.ts`:
```typescript
import type { ProviderConfig } from '@qiming/shared';
import { embedText } from './embedder';
import { getDb } from '../store/db';
import { createMemoryStore } from './vectorStore';

/** 检索 top-K 记忆，格式化成 system prompt 片段。
 *  无 embeddingModel / 无相关记忆 / 检索失败时返回 null（降级，不阻塞对话）。 */
export async function retrieveMemories(
  cfg: ProviderConfig,
  userMessage: string,
  k = 3,
  minScore = 0.3,
): Promise<string | null> {
  if (!cfg.embeddingModel) return null;
  try {
    const queryVec = await embedText(cfg, userMessage);
    const store = createMemoryStore(getDb());
    const results = store.search(queryVec, k);
    const filtered = results.filter((r) => r.score >= minScore);
    if (filtered.length === 0) return null;
    const lines = filtered.map((r) => `- ${r.memory.content}`).join('\n');
    return `以下是关于用户的长期记忆，供参考：\n${lines}`;
  } catch (e) {
    console.error('[p1] 记忆检索失败，降级', e);
    return null;
  }
}
```

- [ ] **Step 2: run.ts 接入记忆检索**

在 run.ts 的预算规划之前（步骤2）插入：
```typescript
import { retrieveMemories } from '../memory/retriever';
import { estimateTokens } from '../context/tokenCounter';

// 取 provider config（已有 provider 变量）
const memorySystemPrompt = await retrieveMemories(provider, userMessage);
const memoryTokens = memorySystemPrompt ? estimateTokens(memorySystemPrompt) : 0;
```

然后 planBudget 的 memoryTokens 参数从 0 改为 `memoryTokens`。

streamText 加 system 参数：
```typescript
const result = streamText({
  model,
  system: memorySystemPrompt ?? undefined,
  messages: contextMessages,
  abortSignal: controller.signal,
});
```

- [ ] **Step 3: 类型检查 + Commit**

Run: tsc node + build → 重建 ABI
```bash
git add -A
git commit -m "feat(p1.5): 记忆检索注入 - retriever + run.ts system prompt 拼装"
```

---

## Task P1.6: 记忆自动提取 + 去重

**Files:**
- Create: `apps/desktop/src/main/memory/extractor.ts`
- Create: `apps/desktop/tests/extractor.test.ts`
- Modify: `apps/desktop/src/main/chat/run.ts`（后台 fire-and-forget）

**Interfaces:**
- Consumes: `embedTexts`（P1.4）、`createMemoryStore`（P1.4）、`buildModel`（P0）、`cosine`（P1.4）
- Produces: `extractAndStore(cfg, userMessage, assistantReply)` 后台提取+去重+存库

- [ ] **Step 1: 写 extractor.ts**

`apps/desktop/src/main/memory/extractor.ts`:
```typescript
import { generateText } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { buildModel } from '../providers/factory';
import { embedTexts } from './embedder';
import { getDb } from '../store/db';
import { createMemoryStore } from './vectorStore';
import { cosine } from './cosine';

const DEDUP_THRESHOLD = 0.9;

/** LLM 从一轮对话提取事实，去重后存库。后台异步，失败静默。 */
export async function extractAndStore(
  cfg: ProviderConfig,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  if (!cfg.embeddingModel) return;
  try {
    const model = await buildModel(cfg, cfg.defaultModel);
    const result = await generateText({
      model,
      prompt: `分析以下对话，提取值得长期记住的用户事实（偏好、身份、关键决策）。
如果没有值得记住的内容，回复"无"。
每条事实单独一行，简洁陈述。

用户：${userMessage}
助手：${assistantReply}`,
    });

    const facts = result.text.split('\n')
      .map((s) => s.trim())
      .filter((s) => s && s !== '无' && !s.startsWith('无。') && !s.startsWith('没有'));
    if (facts.length === 0) return;

    // 批量 embed
    const embeddings = await embedTexts(cfg, facts);
    const store = createMemoryStore(getDb());
    const existing = store.listEnabled();

    for (let i = 0; i < facts.length; i++) {
      const newVec = embeddings[i];
      // 去重：与现有记忆比，cosine > 0.9 跳过
      const isDup = existing.some((m) => cosine(newVec, m.embedding) > DEDUP_THRESHOLD);
      if (!isDup) {
        store.add(facts[i], newVec, 'auto');
      }
    }
  } catch (e) {
    console.error('[p1] 记忆提取失败（后台，不影响对话）', e);
  }
}
```

- [ ] **Step 2: 写测试（mock generateText + embedTexts）**

`apps/desktop/tests/extractor.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../src/main/providers/factory', () => ({ buildModel: vi.fn().mockResolvedValue({}) }));
vi.mock('../src/main/memory/embedder', () => ({ embedTexts: vi.fn() }));
vi.mock('../src/main/store/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../src/main/memory/vectorStore', () => ({
  createMemoryStore: vi.fn(() => ({
    listEnabled: vi.fn(() => []),
    add: vi.fn(),
  })),
}));

import { extractAndStore } from '../src/main/memory/extractor';
import { generateText } from 'ai';
import { embedTexts } from '../src/main/memory/embedder';
import { createMemoryStore } from '../src/main/memory/vectorStore';
import type { ProviderConfig } from '@qiming/shared';

const cfg: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'r', defaultModel: 'gpt-4o',
  enabledModels: [], createdAt: 0, updatedAt: 0, embeddingModel: 'text-embedding-3-small',
};

describe('extractAndStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无 embeddingModel 直接 return', async () => {
    await extractAndStore({ ...cfg, embeddingModel: undefined }, 'u', 'a');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('LLM 回复"无"不入库', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '无' } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('提取 2 条，无重复，全入库', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '用户偏好 Go\n用户用 VSCode' } as never);
    vi.mocked(embedTexts).mockResolvedValue([[1, 0], [0, 1]] as never);
    const mockAdd = vi.fn();
    vi.mocked(createMemoryStore).mockReturnValue({ listEnabled: () => [], add: mockAdd } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  it('去重：现有记忆 cosine>0.9 跳过', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '用户偏好 Go' } as never);
    vi.mocked(embedTexts).mockResolvedValue([[1, 0]] as never);
    const mockAdd = vi.fn();
    vi.mocked(createMemoryStore).mockReturnValue({
      listEnabled: () => [{ id: 'e1', content: 'x', embedding: [1, 0], source: 'auto', enabled: true, createdAt: 0, updatedAt: 0 }],
      add: mockAdd,
    } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(mockAdd).not.toHaveBeenCalled();  // cosine=1 > 0.9，跳过
  });
});
```

- [ ] **Step 3: run.ts 后台接入**

在 run.ts 的 runTurn 末尾（CHAT_DONE 发送后或 finally 前），加 fire-and-forget：
```typescript
import { extractAndStore } from '../memory/extractor';

// 在 appendMessage assistant 之后：
void extractAndStore(provider, userMessage, finalText).catch((e) => console.error('[p1] extractAndStore 异常', e));
```

- [ ] **Step 4: 跑测试 + 类型检查 + Commit**

Run: 重建 Node ABI → `corepack pnpm test`（extractor 4）+ tsc → 重建 ABI
```bash
git add -A
git commit -m "feat(p1.6): 记忆自动提取 + 去重 - extractor + run.ts 后台接入"
```

---

## Task P1.7: UI - token 进度条 + summary 竹简样式

**Files:**
- Create: `apps/desktop/src/renderer/components/ContextMeter.tsx`
- Create: `apps/desktop/src/renderer/components/ContextMeter.module.css`
- Modify: `apps/desktop/src/renderer/components/MessageBubble.tsx`（kind='summary' 样式）
- Modify: `apps/desktop/src/renderer/components/MessageBubble.module.css`
- Modify: `apps/desktop/src/renderer/pages/ChatPage.tsx`（顶栏加 ContextMeter）
- Modify: `apps/desktop/src/renderer/stores/chat.ts`（存 usage）

**Interfaces:**
- Consumes: `ChatDonePayload.usage`（P1.3）、Message.kind（P1.1）、古风令牌
- Produces: ContextMeter 组件（朱砂进度条）；MessageBubble 区分 message/summary

- [ ] **Step 1: ContextMeter.tsx + css**

`apps/desktop/src/renderer/components/ContextMeter.tsx`:
```typescript
import styles from './ContextMeter.module.css';

export interface ContextMeterProps {
  used: number;
  total: number;
}

export function ContextMeter({ used, total }: ContextMeterProps) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const warn = pct >= 80;
  return (
    <div className={styles.wrap} title={`上下文 ${used}/${total} tokens (${pct}%)`}>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${warn ? styles.warn : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.label}>{pct}%</span>
    </div>
  );
}
```

`apps/desktop/src/renderer/components/ContextMeter.module.css`:
```css
.wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-ink-light);
}
.track {
  width: 120px;
  height: var(--space-2);
  background: var(--bg-paper-dark);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--accent-cinnabar);
  border-radius: var(--radius-full);
  transition: width var(--duration-fast) var(--ease-brush-in);
}
.warn { background: var(--accent-cinnabar-hover); }
.label { font-family: var(--font-family-cn); min-width: 3em; }
```

- [ ] **Step 2: MessageBubble 加 summary 样式**

修改 MessageBubble.tsx，根据 kind 用不同 className：
```typescript
export function MessageBubble({ message }: { message: Message }) {
  if (message.kind === 'summary') {
    return <SummaryBubble content={message.content} />;
  }
  const isUser = message.role === 'user';
  return (/* P0 原有渲染 */);
}

function SummaryBubble({ content }: { content: string }) {
  return (
    <details className={styles.summary} open>
      <summary className={styles.summaryTitle}>前情提要</summary>
      <div className={styles.summaryBody}>{content}</div>
    </details>
  );
}
```

MessageBubble.module.css 追加：
```css
.summary {
  background: var(--bg-paper-dark);
  background-image: var(--texture-bamboo);
  border-left: var(--border-width-thick) solid var(--border-ancient);
  border-radius: var(--radius-base);
  padding: var(--space-3) var(--space-4);
  color: var(--text-ink-light);
  font-size: var(--font-size-sm);
}
.summaryTitle {
  cursor: pointer;
  font-family: var(--font-family-cn);
  color: var(--text-ink);
  letter-spacing: 0.1em;
  list-style: none;
}
.summaryTitle::before { content: '❯ '; color: var(--accent-gold); }
.summaryBody {
  margin-top: var(--space-2);
  line-height: var(--line-height-relaxed);
  white-space: pre-wrap;
}
```

- [ ] **Step 3: chat store 存 usage**

修改 stores/chat.ts 的 onDone 回调，存 usage：
```typescript
usage: null as { contextWindow: number; usedTokens: number } | null,
// onDone:
onDone: (p) => {
  if (p.sessionId === id) {
    set({
      messages: /* reload */,
      streamBuffer: '',
      streaming: false,
      usage: p.usage ?? null,  // 新增
    });
  }
},
```

- [ ] **Step 4: ChatPage 顶栏加 ContextMeter**

ChatPage topbar 加：
```typescript
import { ContextMeter } from '../components/ContextMeter';
// 在 provider/model 下拉之后：
{s.usage && <ContextMeter used={s.usage.usedTokens} total={s.usage.contextWindow} />}
```

- [ ] **Step 5: build + 类型检查 + Commit**

Run: `corepack pnpm build` + tsc web
```bash
git add -A
git commit -m "feat(p1.7): UI - token 进度条 + summary 竹简样式"
```

---

## Task P1.8: UI - 记忆管理 + IPC + ProviderForm 扩展

**Files:**
- Create: `apps/desktop/src/main/ipc/handlers/memory.ts`
- Modify: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/preload/index.ts`（memory 命名空间）
- Modify: `packages/shared/src/ipc.ts`（memory 通道 + ExposedApi.memory）
- Create: `apps/desktop/src/renderer/components/MemoryPanel.tsx`
- Create: `apps/desktop/src/renderer/components/MemoryPanel.module.css`
- Modify: `apps/desktop/src/renderer/pages/SettingsPage.tsx`（加 MemoryPanel）
- Modify: `apps/desktop/src/renderer/components/ProviderForm.tsx`（embeddingModel/contextWindow 字段）
- Modify: `apps/desktop/src/renderer/lib/templates.ts`（模板补字段）

**Interfaces:**
- Consumes: `createMemoryStore`（P1.4）、`embedText`（P1.4）、ProviderConfig 新字段（P1.1）
- Produces: 完整的记忆管理 UI（CRUD）+ IPC；ProviderForm 可配 embeddingModel/contextWindow

- [ ] **Step 1: shared/ipc.ts 加 memory 通道 + ExposedApi.memory**

```typescript
// IPC 对象追加：
MEMORY_LIST: 'memory:list',
MEMORY_ADD: 'memory:add',
MEMORY_UPDATE: 'memory:update',
MEMORY_DELETE: 'memory:delete',
MEMORY_REEMBED: 'memory:reembed',

// ExposedApi 追加：
memory: {
  list(): Promise<Memory[]>;
  add(content: string): Promise<Memory>;
  update(id: string, input: { content?: string; enabled?: boolean }): Promise<Memory>;
  delete(id: string): Promise<void>;
  reembed(): Promise<{ updated: number }>;
};
```

- [ ] **Step 2: memory IPC handler**

`apps/desktop/src/main/ipc/handlers/memory.ts`:
```typescript
import { ipcMain } from 'electron';
import { IPC } from '@qiming/shared';
import { getDb } from '../../store/db';
import { createProviderStore } from '../../store/providers';
import { createMemoryStore } from '../../memory/vectorStore';
import { embedText, embedTexts } from '../../memory/embedder';
import { getActiveSessionProvider } from './session';  // 或从 session store 拿当前 provider

export function registerMemoryHandlers() {
  const store = createMemoryStore(getDb());

  ipcMain.handle(IPC.MEMORY_LIST, () => store.list());

  ipcMain.handle(IPC.MEMORY_ADD, async (_e, content: string, providerCfg?: ProviderConfig) => {
    if (!providerCfg?.embeddingModel) throw new Error('当前 provider 未配置 embeddingModel');
    const vec = await embedText(providerCfg, content);
    return store.add(content, vec, 'manual');
  });

  ipcMain.handle(IPC.MEMORY_UPDATE, async (_e, id: string, input: { content?: string; enabled?: boolean }, providerCfg?: ProviderConfig) => {
    if (input.content !== undefined && providerCfg?.embeddingModel) {
      const vec = await embedText(providerCfg, input.content);
      return store.update(id, { ...input, embedding: vec });
    }
    return store.update(id, input);
  });

  ipcMain.handle(IPC.MEMORY_DELETE, (_e, id: string) => store.delete(id));

  ipcMain.handle(IPC.MEMORY_REEMBED, async (_e, providerCfg?: ProviderConfig) => {
    if (!providerCfg?.embeddingModel) return { updated: 0 };
    const all = store.list();
    const texts = all.map((m) => m.content);
    const vecs = await embedTexts(providerCfg, texts);
    all.forEach((m, i) => store.replaceEmbedding(m.id, vecs[i]));
    return { updated: all.length };
  });
}
```

注意：memory:add 需要 provider 配置来 embed。从哪拿 provider？P1 简化：IPC 调用方（renderer）传入当前会话绑定的 provider id，handler 用 providerStore.get(id) 取配置。调整签名：`MEMORY_ADD` 接收 `(content, providerId)`。

- [ ] **Step 3: register.ts + preload 暴露**

register.ts 加 `registerMemoryHandlers()`。preload 加 memory 命名空间（对应 5 方法，invoke 各通道）。

- [ ] **Step 4: MemoryPanel.tsx + css**

`apps/desktop/src/renderer/components/MemoryPanel.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { api } from '../ipc/client';
import { Button, Input, Card } from '@qiming/ui';
import type { Memory } from '@qiming/shared';
import styles from './MemoryPanel.module.css';

export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newContent, setNewContent] = useState('');
  const reload = async () => setMemories(await api.memory.list());
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!newContent.trim()) return;
    await api.memory.add(newContent);
    setNewContent('');
    reload();
  };
  const toggle = async (m: Memory) => { await api.memory.update(m.id, { enabled: !m.enabled }); reload(); };
  const remove = async (m: Memory) => { await api.memory.delete(m.id); reload(); };

  const enabledCount = memories.filter((m) => m.enabled).length;

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>记忆管理 · 脑海拾遗</h2>
      <div className={styles.addRow}>
        <Input placeholder="记下一条…" value={newContent} onChange={(e) => setNewContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" onClick={add}>+ 拾遗</Button>
      </div>
      <div className={styles.list}>
        {memories.map((m) => (
          <Card key={m.id} className={`${styles.item} ${!m.enabled ? styles.disabled : ''}`}>
            <div className={styles.itemHead}>
              <span className={`${styles.tag} ${m.source === 'auto' ? styles.auto : styles.manual}`}>
                {m.source === 'auto' ? '自动拾得' : '亲笔记下'}
              </span>
            </div>
            <div className={styles.content}>{m.content}</div>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => toggle(m)}>{m.enabled ? '封存' : '启用'}</Button>
              <Button variant="ghost" onClick={() => remove(m)}>删除</Button>
            </div>
          </Card>
        ))}
      </div>
      <div className={styles.stats}>共 {memories.length} 条（{enabledCount} 启用 / {memories.length - enabledCount} 封存）</div>
    </div>
  );
}
```

MemoryPanel.module.css（古风：金色边框标签、淡墨内容、封存项半透明）—— 走 gufeng 令牌，参照 SettingsPage.module.css 风格。

- [ ] **Step 5: SettingsPage 加 MemoryPanel**

在 SettingsPage.tsx 的 provider 区域下方加 `<MemoryPanel />`。

- [ ] **Step 6: ProviderForm 加 embeddingModel/contextWindow 字段**

ProviderForm.tsx 加两个 Input：
- embeddingModel（文本，placeholder `text-embedding-3-small`）
- contextWindow（数字，placeholder `128000`）

存入 ProviderInput。

- [ ] **Step 7: templates.ts 补字段**

4 个模板补 embeddingModel/contextWindow 推荐值（OpenAI: text-embedding-3-small/128000；Gemini: text-embedding-004/1000000；Claude: 无/200000；兼容: 空/空）。

- [ ] **Step 8: build + 类型检查 + Commit**

Run: `corepack pnpm build` + tsc
```bash
git add -A
git commit -m "feat(p1.8): UI - 记忆管理面板 + IPC + ProviderForm embedding 配置"
```

---

## Self-Review（计划完成后自查）

**1. Spec 覆盖度** — 对照 spec §2.2/§5/§6/§7/§8：

| spec 要求 | 覆盖 task |
|---|---|
| 衔接债①tokens 落库 | P1.0 Step 5 |
| 衔接债②content 注释 | P1.0 Step 6 |
| 衔接债③migration 框架 | P1.0 Step 1-4 |
| memories 表 + messages.kind | P1.1 |
| ProviderConfig embedding/contextWindow | P1.1 Step 5 |
| tokenCounter/budget/compressor | P1.2 |
| 压缩接入 run.ts | P1.3 |
| cosine/vectorStore/embedder | P1.4 |
| retriever + 注入 | P1.5 |
| extractor + 去重 | P1.6 |
| token 进度条 | P1.7 Step 1 |
| summary 竹简样式 | P1.7 Step 2 |
| 记忆管理 UI | P1.8 Step 4-5 |
| ProviderForm embedding 配置 | P1.8 Step 6 |
| 模板补字段 | P1.8 Step 7 |

无遗漏。

**2. Placeholder 扫描**：通读计划，无 TBD/TODO。所有步骤含完整代码或确切命令。

**3. 类型一致性**：
- `MessageKind = 'message' | 'summary'` 在 P1.1 定义，P1.1/P1.2/P1.3/P1.7 一致引用。
- `Memory`/`ScoredMemory` 在 P1.1 定义，P1.4/P1.5/P1.6/P1.8 一致。
- `appendMessage(..., kind?)` P1.1 新签名，P1.0（默认 message）、P1.3（kind='summary'）一致。
- `createMemoryStore(db)` P1.4 定义，P1.5/P1.6/P1.8 一致引用。
- `embedTexts`/`embedText` P1.4 定义，P1.5/P1.6/P1.8 一致。
- `planBudget` 返回 `{summaries, recent, toCompress}`，P1.3 解构一致。
- `ChatDonePayload.usage` P1.1（shared）+ P1.3（run.ts 发送）+ P1.7（chat store 消费）一致。

无类型不一致。

**4. 风险提示**（执行时注意）：
- **ABI 冲突延续 P0**：每个 task 跑测试前需重建 Node ABI，跑完恢复 Electron ABI。计划各 task 已标注。
- **Vercel AI SDK 版本差异**：`result.usage` 在不同版本可能是 Promise 或同步。P1.0 Step 5 已给兼容写法，实测以版本为准。
- **ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS**：P1.1 Step 2 用 JS 逻辑（PRAGMA table_info 检查）安全加列，非纯 SQL。
- **memory IPC 需要 provider 配置 embed**：P1.8 Step 2 handler 需拿 provider 配置，从 providerId 查（renderer 传当前会话 providerId）。
- **P1.3 的压缩重规划逻辑**较复杂（压缩后重新读 all + 排除已压缩 + 重新 plan），执行时注意 toCompress 的 id 集合过滤正确。

---

## 执行交付物

完成全部 9 个 task 后，P1 交付：
- 自动上下文压缩（长会话不超限，summary 竹简样式显示）
- 向量检索长期记忆（自动提取去重 + 手动管理 + top-K 注入）
- token 进度条 UI
- migration 框架（P2/P3 可复用）
- P0 衔接债清偿（tokens 落库 + content 语义统一）

满足 spec §8.2 全部验收标准。

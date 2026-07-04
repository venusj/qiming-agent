# P0 设计：qiming-agent 基础骨架 + 多 Provider 抽象层

- **日期**：2026-07-04
- **状态**：待评审
- **作者**：brainstorming 流程产出
- **范围**：整个 qiming-agent 项目的第一个子项目（P0）

---

## 1. 项目背景与整体规划

### 1.1 项目愿景

构建一款 **类 Codex 的跨平台可视化 AI Agent 桌面应用**，具备：

- 多厂商 LLM 接入（任意配置 URL + APIKey，可切换）
- 多会话管理与上下文自动压缩、长期记忆
- 本地全能力执行（读写文件、执行 shell、工具调用）
- MCP（Model Context Protocol）客户端 + Skill 加载

### 1.2 已确认的整体技术决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 目标平台 | Windows + macOS 桌面端（iOS 暂缓） | 用户明确优先级 |
| 桌面框架 | Electron + electron-vite | 用户选择；JS/TS 全栈 |
| 前端 | React 18 + TypeScript + Vite | 用户选择 |
| LLM 抽象 | Vercel AI SDK | 已抽象多厂商，开发最快 |
| 数据存储 | 纯本地（keytar + SQLite） | 安全、无后端依赖 |
| Agent 能力 | 本地代码执行型（全能力） | 类 Codex |
| 文档语言 | 中文（代码与变量名仍用英文） | 用户偏好 |

### 1.3 子项目分解（整个项目的路线图）

本项目是平台级应用，分解为 4 个子项目，各自走「设计→计划→实现」循环：

| 顺序 | 子项目 | 内容 | 依赖 |
|---|---|---|---|
| **P0** | 基础骨架 + 多 Provider 抽象层 | Electron 脚手架、React UI 骨架、Provider 接口与适配器、APIKey 管理、基础聊天循环 | 无 |
| **P1** | 会话与上下文管理 | 多会话切换增强、上下文自动压缩、长期记忆 | P0 |
| **P2** | 本地执行能力 + 工具系统 | 文件读写、shell 执行、权限/沙箱、tool-use 循环、MCP 客户端 | P0 |
| **P3** | Skill 加载器 + 高级 UI | Skill 注册/发现、可视化编排、流式渲染增强、diff/审批 UI | P0–P2 |

**本 spec 仅覆盖 P0。** 后续子项目在 P0 落地后各自开新一轮设计。

---

## 2. P0 范围

### 2.1 P0 目标

交付一个**能配置多厂商、能流式聊天、能多会话切换、数据本地持久化**的最小可用桌面应用。它是后续所有能力的地基。

### 2.2 P0 验收标准

**配置侧（设置页）**：

- 添加 / 编辑 / 删除 Provider，字段：name、baseUrl、apiKey、默认模型、启用模型列表
- APIKey 存入系统密钥库，UI 仅显示掩码（如 `sk-...xxxx`）
- "测试连接"按钮：发一个最小请求验证配置有效，返回成功/失败与错误信息
- 4 个预置模板：OpenAI、Anthropic Claude、Google Gemini、OpenAI 兼容（填 baseUrl）
- 国产模型只做通用 "OpenAI 兼容" 模板，不做具体厂商预置

**会话侧（聊天页）**：

- 多会话：新建 / 切换 / 重命名 / 删除
- 每个会话可独立选择 provider + 模型（顶栏下拉）
- 流式多轮对话（逐 token 输出）
- Markdown + 代码高亮渲染
- 中断生成（停止按钮）
- 消息持久化（重开应用会话与消息仍在）

### 2.3 P0 明确不做（留给后续子项目）

- ❌ 上下文自动压缩（P1）
- ❌ 长期记忆（P1）
- ❌ 文件读写 / shell 执行 / 工具调用（P2）
- ❌ MCP 客户端（P2）
- ❌ Skill 加载（P3）
- ❌ iOS（远期）

---

## 3. 整体架构

### 3.1 进程划分

```
┌─────────────────────────────────────────────────────────────┐
│                  Electron 应用（qiming-agent）                │
│                                                              │
│  ┌────────────────────────┐    IPC    ┌───────────────────┐ │
│  │   Renderer 进程 (React) │◄─────────►│  Main 进程 (Node) │ │
│  │                         │  context  │                   │ │
│  │  • 聊天 UI              │  bridge   │  • Provider 引擎   │ │
│  │  • 会话侧栏             │  -isolation│  • APIKey 加密库   │ │
│  │  • 设置面板             │           │  • SQLite 存储     │ │
│  │  • 流式渲染             │           │  • 文件/shell(P2) │ │
│  │                         │           │  • MCP 客户端(P2) │ │
│  └────────────────────────┘           └───────────────────┘ │
│                                              │                │
│                                              ▼                │
│                              ┌────────────────────────────┐  │
│                              │  外部（各厂商 API、MCP）   │  │
│                              └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**关键设计原则：进程隔离（安全第一）**

- Renderer 进程只负责展示，**永远拿不到原始 APIKey**。
- 所有"危险操作"（调用 API、读写文件、跑 shell、读密钥）都在 Main 进程。
- Renderer 通过 `contextBridge` 暴露的受限 API 调用 Main。
- IPC 不暴露任何"读取密钥明文"的接口，只暴露"测试连接""列出 provider（不含 key）"等。

### 3.2 分层架构

P0 关注前 4 层；后两层在 P1/P2 引入：

| 层 | 职责 | P0 是否实现 |
|---|---|---|
| UI 层 | React 组件 | ✅ |
| 应用层 | Renderer 侧状态管理、IPC 调用 | ✅ |
| 服务层 | Main 侧：ProviderEngine、KeyStore、SessionStore | ✅ |
| Provider 抽象层 | Vercel AI SDK + 配置适配 | ✅ |
| 执行层 | 文件/shell/工具循环 | ❌ P2 |
| 扩展层 | MCP 客户端、Skill 加载器 | ❌ P2/P3 |

### 3.3 目录结构（pnpm monorepo）

```
qiming-agent/
├── apps/
│   └── desktop/                  # Electron 主应用
│       ├── src/
│       │   ├── main/             # Main 进程（Node 侧）
│       │   │   ├── providers/    # Provider 引擎 + 适配器
│       │   │   ├── keystore/     # APIKey 加密（keytar）
│       │   │   ├── store/        # SQLite（better-sqlite3）
│       │   │   ├── chat/         # 聊天循环（streamText）
│       │   │   └── ipc/          # IPC handlers
│       │   ├── preload/          # contextBridge 暴露受限 API
│       │   └── renderer/         # Renderer 进程（React）
│       │       ├── components/   # UI 组件
│       │       ├── pages/        # 聊天页/设置页
│       │       ├── stores/       # zustand 状态
│       │       └── ipc/          # IPC 调用封装
│       ├── resources/            # 图标等
│       └── electron-builder.yml  # 打包配置
├── packages/
│   ├── shared/                   # 进程间共享的 TS 类型
│   └── ui/                       # 可复用 UI 组件库（shadcn 二次封装）
├── docs/
│   └── superpowers/specs/        # 设计文档
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 4. Provider 抽象层

P0 的核心模块。目标是让"切换厂商"变成一个配置动作，业务代码零改动。

### 4.1 数据模型（`packages/shared/types.ts`）

```typescript
/** 决定走哪个 AI SDK 适配器 */
type ProviderKind =
  | 'openai'              // 走 @ai-sdk/openai，默认 baseUrl（OpenAI 官方）
  | 'openai-compatible'   // 走 createOpenAI 但自定义 baseUrl（国产/代理/本地）
  | 'anthropic'           // 走 @ai-sdk/anthropic
  | 'google';             // 走 @ai-sdk/google

/** 一个厂商的连接配置 */
interface ProviderConfig {
  id: string;                // uuid，主键
  name: string;              // 用户起的名字，如 "我的智谱"
  kind: ProviderKind;        // 决定走哪个适配器
  baseUrl?: string;          // 可选，自定义端点（openai-compatible 必填）
  apiKeyRef: string;         // 指向 KeyStore 的引用（不存明文）
  defaultModel: string;      // 该 provider 默认模型
  enabledModels: string[];   // 启用哪些模型（下拉框候选）
  headers?: Record<string, string>; // 额外请求头（某些代理需要）
  createdAt: number;
  updatedAt: number;
}

/** 会话绑定：当前会话用哪个 provider 的哪个模型 */
interface SessionBinding {
  providerId: string;
  model: string;
}
```

**关键设计：配置与密钥分离**

`ProviderConfig` 只存 `apiKeyRef`，明文 key 在 KeyStore（加密）。运行时由 Main 进程从 KeyStore 取出注入。导出/分享配置时不会泄露密钥。

### 4.2 适配器覆盖面（首版）

| 厂商 | ProviderKind | baseUrl |
|---|---|---|
| OpenAI 官方 | `openai` | 默认 |
| DeepSeek / Kimi / 智谱 GLM / 通义 | `openai-compatible` | 用户填写 |
| 本地 Ollama / vLLM | `openai-compatible` | `http://localhost:11434/v1` 等 |
| Anthropic Claude | `anthropic` | 默认或自定义 |
| Google Gemini | `google` | 默认或自定义 |

### 4.3 工厂函数（`apps/desktop/src/main/providers/factory.ts`）

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/** 把 ProviderConfig + 模型名 转成 Vercel AI SDK 的 LanguageModel */
export function buildModel(cfg: ProviderConfig, model: string): LanguageModel {
  const apiKey = keyStore.get(cfg.apiKeyRef);  // 运行时从加密库取

  switch (cfg.kind) {
    case 'openai':
    case 'openai-compatible': {
      // compatibility:'compatible' 让 OpenAI SDK 容忍国产端点的细微差异
      const client = createOpenAI({
        apiKey,
        baseURL: cfg.baseUrl,
        compatibility: cfg.kind === 'openai-compatible' ? 'compatible' : 'strict',
      });
      return client(model);
    }
    case 'anthropic': {
      const client = createAnthropic({ apiKey, baseURL: cfg.baseUrl });
      return client(model);
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseUrl });
      return client(model);
    }
  }
}
```

### 4.4 测试连接（`apps/desktop/src/main/providers/test.ts`）

发一个最小请求（如 `streamText({ prompt: 'ping' })` + `maxOutputTokens: 1`），捕获异常并返回结构化结果：

```typescript
interface TestResult {
  ok: boolean;
  error?: { kind: 'auth' | 'network' | 'model' | 'unknown'; message: string };
  latencyMs?: number;
}
```

错误归类用于 UI 给出可操作提示（如 `auth` → "请检查 APIKey"）。

---

## 5. APIKey 与安全模型

### 5.1 密钥存储（`apps/desktop/src/main/keystore/index.ts`）

用 `keytar`（跨平台原生密钥库的 Node 绑定）：

| 平台 | 后端 |
|---|---|
| Windows | Windows Credential Manager |
| macOS | Keychain |

```typescript
import keytar from 'keytar';

const SERVICE = 'qiming-agent';

export const keyStore = {
  async set(ref: string, secret: string) {
    await keytar.setPassword(SERVICE, ref, secret);
  },
  async get(ref: string): Promise<string | null> {
    return keytar.getPassword(SERVICE, ref);
  },
  async delete(ref: string): Promise<boolean> {
    return keytar.deletePassword(SERVICE, ref);
  },
};
```

`apiKeyRef` 命名规则：`provider:<providerId>`。

### 5.2 安全边界（强制约束）

- **密钥永不进入 Renderer**：IPC 不暴露任何读 key 明文的接口。设置面板输入 key 后立即通过 IPC 存入 KeyStore，UI 仅显示掩码。
- **密钥永不进入日志**：日志打印 baseUrl/model 时自动 mask key；严禁 `console.log` 含 key 的对象。
- **密钥永不进入数据库**：`providers` 表只存 `apiKeyRef`，不存明文。
- **删除 Provider 时级联删除 KeyStore 条目**，避免密钥残留。

### 5.3 业务数据（SQLite）

`better-sqlite3`，文件位置：

- Windows：`%APPDATA%/qiming-agent/data.db`
- macOS：`~/Library/Application Support/qiming-agent/data.db`

P0 表结构（最小集）：

```sql
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT,
  api_key_ref TEXT NOT NULL,
  default_model TEXT NOT NULL,
  enabled_models TEXT,   -- JSON array
  headers TEXT,          -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  provider_id TEXT,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,        -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,     -- JSON：文本/工具调用/工具结果（P0 只有文本）
  tokens INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
```

P0 只建表与基础 CRUD；上下文压缩逻辑在 P1。

---

## 6. 聊天循环与流式 UI

### 6.1 Main 侧：流式生成 + IPC 推送

```typescript
// apps/desktop/src/main/chat/run.ts
import { streamText } from 'ai';

export async function runTurn(
  sessionId: string,
  userMessage: string,
  signal: AbortSignal,
) {
  const session = store.getSession(sessionId);
  const provider = store.getProvider(session.providerId);
  const model = providerFactory.buildModel(provider, session.model);
  const history = store.getMessages(sessionId);  // P0：全量拼接；P1：压缩

  // 存用户消息
  store.appendMessage(sessionId, 'user', userMessage);

  const result = streamText({
    model,
    messages: [...history, { role: 'user', content: userMessage }],
    abortSignal: signal,
    // P2 才加 tools / mcp
  });

  // 流式 token 通过 IPC 推给 Renderer
  for await (const delta of result.textStream) {
    mainWindow.webContents.send('chat:delta', { sessionId, delta });
  }

  const finalText = await result.text;
  store.appendMessage(sessionId, 'assistant', finalText);
}
```

### 6.2 Renderer 侧：流式渲染

- 用 `zustand` 管聊天状态：当前会话 id、消息列表、流式缓冲、是否生成中。
- 监听 `chat:delta` 事件追加到当前消息缓冲，React 自动重渲染。
- 用 `react-markdown` + `react-syntax-highlighter` 渲染 Markdown 与代码块。
- 停止按钮调用 IPC，Main 侧 `AbortController.abort()` 中断 `streamText`。

### 6.3 IPC 通道清单（P0）

| 通道 | 方向 | 用途 |
|---|---|---|
| `provider:list` | R→M | 列出所有 provider（不含 key） |
| `provider:create` / `update` / `delete` | R→M | 增删改 provider（key 单独走 setKey） |
| `provider:setKey` | R→M | 写入 APIKey 到 KeyStore |
| `provider:test` | R→M | 测试连接 |
| `session:list` / `create` / `rename` / `delete` | R→M | 会话管理 |
| `session:setBinding` | R→M | 设置会话的 provider+model |
| `chat:send` | R→M | 发送消息触发一轮生成 |
| `chat:stop` | R→M | 中断生成 |
| `chat:delta` | M→R | 推送流式 token |
| `chat:done` / `chat:error` | M→R | 一轮结束/出错 |

---

## 7. 技术选型清单

| 层 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | Electron 30+ + electron-vite | 当前最现代的 Electron 构建工具 |
| 前端 | React 18 + TypeScript + Vite | 用户选择 |
| 状态管理 | zustand | 轻量，聊天状态足够 |
| UI 组件 | shadcn/ui + Tailwind CSS | 可定制、不锁框架、风格专业 |
| Markdown | react-markdown + react-syntax-highlighter | 渲染富文本与代码 |
| LLM 抽象 | Vercel AI SDK（`ai` + `@ai-sdk/openai/anthropic/google`） | 已抽象多厂商 |
| 密钥库 | keytar | 跨平台原生密钥库 |
| 数据库 | better-sqlite3 | 同步 API、性能好、Electron 友好 |
| 包管理 | pnpm + workspace | monorepo |
| 打包分发 | electron-builder | Win/Mac 安装包 |

---

## 8. 测试策略（P0）

| 层 | 策略 |
|---|---|
| Provider 工厂 | 单测：mock keyStore，验证各 kind 产出正确的 SDK client 与 baseURL |
| 测试连接 | 单测：mock fetch，验证错误归类（auth/network/model） |
| KeyStore | 跳过单测（依赖系统密钥库），手动验证 |
| SQLite store | 单测：内存 SQLite（`:memory:`），验证 CRUD 与级联删除 |
| IPC 层 | 手动集成测试：起 Electron，验证 Renderer 能正确读写 |
| 端到端 | 手动：配置一个真实 provider，完成一轮流式对话 |

P0 不强求自动化 E2E；优先保证 store 与 provider 工厂有单测覆盖。

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `better-sqlite3` 是原生模块，Electron 需重编译 | 用 `electron-builder` 的 install-app-deps；早期跑通一次打包验证 |
| `keytar` 同样是原生模块，跨平台行为差异 | 同上；并为密钥库失败准备降级（加密文件 fallback，标为后续） |
| 国产 OpenAI 兼容端点的细微差异（工具调用字段） | P0 不做工具调用，规避；P2 引入时再处理 |
| Vercel AI SDK 版本迭代快 | 锁定主版本；抽象一层 `buildModel` 隔离 SDK 变化 |

---

## 10. P0 完成后的衔接

P0 落地后，后续子项目各自开新一轮 brainstorming + spec：

- **P1**：在 `chat/run.ts` 的 `getMessages` 处接入压缩策略；新增 `memories` 表与记忆模块。
- **P2**：在 `streamText` 的 `tools` 参数接入本地工具与 MCP 客户端；引入权限/审批 UI。
- **P3**：新增 Skill 注册中心与加载器；增强 Renderer 的可视化编排能力。

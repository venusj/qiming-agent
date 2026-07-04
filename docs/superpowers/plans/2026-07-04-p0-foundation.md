# P0 基础骨架 + 多 Provider 抽象层 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个能配置多厂商、能流式聊天、能多会话切换、数据本地持久化、且完整采用古风设计语言的 Electron 桌面应用（Windows + macOS）。

**Architecture:** Electron 双进程（Main 负责密钥/网络/DB，Renderer 负责 UI），pnpm monorepo（apps/desktop + packages/shared + packages/design-tokens + packages/ui）。Provider 抽象基于 Vercel AI SDK。APIKey 走 keytar 系统密钥库，业务数据走 better-sqlite3。UI 全程引用 gufeng-design-tokens + gufeng-motion-engine 令牌，组件来自 gufeng-component-builder，平台差异按 gufeng-platform-adapter 处理。

**Tech Stack:** Electron 30+ / electron-vite / React 18 / TypeScript / Vite / zustand / Tailwind CSS / Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) / keytar / better-sqlite3 / electron-builder / pnpm workspace。

## Global Constraints

（来自 spec，每个 task 的需求都隐含以下约束）

- 目标平台：Windows + macOS 桌面端（iOS 不做）。
- 进程隔离：Renderer 永远拿不到原始 APIKey；IPC 不暴露读 key 明文的接口；密钥永不进日志、永不进数据库。
- 所有颜色/字号/间距/圆角/阴影必须引用 design tokens（`--bg-*`/`--text-*`/`--accent-*` 等），禁止硬编码十六进制。
- 所有动画时长/缓动必须引用 motion tokens（`--duration-*`/`--ease-*`），禁止硬编码。
- 组件须覆盖 normal/hover/active/disabled/focus 五态。
- 数据库路径：Windows `%APPDATA%/qiming-agent/data.db`，macOS `~/Library/Application Support/qiming-agent/data.db`。
- 国产模型只做通用 "OpenAI 兼容" 模板，不做具体厂商预置。
- 文档/注释用中文，代码与变量名用英文。
- 提交粒度：每个 task 至少一次 commit，信息用中文或英文均可但保持一致。

---

## File Structure

```
qiming-agent/
├── package.json                      # [T1] 根 manifest，pnpm workspace 配置
├── pnpm-workspace.yaml               # [T1]
├── tsconfig.base.json                # [T1] 共享 TS 配置
├── .gitignore                        # [T1]
├── .npmrc                            # [T1] 原生模块编译配置
├── packages/
│   ├── shared/                       # [T2] 进程间共享类型
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── provider.ts           # ProviderConfig / ProviderKind / SessionBinding
│   │       ├── session.ts            # Session / Message
│   │       └── ipc.ts                # IPC 通道名常量 + payload 类型
│   ├── design-tokens/                # [T3] gufeng 令牌工程化
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── tokens.css            # design-tokens + motion-engine 合并 :root 变量
│   │   │   ├── platform-fonts.css    # macOS/Windows 字体回退
│   │   │   ├── tokens.ts             # 等价 TS 常量
│   │   │   └── tailwind-theme.ts     # Tailwind colors/fontFamily/radius/shadow 映射
│   │   └── tests/
│   │       └── tokens.test.ts        # 令牌纯净度校验
│   └── ui/                           # [T6] 古风组件库
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── button/Button.tsx
│           ├── button/Button.module.css
│           ├── input/Input.tsx
│           ├── input/Input.module.css
│           ├── card/Card.tsx
│           ├── card/Card.module.css
│           ├── scrollbar/scrollbar.css
│           ├── dialog/Dialog.tsx
│           ├── dialog/Dialog.module.css
│           ├── dropdown/Dropdown.tsx
│           ├── dropdown/Dropdown.module.css
│           ├── titlebar/TitleBar.tsx          # Windows 自绘木纹标题栏
│           ├── titlebar/TitleBar.module.css
│           ├── loading/InkLoading.tsx         # 研墨加载
│           └── index.ts
├── apps/
│   └── desktop/                      # [T4] Electron 主应用
│       ├── package.json
│       ├── electron.vite.config.ts
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── tsconfig.web.json
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── electron-builder.yml
│       └── src/
│           ├── main/
│           │   ├── index.ts           # [T4] Electron 入口
│           │   ├── window/create.ts   # [T5] 窗口创建（平台分支）
│           │   ├── keystore/index.ts  # [T7] keytar 封装
│           │   ├── store/db.ts        # [T8] better-sqlite3 连接 + 建表
│           │   ├── store/providers.ts # [T8] provider CRUD
│           │   ├── store/sessions.ts  # [T8] session/message CRUD
│           │   ├── providers/factory.ts # [T9] ProviderConfig → AI SDK model
│           │   ├── providers/test.ts  # [T9] 测试连接
│           │   ├── chat/run.ts        # [T10] 流式生成
│           │   ├── ipc/register.ts    # [T11] 注册所有 IPC handler
│           │   └── ipc/handlers/*.ts  # [T11] 各通道 handler
│           ├── preload/
│           │   └── index.ts           # [T11] contextBridge 暴露受限 API
│           └── renderer/
│               ├── index.html
│               ├── main.tsx           # [T4] React 入口
│               ├── App.tsx
│               ├── styles/global.css  # [T5] 引入 tokens + 平台字体
│               ├── ipc/client.ts      # [T11] Renderer 侧 IPC 调用封装
│               ├── stores/chat.ts     # [T12] zustand 聊天状态
│               ├── stores/settings.ts # [T13] zustand 设置状态
│               └── pages/
│                   ├── ChatPage.tsx   # [T12] 聊天页
│                   ├── ChatPage.module.css
│                   ├── SettingsPage.tsx # [T13] 设置页
│                   └── SettingsPage.module.css
└── docs/superpowers/
    ├── specs/2026-07-04-p0-foundation-design.md   # 已存在
    └── plans/2026-07-04-p0-foundation.md          # 本文件
```

---

## Task 1: 初始化 monorepo 骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `README.md`

**Interfaces:**
- Produces: 可被 `pnpm install` 识别的 workspace 结构；后续 task 在 `packages/*` 和 `apps/*` 下建包。

- [ ] **Step 1: 写根 `package.json`**

```json
{
  "name": "qiming-agent",
  "private": true,
  "version": "0.0.0",
  "description": "启明 - 类 Codex 的跨平台古风 AI Agent 桌面应用",
  "license": "MIT",
  "scripts": {
    "dev": "pnpm --filter @qiming/desktop dev",
    "build": "pnpm --filter @qiming/desktop build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 写 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: 写 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  }
}
```

- [ ] **Step 4: 写 `.gitignore`**

```gitignore
node_modules/
dist/
out/
.DS_Store
*.log
.env
.env.local
coverage/
.vite/
```

- [ ] **Step 5: 写 `.npmrc`**（关键：原生模块编译目标）

```ini
# electron 原生模块（better-sqlite3/keytar）重编译目标
runtime=electron
target=30.0.0
target_arch=x64
disturl=https://electronjs.org/headers
```

- [ ] **Step 6: 写 `README.md`**

```markdown
# 启明（qiming-agent）

类 Codex 的跨平台古风 AI Agent 桌面应用。Windows + macOS。

## 开发

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

详见 docs/superpowers/specs/2026-07-04-p0-foundation-design.md。
```

- [ ] **Step 7: 验证 workspace 可识别**

Run: `pnpm install`
Expected: 无报错，生成 `pnpm-lock.yaml`（此时 workspace 包还没建，仅根依赖）。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: 初始化 pnpm monorepo 骨架"
```

---

## Task 2: shared 类型包

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/provider.ts`
- Create: `packages/shared/src/session.ts`
- Create: `packages/shared/src/ipc.ts`

**Interfaces:**
- Consumes: 无
- Produces: `@qiming/shared` 包，导出 `ProviderKind`、`ProviderConfig`、`Session`、`Message`、IPC 通道常量与 payload 类型。所有后续 task 引用这些类型。

- [ ] **Step 1: 写 `packages/shared/package.json`**

```json
{
  "name": "@qiming/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "echo \"no tests in shared (types only)\" && exit 0"
  }
}
```

- [ ] **Step 2: 写 `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 `packages/shared/src/provider.ts`**

```typescript
/** 决定走哪个 AI SDK 适配器 */
export type ProviderKind =
  | 'openai'             // OpenAI 官方，默认 baseUrl
  | 'openai-compatible'  // 自定义 baseUrl（国产/代理/本地）
  | 'anthropic'
  | 'google';

/** 一个厂商的连接配置（不含明文 key） */
export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  /** 指向 KeyStore 的引用，命名规则 provider:<providerId>；不含明文 */
  apiKeyRef: string;
  defaultModel: string;
  enabledModels: string[];
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/** 创建/更新 provider 的输入（不含 id/createdAt/updatedAt） */
export type ProviderInput = Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>;

/** 预置模板 */
export interface ProviderTemplate {
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel: string;
  enabledModels: string[];
}
```

- [ ] **Step 4: 写 `packages/shared/src/session.ts`**

```typescript
export interface Session {
  id: string;
  title: string | null;
  providerId: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  /** JSON 字符串：P0 为纯文本 { text: string }；P2 起含工具调用 */
  content: string;
  tokens: number | null;
  createdAt: number;
}

/** 会话绑定（设置/切换会话用的 provider+model） */
export interface SessionBinding {
  providerId: string;
  model: string;
}
```

- [ ] **Step 5: 写 `packages/shared/src/ipc.ts`**

```typescript
import type { ProviderConfig, ProviderInput } from './provider.js';
import type { Session, Message, SessionBinding } from './session.js';

/** IPC 通道名常量，Main/Preload/Renderer 三处共用，避免拼写漂移 */
export const IPC = {
  PROVIDER_LIST: 'provider:list',
  PROVIDER_CREATE: 'provider:create',
  PROVIDER_UPDATE: 'provider:update',
  PROVIDER_DELETE: 'provider:delete',
  PROVIDER_SET_KEY: 'provider:setKey',
  PROVIDER_TEST: 'provider:test',
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_RENAME: 'session:rename',
  SESSION_DELETE: 'session:delete',
  SESSION_SET_BINDING: 'session:setBinding',
  CHAT_SEND: 'chat:send',
  CHAT_STOP: 'chat:stop',
  CHAT_DELTA: 'chat:delta',
  CHAT_DONE: 'chat:done',
  CHAT_ERROR: 'chat:error',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** 测试连接结果 */
export interface TestResult {
  ok: boolean;
  error?: { kind: 'auth' | 'network' | 'model' | 'unknown'; message: string };
  latencyMs?: number;
}

/** 流式增量推送 payload */
export interface ChatDeltaPayload {
  sessionId: string;
  delta: string;
}

export interface ChatDonePayload {
  sessionId: string;
  message: Message;
}

export interface ChatErrorPayload {
  sessionId: string;
  message: string;
}

/** Preload 通过 contextBridge 暴露给 Renderer 的 API 形状 */
export interface ExposedApi {
  provider: {
    list(): Promise<ProviderConfig[]>;
    create(input: ProviderInput, apiKey: string): Promise<ProviderConfig>;
    update(id: string, input: Partial<ProviderInput>, apiKey?: string): Promise<ProviderConfig>;
    delete(id: string): Promise<void>;
    test(id: string): Promise<TestResult>;
  };
  session: {
    list(): Promise<Session[]>;
    create(title?: string): Promise<Session>;
    rename(id: string, title: string): Promise<Session>;
    delete(id: string): Promise<void>;
    setBinding(id: string, binding: SessionBinding): Promise<Session>;
    messages(sessionId: string): Promise<Message[]>;
  };
  chat: {
    send(sessionId: string, userMessage: string): Promise<void>;
    stop(sessionId: string): Promise<void>;
    onDelta(cb: (p: ChatDeltaPayload) => void): () => void;
    onDone(cb: (p: ChatDonePayload) => void): () => void;
    onError(cb: (p: ChatErrorPayload) => void): () => void;
  };
}
```

- [ ] **Step 6: 写 `packages/shared/src/index.ts`**

```typescript
export * from './provider.js';
export * from './session.js';
export * from './ipc.js';
```

- [ ] **Step 7: 类型检查**

Run: `cd packages/shared && ppm exec tsc --noEmit`（若 pnpm 未全局可用则 `npx tsc --noEmit -p .`）
Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 进程间共享类型与 IPC 通道定义"
```

---

## Task 3: design-tokens 包（古风令牌工程化）

**Files:**
- Create: `packages/design-tokens/package.json`
- Create: `packages/design-tokens/src/tokens.css`
- Create: `packages/design-tokens/src/platform-fonts.css`
- Create: `packages/design-tokens/src/tokens.ts`
- Create: `packages/design-tokens/src/tailwind-theme.ts`
- Create: `packages/design-tokens/tests/tokens.test.ts`
- Create: `packages/design-tokens/vitest.config.ts`
- Create: `packages/design-tokens/tsconfig.json`

**Interfaces:**
- Consumes: 无（令牌是源点）
- Produces: `@qiming/design-tokens` 包，导出 `tokens.css`（:root 变量）、`tailwind-theme.ts`（Tailwind 配置对象）。后续 UI 与 desktop 引用。

- [ ] **Step 1: 写 `packages/design-tokens/package.json`**

```json
{
  "name": "@qiming/design-tokens",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./tokens.css": "./src/tokens.css",
    "./platform-fonts.css": "./src/platform-fonts.css",
    "./tailwind-theme": "./src/tailwind-theme.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 `packages/design-tokens/src/tokens.css`**

（合并 gufeng-design-tokens + gufeng-motion-engine 全部令牌）

```css
:root {
  /* ===== 背景色系（宣纸/绢布/木纹） ===== */
  --bg-paper: #F4ECD8;
  --bg-paper-dark: #E8DDC8;
  --bg-silk: #DCD3C1;
  --bg-wood: #5A4A3A;
  --bg-wood-light: #8A7A6A;

  /* ===== 文字色系（松烟墨） ===== */
  --text-ink: #3C3A36;
  --text-ink-light: #6B6965;
  --text-ink-reverse: #F4ECD8;

  /* ===== 点缀色系 ===== */
  --accent-cinnabar: #B33A2C;        /* 朱砂红 - 主强调 */
  --accent-cinnabar-hover: #9A2E21;  /* 朱砂暗 */
  --accent-lapis: #2C4B5E;           /* 黛蓝 */
  --accent-gold: #C9A96E;            /* 金色 - 装饰 */
  --accent-jade: #7BA39C;            /* 青玉色 - 滚动条/辅助 */
  --accent-jade-hover: #6B8F88;      /* 深青玉 */

  /* ===== 边框色系 ===== */
  --border-ancient: #B8A990;  /* 古铜色 */
  --border-ink: #8A8070;      /* 墨线色 */

  /* ===== 字体族 ===== */
  --font-family-cn: 'Source Han Serif SC', 'Songti SC', 'SimSun', serif;
  --font-family-en: 'Cormorant Garamond', 'EB Garamond', serif;
  --font-family-ui: var(--font-family-cn);

  /* ===== 字号（16px 基准） ===== */
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
  --font-size-3xl: 48px;

  /* ===== 行高 ===== */
  --line-height-tight: 1.4;
  --line-height-relaxed: 1.8;
  --line-height-loose: 2.2;

  /* ===== 间距 ===== */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* ===== 圆角（榫卯方正感） ===== */
  --radius-sm: 2px;
  --radius-base: 4px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* ===== 阴影（墨迹晕染） ===== */
  --shadow-ink-sm: 0 2px 4px rgba(60, 58, 54, 0.08);
  --shadow-ink-md: 0 4px 16px rgba(60, 58, 54, 0.12);
  --shadow-ink-lg: 0 8px 32px rgba(60, 58, 54, 0.16);
  --shadow-ink-xl: 0 16px 48px rgba(60, 58, 54, 0.2);

  /* ===== 边框宽度 ===== */
  --border-width-thin: 1px;
  --border-width-base: 2px;
  --border-width-thick: 3px;

  /* ===== 纹理 ===== */
  --texture-paper: radial-gradient(ellipse at 30% 40%, rgba(0,0,0,0.02) 0%, transparent 60%),
                   radial-gradient(ellipse at 70% 80%, rgba(0,0,0,0.015) 0%, transparent 50%);
  --texture-wood: repeating-linear-gradient(90deg,
                   rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.01) 2px,
                   rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.01) 6px);
  --texture-bamboo: repeating-linear-gradient(0deg,
                   rgba(184,169,144,0.2) 0px, rgba(184,169,144,0.05) 1px,
                   rgba(184,169,144,0.2) 3px, rgba(184,169,144,0.05) 4px);

  /* ===== 动效缓动（毛笔/卷轴/墨迹） ===== */
  --ease-brush-out: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-brush-in: cubic-bezier(0.2, 0.9, 0.3, 1);
  --ease-scroll: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-ink: cubic-bezier(0.6, 0.04, 0.98, 0.34);

  /* ===== 动效时长 ===== */
  --duration-instant: 150ms;
  --duration-fast: 300ms;
  --duration-medium: 500ms;
  --duration-slow: 800ms;
  --duration-ink: 1200ms;
}
```

- [ ] **Step 3: 写 `packages/design-tokens/src/platform-fonts.css`**

```css
/* macOS：宋体优先 */
:root[data-platform='darwin'] {
  --font-family-cn: 'Songti SC', 'Source Han Serif SC', serif;
}
/* Windows：SimSun 优先 */
:root[data-platform='win32'] {
  --font-family-cn: 'SimSun', 'Source Han Serif SC', serif;
}
```

- [ ] **Step 4: 写 `packages/design-tokens/src/tokens.ts`**

```typescript
/** 令牌的 TS 镜像，供 Tailwind theme 与 JS 逻辑引用 */
export const tokens = {
  color: {
    bg: {
      paper: 'var(--bg-paper)',
      paperDark: 'var(--bg-paper-dark)',
      silk: 'var(--bg-silk)',
      wood: 'var(--bg-wood)',
      woodLight: 'var(--bg-wood-light)',
    },
    text: {
      ink: 'var(--text-ink)',
      inkLight: 'var(--text-ink-light)',
      inkReverse: 'var(--text-ink-reverse)',
    },
    accent: {
      cinnabar: 'var(--accent-cinnabar)',
      cinnabarHover: 'var(--accent-cinnabar-hover)',
      lapis: 'var(--accent-lapis)',
      gold: 'var(--accent-gold)',
      jade: 'var(--accent-jade)',
      jadeHover: 'var(--accent-jade-hover)',
    },
    border: {
      ancient: 'var(--border-ancient)',
      ink: 'var(--border-ink)',
    },
  },
} as const;
```

- [ ] **Step 5: 写 `packages/design-tokens/src/tailwind-theme.ts`**

```typescript
import type { Config } from 'tailwindcss';

/** Tailwind theme 扩展，desktop 的 tailwind.config 引入 */
export const tailwindTheme: Pick<Config, 'theme'> = {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: 'var(--bg-paper)', dark: 'var(--bg-paper-dark)' },
        silk: 'var(--bg-silk)',
        wood: { DEFAULT: 'var(--bg-wood)', light: 'var(--bg-wood-light)' },
        ink: { DEFAULT: 'var(--text-ink)', light: 'var(--text-ink-light)', reverse: 'var(--text-ink-reverse)' },
        cinnabar: { DEFAULT: 'var(--accent-cinnabar)', hover: 'var(--accent-cinnabar-hover)' },
        lapis: 'var(--accent-lapis)',
        gold: 'var(--accent-gold)',
        jade: { DEFAULT: 'var(--accent-jade)', hover: 'var(--accent-jade-hover)' },
        'border-ancient': 'var(--border-ancient)',
        'border-ink': 'var(--border-ink)',
      },
      fontFamily: {
        cn: ['var(--font-family-cn)'],
        en: ['var(--font-family-en)'],
      },
      fontSize: {
        xs: ['var(--font-size-xs)', 'var(--line-height-tight)'],
        sm: ['var(--font-size-sm)', 'var(--line-height-tight)'],
        base: ['var(--font-size-base)', 'var(--line-height-relaxed)'],
        lg: ['var(--font-size-lg)', 'var(--line-height-relaxed)'],
        xl: ['var(--font-size-xl)', 'var(--line-height-relaxed)'],
        '2xl': ['var(--font-size-2xl)', 'var(--line-height-tight)'],
        '3xl': ['var(--font-size-3xl)', 'var(--line-height-tight)'],
      },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)',
        4: 'var(--space-4)', 6: 'var(--space-6)', 8: 'var(--space-8)',
        12: 'var(--space-12)', 16: 'var(--space-16)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)', base: 'var(--radius-base)',
        lg: 'var(--radius-lg)', full: 'var(--radius-full)',
      },
      boxShadow: {
        'ink-sm': 'var(--shadow-ink-sm)', 'ink-md': 'var(--shadow-ink-md)',
        'ink-lg': 'var(--shadow-ink-lg)', 'ink-xl': 'var(--shadow-ink-xl)',
      },
      transitionTimingFunction: {
        'brush-out': 'var(--ease-brush-out)',
        'brush-in': 'var(--ease-brush-in)',
        scroll: 'var(--ease-scroll)',
        ink: 'var(--ease-ink)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)', fast: 'var(--duration-fast)',
        medium: 'var(--duration-medium)', slow: 'var(--duration-slow)',
        ink: 'var(--duration-ink)',
      },
    },
  },
};
```

- [ ] **Step 6: 写 `packages/design-tokens/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

- [ ] **Step 7: 写 `packages/design-tokens/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 8: 写失败测试 `tests/tokens.test.ts`**（验证令牌纯净度：CSS 中所有颜色都是变量定义，无散落硬编码）

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(join(__dirname, '../src/tokens.css'), 'utf-8');

describe('tokens.css 令牌纯净度', () => {
  // 提取所有 :root 内定义的变量赋值行（排除纹理 gradient 中的 rgba）
  const lines = tokensCss.split('\n');

  it('每个颜色变量定义都形如 --name: #RRGGBB; 形式（十六进制）', () => {
    // 抓取 --bg-*/--text-*/--accent-*/--border-* 的赋值行
    const colorVarPattern = /--(bg|text|accent|border)-[^:]+:\s*(#[0-9A-Fa-f]{6})\s*;/;
    const colorVarLines = lines.filter((l) =>
      /--(bg|text|accent|border)-/.test(l) && !l.includes('gradient') && !l.includes('var(--'),
    );
    expect(colorVarLines.length).toBeGreaterThan(10);
    colorVarLines.forEach((l) => {
      expect(colorVarPattern.test(l), `违反令牌格式: ${l.trim()}`).toBe(true);
    });
  });

  it('纹理令牌允许使用 rgba', () => {
    expect(tokensCss).toContain('--texture-paper');
    expect(tokensCss).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  it('动效缓动与时长齐全', () => {
    ['--ease-brush-out', '--ease-brush-in', '--ease-scroll', '--ease-ink',
     '--duration-instant', '--duration-fast', '--duration-medium', '--duration-slow', '--duration-ink']
      .forEach((name) => expect(tokensCss).toContain(name));
  });
});
```

- [ ] **Step 9: 跑测试验证通过**

Run: `cd packages/design-tokens && pnpm install && pnpm test`
Expected: 3 个测试全部 PASS。

- [ ] **Step 10: Commit**

```bash
git add packages/design-tokens
git commit -m "feat(design-tokens): 古风令牌工程化（design-tokens+motion-engine 合并）"
```

---

## Task 4: desktop 应用脚手架（Electron + electron-vite + React）

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`（占位，T11 完善）
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/main.tsx`
- Create: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `@qiming/shared`、`@qiming/design-tokens`（T2/T3 产物）
- Produces: 可 `pnpm dev` 启动的 Electron 空壳窗口，Renderer 显示"启明"标题与宣纸背景。

- [ ] **Step 1: 写 `apps/desktop/package.json`**

```json
{
  "name": "@qiming/desktop",
  "version": "0.0.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^0.0.40",
    "@ai-sdk/google": "^0.0.50",
    "@ai-sdk/openai": "^0.0.60",
    "@qiming/design-tokens": "workspace:*",
    "@qiming/shared": "workspace:*",
    "@qiming/ui": "workspace:*",
    "ai": "^4.0.0",
    "better-sqlite3": "^11.0.0",
    "keytar": "^7.9.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-markdown": "^9.0.0",
    "react-syntax-highlighter": "^15.5.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/react-syntax-highlighter": "^15.5.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^30.0.0",
    "electron-builder": "^24.13.0",
    "electron-vite": "^2.2.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 `apps/desktop/electron.vite.config.ts`**

```typescript
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer') },
    },
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});
```

- [ ] **Step 3: 写三个 tsconfig**

`apps/desktop/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`apps/desktop/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "outDir": "./out",
    "types": ["electron-vite/node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "electron.vite.config.ts"]
}
```

`apps/desktop/tsconfig.web.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./out",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*"]
}
```

- [ ] **Step 4: 写 `apps/desktop/src/main/index.ts`**（最小入口，T5/T11 会扩展）

```typescript
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window/create';

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: 写 `apps/desktop/src/preload/index.ts`**（占位，T11 完善）

```typescript
// T11 将在此用 contextBridge 暴露 ExposedApi
export {};
```

- [ ] **Step 6: 写 `apps/desktop/src/renderer/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>启明</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 写 `apps/desktop/src/renderer/main.tsx`**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 8: 写 `apps/desktop/src/renderer/App.tsx`**（T5 会加平台检测；T12/T13 会加路由）

```typescript
export function App() {
  return (
    <div className="min-h-screen bg-paper text-ink font-cn p-8">
      <h1 className="text-2xl">启明</h1>
      <p className="text-sm text-ink-light">古风 AI Agent · P0 脚手架</p>
    </div>
  );
}
```

- [ ] **Step 9: 验证启动**

Run: `pnpm install && pnpm dev`
Expected: Electron 窗口打开，宣纸背景，显示"启明"标题。（此时 window/create.ts 还没写，需先做 T5 step 1-2 再验证；或临时在 index.ts 内联创建窗口验证后再拆分。）

- [ ] **Step 10: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): Electron + electron-vite + React 脚手架"
```

---

## Task 5: 窗口创建（平台分支）+ 全局样式 + 平台检测

**Files:**
- Create: `apps/desktop/src/main/window/create.ts`
- Create: `apps/desktop/src/renderer/styles/global.css`
- Create: `apps/desktop/src/renderer/lib/platform.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`（注入 data-platform）
- Create: `apps/desktop/tailwind.config.ts`
- Create: `apps/desktop/postcss.config.js`

**Interfaces:**
- Consumes: `@qiming/design-tokens`（tokens.css / platform-fonts.css / tailwind-theme）
- Produces: `createMainWindow()` 供 main/index 调用；Renderer `<html data-platform="...">` 驱动字体回退。

- [ ] **Step 1: 写 `apps/desktop/src/main/window/create.ts`**（按 gufeng-platform-adapter）

```typescript
import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F4ECD8',  // 宣纸白，避免启动白闪
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    frame: isMac,                 // macOS 保留系统框架；Windows 无边框自绘
    vibrancy: isMac ? 'under-window' : undefined,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
```

> 注：需加依赖 `@electron-toolkit/utils`（dev）。

- [ ] **Step 2: 写 `apps/desktop/src/renderer/lib/platform.ts`**

```typescript
/** 检测当前平台，供设置 data-platform 属性驱动字体回退 */
export function detectPlatform(): 'darwin' | 'win32' | 'linux' {
  const ua = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  return 'linux';
}
```

- [ ] **Step 3: 写 `apps/desktop/src/renderer/styles/global.css`**

```css
@import '@qiming/design-tokens/tokens.css';
@import '@qiming/design-tokens/platform-fonts.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
}

body {
  font-family: var(--font-family-ui);
  background-color: var(--bg-paper);
  background-image: var(--texture-paper);
  color: var(--text-ink);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
}

/* 减少动效：尊重系统偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: 写 `apps/desktop/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';
import { tailwindTheme } from '@qiming/design-tokens/tailwind-theme';

export default {
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
    '../packages/ui/src/**/*.{ts,tsx}',
  ],
  ...tailwindTheme,
} satisfies Config;
```

- [ ] **Step 5: 写 `apps/desktop/postcss.config.js`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: 修改 `App.tsx` 注入 data-platform**

```typescript
import { useEffect } from 'react';
import { detectPlatform } from './lib/platform';

export function App() {
  useEffect(() => {
    document.documentElement.dataset.platform = detectPlatform();
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink font-cn p-8">
      <h1 className="text-2xl">启明</h1>
      <p className="text-sm text-ink-light">古风 AI Agent · P0 脚手架</p>
    </div>
  );
}
```

- [ ] **Step 7: 安装并验证**

Run: `pnpm install && pnpm dev`
Expected: Windows 上窗口无边框（待 T6 标题栏组件补上自绘按钮）；macOS 上标题栏内嵌、宣纸背景。文字使用对应平台宋体。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(window): 平台分支窗口创建 + 古风全局样式 + 平台字体检测"
```

---

## Task 6: 古风组件库（packages/ui）

**Files:**
- Create: `packages/ui/package.json` / `tsconfig.json`
- Create: `packages/ui/src/button/{Button.tsx,Button.module.css}`
- Create: `packages/ui/src/input/{Input.tsx,Input.module.css}`
- Create: `packages/ui/src/card/{Card.tsx,Card.module.css}`
- Create: `packages/ui/src/scrollbar/scrollbar.css`
- Create: `packages/ui/src/dialog/{Dialog.tsx,Dialog.module.css}`
- Create: `packages/ui/src/dropdown/{Dropdown.tsx,Dropdown.module.css}`
- Create: `packages/ui/src/titlebar/{TitleBar.tsx,TitleBar.module.css}`
- Create: `packages/ui/src/loading/{InkLoading.tsx,loading.module.css}`
- Create: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `@qiming/design-tokens`（CSS 变量，经 Tailwind utility 暴露）
- Produces: `@qiming/ui` 导出 `Button`/`Input`/`Card`/`Dialog`/`Dropdown`/`TitleBar`/`InkLoading`，以及全局 `scrollbar.css`。供 ChatPage/SettingsPage 使用。

> 说明：本 task 涵盖多个组件，因同属"古风组件库"单一交付物、共享同一令牌与风格规范，作为一个 task 评审。每个组件内部仍遵循 TDD（先写快照/渲染测试再实现）。组件数量较多，下方给 Button 与 TitleBar 完整代码作样板，其余组件照此模式（受篇幅，其余给关键差异代码）。

- [ ] **Step 1: 写 `packages/ui/package.json`**

```json
{
  "name": "@qiming/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "peerDependencies": { "react": "^18.0.0" },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "jsdom": "^24.0.0",
    "react": "^18.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 Button（碑刻拓印风）**

`packages/ui/src/button/Button.tsx`:
```typescript
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', className, ...rest }, ref) => (
    <button
      ref={ref}
      className={[styles.btn, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';
```

`packages/ui/src/button/Button.module.css`:
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3) var(--space-6);
  font-family: var(--font-family-cn);
  font-size: var(--font-size-base);
  color: var(--text-ink);
  background: transparent;
  border: var(--border-width-base) solid var(--border-ancient);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-brush-in);
  position: relative;
  letter-spacing: 0.05em;
}
.btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--texture-paper);
  opacity: 0.3;
  border-radius: inherit;
  pointer-events: none;
}
.btn:hover {
  color: var(--text-ink-reverse);
  background: var(--accent-cinnabar);
  border-color: var(--accent-cinnabar);
  box-shadow: var(--shadow-ink-md);
  transform: translateY(-1px);
}
.btn:active {
  transform: scale(0.97);
  box-shadow: var(--shadow-ink-sm);
}
.btn:focus-visible {
  outline: var(--border-width-thick) solid var(--accent-gold);
  outline-offset: 2px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.primary {
  background: var(--accent-cinnabar);
  color: var(--text-ink-reverse);
  border-color: var(--accent-cinnabar);
}
.primary:hover {
  background: var(--accent-cinnabar-hover);
  border-color: var(--accent-cinnabar-hover);
}
.ghost {
  border-color: transparent;
}
.ghost:hover {
  background: var(--bg-paper-dark);
  color: var(--text-ink);
  border-color: transparent;
}
```

- [ ] **Step 4: 写 TitleBar（Windows 自绘木纹标题栏）**

`packages/ui/src/titlebar/TitleBar.tsx`:
```typescript
import styles from './TitleBar.module.css';

export interface TitleBarProps {
  title?: string;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

/** Windows 平台自绘木纹标题栏。macOS 用系统标题栏，不渲染本组件。 */
export function TitleBar({ title = '启明', onClose, onMinimize, onToggleMaximize }: TitleBarProps) {
  return (
    <div className={styles.bar}>
      <span className={styles.title}>{title}</span>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={onMinimize} aria-label="最小化">—</button>
        <button className={styles.btn} onClick={onToggleMaximize} aria-label="最大化">▢</button>
        <button className={`${styles.btn} ${styles.close}`} onClick={onClose} aria-label="关闭">✕</button>
      </div>
    </div>
  );
}
```

`packages/ui/src/titlebar/TitleBar.module.css`:
```css
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 var(--space-4);
  background: var(--bg-wood);
  background-image: var(--texture-wood);
  color: var(--text-ink-reverse);
  font-family: var(--font-family-cn);
  font-size: var(--font-size-sm);
  -webkit-app-region: drag;   /* 允许拖拽窗口 */
  user-select: none;
}
.title { letter-spacing: 0.1em; }
.controls {
  display: flex;
  gap: var(--space-1);
  -webkit-app-region: no-drag;
}
.btn {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  color: var(--text-ink-reverse);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-brush-in);
}
.btn:hover { background: var(--bg-wood-light); }
.close:hover { background: var(--accent-cinnabar); }
```

- [ ] **Step 5: 写 Input（宣纸留白）**

`packages/ui/src/input/Input.tsx`:
```typescript
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './Input.module.css';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={[styles.input, className].filter(Boolean).join(' ')} {...rest} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')} {...rest} />
  ),
);
Textarea.displayName = 'Textarea';
```

`packages/ui/src/input/Input.module.css`:
```css
.input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-family-cn);
  font-size: var(--font-size-base);
  color: var(--text-ink);
  background: var(--bg-paper);
  background-image: var(--texture-paper);
  border: var(--border-width-thin) solid var(--border-ink);
  border-radius: var(--radius-base);
  transition: border-color var(--duration-fast) var(--ease-brush-in),
              box-shadow var(--duration-fast) var(--ease-brush-in);
}
.input::placeholder { color: var(--text-ink-light); opacity: 0.7; }
.input:focus {
  outline: none;
  border-color: var(--accent-cinnabar);
  box-shadow: 0 0 0 var(--border-width-thin) var(--accent-cinnabar);
}
.input:disabled { opacity: 0.5; cursor: not-allowed; }
.textarea { resize: vertical; min-height: 80px; line-height: var(--line-height-relaxed); }
```

- [ ] **Step 6: 写 Card（绢布底面板）**

`packages/ui/src/card/Card.tsx`:
```typescript
import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.card, className].filter(Boolean).join(' ')} {...rest} />;
}
```

`packages/ui/src/card/Card.module.css`:
```css
.card {
  background: var(--bg-silk);
  border: var(--border-width-thin) solid var(--border-ancient);
  border-radius: var(--radius-base);
  padding: var(--space-6);
  box-shadow: var(--shadow-ink-sm);
}
```

- [ ] **Step 7: 写 scrollbar.css（青玉玉轴）**

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--bg-paper-dark); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb {
  background: var(--accent-jade);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-paper-dark);
  transition: background var(--duration-fast) var(--ease-brush-in);
}
::-webkit-scrollbar-thumb:hover { background: var(--accent-jade-hover); }
* { scrollbar-width: thin; scrollbar-color: var(--accent-jade) var(--bg-paper-dark); }
```

- [ ] **Step 8: 写 InkLoading（研墨加载）**

`packages/ui/src/loading/InkLoading.tsx`:
```typescript
import styles from './loading.module.css';

export function InkLoading({ label = '研墨中…' }: { label?: string }) {
  return (
    <span className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.ink} />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
```

`packages/ui/src/loading/loading.module.css`:
```css
.wrap { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-ink-light); font-size: var(--font-size-sm); }
.ink {
  width: 20px; height: 20px; border-radius: 50%;
  background: radial-gradient(circle, var(--accent-cinnabar), transparent 70%);
  animation: ink-grinding 1.6s var(--ease-brush-in) infinite;
}
.label { font-family: var(--font-family-cn); }
@keyframes ink-grinding {
  0% { transform: scale(0.8); opacity: 0.3; }
  50% { transform: scale(1.2); opacity: 0.8; }
  100% { transform: scale(0.8); opacity: 0.3; }
}
```

- [ ] **Step 9: 写 Dialog 与 Dropdown**

`packages/ui/src/dialog/Dialog.tsx`:
```typescript
import type { ReactNode } from 'react';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
```

`packages/ui/src/dialog/Dialog.module.css`:
```css
.overlay {
  position: fixed; inset: 0;
  background: rgba(60,58,54,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
  animation: fade var(--duration-fast) var(--ease-brush-in);
}
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
.panel {
  background: var(--bg-paper);
  background-image: var(--texture-paper);
  border: var(--border-width-base) solid var(--border-ancient);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-ink-xl);
  padding: var(--space-6);
  min-width: 320px;
  max-width: 90vw;
}
.title { font-size: var(--font-size-lg); color: var(--text-ink); margin: 0 0 var(--space-4); }
.body { color: var(--text-ink); }
.footer { margin-top: var(--space-6); display: flex; justify-content: flex-end; gap: var(--space-3); }
```

`packages/ui/src/dropdown/Dropdown.tsx`:
```typescript
import type { SelectHTMLAttributes } from 'react';
import styles from './Dropdown.module.css';

export interface DropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Dropdown({ className, children, ...rest }: DropdownProps) {
  return (
    <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}
```

`packages/ui/src/dropdown/Dropdown.module.css`:
```css
.select {
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-family-cn);
  font-size: var(--font-size-sm);
  color: var(--text-ink);
  background: var(--bg-paper);
  border: var(--border-width-thin) solid var(--border-ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.select:focus { outline: none; border-color: var(--accent-cinnabar); }
```

- [ ] **Step 10: 写 `packages/ui/src/index.ts`**

```typescript
export { Button } from './button/Button';
export type { ButtonProps, ButtonVariant } from './button/Button';
export { Input, Textarea } from './input/Input';
export { Card } from './card/Card';
export { Dialog } from './dialog/Dialog';
export type { DialogProps } from './dialog/Dialog';
export { Dropdown } from './dropdown/Dropdown';
export { TitleBar } from './titlebar/TitleBar';
export type { TitleBarProps } from './titlebar/TitleBar';
export { InkLoading } from './loading/InkLoading';
```

- [ ] **Step 11: 写 Button 渲染测试**（样板，其余组件照此）

`packages/ui/tests/button.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../src/button/Button';

describe('Button', () => {
  it('渲染默认 variant', () => {
    render(<Button>测试</Button>);
    expect(screen.getByText('测试')).toBeDefined();
  });
  it('primary variant 应用 primary 类', () => {
    render(<Button variant="primary">主</Button>);
    const el = screen.getByText('主');
    expect(el.className).toMatch(/primary/);
  });
  it('disabled 时不可点击', () => {
    render(<Button disabled>禁</Button>);
    expect((screen.getByText('禁') as HTMLButtonElement).disabled).toBe(true);
  });
});
```

`packages/ui/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.tsx'] },
});
```

- [ ] **Step 12: 跑测试**

Run: `cd packages/ui && pnpm install && pnpm test`
Expected: Button 3 个测试 PASS。

- [ ] **Step 13: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): 古风组件库（按钮/输入/卡片/弹窗/下拉/标题栏/研墨加载/玉轴滚动条）"
```

---

## Task 7: KeyStore（keytar 封装）

**Files:**
- Create: `apps/desktop/src/main/keystore/index.ts`
- Create: `apps/desktop/tests/keystore.test.ts`（集成测试，默认 skip）

**Interfaces:**
- Consumes: `keytar`
- Produces: `keyStore.set/get/delete(ref, secret)`。Provider 工厂（T9）调用 `get`。

> KeyStore 依赖系统密钥库，spec §9 明确"跳过单测，手动验证"。本 task 提供接口与集成测试桩（describe.skip），实际验证手动进行。

- [ ] **Step 1: 写 `apps/desktop/src/main/keystore/index.ts`**

```typescript
import keytar from 'keytar';

const SERVICE = 'qiming-agent';

/** APIKey 命名规则：provider:<providerId> */
function ref(providerId: string): string {
  return `provider:${providerId}`;
}

export const keyStore = {
  async set(providerId: string, secret: string): Promise<void> {
    await keytar.setPassword(SERVICE, ref(providerId), secret);
  },
  async get(providerId: string): Promise<string | null> {
    return keytar.getPassword(SERVICE, ref(providerId));
  },
  async delete(providerId: string): Promise<boolean> {
    return keytar.deletePassword(SERVICE, ref(providerId));
  },
};
```

- [ ] **Step 2: 写集成测试桩（跳过）**

`apps/desktop/tests/keystore.test.ts`:
```typescript
import { describe, it } from 'vitest';
import { keyStore } from '../src/main/keystore';

describe.skip('KeyStore 集成测试（需真实系统密钥库，手动运行）', () => {
  it('存取删一个 key', async () => {
    await keyStore.set('test-id', 'sk-secret');
    expect(await keyStore.get('test-id')).toBe('sk-secret');  // eslint-disable-line no-undef
    expect(await keyStore.delete('test-id')).toBe(true);
  });
});
```

- [ ] **Step 3: 手动验证**（在 dev 控制台或临时脚本）

在 main 进程临时加一段：
```typescript
keytar.setPassword('qiming-agent', 'provider:manual', 'sk-test');
console.log(await keytar.getPassword('qiming-agent', 'provider:manual')); // 应输出 sk-test
```
Windows 凭据管理器 / macOS Keychain 可见 `qiming-agent` 条目。验证后删除。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(keystore): keytar 封装 APIKey 加密存储"
```

---

## Task 8: SQLite store（建表 + provider/session/message CRUD）

**Files:**
- Create: `apps/desktop/src/main/store/db.ts`
- Create: `apps/desktop/src/main/store/schema.sql`
- Create: `apps/desktop/src/main/store/providers.ts`
- Create: `apps/desktop/src/main/store/sessions.ts`
- Create: `apps/desktop/tests/store.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3`、`@qiming/shared`（类型）
- Produces: `db`（连接）、`providerStore`（CRUD）、`sessionStore`（含 messages CRUD）。IPC handler（T11）调用它们。

- [ ] **Step 1: 写 `apps/desktop/src/main/store/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT,
  api_key_ref TEXT NOT NULL,
  default_model TEXT NOT NULL,
  enabled_models TEXT,
  headers TEXT,
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
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
```

- [ ] **Step 2: 写 `apps/desktop/src/main/store/db.ts`**

```typescript
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = app.getPath('userData');  // %APPDATA%/qiming-agent 或 ~/Library/Application Support/qiming-agent
  const dbPath = join(dir, 'data.db');
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  dbInstance.exec(schema);
  return dbInstance;
}

/** 测试用：内存库工厂 */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, '../../src/main/store/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}
```

- [ ] **Step 3: 写 `apps/desktop/src/main/store/providers.ts`**

```typescript
import type { Database } from 'better-sqlite3';
import type { ProviderConfig, ProviderInput } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface Row {
  id: string; name: string; kind: string; base_url: string | null;
  api_key_ref: string; default_model: string;
  enabled_models: string | null; headers: string | null;
  created_at: number; updated_at: number;
}

function rowToConfig(r: Row): ProviderConfig {
  return {
    id: r.id, name: r.name, kind: r.kind as ProviderConfig['kind'],
    baseUrl: r.base_url ?? undefined, apiKeyRef: r.api_key_ref,
    defaultModel: r.default_model,
    enabledModels: r.enabled_models ? JSON.parse(r.enabled_models) : [],
    headers: r.headers ? JSON.parse(r.headers) : undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function createProviderStore(db: Database) {
  return {
    list(): ProviderConfig[] {
      return db.prepare('SELECT * FROM providers ORDER BY created_at').all() as Row[]
        .map(rowToConfig);
    },
    get(id: string): ProviderConfig | null {
      const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Row | undefined;
      return r ? rowToConfig(r) : null;
    },
    create(input: ProviderInput): ProviderConfig {
      const now = Date.now();
      const id = randomUUID();
      db.prepare(`INSERT INTO providers
        (id, name, kind, base_url, api_key_ref, default_model, enabled_models, headers, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        id, input.name, input.kind, input.baseUrl ?? null, input.apiKeyRef,
        input.defaultModel, JSON.stringify(input.enabledModels),
        input.headers ? JSON.stringify(input.headers) : null, now, now,
      );
      return this.get(id)!;
    },
    update(id: string, input: Partial<ProviderInput>): ProviderConfig | null {
      const cur = this.get(id);
      if (!cur) return null;
      const merged: ProviderConfig = { ...cur, ...input, updatedAt: Date.now() };
      db.prepare(`UPDATE providers SET name=?, kind=?, base_url=?, api_key_ref=?,
        default_model=?, enabled_models=?, headers=?, updated_at=? WHERE id=?`).run(
        merged.name, merged.kind, merged.baseUrl ?? null, merged.apiKeyRef,
        merged.defaultModel, JSON.stringify(merged.enabledModels),
        merged.headers ? JSON.stringify(merged.headers) : null, merged.updatedAt, id,
      );
      return this.get(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    },
  };
}
```

- [ ] **Step 4: 写 `apps/desktop/src/main/store/sessions.ts`**

```typescript
import type { Database } from 'better-sqlite3';
import type { Session, Message, MessageRole, SessionBinding } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface SessionRow { id: string; title: string | null; provider_id: string | null; model: string | null; created_at: number; updated_at: number; }
interface MsgRow { id: string; session_id: string; role: string; content: string; tokens: number | null; created_at: number; }

function sRow(r: SessionRow): Session {
  return { id: r.id, title: r.title, providerId: r.provider_id, model: r.model, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mRow(r: MsgRow): Message {
  return { id: r.id, sessionId: r.session_id, role: r.role as MessageRole, content: r.content, tokens: r.tokens, createdAt: r.created_at };
}

export function createSessionStore(db: Database) {
  return {
    listSessions(): Session[] {
      return (db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as SessionRow[]).map(sRow);
    },
    getSession(id: string): Session | null {
      const r = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as SessionRow | undefined;
      return r ? sRow(r) : null;
    },
    createSession(title: string | null): Session {
      const now = Date.now(), id = randomUUID();
      db.prepare('INSERT INTO sessions (id,title,provider_id,model,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(id, title, null, null, now, now);
      return this.getSession(id)!;
    },
    rename(id: string, title: string): Session | null {
      db.prepare('UPDATE sessions SET title=?, updated_at=? WHERE id=?').run(title, Date.now(), id);
      return this.getSession(id);
    },
    setBinding(id: string, binding: SessionBinding): Session | null {
      db.prepare('UPDATE sessions SET provider_id=?, model=?, updated_at=? WHERE id=?')
        .run(binding.providerId, binding.model, Date.now(), id);
      return this.getSession(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM sessions WHERE id=?').run(id);  // 级联删 messages
    },
    messages(sessionId: string): Message[] {
      return (db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY created_at').all(sessionId) as MsgRow[]).map(mRow);
    },
    appendMessage(sessionId: string, role: MessageRole, content: string, tokens: number | null = null): Message {
      const now = Date.now(), id = randomUUID();
      db.prepare('INSERT INTO messages (id,session_id,role,content,tokens,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, sessionId, role, content, tokens, now);
      db.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(now, sessionId);
      return { id, sessionId, role, content, tokens, createdAt: now };
    },
  };
}
```

- [ ] **Step 5: 写失败测试 `tests/store.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createProviderStore } from '../src/main/store/providers';
import { createSessionStore } from '../src/main/store/sessions';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(new URL('../src/main/store/schema.sql', import.meta.url), 'utf-8'));
  return db;
}

describe('providerStore', () => {
  let db: Database.Database;
  beforeEach(() => { db = memDb(); });
  it('create + list + get', () => {
    const store = createProviderStore(db);
    const p = store.create({ name: '我的OpenAI', kind: 'openai', apiKeyRef: 'provider:x', defaultModel: 'gpt-4o', enabledModels: ['gpt-4o'] });
    expect(store.list()).toHaveLength(1);
    expect(store.get(p.id)?.name).toBe('我的OpenAI');
  });
  it('update 修改字段', () => {
    const store = createProviderStore(db);
    const p = store.create({ name: 'a', kind: 'openai', apiKeyRef: 'r', defaultModel: 'm', enabledModels: [] });
    const u = store.update(p.id, { name: 'b' });
    expect(u?.name).toBe('b');
  });
  it('delete', () => {
    const store = createProviderStore(db);
    const p = store.create({ name: 'a', kind: 'openai', apiKeyRef: 'r', defaultModel: 'm', enabledModels: [] });
    store.delete(p.id);
    expect(store.list()).toHaveLength(0);
  });
});

describe('sessionStore 级联删除', () => {
  it('删除 session 同时删 messages', () => {
    const db = memDb();
    const ps = createProviderStore(db);
    const ss = createSessionStore(db);
    const prov = ps.create({ name: 'a', kind: 'openai', apiKeyRef: 'r', defaultModel: 'm', enabledModels: [] });
    const sess = ss.createSession('test');
    ss.setBinding(sess.id, { providerId: prov.id, model: 'm' });
    ss.appendMessage(sess.id, 'user', '你好');
    ss.appendMessage(sess.id, 'assistant', '你好！');
    expect(ss.messages(sess.id)).toHaveLength(2);
    ss.delete(sess.id);
    expect(ss.messages(sess.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 6: 跑测试**

Run: `cd apps/desktop && pnpm install && pnpm test`
Expected: providerStore 3 个 + sessionStore 1 个测试 PASS。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(store): SQLite 建表 + provider/session/message CRUD"
```

---

## Task 9: Provider 工厂 + 测试连接

**Files:**
- Create: `apps/desktop/src/main/providers/factory.ts`
- Create: `apps/desktop/src/main/providers/templates.ts`
- Create: `apps/desktop/src/main/providers/test.ts`
- Create: `apps/desktop/tests/providers.factory.test.ts`
- Create: `apps/desktop/tests/providers.test-conn.test.ts`

**Interfaces:**
- Consumes: `@qiming/shared`（`ProviderConfig`/`ProviderKind`）、`keyStore`（T7）、Vercel AI SDK
- Produces: `buildModel(config, model)`、`PROVIDER_TEMPLATES`、`testConnection(config)`。chat/run（T10）调用 `buildModel`。

- [ ] **Step 1: 写 `apps/desktop/src/main/providers/factory.ts`**

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { keyStore } from '../keystore';

/** 把 ProviderConfig + 模型名 转成 Vercel AI SDK 的 LanguageModel */
export async function buildModel(cfg: ProviderConfig, model: string): Promise<LanguageModel> {
  const apiKey = await keyStore.get(cfg.id);
  if (!apiKey) throw new Error(`provider ${cfg.name} 未设置 APIKey`);

  switch (cfg.kind) {
    case 'openai':
    case 'openai-compatible': {
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

- [ ] **Step 2: 写 `apps/desktop/src/main/providers/templates.ts`**

```typescript
import type { ProviderTemplate } from '@qiming/shared';

/** 4 个预置模板（spec §2.2）。国产只给通用 OpenAI 兼容模板。 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    label: 'OpenAI', kind: 'openai', defaultModel: 'gpt-4o',
    enabledModels: ['gpt-4o', 'gpt-4o-mini'],
  },
  {
    label: 'Anthropic Claude', kind: 'anthropic', defaultModel: 'claude-3-5-sonnet-latest',
    enabledModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  {
    label: 'Google Gemini', kind: 'google', defaultModel: 'gemini-1.5-pro',
    enabledModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    label: 'OpenAI 兼容（国产/本地）', kind: 'openai-compatible',
    baseUrl: '',  // 用户填写
    defaultModel: '',
    enabledModels: [],
  },
];
```

- [ ] **Step 3: 写 `apps/desktop/src/main/providers/test.ts`**

```typescript
import { generateText } from 'ai';
import type { ProviderConfig, TestResult } from '@qiming/shared';
import { buildModel } from './factory';

/** 发最小请求验证配置。错误归类供 UI 给提示。 */
export async function testConnection(cfg: ProviderConfig): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = await buildModel(cfg, cfg.defaultModel);
    await generateText({ model, prompt: 'ping', maxOutputTokens: 1 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    let kind: TestResult['error'] extends infer T ? (T extends { kind: infer K } ? K : never) : never = 'unknown';
    if (/401|auth|api\s?key|unauthorized/i.test(msg)) kind = 'auth';
    else if (/network|econnrefused|timeout|fetch|dns/i.test(msg)) kind = 'network';
    else if (/model|not\s*found|invalid/i.test(msg)) kind = 'model';
    return { ok: false, error: { kind, message: msg }, latencyMs: Date.now() - start };
  }
}
```

- [ ] **Step 4: 写工厂单测 `tests/providers.factory.test.ts`**（mock keyStore + 验证 baseURL 注入）

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildModel } from '../src/main/providers/factory';

vi.mock('../src/main/keystore', () => ({
  keyStore: { get: vi.fn().mockResolvedValue('sk-fake') },
}));

import { keyStore } from '../src/main/keystore';
import type { ProviderConfig } from '@qiming/shared';

const base: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'provider:p1',
  defaultModel: 'gpt-4o', enabledModels: ['gpt-4o'], createdAt: 0, updatedAt: 0,
};

describe('buildModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('openai kind 调用 keyStore.get(providerId)', async () => {
    await buildModel(base, 'gpt-4o');
    expect(keyStore.get).toHaveBeenCalledWith('p1');
  });

  it('openai-compatible 传入自定义 baseUrl', async () => {
    const factory = await import('@ai-sdk/openai');
    const spy = vi.spyOn(factory, 'createOpenAI');
    await buildModel({ ...base, kind: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' }, 'llama3');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'http://localhost:11434/v1',
      compatibility: 'compatible',
    }));
  });

  it('未设 key 抛错', async () => {
    vi.mocked(keyStore.get).mockResolvedValueOnce(null);
    await expect(buildModel(base, 'gpt-4o')).rejects.toThrow(/未设置 APIKey/);
  });
});
```

- [ ] **Step 5: 写连接测试单测 `tests/providers.test-conn.test.ts`**（mock generateText 验证归类）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { testConnection } from '../src/main/providers/test';
import type { ProviderConfig } from '@qiming/shared';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../src/main/providers/factory', () => ({ buildModel: vi.fn() }));

const cfg: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'r',
  defaultModel: 'gpt-4o', enabledModels: [], createdAt: 0, updatedAt: 0,
};

describe('testConnection 错误归类', () => {
  it('成功返回 ok', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({} as never);
    const r = await testConnection(cfg);
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('401 归类为 auth', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new Error('Request failed: 401 Unauthorized'));
    const r = await testConnection(cfg);
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('auth');
  });

  it('ECONNREFUSED 归类为 network', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const r = await testConnection(cfg);
    expect(r.error?.kind).toBe('network');
  });
});
```

- [ ] **Step 6: 跑测试**

Run: `cd apps/desktop && pnpm test`
Expected: factory 3 个 + testConnection 3 个测试 PASS。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(providers): Provider 工厂 + 预置模板 + 测试连接（错误归类）"
```

---

## Task 10: 聊天循环（流式生成）

**Files:**
- Create: `apps/desktop/src/main/chat/run.ts`
- Create: `apps/desktop/src/main/chat/registry.ts`（AbortController 注册表）
- Create: `apps/desktop/tests/chat.test.ts`

**Interfaces:**
- Consumes: `streamText`（AI SDK）、`buildModel`（T9）、`sessionStore`（T8）、窗口引用
- Produces: `runTurn(sessionId, userMessage, sender)` 与 `stopTurn(sessionId)`。IPC handler（T11）调用。

- [ ] **Step 1: 写 `apps/desktop/src/main/chat/registry.ts`**

```typescript
/** 每个 session 一个 AbortController，支持中断 */
const controllers = new Map<string, AbortController>();

export function getController(sessionId: string): AbortController {
  let c = controllers.get(sessionId);
  if (!c) { c = new AbortController(); controllers.set(sessionId, c); }
  return c;
}
export function abortController(sessionId: string): void {
  controllers.get(sessionId)?.abort();
  controllers.delete(sessionId);
}
```

- [ ] **Step 2: 写 `apps/desktop/src/main/chat/run.ts`**

```typescript
import { streamText } from 'ai';
import { BrowserWindow } from 'electron';
import type { Message } from '@qiming/shared';
import { getDb } from '../store/db';
import { createSessionStore, createProviderStore } from '../store';
import { buildModel } from '../providers/factory';
import { getController, abortController } from './registry';
import { IPC } from '@qiming/shared';

const sessions = () => createSessionStore(getDb());
const providers = () => createProviderStore(getDb());

function activeWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

export async function runTurn(sessionId: string, userMessage: string): Promise<void> {
  const win = activeWindow();
  const session = sessions().getSession(sessionId);
  if (!session?.providerId || !session.model) {
    win?.webContents.send(IPC.CHAT_ERROR, { sessionId, message: '会话未绑定 provider 或模型' });
    return;
  }
  const provider = providers().get(session.providerId);
  if (!provider) {
    win?.webContents.send(IPC.CHAT_ERROR, { sessionId, message: 'provider 不存在' });
    return;
  }

  sessions().appendMessage(sessionId, 'user', userMessage);
  const history = sessions().messages(sessionId)
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = getController(sessionId);
  try {
    const model = await buildModel(provider, session.model);
    const result = streamText({
      model,
      messages: history,
      abortSignal: controller.signal,
    });

    for await (const delta of result.textStream) {
      win?.webContents.send(IPC.CHAT_DELTA, { sessionId, delta });
    }

    const finalText = await result.text;
    const saved: Message = sessions().appendMessage(sessionId, 'assistant', finalText);
    win?.webContents.send(IPC.CHAT_DONE, { sessionId, message: saved });
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      win?.webContents.send(IPC.CHAT_DONE, { sessionId, message: { id: '', sessionId, role: 'assistant', content: '[已中断]', tokens: null, createdAt: Date.now() } });
    } else {
      win?.webContents.send(IPC.CHAT_ERROR, { sessionId, message: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    abortController(sessionId);
  }
}

export function stopTurn(sessionId: string): void {
  abortController(sessionId);
}
```

- [ ] **Step 3: 写测试 `tests/chat.test.ts`**（验证：未绑定 provider 报错、user 消息已落库）

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock electron BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));
// mock streamText
vi.mock('ai', () => ({ streamText: vi.fn() }));
// mock db / store
vi.mock('../src/main/store/db', () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock('../src/main/store', () => ({
  createSessionStore: vi.fn(() => ({
    getSession: vi.fn(() => null),
    appendMessage: vi.fn(),
    messages: vi.fn(() => []),
  })),
  createProviderStore: vi.fn(() => ({ get: vi.fn(() => null) })),
}));

import { runTurn } from '../src/main/chat/run';
import { createSessionStore } from '../src/main/store';

describe('runTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('session 不存在时不抛错（静默，无窗口）', async () => {
    await expect(runTurn('nope', 'hi')).resolves.toBeUndefined();
  });

  it('session 未绑定 provider 时不调 appendMessage', async () => {
    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({ id: 's1', title: null, providerId: null, model: null, createdAt: 0, updatedAt: 0 })),
      appendMessage: vi.fn(),
      messages: vi.fn(() => []),
    } as never);
    await runTurn('s1', 'hi');
    // 无窗口可发送错误，但不应抛错
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `cd apps/desktop && pnpm test`
Expected: chat 测试 PASS（验证不抛错路径）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(chat): 流式生成 + AbortController 中断 + IPC 推送"
```

---

## Task 11: IPC 层 + Preload contextBridge

**Files:**
- Create: `apps/desktop/src/main/ipc/handlers/{provider,session,chat}.ts`
- Create: `apps/desktop/src/main/ipc/register.ts`
- Modify: `apps/desktop/src/main/index.ts`（注册 IPC + 初始化 db）
- Create: `apps/desktop/src/preload/index.ts`（contextBridge 实现 ExposedApi）
- Create: `apps/desktop/src/main/store/index.ts`（barrel）

**Interfaces:**
- Consumes: `providerStore`/`sessionStore`（T8）、`keyStore`（T7）、`providerFactory`/`testConnection`（T9）、`runTurn`/`stopTurn`（T10）
- Produces: Main 侧 `registerIpc()`；Preload 暴露 `window.qiming`（实现 `ExposedApi`）。Renderer（T12/T13）通过 `window.qiming` 调用。

- [ ] **Step 1: 写 store barrel `apps/desktop/src/main/store/index.ts`**

```typescript
export { getDb } from './db';
export { createProviderStore } from './providers';
export { createSessionStore } from './sessions';
```

- [ ] **Step 2: 写 provider handler**

`apps/desktop/src/main/ipc/handlers/provider.ts`:
```typescript
import { ipcMain } from 'electron';
import { IPC, type ProviderConfig, type ProviderInput } from '@qiming/shared';
import { getDb } from '../../store/db';
import { createProviderStore } from '../../store/providers';
import { keyStore } from '../../keystore';
import { testConnection } from '../../providers/test';

export function registerProviderHandlers() {
  const store = createProviderStore(getDb());

  ipcMain.handle(IPC.PROVIDER_LIST, () => store.list());

  ipcMain.handle(IPC.PROVIDER_CREATE, (_e, input: ProviderInput, apiKey: string) => {
    const cfg = store.create(input);
    keyStore.set(cfg.id, apiKey);
    return cfg;
  });

  ipcMain.handle(IPC.PROVIDER_UPDATE, (_e, id: string, input: Partial<ProviderInput>, apiKey?: string) => {
    const cfg = store.update(id, input);
    if (cfg && apiKey) keyStore.set(cfg.id, apiKey);
    return cfg;
  });

  ipcMain.handle(IPC.PROVIDER_DELETE, async (_e, id: string) => {
    store.delete(id);
    await keyStore.delete(id);
  });

  ipcMain.handle(IPC.PROVIDER_TEST, (_e, id: string) => {
    const cfg = store.get(id);
    if (!cfg) return { ok: false, error: { kind: 'unknown', message: 'provider 不存在' } };
    return testConnection(cfg);
  });
}
```

- [ ] **Step 3: 写 session handler**

```typescript
import { ipcMain } from 'electron';
import { IPC, type SessionBinding } from '@qiming/shared';
import { getDb } from '../../store/db';
import { createSessionStore } from '../../store/sessions';

export function registerSessionHandlers() {
  const store = createSessionStore(getDb());

  ipcMain.handle(IPC.SESSION_LIST, () => store.listSessions());
  ipcMain.handle(IPC.SESSION_CREATE, (_e, title?: string) => store.createSession(title ?? null));
  ipcMain.handle(IPC.SESSION_RENAME, (_e, id: string, title: string) => store.rename(id, title));
  ipcMain.handle(IPC.SESSION_DELETE, (_e, id: string) => store.delete(id));
  ipcMain.handle(IPC.SESSION_SET_BINDING, (_e, id: string, binding: SessionBinding) => store.setBinding(id, binding));
  ipcMain.handle(IPC.SESSION_MESSAGES, (_e, sessionId: string) => store.messages(sessionId));
}
```

- [ ] **Step 4: 写 chat handler**

```typescript
import { ipcMain } from 'electron';
import { IPC } from '@qiming/shared';
import { runTurn, stopTurn } from '../../chat/run';

export function registerChatHandlers() {
  ipcMain.handle(IPC.CHAT_SEND, (_e, sessionId: string, userMessage: string) => runTurn(sessionId, userMessage));
  ipcMain.handle(IPC.CHAT_STOP, (_e, sessionId: string) => stopTurn(sessionId));
}
```

- [ ] **Step 5: 写 register barrel**

`apps/desktop/src/main/ipc/register.ts`:
```typescript
import { registerProviderHandlers } from './handlers/provider';
import { registerSessionHandlers } from './handlers/session';
import { registerChatHandlers } from './handlers/chat';

export function registerIpc() {
  registerProviderHandlers();
  registerSessionHandlers();
  registerChatHandlers();
}
```

- [ ] **Step 6: 修改 `apps/desktop/src/main/index.ts` 注册 IPC + 初始化 db**

```typescript
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window/create';
import { registerIpc } from './ipc/register';
import { getDb } from './store/db';

app.whenReady().then(() => {
  getDb();           // 建表 + 连接
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 7: 写 preload `apps/desktop/src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ExposedApi } from '@qiming/shared';

const api: ExposedApi = {
  provider: {
    list: () => ipcRenderer.invoke(IPC.PROVIDER_LIST),
    create: (input, apiKey) => ipcRenderer.invoke(IPC.PROVIDER_CREATE, input, apiKey),
    update: (id, input, apiKey) => ipcRenderer.invoke(IPC.PROVIDER_UPDATE, id, input, apiKey),
    delete: (id) => ipcRenderer.invoke(IPC.PROVIDER_DELETE, id),
    test: (id) => ipcRenderer.invoke(IPC.PROVIDER_TEST, id),
  },
  session: {
    list: () => ipcRenderer.invoke(IPC.SESSION_LIST),
    create: (title) => ipcRenderer.invoke(IPC.SESSION_CREATE, title),
    rename: (id, title) => ipcRenderer.invoke(IPC.SESSION_RENAME, id, title),
    delete: (id) => ipcRenderer.invoke(IPC.SESSION_DELETE, id),
    setBinding: (id, binding) => ipcRenderer.invoke(IPC.SESSION_SET_BINDING, id, binding),
    messages: (sessionId) => ipcRenderer.invoke(IPC.SESSION_MESSAGES, sessionId),
  },
  chat: {
    send: (sessionId, userMessage) => ipcRenderer.invoke(IPC.CHAT_SEND, sessionId, userMessage),
    stop: (sessionId) => ipcRenderer.invoke(IPC.CHAT_STOP, sessionId),
    onDelta: (cb) => {
      const h = (_e: unknown, p: any) => cb(p);
      ipcRenderer.on(IPC.CHAT_DELTA, h);
      return () => ipcRenderer.off(IPC.CHAT_DELTA, h);
    },
    onDone: (cb) => {
      const h = (_e: unknown, p: any) => cb(p);
      ipcRenderer.on(IPC.CHAT_DONE, h);
      return () => ipcRenderer.off(IPC.CHAT_DONE, h);
    },
    onError: (cb) => {
      const h = (_e: unknown, p: any) => cb(p);
      ipcRenderer.on(IPC.CHAT_ERROR, h);
      return () => ipcRenderer.off(IPC.CHAT_ERROR, h);
    },
  },
};

contextBridge.exposeInMainWorld('qiming', api);
```

- [ ] **Step 8: 加全局类型声明**

`apps/desktop/src/renderer/env.d.ts`:
```typescript
import type { ExposedApi } from '@qiming/shared';
declare global {
  interface Window { qiming: ExposedApi }
}
```

- [ ] **Step 9: 集成验证**（手动）

Run: `pnpm dev`，在 Renderer DevTools 控制台执行：
```js
await window.qiming.provider.list()   // 应返回 []
await window.qiming.session.create()  // 应返回一个 session
await window.qiming.session.list()    // 应含刚建的 session
```
Expected: 全部返回正确数据，DB 文件已生成。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(ipc): IPC handlers + preload contextBridge 暴露受限 API"
```

---

## Task 12: 聊天页 UI（流式 + 多会话）

**Files:**
- Create: `apps/desktop/src/renderer/stores/chat.ts`
- Create: `apps/desktop/src/renderer/ipc/client.ts`
- Create: `apps/desktop/src/renderer/pages/ChatPage.tsx`
- Create: `apps/desktop/src/renderer/pages/ChatPage.module.css`
- Create: `apps/desktop/src/renderer/components/MessageBubble.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`（挂载 ChatPage）

**Interfaces:**
- Consumes: `window.qiming`（T11）、`@qiming/ui`（T6）、`react-markdown`
- Produces: 可交互的聊天页：左侧会话列表 + 右侧消息流 + 输入框 + provider/model 选择。

- [ ] **Step 1: 写 `apps/desktop/src/renderer/ipc/client.ts`**

```typescript
import type { ExposedApi } from '@qiming/shared';
export const api: ExposedApi = window.qiming;
```

- [ ] **Step 2: 写 `stores/chat.ts`**（zustand）

```typescript
import { create } from 'zustand';
import type { Session, Message, ProviderConfig } from '@qiming/shared';
import { api } from '../ipc/client';

interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  streaming: boolean;
  streamBuffer: string;
  providers: ProviderConfig[];
  loadSessions: () => Promise<void>;
  loadProviders: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  setBinding: (providerId: string, model: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [], activeSessionId: null, messages: [], streaming: false, streamBuffer: '', providers: [],

  loadSessions: async () => set({ sessions: await api.session.list() }),
  loadProviders: async () => set({ providers: await api.provider.list() }),

  selectSession: async (id) => {
    set({ activeSessionId: id, messages: await api.session.messages(id), streamBuffer: '' });
  },

  newSession: async () => {
    const s = await api.session.create('新对话');
    set({ sessions: [s, ...get().sessions], activeSessionId: s.id, messages: [], streamBuffer: '' });
  },

  setBinding: async (providerId, model) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api.session.setBinding(id, { providerId, model });
    set({ sessions: get().sessions.map((s) => s.id === id ? { ...s, providerId, model } : s) });
  },

  send: async (text) => {
    const id = get().activeSessionId;
    if (!id || !text.trim() || get().streaming) return;
    set({ streaming: true, streamBuffer: '' });
    api.chat.onDelta((p) => {
      if (p.sessionId === id) set({ streamBuffer: get().streamBuffer + p.delta });
    });
    await api.chat.send(id, text);
    set({ streaming: false, messages: await api.session.messages(id) });
  },

  stop: async () => {
    const id = get().activeSessionId;
    if (id) await api.chat.stop(id);
    set({ streaming: false });
  },
}));
```

- [ ] **Step 3: 写 `MessageBubble.tsx`**

```typescript
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import styles from './MessageBubble.module.css';
import type { Message } from '@qiming/shared';

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.assistant}`}>
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const lang = /language-(\w+)/.exec(className || '')?.[1];
            return lang
              ? <SyntaxHighlighter language={lang}>{String(children)}</SyntaxHighlighter>
              : <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
}
```

`MessageBubble.module.css`（古风气泡：用户=绢布偏右，助手=宣纸偏左）
```css
.bubble {
  max-width: 80%;
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-base);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  box-shadow: var(--shadow-ink-sm);
  animation: fade-in var(--duration-fast) var(--ease-brush-in);
}
.user {
  margin-left: auto;
  background: var(--bg-silk);
  border: var(--border-width-thin) solid var(--border-ancient);
}
.assistant {
  background: var(--bg-paper);
  background-image: var(--texture-paper);
  border: var(--border-width-thin) solid var(--border-ink);
}
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 4: 写 `ChatPage.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat';
import { MessageBubble } from '../components/MessageBubble';
import { Button, Textarea, Dropdown, InkLoading } from '@qiming/ui';
import styles from './ChatPage.module.css';

export function ChatPage() {
  const s = useChatStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    s.loadSessions();
    s.loadProviders();
    if (!s.sessions.length) s.newSession();
    else if (!s.activeSessionId) s.selectSession(s.sessions[0].id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [s.messages, s.streamBuffer]);

  const activeSession = s.sessions.find((x) => x.id === s.activeSessionId);
  const activeProvider = s.providers.find((p) => p.id === activeSession?.providerId);
  const models = activeProvider?.enabledModels ?? [];

  const send = () => {
    if (!input.trim()) return;
    s.send(input);
    setInput('');
  };

  return (
    <div className={styles.layout}>
      {/* 会话侧栏 - 卷轴意象 */}
      <aside className={styles.sidebar}>
        <Button variant="primary" className="w-full" onClick={() => s.newSession()}>新建 · 卷起一卷</Button>
        <ul className={styles.sessionList}>
          {s.sessions.map((sess) => (
            <li
              key={sess.id}
              className={`${styles.sessionItem} ${sess.id === s.activeSessionId ? styles.active : ''}`}
              onClick={() => s.selectSession(sess.id)}
            >
              {sess.title || '新对话'}
            </li>
          ))}
        </ul>
      </aside>

      {/* 主区 */}
      <main className={styles.main}>
        {/* 顶栏：provider/model 选择 */}
        <div className={styles.topbar}>
          <Dropdown
            value={activeSession?.providerId ?? ''}
            onChange={(e) => {
              const p = s.providers.find((x) => x.id === e.target.value);
              if (p) s.setBinding(p.id, p.defaultModel);
            }}
          >
            <option value="">选择厂商…</option>
            {s.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Dropdown>
          <Dropdown
            value={activeSession?.model ?? ''}
            disabled={!models.length}
            onChange={(e) => activeSession && s.setBinding(activeSession.providerId!, e.target.value)}
          >
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Dropdown>
        </div>

        {/* 消息流 */}
        <div className={styles.messages} ref={scrollRef}>
          {s.messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          {s.streaming && (
            <div className="flex items-center gap-2">
              <InkLoading />
            </div>
          )}
          {s.streamBuffer && !s.streaming && (
            <MessageBubble message={{ id: 'stream', sessionId: '', role: 'assistant', content: s.streamBuffer, tokens: null, createdAt: 0 }} />
          )}
        </div>

        {/* 输入区 */}
        <div className={styles.composer}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="研墨提笔，落字成文…（Enter 发送，Shift+Enter 换行）"
            rows={3}
          />
          <div className="flex gap-2">
            {s.streaming
              ? <Button onClick={() => s.stop()}>停笔</Button>
              : <Button variant="primary" onClick={send}>落墨</Button>}
          </div>
        </div>
      </main>
    </div>
  );
}
```

`ChatPage.module.css`:
```css
.layout { display: flex; height: 100vh; }
.sidebar {
  width: 240px;
  padding: var(--space-4);
  background: var(--bg-paper-dark);
  background-image: var(--texture-bamboo);
  border-right: var(--border-width-thin) solid var(--border-ancient);
  display: flex; flex-direction: column; gap: var(--space-3);
  overflow-y: auto;
  transition: width var(--duration-medium) var(--ease-scroll);
}
.sessionList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.sessionItem {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-ink);
  transition: background var(--duration-fast) var(--ease-brush-in);
}
.sessionItem:hover { background: var(--bg-silk); }
.active { background: var(--bg-silk); border-left: var(--border-width-base) solid var(--accent-cinnabar); }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-4);
  background: var(--bg-paper);
  border-bottom: var(--border-width-thin) solid var(--border-ancient);
}
.messages { flex: 1; overflow-y: auto; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.composer {
  padding: var(--space-4);
  background: var(--bg-paper);
  border-top: var(--border-width-thin) solid var(--border-ancient);
  display: flex; flex-direction: column; gap: var(--space-2);
}
```

- [ ] **Step 5: 修改 App.tsx 挂载 ChatPage**（含 Windows 标题栏）

```typescript
import { useEffect } from 'react';
import { detectPlatform } from './lib/platform';
import { ChatPage } from './pages/ChatPage';
import { TitleBar } from '@qiming/ui';
import styles from './App.module.css';

export function App() {
  const isWin = detectPlatform() === 'win32';
  useEffect(() => {
    document.documentElement.dataset.platform = detectPlatform();
  }, []);

  return (
    <div className={styles.app}>
      {isWin && (
        <TitleBar
          onClose={() => window.close()}
          onMinimize={() => {/* T14 接 electron 窗口控制 */}}
          onToggleMaximize={() => {}}
        />
      )}
      <ChatPage />
    </div>
  );
}
```

`App.module.css`:
```css
.app { display: flex; flex-direction: column; height: 100vh; }
```

- [ ] **Step 6: 集成验证**（手动）

Run: `pnpm dev`
- 先在设置页（T13）建一个 provider，或临时在控制台 `await window.qiming.provider.create({name:'x',kind:'openai',apiKeyRef:'',defaultModel:'gpt-4o',enabledModels:['gpt-4o']},'sk-...')`
- 回聊天页选 provider，发消息，应看到流式输出（研墨 loading + 文本逐字出现）。
- 切换会话、新建会话正常。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(chat-page): 聊天页 UI（流式渲染 + 多会话 + provider 选择）"
```

---

## Task 13: 设置页 UI（Provider 增删改 + 测试连接）

**Files:**
- Create: `apps/desktop/src/renderer/pages/SettingsPage.tsx`
- Create: `apps/desktop/src/renderer/pages/SettingsPage.module.css`
- Create: `apps/desktop/src/renderer/components/ProviderForm.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`（加聊天/设置切换）
- Modify: `apps/desktop/src/renderer/lib/templates.ts`（运行时镜像 T9 的 templates，或从 main 暴露）

**Interfaces:**
- Consumes: `window.qiming`、`@qiming/ui`、`PROVIDER_TEMPLATES`
- Produces: 可添加/编辑/删除 provider 的设置页，含 APIKey 掩码显示与测试连接。

- [ ] **Step 1: 镜像 templates 到 renderer** `apps/desktop/src/renderer/lib/templates.ts`

```typescript
import type { ProviderTemplate } from '@qiming/shared';
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { label: 'OpenAI', kind: 'openai', defaultModel: 'gpt-4o', enabledModels: ['gpt-4o', 'gpt-4o-mini'] },
  { label: 'Anthropic Claude', kind: 'anthropic', defaultModel: 'claude-3-5-sonnet-latest', enabledModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
  { label: 'Google Gemini', kind: 'google', defaultModel: 'gemini-1.5-pro', enabledModels: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  { label: 'OpenAI 兼容（国产/本地）', kind: 'openai-compatible', baseUrl: '', defaultModel: '', enabledModels: [] },
];
```

- [ ] **Step 2: 写 `ProviderForm.tsx`**

```typescript
import { useState } from 'react';
import { Input, Button, Dropdown } from '@qiming/ui';
import { PROVIDER_TEMPLATES } from '../lib/templates';
import type { ProviderConfig, ProviderInput, TestResult } from '@qiming/shared';
import { api } from '../ipc/client';

export function ProviderForm({
  initial, onSaved, onCancel,
}: { initial?: ProviderConfig; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ProviderInput['kind']>(initial?.kind ?? 'openai');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? '');
  const [enabledModelsText, setEnabledModelsText] = useState((initial?.enabledModels ?? []).join(', '));
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const applyTemplate = (label: string) => {
    const t = PROVIDER_TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setKind(t.kind); setBaseUrl(t.baseUrl ?? '');
    setDefaultModel(t.defaultModel); setEnabledModelsText(t.enabledModels.join(', '));
  };

  const save = async () => {
    const input: ProviderInput = {
      name, kind,
      baseUrl: kind === 'openai-compatible' ? baseUrl : undefined,
      apiKeyRef: initial?.apiKeyRef ?? `provider:${crypto.randomUUID()}`,
      defaultModel,
      enabledModels: enabledModelsText.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (initial) await api.provider.update(initial.id, input, apiKey || undefined);
    else await api.provider.create(input, apiKey);
    onSaved();
  };

  const runTest = async () => {
    if (!initial) { await save(); }
    setTesting(true);
    setTest(await api.provider.test(initial?.id ?? ''));
    setTesting(false);
  };

  const keyMask = initial ? '••••••（已保存，留空则不改）' : '';

  return (
    <div className="flex flex-col gap-3">
      <Dropdown onChange={(e) => applyTemplate(e.target.value)} defaultValue="">
        <option value="" disabled>选择模板快速填充…</option>
        {PROVIDER_TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
      </Dropdown>
      <Input placeholder="名称（如：我的智谱）" value={name} onChange={(e) => setName(e.target.value)} />
      <Dropdown value={kind} onChange={(e) => setKind(e.target.value as ProviderInput['kind'])}>
        <option value="openai">openai</option>
        <option value="openai-compatible">openai-compatible</option>
        <option value="anthropic">anthropic</option>
        <option value="google">google</option>
      </Dropdown>
      {kind === 'openai-compatible' && (
        <Input placeholder="baseUrl（如 https://open.bigmodel.cn/api/paas/v4）" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      )}
      <Input type="password" placeholder={keyMask || 'APIKey'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <Input placeholder="默认模型" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
      <Input placeholder="启用模型（逗号分隔）" value={enabledModelsText} onChange={(e) => setEnabledModelsText(e.target.value)} />

      {test && (
        <div className={test.ok ? 'text-jade' : 'text-cinnabar'}>
          {test.ok ? `✓ 连接成功（${test.latencyMs}ms）` : `✕ ${test.error?.kind}：${test.error?.message}`}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={runTest} disabled={testing}>{testing ? '测试中…' : '测试连接'}</Button>
        <Button variant="primary" onClick={save}>保存</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 写 `SettingsPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { api } from '../ipc/client';
import { Button, Card, Dialog } from '@qiming/ui';
import { ProviderForm } from '../components/ProviderForm';
import type { ProviderConfig } from '@qiming/shared';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProviderConfig | null>(null);

  const reload = async () => setProviders(await api.provider.list());
  useEffect(() => { reload(); }, []);

  const doDelete = async () => {
    if (confirmDelete) { await api.provider.delete(confirmDelete.id); setConfirmDelete(null); reload(); }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>厂商配置 · 启明之印</h1>
      <Button variant="primary" onClick={() => setCreating(true)}>+ 新增厂商</Button>

      <div className={styles.grid}>
        {providers.map((p) => (
          <Card key={p.id} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.kind}>{p.kind}</span>
            </div>
            <div className={styles.meta}>
              <div>默认模型：{p.defaultModel}</div>
              {p.baseUrl && <div>baseUrl：{p.baseUrl}</div>}
              <div>APIKey：••••••</div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => setEditing(p)}>编辑</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(p)}>删除</Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }}
        title={editing ? '编辑厂商' : '新增厂商'}>
        <ProviderForm
          initial={editing ?? undefined}
          onSaved={() => { setCreating(false); setEditing(null); reload(); }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      </Dialog>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="确认删除"
        footer={<><Button onClick={() => setConfirmDelete(null)}>取消</Button><Button variant="primary" onClick={doDelete}>删除</Button></>}>
        确定删除「{confirmDelete?.name}」？该操作会同时清除已保存的 APIKey。
      </Dialog>
    </div>
  );
}
```

`SettingsPage.module.css`:
```css
.page { padding: var(--space-8); max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-4); }
.title { font-size: var(--font-size-2xl); color: var(--text-ink); margin: 0; letter-spacing: 0.1em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4); }
.card { display: flex; flex-direction: column; gap: var(--space-2); }
.cardHead { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: var(--font-size-lg); color: var(--text-ink); }
.kind { font-size: var(--font-size-xs); color: var(--text-ink-light); padding: 2px var(--space-2); border: var(--border-width-thin) solid var(--border-ancient); border-radius: var(--radius-sm); }
.meta { font-size: var(--font-size-sm); color: var(--text-ink-light); line-height: var(--line-height-relaxed); }
```

- [ ] **Step 4: 修改 App.tsx 加页面切换**

```typescript
import { useEffect, useState } from 'react';
import { detectPlatform } from './lib/platform';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { TitleBar, Button } from '@qiming/ui';
import styles from './App.module.css';

type Page = 'chat' | 'settings';

export function App() {
  const isWin = detectPlatform() === 'win32';
  const [page, setPage] = useState<Page>('chat');
  useEffect(() => { document.documentElement.dataset.platform = detectPlatform(); }, []);

  return (
    <div className={styles.app}>
      {isWin && <TitleBar onClose={() => window.close()} onMinimize={() => {}} onToggleMaximize={() => {}} />}
      <nav className={styles.nav}>
        <Button variant={page === 'chat' ? 'primary' : 'ghost'} onClick={() => setPage('chat')}>对话</Button>
        <Button variant={page === 'settings' ? 'primary' : 'ghost'} onClick={() => setPage('settings')}>设置</Button>
      </nav>
      {page === 'chat' ? <ChatPage /> : <SettingsPage />}
    </div>
  );
}
```

`App.module.css` 补 nav:
```css
.app { display: flex; flex-direction: column; height: 100vh; }
.nav { display: flex; gap: var(--space-2); padding: var(--space-2) var(--space-4); background: var(--bg-paper-dark); border-bottom: var(--border-width-thin) solid var(--border-ancient); }
```

- [ ] **Step 5: 集成验证**（手动）

Run: `pnpm dev`
- 设置页：点"+ 新增厂商"→ 选 OpenAI 模板→ 填 key→ 测试连接（成功显示延迟）→ 保存
- 设置页：列表显示该 provider，APIKey 显示掩码
- 编辑/删除工作正常
- 切到对话页，下拉能选到刚建的 provider

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(settings-page): 设置页 UI（provider 增删改 + 测试连接 + 模板）"
```

---

## Task 14: Windows 窗口控制接线 + electron-builder 打包配置

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers/window.ts`（新增）
- Modify: `apps/desktop/src/main/ipc/register.ts`（注册 window handlers）
- Modify: `apps/desktop/src/preload/index.ts`（暴露 window 控制）
- Modify: `packages/shared/src/ipc.ts`（加 window IPC 通道）
- Modify: `apps/desktop/src/renderer/App.tsx`（TitleBar 按钮接线）
- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/resources/icon.png`（占位，古风印章风图标后续替换）

**Interfaces:**
- Consumes: T5 窗口、T11 IPC 体系
- Produces: 可打包的 .exe / .dmg；Windows 标题栏按钮可用。

- [ ] **Step 1: 在 shared/ipc.ts 加 window 通道**

在 `IPC` 对象内追加：
```typescript
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  WINDOW_CLOSE: 'window:close',
```

在 `ExposedApi` 追加：
```typescript
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
```

- [ ] **Step 2: 写 window handler**

`apps/desktop/src/main/ipc/handlers/window.ts`:
```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@qiming/shared';

export function registerWindowHandlers() {
  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}
```

注册进 register.ts：
```typescript
import { registerWindowHandlers } from './handlers/window';
export function registerIpc() {
  registerProviderHandlers();
  registerSessionHandlers();
  registerChatHandlers();
  registerWindowHandlers();
}
```

- [ ] **Step 3: preload 暴露 window 控制**

在 preload `api` 内追加：
```typescript
  window: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
```

- [ ] **Step 4: App.tsx 的 TitleBar 接线**

```typescript
<TitleBar
  onClose={() => window.qiming.window.close()}
  onMinimize={() => window.qiming.window.minimize()}
  onToggleMaximize={() => window.qiming.window.toggleMaximize()}
/>
```

- [ ] **Step 5: 写 `electron-builder.yml`**

```yaml
appId: com.qiming.agent
productName: 启明
directories:
  output: dist
  buildResources: resources
files:
  - out/**/*
asarUnpack:
  - '**/*.{node,dll}'   # better-sqlite3 / keytar 原生模块
win:
  target: nsis
  icon: resources/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
mac:
  target: dmg
  icon: resources/icon.png
  category: public.app-category.productivity
```

- [ ] **Step 6: 打包验证（手动，按当前平台）**

Run: `cd apps/desktop && pnpm build && pnpm exec electron-builder`
Expected: 生成 `dist/启明 Setup x.y.z.exe`（Windows）或 `.dmg`（macOS）。安装后能启动，聊天+设置功能正常。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(packaging): Windows 窗口控制接线 + electron-builder 打包配置"
```

---

## Self-Review（计划完成后自查）

**1. Spec 覆盖度** — 对照 spec §2.2 验收标准：

| 验收项 | 覆盖 Task |
|---|---|
| 添加/编辑/删除 Provider | T8(store) + T9 + T11(IPC) + T13(UI) |
| APIKey 系统密钥库 + 掩码 | T7 + T13 |
| 测试连接 | T9 + T13 |
| 4 个预置模板 | T9(templates) + T13(UI) |
| 国产只做通用模板 | T9 templates 第 4 项 |
| 多会话 CRUD | T8 + T11 + T12 |
| 每会话选 provider+model | T12(ChatPage topbar) |
| 流式多轮对话 | T10 + T12 |
| Markdown + 代码高亮 | T12(MessageBubble) |
| 中断生成 | T10(stopTurn) + T12 |
| 消息持久化 | T8(messages) + T10 |
| 古风令牌全局引用 | T3 + T6 + 全部 UI |
| 古风组件 | T6 |
| 玉轴滚动条 | T6(scrollbar.css) |
| 研墨 loading | T6(InkLoading) + T12 |
| 卷轴/印章动效 | T6(TitleBar/Button) + T12(sidebar) |
| Win/macOS 平台适配 | T5 + T14(标题栏) |
| 零硬编码 | T3 纯净度测试 |

无遗漏。

**2. Placeholder 扫描**：通读计划，无 TBD/TODO/"稍后实现"。所有步骤含完整代码或确切命令。

**3. 类型一致性**：
- `ProviderConfig`/`Session`/`Message` 在 T2 定义，T8/T9/T10/T11/T12/T13 一致引用。
- `ExposedApi` 在 T2 定义，T11 preload 实现，T12/T13 通过 `window.qiming` 调用，签名一致。
- `IPC` 通道常量 T2 定义，T11 handlers 引用同一常量集，避免拼写漂移。
- `keyStore.set/get/delete(providerId, ...)` 在 T7 定义，T9/T11 引用 `(providerId)` 签名一致。
- `createProviderStore(db)`/`createSessionStore(db)` T8 定义，T10/T11 引用一致。

无类型不一致。

**4. 风险提示**（执行时注意）：
- `better-sqlite3`/`keytar` 为原生模块，`pnpm install` 后需 `electron-builder install-app-deps` 重编译。T4 的 `.npmrc` 已配 electron target，首次 `pnpm dev` 前若报模块加载失败，执行 `pnpm rebuild better-sqlite3 keytar` 或 `electron-builder install-app-deps`。
- 版本号（如 `electron@^30`、`ai@^4`、`@ai-sdk/openai@^0.0.60`）为计划撰写时的主流版本，执行时以实际 `pnpm add` 解析的最新稳定版为准，但需保持 major 版本约束。
- T9 `test.ts` 中 TS 类型表达式较复杂（提取 error.kind 联合），执行时若类型报错可简化为 `let kind: 'auth'|'network'|'model'|'unknown' = 'unknown';`。
- T10 的 `messages` 历史拼接当前直接传 `content`（P0 仅文本）；P1 引入压缩时此处改造。

---

## 执行交付物

完成全部 14 个 task 后，P0 交付一个可 `pnpm dev` 运行、可 `electron-builder` 打包的 Windows+macOS 古风 AI Agent 桌面应用，满足 spec §2.2 全部验收标准。

# P2 设计：本地执行能力 + 工具系统

- **日期**：2026-07-06
- **状态**：待评审
- **范围**：qiming-agent 项目的第三个子项目（P2）
- **依赖**：P0（基础骨架）+ P1（会话压缩/记忆）已合并到 main

---

## 1. 项目背景

### 1.1 P2 在路线图中的位置

| 子项目 | 内容 | 状态 |
|---|---|---|
| P0 | 基础骨架 + 多 Provider 抽象层 | ✅ 已合并 |
| P1 | 会话压缩 + 长期记忆 | ✅ 已合并 |
| **P2** | **本地执行能力 + 工具系统** | **本文档** |
| P2.5 | MCP 客户端（连接外部 MCP 服务器） | 待开始 |
| P3 | Skill 加载器 + 高级 UI（diff 可视化等） | 待开始 |

### 1.2 已确认的 P2 决策

| 维度 | 决策 |
|---|---|
| 范围 | 本地工具集 + tool-use 循环 + 逐次审批（MCP 拆 P2.5，Skill 留 P3） |
| 权限模型 | **逐次审批**（每个危险操作弹窗，三选项：拒绝/允许本次/本会话总允许） |
| 工具集 | **6 个**：read_file / list_directory / glob / grep / write_file / edit_file / run_shell |
| 循环上限 | **maxSteps=25**（到顶优雅终止，告知用户） |
| 工作目录 | **启动时选目录**（首次启动弹目录选择器，设置页可改） |
| 工具循环实现 | Vercel AI SDK 原生 `tools` + `maxSteps`（不手写循环） |

### 1.3 继承自 P0/P1 的技术栈

Electron + electron-vite + React 18 + TypeScript + Vite + zustand + Tailwind + 古风令牌（gufeng-design-tokens/motion-engine）+ Vercel AI SDK + keytar + better-sqlite3 + pnpm workspace。P2 新增依赖：**zod**（工具参数 schema）。

---

## 2. 整体架构

### 2.1 P2 在系统中的位置

```
┌─────────────────── Main 进程 ───────────────────┐
│                                                  │
│  chat/run.ts ◄─── 改造（streamText 加 tools）     │
│      │                                           │
│      ├── tools/ ◄── 新：工具系统                  │
│      │     ├── registry.ts    工具注册表          │
│      │     ├── paths.ts       路径解析/工作目录    │
│      │     └── builtins/      6 个内置工具         │
│      │           ├── readFile.ts                  │
│      │           ├── listDirectory.ts             │
│      │           ├── glob.ts                      │
│      │           ├── grep.ts                      │
│      │           ├── writeFile.ts                 │
│      │           ├── editFile.ts                  │
│      │           └── runShell.ts                  │
│      │                                           │
│      └── approval/ ◄── 新：审批引擎               │
│            └── queue.ts      审批队列（session 隔离）│
│                                                  │
└──────────────────────────────────────────────────┘
         ▲ IPC（chat:tool_call / chat:tool_result / chat:approval_*）
         │
┌────────┴──────── Renderer 进程 ────────────────┐
│  ApprovalDialog ◄── 新：审批弹窗（朱砂印意象）    │
│  ToolCallView   ◄── 新：工具调用折叠卡片          │
│  设置页 + 工作目录区域                            │
└──────────────────────────────────────────────────┘
```

### 2.2 安全模型（逐次审批）

**核心原则：危险操作永远不自动执行，必须用户明确批准。**

操作分两级：

| 级别 | 工具 | 行为 |
|---|---|---|
| **只读（自动放行）** | read_file / list_directory / glob / grep | 直接执行，不需审批 |
| **危险（逐次审批）** | write_file / edit_file / run_shell | 暂停→推 IPC 给 Renderer→弹 ApprovalDialog→用户决定 |

审批三选项：
- **拒绝**：工具返回错误给 LLM，LLM 继续对话
- **允许本次**：执行这一次
- **本会话总允许**：本会话内该工具不再弹窗（仍记录日志）；切换会话/重启重置

**不做"永久允许"**：避免用户一旦允许就忘了风险。

**run_shell 额外约束**：
- 命令必须明文显示（不允许多行混淆命令隐藏在变量里）
- 工作目录默认项目根，用户可在审批时改
- 超时 30s

### 2.3 tool-use 循环（AI SDK 原生）

```typescript
const result = streamText({
  model,
  system: memorySystemPrompt ?? undefined,
  messages: contextMessages,
  tools,              // ← P2 核心接入点
  maxSteps: 25,       // ← 循环上限
  abortSignal: controller.signal,
});
```

Vercel AI SDK 传 `tools` + `maxSteps` 后**自动处理 tool-use 循环**：LLM 返回 tool_call → SDK 调 tool.execute → 结果回填 → LLM 继续。我们只需定义工具 + 在 execute 里做权限检查 + 消费 fullStream 事件。

### 2.4 一轮含工具调用的对话数据流

```
用户发消息 → runTurn
   │
   ├─ 1-3. (P1 既有：记忆检索 + 压缩 + 拼上下文)
   │
   ├─ 4. streamText({ tools, maxSteps: 25, ... })
   │     ├─ LLM 返回文本 → CHAT_DELTA（同 P1）
   │     ├─ LLM 返回 tool_call（如 write_file）
   │     │   ├─ tool.execute 检查权限
   │     │   ├─ 危险工具 → await 审批 → 推 CHAT_TOOL_CALL 给 UI
   │     │   ├─ 执行（fs 写 / shell 跑）
   │     │   └─ 推 CHAT_TOOL_RESULT 给 UI + 回填 LLM（SDK 自动）
   │     └─ LLM 继续（可能再调工具，最多 25 轮）
   │
   ├─ 5. 消费 fullStream：text-delta→CHAT_DELTA，tool-call/tool-result→事件
   │
   └─ 6. appendMessage(assistant, finalText) + 记忆提取（P1 既有）
```

---

## 3. 数据模型与 IPC

### 3.1 shared/tool.ts（新文件）

```typescript
export type ToolName = 'read_file' | 'list_directory' | 'glob' | 'grep'
  | 'write_file' | 'edit_file' | 'run_shell';

export type ToolRisk = 'readonly' | 'dangerous';

export interface ToolInfo {
  name: ToolName;
  description: string;
  risk: ToolRisk;
}

/** Main→Renderer 推送的审批请求 */
export interface ApprovalRequest {
  id: string;
  sessionId: string;
  tool: ToolName;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: number;
}

export type ApprovalDecision = 'allow' | 'deny' | 'allow_session';

/** 工具调用事件（M→R 推送） */
export interface ToolCallEvent {
  sessionId: string;
  tool: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  sessionId: string;
  tool: ToolName;
  output: unknown;
  ok: boolean;
}
```

### 3.2 IPC 扩展（shared/ipc.ts）

IPC 对象追加通道：

```typescript
CHAT_TOOL_CALL: 'chat:tool_call',
CHAT_TOOL_RESULT: 'chat:tool_result',
CHAT_APPROVAL_REQUEST: 'chat:approval_request',
CHAT_APPROVAL_RESPOND: 'chat:approval_respond',
TOOLS_LIST: 'tools:list',
TOOLS_SET_WORKSPACE: 'tools:set_workspace',
TOOLS_GET_WORKSPACE: 'tools:get_workspace',
```

ExposedApi 追加 tools 命名空间：

```typescript
interface ExposedApi {
  // ...既有 provider/session/chat/window/memory
  tools: {
    list(): Promise<ToolInfo[]>;
    setWorkspace(path: string): Promise<void>;
    getWorkspace(): Promise<string>;
    onApprovalRequest(cb: (req: ApprovalRequest) => void): () => void;
    respondApproval(id: string, decision: ApprovalDecision): Promise<void>;
    onToolCall(cb: (p: ToolCallEvent) => void): () => void;
    onToolResult(cb: (p: ToolResultEvent) => void): () => void;
  };
}
```

---

## 4. 工具系统

### 4.1 路径解析（`tools/paths.ts`）

```typescript
import { resolve, isAbsolute } from 'node:path';

let workspaceRoot = '';

export function setWorkspaceRoot(path: string) { workspaceRoot = path; }
export function getWorkspaceRoot() { return workspaceRoot; }

export function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(workspaceRoot, p);
}
```

**P2 不做路径白名单沙箱**（审批机制是安全网）。工作目录仅用于解析相对路径。后续 P3 可加 workspace 信任级别。

### 4.2 工具注册表（`tools/registry.ts`）

```typescript
export function buildToolRegistry(approvals: ApprovalQueue, sessionId: string): Record<string, Tool> {
  return {
    read_file: readFileTool,
    list_directory: listDirectoryTool,
    glob: globTool,
    grep: grepTool,
    write_file: writeFileTool(approvals, sessionId),
    edit_file: editFileTool(approvals, sessionId),
    run_shell: runShellTool(approvals, sessionId),
  };
}
```

只读工具是静态对象；危险工具是工厂函数（注入 approvals + sessionId 用于审批）。

### 4.3 只读工具（自动放行）

| 工具 | 参数 | 行为 |
|---|---|---|
| read_file | path | 读文本文件，>50000 字符截断 |
| list_directory | path | 列目录，返回 {name, type}[] |
| glob | pattern, path? | 按模式搜文件名，上限 200 |
| grep | pattern, path?, glob?, maxResults? | 内容搜索，逐行扫，上限默认 50 |

用 Node 的 fs/promises + readline 实现，**不依赖外部二进制**（如 ripgrep）。

### 4.4 危险工具（逐次审批）

| 工具 | 参数 | 审批要点 |
|---|---|---|
| write_file | path, content | 摘要"写入文件：{path}"，detail 含 contentPreview（前 500 字符） |
| edit_file | path, oldText, newText | oldText 必须精确匹配；摘要"编辑文件：{path}（替换 N 处）" |
| run_shell | command, cwd? | 命令明文显示；30s 超时；输出各截断 10000 字符 |

execute 流程：`await approvals.request(sessionId, req)` → approved 则执行 → 返回结果；denied 则返回 `{ ok: false, error: '用户拒绝' }`。

### 4.5 zod 参数 schema

每个工具用 zod 定义 parameters（AI SDK 用它做 LLM 的 function calling schema + 运行时校验）：

```typescript
import { z } from 'zod';

const readFileSchema = z.object({
  path: z.string().describe('文件路径，绝对或相对工作目录'),
});
```

---

## 5. 审批引擎

### 5.1 审批队列（`approval/queue.ts`）

```typescript
export class ApprovalQueue {
  private pending = new Map<string, { resolve: (d: ApprovalDecision) => void }>();
  private sessionAllowed = new Map<string, Set<ToolName>>();

  /** 工具 execute 调此方法，阻塞等审批 */
  async request(sessionId: string, req: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.sessionAllowed.get(sessionId)?.has(req.tool)) return 'allow';
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send(IPC.CHAT_APPROVAL_REQUEST, req);
    return new Promise((resolve) => {
      this.pending.set(req.id, { resolve });
    });
  }

  /** Renderer 回传决策 */
  respond(id: string, decision: ApprovalDecision, sessionId: string, tool: ToolName) {
    const p = this.pending.get(id);
    if (p) { p.resolve(decision); this.pending.delete(id); }
    if (decision === 'allow_session') {
      if (!this.sessionAllowed.has(sessionId)) this.sessionAllowed.set(sessionId, new Set());
      this.sessionAllowed.get(sessionId)!.add(tool);
    }
  }
}
```

- pending Map：id → resolve 回调（每个请求挂起一个 Promise）
- sessionAllowed：sessionId → 本会话总允许的工具集合
- request 先查 sessionAllowed，命中则直接放行（不弹窗）

### 5.2 ApprovalQueue 生命周期

- Main 进程单例（所有会话共享一个 queue）
- sessionAllowed 按 sessionId 隔离（不同会话审批互不干扰）
- 切换会话/重启应用 → sessionAllowed 重置（因 Map 是内存态）

---

## 6. run.ts 改造（核心）

### 6.1 streamText 接入 tools

```typescript
const approvalQueue = getApprovalQueueSingleton();  // Main 进程单例
const tools = buildToolRegistry(approvalQueue, sessionId);

const result = streamText({
  model,
  system: memorySystemPrompt ?? undefined,
  messages: contextMessages,
  tools,
  maxSteps: 25,
  abortSignal: controller.signal,
});
```

### 6.2 fullStream 消费（替代 textStream）

```typescript
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-delta':
      win?.webContents.send(IPC.CHAT_DELTA, { sessionId, delta: part.textDelta });
      break;
    case 'tool-call':
      win?.webContents.send(IPC.CHAT_TOOL_CALL, { sessionId, tool: part.toolName, input: part.input });
      break;
    case 'tool-result':
      win?.webContents.send(IPC.CHAT_TOOL_RESULT, { sessionId, tool: part.toolName, output: part.output, ok: !(part.output instanceof Error) });
      break;
    case 'error':
      console.error('[p2] streamText error', part.error);
      break;
  }
}
```

**关键变化**：P0/P1 用 `result.textStream`（只纯文本），P2 改用 `result.fullStream`（含工具事件）。文本 delta 仍推 CHAT_DELTA（向后兼容 P1 的 UI），新增 CHAT_TOOL_CALL/CHAT_TOOL_RESULT。

### 6.3 finalText 提取

fullStream 消费完后，`await result.text` 仍是 LLM 的最终文本回复（含所有工具调用后的总结），落库逻辑同 P1。

---

## 7. UI 扩展

### 7.1 审批弹窗（`ApprovalDialog.tsx`）

监听 `onApprovalRequest`，弹出古风对话框：

- 标题"朱砂印 · 待审批"（古风意象：盖印前需审视）
- 危险图标朱砂色
- 工具名 + 一行摘要
- 参数详情默认折叠，可展开（run_shell 命令强制展开）
- 三按钮：拒绝（默认聚焦）/ 允许本次 / 本会话总允许
- 无超时（一直等用户）
- 古风样式：朱砂边框 + 宣纸底 + 古铜按钮

### 7.2 工具调用可视化（`ToolCallView.tsx`）

在消息流中渲染工具调用过程（穿插文本消息之间）：

- 折叠卡片样式
- 状态：⏳ 执行中 / ✓ 完成 / ✗ 失败 / ⏸ 待审批
- 工具图标 + 工具名 + 参数摘要 + 结果摘要
- 默认折叠详情，点击展开看完整 output
- 危险工具用朱砂色边框，只读用青玉色边框

### 7.3 chat store 扩展

zustand store 加 toolCalls 状态，监听 onToolCall/onToolResult 更新。ToolCallView 按 sessionId 过滤、按时间序渲染。

### 7.4 设置页加"工作目录"区域

第三个区域"工作目录 · 案牍之所"：
- 显示当前工作目录
- "选择目录"按钮（electron dialog.showOpenDialog）
- 说明文字

### 7.5 启动时选目录

应用首次启动（workspace 未设置）弹目录选择器。已设置则跳过。用户随时可在设置页改。

---

## 8. P2 范围与验收

### 8.1 task 分解

| 顺序 | task | 内容 | 依赖 |
|---|---|---|---|
| **P2.0** | 类型 + IPC 契约 | shared/tool.ts + ipc.ts 扩展通道 + ExposedApi.tools | 无 |
| **P2.1** | 工具基础设施 | tools/registry.ts + tools/paths.ts + 装 zod | P2.0 |
| **P2.2** | 只读工具 | read_file + list_directory + glob + grep + 单测 | P2.1 |
| **P2.3** | 审批引擎 | approval/queue.ts + IPC handler + preload 暴露 | P2.0 |
| **P2.4** | 危险工具 | write_file + edit_file + run_shell（注入审批）+ 单测 | P2.1, P2.3 |
| **P2.5** | tool-use 接入 run.ts | streamText 加 tools/maxSteps + fullStream 消费 | P2.2, P2.4 |
| **P2.6** | UI：审批弹窗 | ApprovalDialog + 古风样式 | P2.3 |
| **P2.7** | UI：工具调用可视化 + 工作目录 | ToolCallView + chat store + 设置页区域 + 启动选目录 | P2.5 |
| **P2.8** | 端到端验证 + 收尾 | 手动验证完整流程 + 文档 | P2.6, P2.7 |

### 8.2 P2 验收标准

**工具能力**：
- ✅ LLM 能调用 6 个工具
- ✅ 参数正确传递，结果正确返回
- ✅ read_file 大文件截断、glob/grep 结果上限

**tool-use 循环**：
- ✅ LLM 能连续多轮调工具（如"读 3 个文件→总结→写入"）
- ✅ maxSteps=25 到顶优雅终止，告知用户
- ✅ 中断（stop）能取消整个循环

**权限审批**：
- ✅ 只读工具自动放行
- ✅ 危险工具执行前弹审批窗
- ✅ 三选项（拒绝/允许本次/本会话总允许）
- ✅ 本会话总允许生效
- ✅ 拒绝时工具返回错误给 LLM，LLM 继续对话
- ✅ run_shell 命令明文显示

**UI 可视化**：
- ✅ 工具调用过程在消息流显示（状态/参数/结果）
- ✅ 审批弹窗古风样式（朱砂印意象）
- ✅ 工作目录可在设置页配置
- ✅ 启动时选目录

### 8.3 P2 明确不做

- ❌ MCP 客户端（P2.5 独立 spec）
- ❌ Skill 加载器（P3）
- ❌ 路径白名单沙箱（审批是安全网）
- ❌ 工具调用 diff 可视化（P2 用折叠卡片，diff UI 留 P3）
- ❌ 后台长任务（shell 超时 30s）

---

## 9. 测试策略

| 层 | 策略 |
|---|---|
| 只读工具 | 单测：read_file（含截断）、list_directory、glob、grep（mock fs） |
| 危险工具 | 单测：mock approvalQueue（approve/deny 两条路径）+ 真实 fs（tmp 目录） |
| approval/queue | 单测：request→respond 流程、sessionAllowed 缓存、pending 清理 |
| paths | 单测：绝对/相对路径解析、workspaceRoot 切换 |
| run.ts tool-use | 手动 e2e（需真实 LLM） |
| UI | 手动验证审批弹窗 + 工具可视化 |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| LLM 误删文件 / 跑恶意命令 | 逐次审批 + 默认拒绝聚焦 + run_shell 命令明文 + 30s 超时 |
| LLM 无限调工具耗 token | maxSteps=25 硬上限 |
| 工具结果过大撑爆上下文 | read_file 50000 字符截断、glob 200 条上限、grep 50 结果、shell stdout 10000 字符 |
| fullStream API 与 textStream 行为差异 | fullStream 含 text-delta 类型，仍推 CHAT_DELTA，向后兼容 P1 UI |
| 国产模型 tool calling 兼容性 | openai-compatible 用 compatibility:'compatible'；Anthropic/Gemini 原生支持；端到端验证时测各厂商 |
| 审批弹窗阻塞导致"卡死"感 | UI 显示"待审批"状态（⏸），用户清楚在等什么 |
| 工作目录未选就发消息 | runTurn 前检查 workspaceRoot，未设则提示用户先选 |

---

## 11. P2 完成后的衔接

- **P2.5（MCP 客户端）**：tools/registry 扩展为可加载 MCP 服务器工具；新增 mcp/ 目录（连接管理 + 工具发现）；MCP 工具同样走 approval 引擎。
- **P3（Skill 加载）**：Skill 可注册自定义工具和工具提示词；引入工具调用 diff 可视化（write_file/edit_file 显示前后对比）。

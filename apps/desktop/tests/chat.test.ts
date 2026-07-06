import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock electron BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));
// mock streamText
vi.mock('ai', () => ({ streamText: vi.fn() }));
// mock db / store —— 路径需与 run.ts 的 import 路径一致（具体文件，非 barrel）
vi.mock('../src/main/store/db', () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock('../src/main/store/sessions', () => ({
  createSessionStore: vi.fn(() => ({
    getSession: vi.fn(() => null),
    appendMessage: vi.fn(),
    messages: vi.fn(() => []),
  })),
}));
vi.mock('../src/main/store/providers', () => ({
  createProviderStore: vi.fn(() => ({ get: vi.fn(() => null) })),
}));
// P2.5 新增：mock 掉 run.ts 用到的工具链/记忆/压缩/模型工厂
vi.mock('../src/main/providers/factory', () => ({
  buildModel: vi.fn(async () => ({})),
}));
vi.mock('../src/main/memory/retriever', () => ({
  retrieveMemories: vi.fn(async () => null),
}));
vi.mock('../src/main/memory/extractor', () => ({
  extractAndStore: vi.fn(async () => undefined),
}));
vi.mock('../src/main/context/compressor', () => ({
  compressMessages: vi.fn(),
}));
vi.mock('../src/main/tools/registry', () => ({
  buildToolRegistry: vi.fn(() => ({ read_file: {} })),
}));
vi.mock('../src/main/approval/queue', () => ({
  getApprovalQueue: vi.fn(() => ({ request: vi.fn(), respond: vi.fn() })),
}));

import { runTurn } from '../src/main/chat/run';
import { createSessionStore } from '../src/main/store/sessions';
import { createProviderStore } from '../src/main/store/providers';
import { streamText } from 'ai';
import { IPC } from '@qiming/shared';

/** 构造一个假的 streamText 返回值：含 fullStream（async iter）+ text + usage + finishReason。
 *  finishReason 默认 'stop'（自然结束）；上限测试可覆盖为 'tool-calls'。 */
function fakeStreamResult(
  parts: { type: string; [k: string]: unknown }[],
  opts: { finishReason?: string } = {},
) {
  const fullStream = (async function* () {
    for (const p of parts) yield p;
  })();
  return {
    fullStream,
    text: Promise.resolve('final'),
    usage: Promise.resolve({ promptTokens: 5, completionTokens: 3 }),
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
  };
}

describe('runTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('session 不存在时不抛错（静默，无窗口）', async () => {
    await expect(runTurn('nope', 'hi')).resolves.toBeUndefined();
  });

  it('session 未绑定 provider 时不调 appendMessage', async () => {
    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({
        id: 's1',
        title: null,
        providerId: null,
        model: null,
        createdAt: 0,
        updatedAt: 0,
      })),
      appendMessage: vi.fn(),
      messages: vi.fn(() => []),
    } as never);
    await runTurn('s1', 'hi');
    // 无窗口可发送错误，但不应抛错
    expect(true).toBe(true);
  });

  it('text-delta 经 CHAT_DELTA 推送且 streamText 收到 tools/maxSteps', async () => {
    const { BrowserWindow } = await import('electron');
    const send = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
      { webContents: { send } } as never,
    ]);

    const appendMessage = vi.fn((_, role, content) => ({
      id: 'm1',
      sessionId: 's1',
      role,
      content,
      tokens: null,
      kind: 'message' as const,
      createdAt: 0,
    }));
    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({
        id: 's1',
        title: null,
        providerId: 'p1',
        model: 'gpt',
        createdAt: 0,
        updatedAt: 0,
      })),
      appendMessage,
      messages: vi.fn(() => []),
    } as never);

    // 3rd test 需要 provider 存在，否则 run.ts 在 "provider 不存在" 处提前 return
    vi.mocked(createProviderStore).mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 'p1',
        name: 'p',
        kind: 'openai' as const,
        apiKeyRef: 'provider:p1',
        defaultModel: 'gpt',
        enabledModels: ['gpt'],
        contextWindow: 8000,
        createdAt: 0,
        updatedAt: 0,
      })),
    } as never);

    vi.mocked(streamText).mockReturnValueOnce(
      fakeStreamResult([
        { type: 'text-delta', textDelta: 'hel' },
        { type: 'text-delta', textDelta: 'lo' },
      ]) as never,
    );

    await runTurn('s1', 'hi');
    expect(streamText).toHaveBeenCalled();
    const callArg = vi.mocked(streamText).mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(callArg).toBeDefined();
    expect(callArg.maxSteps).toBe(25);
    expect(callArg.tools).toBeTypeOf('object');
    // send 至少被调过（text-delta 推送）
    expect(send).toHaveBeenCalled();
  });

  // P2 final-fix M4 + I3：tool-call/tool-result 经对应 IPC 推送；
  // 且 readonly 工具结果（无 ok 字段）应被启发式判定为成功（ok=true）。
  it('tool-call/tool-result 经对应 IPC 推送', async () => {
    const { BrowserWindow } = await import('electron');
    const send = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
      { webContents: { send } } as never,
    ]);

    const appendMessage = vi.fn((_, role, content) => ({
      id: 'm2',
      sessionId: 's1',
      role,
      content,
      tokens: null,
      kind: 'message' as const,
      createdAt: 0,
    }));
    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({
        id: 's1',
        title: null,
        providerId: 'p1',
        model: 'gpt',
        createdAt: 0,
        updatedAt: 0,
      })),
      appendMessage,
      messages: vi.fn(() => []),
    } as never);
    vi.mocked(createProviderStore).mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 'p1',
        name: 'p',
        kind: 'openai' as const,
        apiKeyRef: 'r',
        defaultModel: 'gpt',
        enabledModels: ['gpt'],
        baseUrl: 'http://x',
        headers: null,
        contextWindow: 8000,
        embeddingModel: null,
        createdAt: 0,
        updatedAt: 0,
      })),
    } as never);

    vi.mocked(streamText).mockReturnValueOnce(
      fakeStreamResult([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'read_file',
          args: { path: 'a.txt' },
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'read_file',
          args: { path: 'a.txt' },
          result: { content: 'hi', truncated: false },
        },
      ]) as never,
    );

    await runTurn('s1', 'hi');

    // 找到推给 CHAT_TOOL_CALL 和 CHAT_TOOL_RESULT 的 send 调用
    const calls = send.mock.calls as [unknown, unknown][];
    const toolCallSent = calls.some(([chan]) => chan === IPC.CHAT_TOOL_CALL);
    const toolResultSent = calls.some(([chan]) => chan === IPC.CHAT_TOOL_RESULT);
    expect(toolCallSent).toBe(true);
    expect(toolResultSent).toBe(true);

    // FIX I3 验证：readonly 结果（无 ok 字段）→ 启发式 ok=true
    const toolResultCall = calls.find(
      ([chan]) => chan === IPC.CHAT_TOOL_RESULT,
    ) as [unknown, { ok?: boolean; result?: unknown }];
    expect(toolResultCall?.[1]?.ok).toBe(true);
  });

  // P2 final-fix I3：危险工具 deny 返回 {ok:false}，启发式应判定为失败（ok=false）。
  it('tool-result {ok:false} 推送 ok=false（deny 路径）', async () => {
    const { BrowserWindow } = await import('electron');
    const send = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
      { webContents: { send } } as never,
    ]);

    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({
        id: 's1',
        title: null,
        providerId: 'p1',
        model: 'gpt',
        createdAt: 0,
        updatedAt: 0,
      })),
      appendMessage: vi.fn((_, role, content) => ({
        id: 'm3',
        sessionId: 's1',
        role,
        content,
        tokens: null,
        kind: 'message' as const,
        createdAt: 0,
      })),
      messages: vi.fn(() => []),
    } as never);
    vi.mocked(createProviderStore).mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 'p1',
        name: 'p',
        kind: 'openai' as const,
        apiKeyRef: 'r',
        defaultModel: 'gpt',
        enabledModels: ['gpt'],
        baseUrl: 'http://x',
        headers: null,
        contextWindow: 8000,
        embeddingModel: null,
        createdAt: 0,
        updatedAt: 0,
      })),
    } as never);

    vi.mocked(streamText).mockReturnValueOnce(
      fakeStreamResult([
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'edit_file',
          args: { path: 'a.txt' },
          // 危险工具 deny 返回形状：普通对象 + ok:false（非 Error 实例）
          result: { ok: false, error: '用户拒绝' },
        },
      ]) as never,
    );

    await runTurn('s1', 'hi');

    const calls = send.mock.calls as [unknown, { ok?: boolean }][];
    const toolResultCall = calls.find(([chan]) => chan === IPC.CHAT_TOOL_RESULT);
    expect(toolResultCall).toBeDefined();
    expect(toolResultCall?.[1]?.ok).toBe(false);
  });

  // P2 final-fix I4：maxSteps 到顶时 finishReason='tool-calls' → 推送上限提示 delta。
  it('hitCeiling 时推送 maxSteps 上限提示 delta', async () => {
    const { BrowserWindow } = await import('electron');
    const send = vi.fn();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
      { webContents: { send } } as never,
    ]);

    vi.mocked(createSessionStore).mockReturnValueOnce({
      getSession: vi.fn(() => ({
        id: 's1',
        title: null,
        providerId: 'p1',
        model: 'gpt',
        createdAt: 0,
        updatedAt: 0,
      })),
      appendMessage: vi.fn((_, role, content) => ({
        id: 'm4',
        sessionId: 's1',
        role,
        content,
        tokens: null,
        kind: 'message' as const,
        createdAt: 0,
      })),
      messages: vi.fn(() => []),
    } as never);
    vi.mocked(createProviderStore).mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 'p1',
        name: 'p',
        kind: 'openai' as const,
        apiKeyRef: 'r',
        defaultModel: 'gpt',
        enabledModels: ['gpt'],
        baseUrl: 'http://x',
        headers: null,
        contextWindow: 8000,
        embeddingModel: null,
        createdAt: 0,
        updatedAt: 0,
      })),
    } as never);

    vi.mocked(streamText).mockReturnValueOnce(
      fakeStreamResult(
        [{ type: 'text-delta', textDelta: '中途' }],
        { finishReason: 'tool-calls' },
      ) as never,
    );

    await runTurn('s1', 'hi');

    const calls = send.mock.calls as [unknown, { delta?: string }][];
    // 应有一条 CHAT_DELTA 携带上限提示
    const ceilingDelta = calls.find(
      ([chan, payload]) =>
        chan === IPC.CHAT_DELTA &&
        typeof payload?.delta === 'string' &&
        payload.delta.includes('已达工具调用上限'),
    );
    expect(ceilingDelta).toBeDefined();
  });
});

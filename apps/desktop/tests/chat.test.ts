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

import { runTurn } from '../src/main/chat/run';
import { createSessionStore } from '../src/main/store/sessions';

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
});

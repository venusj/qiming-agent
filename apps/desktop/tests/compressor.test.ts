import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('ai', () => ({ generateText: vi.fn() }));

import { compressMessages } from '../src/main/context/compressor';
import { generateText } from 'ai';
import type { Message } from '@qiming/shared';

const fakeModel = { name: 'fake' } as never;

function mkMsg(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, sessionId: 's', role, content, tokens: null, kind: 'message', createdAt: 0 };
}

describe('compressMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

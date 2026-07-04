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
    const msgs = Array.from({ length: 10 }, (_, i) => mk(`${i}`, 'x'.repeat(1000))); // 每条约 250 token
    const plan = planBudget({ contextWindow: 2000, reservedForReply: 500, memoryTokens: 0, summaries: [], messages: msgs, keepRecent: 6 });
    expect(plan.recent.length).toBeGreaterThanOrEqual(6); // keepRecent 保底
    expect(plan.recent.length).toBeLessThan(10); // 没全保留
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

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
    expect(estimateTokens('hello')).toBe(Math.ceil(5 / 4)); // 2
  });
  it('混合', () => {
    expect(estimateTokens('你好 hello')).toBe(2 + Math.ceil(6 / 4)); // 2+2=4
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

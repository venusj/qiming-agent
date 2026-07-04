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

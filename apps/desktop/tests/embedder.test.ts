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

import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../src/main/providers/factory', () => ({ buildModel: vi.fn().mockResolvedValue({}) }));
vi.mock('../src/main/memory/embedder', () => ({ embedTexts: vi.fn() }));
vi.mock('../src/main/store/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../src/main/memory/vectorStore', () => ({
  createMemoryStore: vi.fn(() => ({
    listEnabled: vi.fn(() => []),
    add: vi.fn(),
  })),
}));

import { extractAndStore } from '../src/main/memory/extractor';
import { generateText } from 'ai';
import { embedTexts } from '../src/main/memory/embedder';
import { createMemoryStore } from '../src/main/memory/vectorStore';
import type { ProviderConfig } from '@qiming/shared';

const cfg: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'r', defaultModel: 'gpt-4o',
  enabledModels: [], createdAt: 0, updatedAt: 0, embeddingModel: 'text-embedding-3-small',
};

describe('extractAndStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无 embeddingModel 直接 return', async () => {
    await extractAndStore({ ...cfg, embeddingModel: undefined }, 'u', 'a');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('LLM 回复"无"不入库', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '无' } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it('提取 2 条，无重复，全入库', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '用户偏好 Go\n用户用 VSCode' } as never);
    vi.mocked(embedTexts).mockResolvedValue([[1, 0], [0, 1]] as never);
    const mockAdd = vi.fn();
    vi.mocked(createMemoryStore).mockReturnValue({ listEnabled: () => [], add: mockAdd } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  it('去重：现有记忆 cosine>0.9 跳过', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '用户偏好 Go' } as never);
    vi.mocked(embedTexts).mockResolvedValue([[1, 0]] as never);
    const mockAdd = vi.fn();
    vi.mocked(createMemoryStore).mockReturnValue({
      listEnabled: () => [{ id: 'e1', content: 'x', embedding: [1, 0], source: 'auto', enabled: true, createdAt: 0, updatedAt: 0 }],
      add: mockAdd,
    } as never);
    await extractAndStore(cfg, 'u', 'a');
    expect(mockAdd).not.toHaveBeenCalled();  // cosine=1 > 0.9，跳过
  });
});

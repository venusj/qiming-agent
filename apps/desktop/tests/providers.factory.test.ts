import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderConfig } from '@qiming/shared';

// 捕获 createOpenAI 入参，供 openai-compatible 用例断言 baseURL/compatibility 注入。
// 用 vi.mock + vi.hoisted 而非 vi.spyOn：@ai-sdk/openai 的 createOpenAI 是 live ESM 绑定、
// 不可 redefine（spyOn 会抛 "Cannot redefine property"）；vi.mock 的 factory 会 hoist，
// 因此捕获用的 fn 必须用 vi.hoisted 提前创建。
const { createOpenAICalls } = vi.hoisted(() => ({ createOpenAICalls: vi.fn() }));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (...args: unknown[]) => {
    createOpenAICalls(...args);
    // 返回一个能被当函数调用的 provider（client(model)）
    return (model: string) => ({ model, provider: 'openai-mock' });
  },
}));

vi.mock('../src/main/keystore', () => ({
  keyStore: { get: vi.fn().mockResolvedValue('sk-fake') },
}));

// factory.ts 在顶层 import createOpenAI；必须在 mock 之后导入，确保拿到 mock 版本。
import { buildModel } from '../src/main/providers/factory';
import { keyStore } from '../src/main/keystore';

const base: ProviderConfig = {
  id: 'p1', name: 't', kind: 'openai', apiKeyRef: 'provider:p1',
  defaultModel: 'gpt-4o', enabledModels: ['gpt-4o'], createdAt: 0, updatedAt: 0,
};

describe('buildModel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('openai kind 调用 keyStore.get(providerId)', async () => {
    await buildModel(base, 'gpt-4o');
    expect(keyStore.get).toHaveBeenCalledWith('p1');
  });

  it('openai-compatible 传入自定义 baseUrl', async () => {
    await buildModel(
      { ...base, kind: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' },
      'llama3',
    );
    expect(createOpenAICalls).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'http://localhost:11434/v1',
      compatibility: 'compatible',
    }));
  });

  it('未设 key 抛错', async () => {
    vi.mocked(keyStore.get).mockResolvedValueOnce(null);
    await expect(buildModel(base, 'gpt-4o')).rejects.toThrow(/未设置 APIKey/);
  });
});

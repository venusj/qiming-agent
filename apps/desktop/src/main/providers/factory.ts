import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { keyStore } from '../keystore';

/** 把 ProviderConfig + 模型名 转成 Vercel AI SDK 的 LanguageModel */
export async function buildModel(cfg: ProviderConfig, model: string): Promise<LanguageModel> {
  const apiKey = await keyStore.get(cfg.id);
  if (!apiKey) throw new Error(`provider ${cfg.name} 未设置 APIKey`);

  switch (cfg.kind) {
    case 'openai':
    case 'openai-compatible': {
      const client = createOpenAI({
        apiKey,
        baseURL: cfg.baseUrl,
        compatibility: cfg.kind === 'openai-compatible' ? 'compatible' : 'strict',
      });
      return client(model);
    }
    case 'anthropic': {
      const client = createAnthropic({ apiKey, baseURL: cfg.baseUrl });
      return client(model);
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseUrl });
      return client(model);
    }
  }
}

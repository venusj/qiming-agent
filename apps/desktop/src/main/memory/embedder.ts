import { embedMany } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { keyStore } from '../keystore';

/** 用 provider 的 embedding 模型批量生成向量。
 *  Anthropic 无 embedding API，抛错提示。 */
export async function embedTexts(cfg: ProviderConfig, texts: string[]): Promise<number[][]> {
  if (!cfg.embeddingModel) throw new Error(`provider ${cfg.name} 未配置 embeddingModel`);

  const apiKey = await keyStore.get(cfg.id);
  if (!apiKey) throw new Error(`provider ${cfg.name} 未设置 APIKey`);

  let model;
  switch (cfg.kind) {
    case 'openai':
    case 'openai-compatible': {
      const client = createOpenAI({ apiKey, baseURL: cfg.baseUrl, compatibility: cfg.kind === 'openai-compatible' ? 'compatible' : 'strict' });
      model = client.textEmbedding(cfg.embeddingModel);
      break;
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseUrl });
      model = client.textEmbedding(cfg.embeddingModel);
      break;
    }
    case 'anthropic':
      throw new Error('Anthropic 暂不支持 embedding，请在设置页配置 OpenAI 或 Gemini 作为 embedding provider');
  }

  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings as unknown as number[][];
}

export async function embedText(cfg: ProviderConfig, text: string): Promise<number[]> {
  const [vec] = await embedTexts(cfg, [text]);
  return vec;
}

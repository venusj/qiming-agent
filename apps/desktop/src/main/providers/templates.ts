import type { ProviderTemplate } from '@qiming/shared';

/** 4 个预置模板（spec §2.2）。国产只给通用 OpenAI 兼容模板。
 *  P1.8 起：含 embeddingModel / contextWindow 推荐值（与 renderer 镜像保持一致）。 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    label: 'OpenAI', kind: 'openai', defaultModel: 'gpt-4o',
    enabledModels: ['gpt-4o', 'gpt-4o-mini'],
    embeddingModel: 'text-embedding-3-small',
    contextWindow: 128000,
  },
  {
    label: 'Anthropic Claude', kind: 'anthropic', defaultModel: 'claude-3-5-sonnet-latest',
    enabledModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    // Anthropic 无 embedding API，不配 embeddingModel
    contextWindow: 200000,
  },
  {
    label: 'Google Gemini', kind: 'google', defaultModel: 'gemini-1.5-pro',
    enabledModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    embeddingModel: 'text-embedding-004',
    contextWindow: 1000000,
  },
  {
    label: 'OpenAI 兼容（国产/本地）', kind: 'openai-compatible',
    baseUrl: '',  // 用户填写
    defaultModel: '',
    enabledModels: [],
    // 兼容厂商 embedding 模型各异，留空让用户自填
  },
];

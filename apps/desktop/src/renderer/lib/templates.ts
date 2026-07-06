import type { ProviderTemplate } from '@qiming/shared';

/**
 * 运行时镜像的 Provider 预置模板。
 *
 * 与 T9（main 侧 `apps/desktop/src/main/lib/providers/templates.ts`）保持一致。
 * renderer 不能直接 import main 模块（两者打包入口分离），故在此镜像一份。
 * 若 T9 调整模板，需同步更新本文件。
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    label: 'OpenAI',
    kind: 'openai',
    defaultModel: 'gpt-4o',
    enabledModels: ['gpt-4o', 'gpt-4o-mini'],
    embeddingModel: 'text-embedding-3-small',
    contextWindow: 128000,
  },
  {
    label: 'Anthropic Claude',
    kind: 'anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    enabledModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    // Anthropic 无 embedding API，不配 embeddingModel
    contextWindow: 200000,
  },
  {
    label: 'Google Gemini',
    kind: 'google',
    defaultModel: 'gemini-1.5-pro',
    enabledModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    embeddingModel: 'text-embedding-004',
    contextWindow: 1000000,
  },
  {
    label: 'OpenAI 兼容（国产/本地）',
    kind: 'openai-compatible',
    baseUrl: '',
    defaultModel: '',
    enabledModels: [],
    // 兼容厂商 embedding 模型各异，留空让用户自填
  },
];

import type { ProviderTemplate } from '@qiming/shared';

/** 4 个预置模板（spec §2.2）。国产只给通用 OpenAI 兼容模板。 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    label: 'OpenAI', kind: 'openai', defaultModel: 'gpt-4o',
    enabledModels: ['gpt-4o', 'gpt-4o-mini'],
  },
  {
    label: 'Anthropic Claude', kind: 'anthropic', defaultModel: 'claude-3-5-sonnet-latest',
    enabledModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  {
    label: 'Google Gemini', kind: 'google', defaultModel: 'gemini-1.5-pro',
    enabledModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    label: 'OpenAI 兼容（国产/本地）', kind: 'openai-compatible',
    baseUrl: '',  // 用户填写
    defaultModel: '',
    enabledModels: [],
  },
];

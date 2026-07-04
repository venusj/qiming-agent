/** 决定走哪个 AI SDK 适配器 */
export type ProviderKind =
  | 'openai'             // OpenAI 官方，默认 baseUrl
  | 'openai-compatible'  // 自定义 baseUrl（国产/代理/本地）
  | 'anthropic'
  | 'google';

/** 一个厂商的连接配置（不含明文 key） */
export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  /** 指向 KeyStore 的引用，命名规则 provider:<providerId>；不含明文 */
  apiKeyRef: string;
  defaultModel: string;
  enabledModels: string[];
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/** 创建/更新 provider 的输入（不含 id/createdAt/updatedAt） */
export type ProviderInput = Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>;

/** 预置模板 */
export interface ProviderTemplate {
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel: string;
  enabledModels: string[];
}

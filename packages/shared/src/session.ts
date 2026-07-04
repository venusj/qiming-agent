export interface Session {
  id: string;
  title: string | null;
  providerId: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  /** JSON 字符串：P0 为纯文本 { text: string }；P2 起含工具调用 */
  content: string;
  tokens: number | null;
  createdAt: number;
}

/** 会话绑定（设置/切换会话用的 provider+model） */
export interface SessionBinding {
  providerId: string;
  model: string;
}

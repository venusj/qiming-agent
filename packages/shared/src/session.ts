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
  /** 纯文本字符串（P2 工具调用会引入结构化 content，届时扩展） */
  content: string;
  tokens: number | null;
  createdAt: number;
}

/** 会话绑定（设置/切换会话用的 provider+model） */
export interface SessionBinding {
  providerId: string;
  model: string;
}

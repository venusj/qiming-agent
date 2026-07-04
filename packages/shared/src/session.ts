export interface Session {
  id: string;
  title: string | null;
  providerId: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

/** 消息种类：'message' 为普通对话消息；'summary' 为 P1 上下文压缩生成的摘要（竹简样式渲染）。 */
export type MessageKind = 'message' | 'summary';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  /** 纯文本字符串（P2 工具调用会引入结构化 content，届时扩展） */
  content: string;
  tokens: number | null;
  /** P1.1 新增：消息种类，区分普通消息与压缩摘要 */
  kind: MessageKind;
  createdAt: number;
}

/** 会话绑定（设置/切换会话用的 provider+model） */
export interface SessionBinding {
  providerId: string;
  model: string;
}

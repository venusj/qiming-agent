import type { ProviderConfig, ProviderInput } from './provider.js';
import type { Session, Message, SessionBinding } from './session.js';

/** IPC 通道名常量，Main/Preload/Renderer 三处共用，避免拼写漂移 */
export const IPC = {
  PROVIDER_LIST: 'provider:list',
  PROVIDER_CREATE: 'provider:create',
  PROVIDER_UPDATE: 'provider:update',
  PROVIDER_DELETE: 'provider:delete',
  PROVIDER_SET_KEY: 'provider:setKey',
  PROVIDER_TEST: 'provider:test',
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_RENAME: 'session:rename',
  SESSION_DELETE: 'session:delete',
  SESSION_SET_BINDING: 'session:setBinding',
  CHAT_SEND: 'chat:send',
  CHAT_STOP: 'chat:stop',
  CHAT_DELTA: 'chat:delta',
  CHAT_DONE: 'chat:done',
  CHAT_ERROR: 'chat:error',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** 测试连接结果 */
export interface TestResult {
  ok: boolean;
  error?: { kind: 'auth' | 'network' | 'model' | 'unknown'; message: string };
  latencyMs?: number;
}

/** 流式增量推送 payload */
export interface ChatDeltaPayload {
  sessionId: string;
  delta: string;
}

export interface ChatDonePayload {
  sessionId: string;
  message: Message;
}

export interface ChatErrorPayload {
  sessionId: string;
  message: string;
}

/** Preload 通过 contextBridge 暴露给 Renderer 的 API 形状 */
export interface ExposedApi {
  provider: {
    list(): Promise<ProviderConfig[]>;
    create(input: ProviderInput, apiKey: string): Promise<ProviderConfig>;
    update(id: string, input: Partial<ProviderInput>, apiKey?: string): Promise<ProviderConfig>;
    delete(id: string): Promise<void>;
    test(id: string): Promise<TestResult>;
  };
  session: {
    list(): Promise<Session[]>;
    create(title?: string): Promise<Session>;
    rename(id: string, title: string): Promise<Session>;
    delete(id: string): Promise<void>;
    setBinding(id: string, binding: SessionBinding): Promise<Session>;
    messages(sessionId: string): Promise<Message[]>;
  };
  chat: {
    send(sessionId: string, userMessage: string): Promise<void>;
    stop(sessionId: string): Promise<void>;
    onDelta(cb: (p: ChatDeltaPayload) => void): () => void;
    onDone(cb: (p: ChatDonePayload) => void): () => void;
    onError(cb: (p: ChatErrorPayload) => void): () => void;
  };
}

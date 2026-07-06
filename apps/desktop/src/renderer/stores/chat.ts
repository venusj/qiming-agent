import { create } from 'zustand';
import type {
  Session,
  Message,
  ProviderConfig,
  ApprovalRequest,
  ApprovalDecision,
  ToolCallEvent,
  ToolResultEvent,
} from '@qiming/shared';
import { api } from '../ipc/client';

/**
 * P2.7：消息流中的工具调用条目。
 * - status='pending'：onToolCall 收到，等待 onToolResult 配对。
 * - status='ok'/'fail'：onToolResult 到达后由 callId 配对写入。
 */
export interface ToolCallState {
  callId: string;
  tool: ToolCallEvent['tool'];
  args: Record<string, unknown>;
  /** 结果未到达 = 'pending'；ok=true = 'ok'；ok=false = 'fail' */
  status: 'pending' | 'ok' | 'fail';
  result?: unknown;
  createdAt: number;
}

/**
 * 聊天页全局状态（zustand）。
 *
 * ── onDelta/onDone/onError 监听泄漏处理 ──
 * brief Step 2 的原始设计在每次 send() 内部调用 api.chat.onDelta(...)，
 * 每次都向 ipcRenderer 注册一个新监听且永不解除 → 内存与回调泄漏。
 *
 * 此实现改为：在首次 send 时（lazyInitStreamListeners）注册一次 onDelta/onDone/onError，
 * 把 unsubscribe 句柄保存到模块作用域；后续 send 复用同一组监听器，
 * 仅按 activeSessionId 过滤事件。这样无论发多少条消息，监听器数量恒为 3。
 * 组件无需在 unmount 时清理（Renderer 进程生命周期 = 应用生命周期）。
 */
interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  streaming: boolean;
  streamBuffer: string;
  providers: ProviderConfig[];
  /** P1.3 新增：最近一轮对话的上下文用量（null=尚未收到 done） */
  usage: { contextWindow: number; usedTokens: number } | null;
  /** P2.6：当前待审批请求（null=无）。一次只展示一个；队列后续请求排队等当前解决。 */
  pendingApproval: ApprovalRequest | null;
  respondApproval: (decision: ApprovalDecision) => Promise<void>;
  /** P2.7：工具调用流（按到达顺序，含调用与配对的结果） */
  toolCalls: ToolCallState[];
  loadSessions: () => Promise<void>;
  loadProviders: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  setBinding: (providerId: string, model: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

// 模块作用域：流式监听器只注册一次的标志位（避免在 store state 里塞入非序列化函数）。
let streamListenersReady = false;

/** 幂等地注册 onDelta/onDone/onError 一次。后续复用。 */
function ensureStreamListeners(
  get: () => ChatState,
  set: (partial: Partial<ChatState>) => void,
) {
  if (streamListenersReady) return;
  streamListenersReady = true;

  api.chat.onDelta((p) => {
    // 仅当增量属于当前活跃会话时累加到 streamBuffer。
    if (p.sessionId === get().activeSessionId) {
      set({ streamBuffer: get().streamBuffer + p.delta });
    }
  });

  api.chat.onDone(async (p) => {
    // 收尾：拉取最新消息列表并清空 buffer，无论是否仍 streaming。
    if (p.sessionId === get().activeSessionId) {
      set({
        streaming: false,
        streamBuffer: '',
        messages: await api.session.messages(p.sessionId),
        usage: p.usage ?? null,
      });
    }
  });

  api.chat.onError((p) => {
    if (p.sessionId === get().activeSessionId) {
      // 错误：把错误信息以系统口吻追加进 buffer 便于用户感知，并结束 streaming。
      // P2 final-fix I5：同时清掉残留 pendingApproval——流已终止，
      // ApprovalDialog 不应继续指向一个被废弃的审批请求。
      set({
        streaming: false,
        streamBuffer: get().streamBuffer + `\n\n> 〔${p.message}〕`,
        pendingApproval: null,
      });
    }
  });

  api.tools.onApprovalRequest((req) => {
    // 只展示属于当前活跃会话的审批（其它会话的请求由其当时的 UI 处理；
    // 实际同时只有一个会话在生成，故直接 set）
    if (req.sessionId === get().activeSessionId) {
      set({ pendingApproval: req });
    }
  });

  // P2.7：工具调用流。onToolCall 追加 pending 条目；onToolResult 按 callId 配对写结果。
  api.tools.onToolCall((p: ToolCallEvent) => {
    if (p.sessionId !== get().activeSessionId) return;
    const next: ToolCallState = {
      callId: p.callId,
      tool: p.tool,
      args: p.args,
      status: 'pending',
      createdAt: Date.now(),
    };
    set({ toolCalls: [...get().toolCalls, next] });
  });
  api.tools.onToolResult((p: ToolResultEvent) => {
    if (p.sessionId !== get().activeSessionId) return;
    set({
      toolCalls: get().toolCalls.map((tc) =>
        tc.callId === p.callId
          ? { ...tc, status: p.ok ? 'ok' : 'fail', result: p.result }
          : tc,
      ),
    });
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  streaming: false,
  streamBuffer: '',
  providers: [],
  usage: null,
  pendingApproval: null,
  toolCalls: [],

  loadSessions: async () => set({ sessions: await api.session.list() }),
  loadProviders: async () => set({ providers: await api.provider.list() }),

  selectSession: async (id) => {
    set({
      activeSessionId: id,
      messages: await api.session.messages(id),
      streamBuffer: '',
      usage: null,
      // P2.6：切换会话时清掉残留审批（会话 A 的待审批不应阻塞会话 B 的视图）。
      pendingApproval: null,
      // P2.7：切换会话时清空工具调用流（旧会话的工具条目不应混入新会话视图）。
      toolCalls: [],
    });
  },

  newSession: async () => {
    const s = await api.session.create('新对话');
    set({
      sessions: [s, ...get().sessions],
      activeSessionId: s.id,
      messages: [],
      streamBuffer: '',
      usage: null,
      pendingApproval: null,
      toolCalls: [],
    });
  },

  setBinding: async (providerId, model) => {
    const id = get().activeSessionId;
    if (!id) return;
    await api.session.setBinding(id, { providerId, model });
    set({
      sessions: get().sessions.map((s) =>
        s.id === id ? { ...s, providerId, model } : s,
      ),
    });
  },

  send: async (text) => {
    const id = get().activeSessionId;
    if (!id || !text.trim() || get().streaming) return;
    // 先确保流式监听器已注册（仅首次真正注册）。
    ensureStreamListeners(get, set);
    set({ streaming: true, streamBuffer: '' });
    try {
      // api.chat.send resolve 即代表本轮流式结束前的 invoke 返回；
      // 真正的收尾（messages 刷新 / streaming 复位）由 onDone/onError 监听器负责。
      await api.chat.send(id, text);
    } catch (e) {
      // invoke 层面的异常（例如未绑定 provider）。
      set({
        streaming: false,
        streamBuffer: get().streamBuffer + `\n\n> 〔${String((e as Error).message || e)}〕`,
      });
    }
  },

  stop: async () => {
    const id = get().activeSessionId;
    if (id) await api.chat.stop(id);
    // P2 final-fix I5：用户中断时清掉 pendingApproval——
    // 流已停止，ApprovalDialog 不应继续指向被废弃的请求。
    set({ streaming: false, pendingApproval: null });
  },

  respondApproval: async (decision) => {
    const req = get().pendingApproval;
    if (!req) return;
    // 先清掉对话框（响应式 UX），再发 IPC；顺序不可颠倒——避免 send 失败时弹窗卡死。
    set({ pendingApproval: null });
    await api.tools.respondApproval(req, decision);
  },
}));

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type ExposedApi } from '@qiming/shared';

/**
 * 通过 contextBridge 暴露受限 API 到 window.qiming。
 * Renderer 无法直接访问 ipcRenderer 或 Node/Electron 能力，只能调用此处的白名单方法。
 *
 * 流式事件（onDelta/onDone/onError）用 ipcRenderer.on 注册监听，返回 unsubscribe。
 */
const api: ExposedApi = {
  provider: {
    list: () => ipcRenderer.invoke(IPC.PROVIDER_LIST),
    create: (input, apiKey) => ipcRenderer.invoke(IPC.PROVIDER_CREATE, input, apiKey),
    update: (id, input, apiKey) => ipcRenderer.invoke(IPC.PROVIDER_UPDATE, id, input, apiKey),
    delete: (id) => ipcRenderer.invoke(IPC.PROVIDER_DELETE, id),
    test: (id) => ipcRenderer.invoke(IPC.PROVIDER_TEST, id),
  },
  session: {
    list: () => ipcRenderer.invoke(IPC.SESSION_LIST),
    create: (title) => ipcRenderer.invoke(IPC.SESSION_CREATE, title),
    rename: (id, title) => ipcRenderer.invoke(IPC.SESSION_RENAME, id, title),
    delete: (id) => ipcRenderer.invoke(IPC.SESSION_DELETE, id),
    setBinding: (id, binding) => ipcRenderer.invoke(IPC.SESSION_SET_BINDING, id, binding),
    messages: (sessionId) => ipcRenderer.invoke(IPC.SESSION_MESSAGES, sessionId),
  },
  chat: {
    send: (sessionId, userMessage) => ipcRenderer.invoke(IPC.CHAT_SEND, sessionId, userMessage),
    stop: (sessionId) => ipcRenderer.invoke(IPC.CHAT_STOP, sessionId),
    onDelta: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_DELTA, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_DELTA, h);
      };
    },
    onDone: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_DONE, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_DONE, h);
      };
    },
    onError: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_ERROR, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_ERROR, h);
      };
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
  memory: {
    list: () => ipcRenderer.invoke(IPC.MEMORY_LIST),
    add: (content, providerId) =>
      ipcRenderer.invoke(IPC.MEMORY_ADD, content, providerId),
    update: (id, input, providerId) =>
      ipcRenderer.invoke(IPC.MEMORY_UPDATE, id, input, providerId),
    delete: (id) => ipcRenderer.invoke(IPC.MEMORY_DELETE, id),
    reembed: (providerId) => ipcRenderer.invoke(IPC.MEMORY_REEMBED, providerId),
  },
  tools: {
    list: () => ipcRenderer.invoke(IPC.TOOLS_LIST),
    setWorkspace: (path) => ipcRenderer.invoke(IPC.TOOLS_SET_WORKSPACE, path),
    getWorkspace: () => ipcRenderer.invoke(IPC.TOOLS_GET_WORKSPACE),
    pickWorkspace: () => ipcRenderer.invoke(IPC.TOOLS_PICK_WORKSPACE),
    // 跨任务修正：透传整个 ApprovalRequest（含 sessionId/tool），
    // Main 侧 respond 需要 sessionId+tool 来登记 sessionAllowed。
    respondApproval: (req, decision) =>
      ipcRenderer.invoke(IPC.CHAT_APPROVAL_RESPOND, req, decision),
    onApprovalRequest: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_APPROVAL_REQUEST, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_APPROVAL_REQUEST, h);
      };
    },
    onToolCall: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_TOOL_CALL, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_TOOL_CALL, h);
      };
    },
    onToolResult: (cb) => {
      const h = (_e: IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p);
      ipcRenderer.on(IPC.CHAT_TOOL_RESULT, h);
      return () => {
        ipcRenderer.off(IPC.CHAT_TOOL_RESULT, h);
      };
    },
  },
};

contextBridge.exposeInMainWorld('qiming', api);

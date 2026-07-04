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
};

contextBridge.exposeInMainWorld('qiming', api);

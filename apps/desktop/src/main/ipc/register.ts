import { registerProviderHandlers } from './handlers/provider';
import { registerSessionHandlers } from './handlers/session';
import { registerChatHandlers } from './handlers/chat';

/** 注册所有 Main 侧 IPC handlers。在 app.whenReady() 中、创建窗口前调用。 */
export function registerIpc() {
  registerProviderHandlers();
  registerSessionHandlers();
  registerChatHandlers();
}

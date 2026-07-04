import { ipcMain } from 'electron';
import { IPC } from '@qiming/shared';
import { runTurn, stopTurn } from '../../chat/run';

/** Chat IPC handlers。流式 delta/done/error 经 webContents.send 推送，不由 invoke 返回。 */
export function registerChatHandlers() {
  ipcMain.handle(IPC.CHAT_SEND, (_e, sessionId: string, userMessage: string) =>
    runTurn(sessionId, userMessage),
  );
  ipcMain.handle(IPC.CHAT_STOP, (_e, sessionId: string) => stopTurn(sessionId));
}

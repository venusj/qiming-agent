import { ipcMain } from 'electron';
import { IPC, type SessionBinding } from '@qiming/shared';
import { getDb } from '../../store';
import { createSessionStore } from '../../store';

/** Session + Message IPC handlers。 */
export function registerSessionHandlers() {
  const store = createSessionStore(getDb());

  ipcMain.handle(IPC.SESSION_LIST, () => store.listSessions());
  ipcMain.handle(IPC.SESSION_CREATE, (_e, title?: string) => store.createSession(title ?? null));
  ipcMain.handle(IPC.SESSION_RENAME, (_e, id: string, title: string) => store.rename(id, title));
  ipcMain.handle(IPC.SESSION_DELETE, (_e, id: string) => store.delete(id));
  ipcMain.handle(IPC.SESSION_SET_BINDING, (_e, id: string, binding: SessionBinding) =>
    store.setBinding(id, binding),
  );
  ipcMain.handle(IPC.SESSION_MESSAGES, (_e, sessionId: string) => store.messages(sessionId));
}

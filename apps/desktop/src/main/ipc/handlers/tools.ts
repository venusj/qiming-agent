// apps/desktop/src/main/ipc/handlers/tools.ts
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC, type ApprovalRequest, type ApprovalDecision } from '@qiming/shared';
import { getDb, createSettingsStore } from '../../store';
import { TOOL_INFOS } from '../../tools/infos';
import { setWorkspaceRoot, getWorkspaceRoot } from '../../tools/paths';
import { getApprovalQueue } from '../../approval/queue';

const WORKSPACE_KEY = 'workspace';

/**
 * tools/approval/workspace IPC handlers。
 *
 * - TOOLS_LIST：返回只读 + 危险工具的元信息（供 Renderer 列表渲染）。
 * - TOOLS_GET_WORKSPACE / TOOLS_SET_WORKSPACE：读写工作目录；
 *   setWorkspace 同步写 settings 表 + paths 模块状态。
 * - CHAT_APPROVAL_RESPOND：Renderer 回传审批决策。签名 (req, decision) —
 *   把 ApprovalRequest 整体回传，Main 侧从中取 id/sessionId/tool 调 queue.respond。
 *   （跨任务修正：原 P2.0 契约为 (id, decision)，sessionAllowed 需要 sessionId+tool，
 *    故改为透传 req；本 handler 在 P2.3 内同步修正。）
 */
export function registerToolHandlers() {
  // 启动时把 settings 里的 workspace 灌进 paths 模块（在本函数被调时执行一次）
  const db = getDb();
  const settings = createSettingsStore(db);
  const saved = settings.get(WORKSPACE_KEY);
  if (saved) setWorkspaceRoot(saved);

  ipcMain.handle(IPC.TOOLS_LIST, () => TOOL_INFOS);

  // P2 final-fix I2（文档化不变式）：此处返回的是 paths 模块的内存缓存，而非直接读
  // settings 表。双写一致性依赖一个约定——所有 workspace 写入者必须成对调用：
  // settings.set(WORKSPACE_KEY, p) + setWorkspaceRoot(p)。当前两处写入者：
  //   1) 本文件的 TOOLS_SET_WORKSPACE handler（上行 setWorkspaceRoot + settings.set）
  //   2) main/index.ts 首次启动目录选择（同样成对调用）
  // 新增写入者时务必保持这一配对，否则 GET 返回值会与持久化值漂移。
  ipcMain.handle(IPC.TOOLS_GET_WORKSPACE, () => getWorkspaceRoot());

  ipcMain.handle(IPC.TOOLS_SET_WORKSPACE, (_e, path: string) => {
    setWorkspaceRoot(path);
    settings.set(WORKSPACE_KEY, path);
  });

  // P2.7：弹原生目录选择器。SettingsPage 的"选择目录"按钮调用。
  // 取消或未选返回 null；否则返回首个路径字符串。Main 进程不在此处持久化，
  // 由调用方拿到 path 后再调 setWorkspace（写 settings + paths 模块）。
  ipcMain.handle(IPC.TOOLS_PICK_WORKSPACE, async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC.CHAT_APPROVAL_RESPOND,
    (_e, req: ApprovalRequest, decision: ApprovalDecision) => {
      getApprovalQueue().respond(req.id, decision, req.sessionId, req.tool);
    },
  );
}

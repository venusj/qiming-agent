// apps/desktop/src/main/ipc/handlers/tools.ts
import { ipcMain } from 'electron';
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

  ipcMain.handle(IPC.TOOLS_GET_WORKSPACE, () => getWorkspaceRoot());

  ipcMain.handle(IPC.TOOLS_SET_WORKSPACE, (_e, path: string) => {
    setWorkspaceRoot(path);
    settings.set(WORKSPACE_KEY, path);
  });

  ipcMain.handle(
    IPC.CHAT_APPROVAL_RESPOND,
    (_e, req: ApprovalRequest, decision: ApprovalDecision) => {
      getApprovalQueue().respond(req.id, decision, req.sessionId, req.tool);
    },
  );
}

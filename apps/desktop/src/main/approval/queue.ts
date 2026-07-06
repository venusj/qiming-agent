// apps/desktop/src/main/approval/queue.ts
import { BrowserWindow } from 'electron';
import { IPC, type ApprovalRequest, type ApprovalDecision, type ToolName } from '@qiming/shared';

interface Pending {
  resolve: (d: ApprovalDecision) => void;
}

/**
 * 审批队列（Main 进程单例）。
 *
 * - pending：id → resolve 回调（每个请求挂起一个 Promise，等 Renderer 决策）。
 * - sessionAllowed：sessionId → 本会话总允许的工具集合。
 *   切换会话/重启 → Map 是内存态自动重置。
 *
 * request() 先查 sessionAllowed，命中则直接 'allow'（不弹窗）；
 * 否则经 IPC 推 CHAT_APPROVAL_REQUEST 给 Renderer，挂起 Promise。
 */
export class ApprovalQueue {
  private pending = new Map<string, Pending>();
  private sessionAllowed = new Map<string, Set<ToolName>>();

  async request(sessionId: string, req: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.sessionAllowed.get(sessionId)?.has(req.tool)) return 'allow';
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send(IPC.CHAT_APPROVAL_REQUEST, req);
    return new Promise<ApprovalDecision>((resolve) => {
      this.pending.set(req.id, { resolve });
    });
  }

  respond(
    id: string,
    decision: ApprovalDecision,
    sessionId: string,
    tool: ToolName,
  ): void {
    const p = this.pending.get(id);
    if (p) {
      p.resolve(decision);
      this.pending.delete(id);
    }
    if (decision === 'allow_session') {
      if (!this.sessionAllowed.has(sessionId)) {
        this.sessionAllowed.set(sessionId, new Set());
      }
      this.sessionAllowed.get(sessionId)!.add(tool);
    }
  }

  /** 清空某会话的总允许集合（测试辅助；切换会话不主动调，靠内存态自然重置）。 */
  clearSession(sessionId: string): void {
    this.sessionAllowed.delete(sessionId);
  }

  /** 测试辅助：pending 是否为空。 */
  hasNoPending(): boolean {
    return this.pending.size === 0;
  }
}

let singleton: ApprovalQueue | null = null;
export function getApprovalQueue(): ApprovalQueue {
  if (!singleton) singleton = new ApprovalQueue();
  return singleton;
}

// packages/shared/src/tool.ts
/** P2 工具系统类型契约。Main/Renderer/preload 三处共用。 */

export type ToolName =
  | 'read_file'
  | 'list_directory'
  | 'glob'
  | 'grep'
  | 'write_file'
  | 'edit_file'
  | 'run_shell';

export type ToolRisk = 'readonly' | 'dangerous';

export interface ToolInfo {
  name: ToolName;
  description: string;
  risk: ToolRisk;
}

/** Main→Renderer 推送的审批请求 */
export interface ApprovalRequest {
  id: string;
  sessionId: string;
  tool: ToolName;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: number;
}

/** 审批决策：deny 拒绝 / allow 允许本次 / allow_session 本会话总允许（不持久） */
export type ApprovalDecision = 'deny' | 'allow' | 'allow_session';

/** 工具调用事件（M→R 推送，出现在消息流中） */
export interface ToolCallEvent {
  sessionId: string;
  /** 单次调用唯一 id，用于把后续 ToolResultEvent 配对到同一调用 */
  callId: string;
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  sessionId: string;
  callId: string;
  tool: ToolName;
  result: unknown;
  ok: boolean;
}

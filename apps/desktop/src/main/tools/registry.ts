// apps/desktop/src/main/tools/registry.ts
import type { Tool } from 'ai';
// 占位（P2.3 之后替换为真实 ApprovalQueue，从 '../approval/queue' 导入）
type ApprovalQueue = unknown;
import { readFileTool } from './builtins/readFile';
import { listDirectoryTool } from './builtins/listDirectory';
import { globTool } from './builtins/glob';
import { grepTool } from './builtins/grep';

/**
 * 构建本会话的工具集。
 *  - 只读工具：静态对象，直接注入。
 *  - 危险工具：工厂函数（writeFile/editFile/runShell），注入 approvals + sessionId
 *    以便 execute 内部 await 审批。P2.4 之后补齐。
 */
export function buildToolRegistry(
  _approvals: ApprovalQueue,
  _sessionId: string,
): Record<string, Tool> {
  return {
    read_file: readFileTool,
    list_directory: listDirectoryTool,
    glob: globTool,
    grep: grepTool,
    // P2.4 追加：
    // write_file: writeFileTool(approvals, sessionId),
    // edit_file: editFileTool(approvals, sessionId),
    // run_shell: runShellTool(approvals, sessionId),
  };
}

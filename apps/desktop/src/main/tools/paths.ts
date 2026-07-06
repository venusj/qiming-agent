// apps/desktop/src/main/tools/paths.ts
import { resolve, isAbsolute } from 'node:path';

/**
 * 工作目录根。Main 进程模块级单例：
 *  - 应用启动时从 settings 表读取并 setWorkspaceRoot。
 *  - 用户在设置页改目录时，IPC handler 同时写 settings + setWorkspaceRoot。
 *
 * P2 不做路径白名单沙箱——审批机制是安全网。工作目录仅用于解析相对路径。
 */
let workspaceRoot = '';

export function setWorkspaceRoot(path: string): void {
  workspaceRoot = path;
}

export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

/** 相对路径 → 相对 workspaceRoot 解析；绝对路径原样返回。 */
export function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(workspaceRoot, p);
}

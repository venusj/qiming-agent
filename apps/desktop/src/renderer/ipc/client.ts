import type { ExposedApi } from '@qiming/shared';

/**
 * Preload 通过 contextBridge 暴露的受限 API 单例入口。
 * Renderer 全部 IPC 调用均经此转发，便于 mock/替换与集中审计。
 *
 * 注意：T11 暴露的命名空间仅 provider / session / chat。
 * 窗口控制（最小化/最大化/关闭）由 T14 才加入的 window 命名空间提供，
 * 当前阶段不可调用 `window.qiming.window.*`。
 */
export const api: ExposedApi = window.qiming;

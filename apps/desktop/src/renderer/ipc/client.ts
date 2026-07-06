import type { ExposedApi } from '@qiming/shared';

/**
 * Preload 通过 contextBridge 暴露的受限 API 单例入口。
 * Renderer 全部 IPC 调用均经此转发，便于 mock/替换与集中审计。
 *
 * 命名空间演进：
 *  - provider / session / chat：P0 起可用（厂商/会话/流式对话）。
 *  - window：P0 起可用（最小化/最大化/关闭，已暴露于 preload）。
 *  - memory：P1.8 起可用（长期记忆管理）。
 *  - tools：P2 起可用（工具元信息、工作目录、审批、工具调用可视化事件）。
 */
export const api: ExposedApi = window.qiming;

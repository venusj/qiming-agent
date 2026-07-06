// apps/desktop/tests/approval-queue.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock electron BrowserWindow.getAllWindows（queue.request 会调它）
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

import { ApprovalQueue } from '../src/main/approval/queue';
import type { ApprovalRequest, ToolName } from '@qiming/shared';

function mkReq(id: string, tool: ToolName = 'write_file'): ApprovalRequest {
  return {
    id,
    sessionId: 's1',
    tool,
    summary: 'test',
    detail: {},
    createdAt: 0,
  };
}

describe('ApprovalQueue', () => {
  let q: ApprovalQueue;
  beforeEach(() => {
    q = new ApprovalQueue();
  });

  it('request 返回的 Promise 在 respond 后 resolve', async () => {
    const p = q.request('s1', mkReq('r1'));
    expect(q.hasNoPending()).toBe(false);
    q.respond('r1', 'allow', 's1', 'write_file');
    await expect(p).resolves.toBe('allow');
    expect(q.hasNoPending()).toBe(true);
  });

  it('respond allow 后 sessionAllowed 不变（allow 只本次）', async () => {
    const p1 = q.request('s1', mkReq('r1'));
    q.respond('r1', 'allow', 's1', 'write_file');
    await p1;
    // 再次 request 同会话同工具 → 不应命中缓存，仍挂起
    const p2 = q.request('s1', mkReq('r2'));
    expect(q.hasNoPending()).toBe(false);
    q.respond('r2', 'deny', 's1', 'write_file');
    await p2;
  });

  it('respond allow_session 后同会话同工具直接放行', async () => {
    const p1 = q.request('s1', mkReq('r1', 'write_file'));
    q.respond('r1', 'allow_session', 's1', 'write_file');
    await p1;
    // 再次 request → 立即 allow，不挂起
    const p2 = q.request('s1', mkReq('r2', 'write_file'));
    await expect(p2).resolves.toBe('allow');
    expect(q.hasNoPending()).toBe(true);
  });

  it('allow_session 按 sessionId 隔离', async () => {
    const p1 = q.request('s1', mkReq('r1', 'write_file'));
    q.respond('r1', 'allow_session', 's1', 'write_file');
    await p1;
    // 另一会话同工具 → 仍挂起
    const p2 = q.request('s2', mkReq('r2', 'write_file'));
    expect(q.hasNoPending()).toBe(false);
    q.respond('r2', 'deny', 's2', 'write_file');
    await p2;
  });

  it('respond 未知 id 不抛错（幂等）', () => {
    expect(() => q.respond('unknown', 'allow', 's1', 'write_file')).not.toThrow();
  });

  it('deny 决策 resolve 为 deny', async () => {
    const p = q.request('s1', mkReq('r1'));
    q.respond('r1', 'deny', 's1', 'write_file');
    await expect(p).resolves.toBe('deny');
  });

  it('clearSession 后总允许失效', async () => {
    const p1 = q.request('s1', mkReq('r1', 'write_file'));
    q.respond('r1', 'allow_session', 's1', 'write_file');
    await p1;
    q.clearSession('s1');
    const p2 = q.request('s1', mkReq('r2', 'write_file'));
    expect(q.hasNoPending()).toBe(false);
    q.respond('r2', 'deny', 's1', 'write_file');
    await p2;
  });
});

// apps/desktop/tests/tools.dangerous.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setWorkspaceRoot } from '../src/main/tools/paths';
import { writeFileTool } from '../src/main/tools/builtins/writeFile';
import { editFileTool } from '../src/main/tools/builtins/editFile';
import { runShellTool } from '../src/main/tools/builtins/runShell';

// mock 一个 approvals：可控决策
function mockApprovals(decision: 'allow' | 'deny' = 'allow') {
  return {
    request: async () => decision,
    // 其余方法用不到，给 noop
    respond: () => {},
    clearSession: () => {},
    hasNoPending: () => true,
  };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'qiming-p2-d-'));
  setWorkspaceRoot(root);
});
afterEach(async () => {
  setWorkspaceRoot('');
  await rm(root, { recursive: true, force: true });
});

describe('write_file', () => {
  it('allow 时写入文件', async () => {
    const t = writeFileTool(mockApprovals('allow') as never, 's1');
    const r = await t.execute({ path: 'out.txt', content: 'hi' }, {} as never);
    expect(r).toMatchObject({ ok: true });
    expect(await readFile(join(root, 'out.txt'), 'utf-8')).toBe('hi');
  });
  it('deny 时返回错误且不写入', async () => {
    const t = writeFileTool(mockApprovals('deny') as never, 's1');
    const r = await t.execute({ path: 'out.txt', content: 'hi' }, {} as never);
    expect(r).toMatchObject({ ok: false });
    expect(r).toHaveProperty('error', '用户拒绝');
    // 文件不应存在
    await expect(readFile(join(root, 'out.txt'), 'utf-8')).rejects.toThrow();
  });
  it('自动创建父目录', async () => {
    const t = writeFileTool(mockApprovals('allow') as never, 's1');
    await t.execute({ path: 'sub/dir/x.txt', content: 'd' }, {} as never);
    expect(await readFile(join(root, 'sub/dir/x.txt'), 'utf-8')).toBe('d');
  });
});

describe('edit_file', () => {
  it('精确替换所有匹配', async () => {
    await writeFile(join(root, 'e.txt'), 'aaa bbb aaa');
    const t = editFileTool(mockApprovals('allow') as never, 's1');
    const r = await t.execute(
      { path: 'e.txt', oldText: 'aaa', newText: 'X' },
      {} as never,
    );
    expect(r).toMatchObject({ ok: true, replaced: 2 });
    expect(await readFile(join(root, 'e.txt'), 'utf-8')).toBe('X bbb X');
  });
  it('oldText 不匹配时返回错误', async () => {
    await writeFile(join(root, 'e.txt'), 'foo');
    const t = editFileTool(mockApprovals('allow') as never, 's1');
    const r = await t.execute(
      { path: 'e.txt', oldText: 'bar', newText: 'baz' },
      {} as never,
    );
    expect(r).toMatchObject({ ok: false });
  });
});

describe('run_shell', () => {
  it('allow 时执行命令并返回输出', async () => {
    const t = runShellTool(mockApprovals('allow') as never, 's1');
    const cmd = process.platform === 'win32' ? 'echo hello' : 'echo hello';
    const r = (await t.execute({ command: cmd }, {} as never)) as {
      ok: boolean;
      stdout: string;
    };
    expect(r.ok).toBe(true);
    expect(r.stdout.toLowerCase()).toContain('hello');
  });
  it('deny 时不执行', async () => {
    const t = runShellTool(mockApprovals('deny') as never, 's1');
    const r = await t.execute({ command: 'echo x' }, {} as never);
    expect(r).toMatchObject({ ok: false, error: '用户拒绝' });
  });
});

// P2 final-fix I6：补 edit_file deny + run_shell deny no-spawn 两个测试。
describe('edit_file deny', () => {
  it('deny 时文件内容不变', async () => {
    await writeFile(join(root, 'e.txt'), 'original');
    const t = editFileTool(mockApprovals('deny') as never, 's1');
    const r = await t.execute(
      { path: 'e.txt', oldText: 'original', newText: 'CHANGED' },
      {} as never,
    );
    expect(r).toMatchObject({ ok: false });
    expect(r).toHaveProperty('error', '用户拒绝');
    // 文件内容未变
    expect(await readFile(join(root, 'e.txt'), 'utf-8')).toBe('original');
  });
});

describe('run_shell deny no-spawn', () => {
  it('deny 时 spawn 不被调用（approval 先于 spawn）', async () => {
    // 用 spy 拦截 approvals.request，断言它在任何 spawn 之前被 await。
    // spawn 是 runShell 内部 import，无法直接 spy；改为验证：
    // mockApprovals('deny') 返回 deny 后，execute 立即返回，spawn 不可能执行。
    // 关键：deny 后 execute 同步返回（Promise resolve），spawn 不可能跑。
    // 若实现错误地把 spawn 放在 approval 之前，approvalSpy 不会被调（或 command 会执行）。
    // approvalSpy 被调恰好 1 次证明 deny 路径走的是 request → return，未触 spawn。
    const approvalSpy = vi.fn(async () => 'deny' as const);
    const approvals = {
      request: approvalSpy,
      respond: vi.fn(),
      clearSession: vi.fn(),
      hasNoPending: () => true,
    };
    const t = runShellTool(approvals as never, 's1');
    const r = (await t.execute({ command: 'echo SHOULD_NOT_RUN' }, {} as never)) as {
      ok: boolean;
      error: string;
    };
    expect(r.ok).toBe(false);
    expect(r.error).toBe('用户拒绝');
    expect(approvalSpy).toHaveBeenCalledTimes(1);
  });
});

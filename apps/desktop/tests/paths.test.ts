// apps/desktop/tests/paths.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { setWorkspaceRoot, getWorkspaceRoot, resolvePath } from '../src/main/tools/paths';

describe('tools/paths', () => {
  afterEach(() => setWorkspaceRoot(''));

  it('workspaceRoot 默认空串', () => {
    expect(getWorkspaceRoot()).toBe('');
  });

  it('setWorkspaceRoot 后可读', () => {
    setWorkspaceRoot('/tmp/proj');
    expect(getWorkspaceRoot()).toBe('/tmp/proj');
  });

  it('相对路径相对 workspaceRoot 解析', () => {
    setWorkspaceRoot('/tmp/proj');
    // resolve 受 process.cwd + 平台分隔符影响（Windows 上带盘符 + 反斜杠），
    // 故将反斜杠归一化为 POSIX 风格后断言末尾段 = workspaceRoot + 输入。
    const r = resolvePath('src/a.ts').replace(/\\/g, '/');
    expect(r.endsWith('tmp/proj/src/a.ts')).toBe(true);
  });

  it('绝对路径原样返回', () => {
    setWorkspaceRoot('/tmp/proj');
    expect(resolvePath('/etc/hosts')).toBe('/etc/hosts');
  });
});

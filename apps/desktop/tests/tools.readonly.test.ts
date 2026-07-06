// apps/desktop/tests/tools.readonly.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setWorkspaceRoot } from '../src/main/tools/paths';
import { readFileTool } from '../src/main/tools/builtins/readFile';
import { listDirectoryTool } from '../src/main/tools/builtins/listDirectory';
import { globTool } from '../src/main/tools/builtins/glob';
import { grepTool } from '../src/main/tools/builtins/grep';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'qiming-p2-'));
  setWorkspaceRoot(root);
  // 准备测试树
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'a.txt'), 'hello world\nsecond line');
  await writeFile(join(root, 'src/b.ts'), 'export const x = 1;');
  await writeFile(join(root, 'src/c.ts'), 'export const y = 2;');
});
afterEach(async () => {
  setWorkspaceRoot('');
  await rm(root, { recursive: true, force: true });
});

describe('read_file', () => {
  it('读相对路径文件', async () => {
    const r = await readFileTool.execute({ path: 'a.txt' }, {} as never);
    expect(r.content).toContain('hello world');
    expect(r.truncated).toBe(false);
  });
  it('大文件截断', async () => {
    const big = 'x'.repeat(60000);
    await writeFile(join(root, 'big.txt'), big);
    const r = await readFileTool.execute({ path: 'big.txt' }, {} as never);
    expect(r.content.length).toBe(50000);
    expect(r.truncated).toBe(true);
  });
});

describe('list_directory', () => {
  it('列出文件与目录', async () => {
    const entries = await listDirectoryTool.execute({ path: '.' }, {} as never);
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain('a.txt');
    expect(names).toContain('src');
    const src = entries.find((e) => e.name === 'src');
    expect(src?.type).toBe('dir');
  });
});

describe('glob', () => {
  it('**/*.ts 匹配 src 下 ts', async () => {
    const r = await globTool.execute({ pattern: '**/*.ts' }, {} as never);
    expect(r.matches.sort()).toEqual(['src/b.ts', 'src/c.ts']);
  });
  it('上限 200 截断标记', async () => {
    for (let i = 0; i < 210; i++) {
      await writeFile(join(root, `f${i}.dat`), 'x');
    }
    const r = await globTool.execute({ pattern: 'f*.dat' }, {} as never);
    expect(r.matches.length).toBe(200);
    expect(r.truncated).toBe(true);
  });
});

describe('grep', () => {
  it('按正则命中行', async () => {
    const r = await grepTool.execute({ pattern: 'export const' }, {} as never);
    expect(r.hits.length).toBe(2);
    expect(r.hits.every((h) => h.file.endsWith('.ts'))).toBe(true);
  });
  it('glob 过滤文件名', async () => {
    const r = await grepTool.execute({ pattern: 'x', glob: 'b.ts' }, {} as never);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].file).toBe('src/b.ts');
  });
});

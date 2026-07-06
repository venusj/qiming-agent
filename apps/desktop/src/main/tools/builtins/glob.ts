// apps/desktop/src/main/tools/builtins/glob.ts
import { z } from 'zod';
import { readdir, stat } from 'node:fs/promises';
import { relative, resolve, join } from 'node:path';
import { resolvePath } from '../paths';
import type { Tool } from 'ai';

const MAX_RESULTS = 200;

const parameters = z.object({
  pattern: z.string().describe('glob 模式，如 "**/*.ts" 或 "src/*.json"'),
  path: z
    .string()
    .optional()
    .describe('搜索根目录，默认工作目录'),
});

/** 把 glob 模式转成正则。支持 **（跨层）、*（不含分隔符）、?（单字符）。 */
function globToRe(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** 跨任意层（含分隔符）
        re += '.*';
        i++;
        // 吃掉多余的 /
        if (pattern[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+()|^$\\{}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

export const globTool: Tool<
  typeof parameters,
  { matches: string[]; truncated: boolean }
> = {
  description:
    '按 glob 模式搜索文件路径（递归）。返回相对工作目录的匹配路径，上限 200 条。',
  parameters,
  async execute({ pattern, path }) {
    const root = path ? resolvePath(path) : resolvePath('.') === '.' ? '' : resolvePath('.');
    // 上面三元处理 '.' 在空 workspaceRoot 下；正常情况直接用 resolvePath(path ?? '.')
    const searchRoot = path ? resolvePath(path) : (resolvePath('.') || process.cwd());
    const re = globToRe(pattern);
    const matches: string[] = [];

    async function walk(dir: string) {
      if (matches.length >= MAX_RESULTS) return;
      let entries: string[] = [];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const abs = join(dir, name);
        let isDir = false;
        try {
          isDir = (await stat(abs)).isDirectory();
        } catch {
          isDir = false;
        }
        const rel = relative(searchRoot, abs).replace(/\\/g, '/');
        if (!isDir && re.test(rel)) {
          matches.push(rel);
          if (matches.length >= MAX_RESULTS) return;
        }
        if (isDir) await walk(abs);
      }
    }

    await walk(searchRoot);
    // 忽略 root 变量（仅为可读性保留），搜索以 searchRoot 为准
    void root;
    return { matches, truncated: matches.length >= MAX_RESULTS };
  },
};

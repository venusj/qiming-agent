// apps/desktop/src/main/tools/builtins/grep.ts
import { z } from 'zod';
import { readdir, stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { resolvePath } from '../paths';
import type { Tool } from 'ai';

const DEFAULT_MAX = 50;

const parameters = z.object({
  pattern: z.string().describe('正则表达式（JS 语法）'),
  path: z.string().optional().describe('搜索根目录，默认工作目录'),
  glob: z
    .string()
    .optional()
    .describe('限定文件名 glob（简单子串匹配，非完整 glob 语法）'),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`结果上限，默认 ${DEFAULT_MAX}`),
});

interface GrepHit {
  file: string;
  line: number;
  text: string;
}

export const grepTool: Tool<
  typeof parameters,
  { hits: GrepHit[]; truncated: boolean }
> = {
  description:
    '在文件内容中搜索正则。逐文件逐行扫描，返回 {file, line, text}。默认上限 50 条。',
  parameters,
  async execute({ pattern, path, glob, maxResults }) {
    const limit = maxResults ?? DEFAULT_MAX;
    const root = path ? resolvePath(path) : resolvePath('.');
    const re = new RegExp(pattern);
    const hits: GrepHit[] = [];
    const globSub = glob ?? '';

    async function walk(dir: string) {
      if (hits.length >= limit) return;
      let entries: string[] = [];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (hits.length >= limit) return;
        const abs = join(dir, name);
        let isDir = false;
        try {
          isDir = (await stat(abs)).isDirectory();
        } catch {
          continue;
        }
        if (isDir) {
          await walk(abs);
          continue;
        }
        if (globSub && !name.includes(globSub)) continue;
        let content: string;
        try {
          content = await readFile(abs, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= limit) break;
          if (re.test(lines[i])) {
            hits.push({
              file: relative(root, abs).replace(/\\/g, '/'),
              line: i + 1,
              text: lines[i].length > 500 ? lines[i].slice(0, 500) + '…' : lines[i],
            });
          }
        }
      }
    }

    await walk(root);
    return { hits, truncated: hits.length >= limit };
  },
};

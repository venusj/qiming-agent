// apps/desktop/src/main/tools/builtins/listDirectory.ts
import { z } from 'zod';
import { readdir, stat } from 'node:fs/promises';
import { resolvePath } from '../paths';
import type { Tool } from 'ai';

const parameters = z.object({
  path: z.string().describe('目录路径，绝对或相对工作目录'),
});

interface Entry {
  name: string;
  type: 'file' | 'dir';
}

export const listDirectoryTool: Tool<typeof parameters, Entry[]> = {
  description: '列出目录下的文件与子目录（不递归）。每项返回 name 与 type。',
  parameters,
  async execute({ path }) {
    const full = resolvePath(path);
    const names = await readdir(full);
    const out: Entry[] = [];
    for (const name of names) {
      let isDir = false;
      try {
        isDir = (await stat(`${full}/${name}`)).isDirectory();
      } catch {
        isDir = false;
      }
      out.push({ name, type: isDir ? 'dir' : 'file' });
    }
    return out;
  },
};

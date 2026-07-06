// apps/desktop/src/main/tools/builtins/readFile.ts
import { z } from 'zod';
import { readFile as fsReadFile } from 'node:fs/promises';
import type { Tool } from 'ai';
import { resolvePath } from '../paths';

const MAX_CHARS = 50000;

const parameters = z.object({
  path: z.string().describe('文件路径，绝对或相对工作目录'),
});

export const readFileTool: Tool<typeof parameters, { content: string; truncated: boolean }> = {
  description:
    '读取文本文件内容。超过 50000 字符会截断并在 truncated 字段标记。用于查看源码、配置、日志等。',
  parameters,
  async execute({ path }) {
    const full = resolvePath(path);
    const buf = await fsReadFile(full, 'utf-8');
    if (buf.length > MAX_CHARS) {
      return { content: buf.slice(0, MAX_CHARS), truncated: true };
    }
    return { content: buf, truncated: false };
  },
};

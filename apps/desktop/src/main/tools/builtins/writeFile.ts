// apps/desktop/src/main/tools/builtins/writeFile.ts
import { z } from 'zod';
import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Tool } from 'ai';
import type { ApprovalQueue } from '../../approval/queue';
import { resolvePath } from '../paths';

const PREVIEW_LEN = 500;

export function writeFileTool(
  approvals: ApprovalQueue,
  sessionId: string,
): Tool {
  const parameters = z.object({
    path: z.string().describe('文件路径，绝对或相对工作目录'),
    content: z.string().describe('要写入的完整内容（覆盖现有）'),
  });
  return {
    description: '写入文件（覆盖）。需用户审批。自动创建父目录。',
    parameters,
    async execute({ path, content }) {
      const full = resolvePath(path);
      const decision = await approvals.request(sessionId, {
        id: randomUUID(),
        sessionId,
        tool: 'write_file',
        summary: `写入文件：${path}`,
        detail: { path: full, contentPreview: content.slice(0, PREVIEW_LEN) },
        createdAt: Date.now(),
      });
      if (decision === 'deny') return { ok: false, error: '用户拒绝' };
      await mkdir(dirname(full), { recursive: true });
      await fsWriteFile(full, content, 'utf-8');
      return { ok: true, path: full, bytes: content.length };
    },
  };
}

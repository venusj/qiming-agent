// apps/desktop/src/main/tools/builtins/editFile.ts
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Tool } from 'ai';
import type { ApprovalQueue } from '../../approval/queue';
import { resolvePath } from '../paths';

export function editFileTool(
  approvals: ApprovalQueue,
  sessionId: string,
): Tool {
  const parameters = z.object({
    path: z.string().describe('文件路径，绝对或相对工作目录'),
    oldText: z.string().describe('要被替换的精确文本（必须唯一匹配）'),
    newText: z.string().describe('替换为的文本'),
  });
  return {
    description:
      '编辑文件：把所有精确匹配 oldText 处替换为 newText。需用户审批。',
    parameters,
    async execute({ path, oldText, newText }) {
      const full = resolvePath(path);
      const original = await readFile(full, 'utf-8');
      // 统计匹配数
      let count = 0;
      let idx = 0;
      while ((idx = original.indexOf(oldText, idx)) !== -1) {
        count++;
        idx += oldText.length;
      }
      if (count === 0) {
        return { ok: false, error: 'oldText 在文件中未匹配' };
      }
      const decision = await approvals.request(sessionId, {
        id: randomUUID(),
        sessionId,
        tool: 'edit_file',
        summary: `编辑文件：${path}（替换 ${count} 处）`,
        detail: {
          path: full,
          oldTextPreview: oldText.slice(0, 300),
          newTextPreview: newText.slice(0, 300),
          count,
        },
        createdAt: Date.now(),
      });
      if (decision === 'deny') return { ok: false, error: '用户拒绝' };
      const replaced = original.split(oldText).join(newText);
      await writeFile(full, replaced, 'utf-8');
      return { ok: true, path: full, replaced: count };
    },
  };
}

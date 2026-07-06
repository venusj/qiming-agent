// apps/desktop/src/main/tools/builtins/runShell.ts
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Tool } from 'ai';
import type { ApprovalQueue } from '../../approval/queue';
import { resolvePath } from '../paths';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 10_000;

export function runShellTool(
  approvals: ApprovalQueue,
  sessionId: string,
): Tool {
  const parameters = z.object({
    command: z.string().describe('要执行的 shell 命令（明文，单行）'),
    cwd: z.string().optional().describe('工作目录，默认工作目录根'),
  });
  return {
    description:
      '执行 shell 命令。30 秒超时。stdout/stderr 各截断 10000 字符。需用户审批。',
    parameters,
    async execute({ command, cwd }) {
      const workDir = cwd ? resolvePath(cwd) : resolvePath('.') || process.cwd();
      const decision = await approvals.request(sessionId, {
        id: randomUUID(),
        sessionId,
        tool: 'run_shell',
        summary: `执行命令：${command}`,
        detail: { command, cwd: workDir },
        createdAt: Date.now(),
      });
      if (decision === 'deny') return { ok: false, error: '用户拒绝' };

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timer: NodeJS.Timeout | null = null;
        const child = spawn(command, {
          cwd: workDir,
          shell: true,
          windowsHide: true,
        });
        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString();
          if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT);
        });
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
          if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT);
        });
        child.on('error', (err) => {
          if (timer) clearTimeout(timer);
          resolve({ ok: false, error: err.message, stdout, stderr });
        });
        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          resolve({
            ok: code === 0,
            code,
            stdout: stdout.slice(0, MAX_OUTPUT),
            stderr: stderr.slice(0, MAX_OUTPUT),
          });
        });
        timer = setTimeout(() => {
          child.kill('SIGTERM');
          resolve({ ok: false, error: '超时（30s）', stdout, stderr });
        }, TIMEOUT_MS);
      });
    },
  };
}

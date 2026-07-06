// apps/desktop/src/renderer/components/ToolCallView.tsx
import { useState, type ReactNode } from 'react';
import type { ToolCallState } from '../stores/chat';
import styles from './ToolCallView.module.css';

const DANGEROUS = new Set(['write_file', 'edit_file', 'run_shell']);

const STATUS_LABEL: Record<ToolCallState['status'], string> = {
  pending: '⏳ 执行中',
  ok: '✓ 完成',
  fail: '✗ 失败',
};

/**
 * 工具调用折叠卡片。穿插在消息流中渲染工具调用过程。
 *  - 危险工具朱砂色边框，只读青玉色边框。
 *  - 默认折叠详情，点击展开看完整 args/result。
 */
export function ToolCallView({ tc }: { tc: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const dangerous = DANGEROUS.has(tc.tool);
  return (
    <div className={`${styles.card} ${dangerous ? styles.danger : styles.safe}`}>
      <button
        type="button"
        className={styles.head}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.status}>{STATUS_LABEL[tc.status]}</span>
        <span className={styles.name}>{tc.tool}</span>
        <span className={styles.argsBrief}>{briefArgs(tc.tool, tc.args)}</span>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className={styles.detail}>
          <Section title="参数">{json(tc.args)}</Section>
          {tc.result !== undefined && (
            <Section title="结果">{json(tc.result)}</Section>
          )}
        </div>
      )}
    </div>
  );
}

function briefArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'read_file' || tool === 'list_directory')
    return String(args.path ?? '');
  if (tool === 'write_file') return `${args.path ?? ''}`;
  if (tool === 'edit_file') return `${args.path ?? ''}`;
  if (tool === 'run_shell') return String(args.command ?? '');
  if (tool === 'glob' || tool === 'grep') return String(args.pattern ?? '');
  return '';
}

function json(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <pre className={styles.pre}>{children}</pre>
    </div>
  );
}

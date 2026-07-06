import { useState } from 'react';
import { useChatStore } from '../stores/chat';
import type { ApprovalRequest, ToolName } from '@qiming/shared';
import styles from './ApprovalDialog.module.css';

const DANGEROUS: ToolName[] = ['write_file', 'edit_file', 'run_shell'];

/**
 * 朱砂印审批弹窗。危险工具执行前弹出。
 *  - 危险图标朱砂色（古风"盖印前需审视"）。
 *  - run_shell 命令强制展开（detail.command 明文）。
 *  - 三按钮：拒绝（默认）/ 允许本次 / 本会话总允许。
 *  - 无超时，一直等用户决策。
 */
export function ApprovalDialog() {
  const req = useChatStore((s) => s.pendingApproval) as ApprovalRequest | null;
  const respond = useChatStore((s) => s.respondApproval);
  const [expanded, setExpanded] = useState(false);

  if (!req) return null;

  const isShell = req.tool === 'run_shell';
  const autoExpand = isShell; // shell 命令强制展开
  const showDetail = expanded || autoExpand;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.seal} aria-hidden>
            朱
          </span>
          <h2 className={styles.title}>朱砂印 · 待审批</h2>
        </div>
        <div className={styles.body}>
          <div className={styles.summary}>
            <span className={styles.toolName}>{req.tool}</span>
            <span className={styles.summaryText}>{req.summary}</span>
          </div>
          {!autoExpand && (
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setExpanded((v) => !v)}
            >
              {showDetail ? '收起详情' : '查看详情'}
            </button>
          )}
          {showDetail && (
            <pre className={styles.detail}>{JSON.stringify(req.detail, null, 2)}</pre>
          )}
          {isShell && (
            <div className={styles.warn}>命令将以下述明文执行，请审视。</div>
          )}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnDeny}
            onClick={() => respond('deny')}
            autoFocus
          >
            拒绝
          </button>
          <button
            type="button"
            className={styles.btnAllow}
            onClick={() => respond('allow')}
          >
            允许本次
          </button>
          <button
            type="button"
            className={styles.btnSession}
            onClick={() => respond('allow_session')}
          >
            本会话总允许
          </button>
        </div>
        {/* DANGEROUS 仅用于语义标记，运行时不渲染；保留供 a11y 后续扩展 */}
        <span hidden>{DANGEROUS.join(',')}</span>
      </div>
    </div>
  );
}

import styles from './ContextMeter.module.css';

export interface ContextMeterProps {
  used: number;
  total: number;
}

/**
 * 上下文 token 用量进度条（朱砂色）。
 * warn 阈值 80%：超过则 fill 用更暗的朱砂（--accent-cinnabar-hover）示警。
 */
export function ContextMeter({ used, total }: ContextMeterProps) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const warn = pct >= 80;
  return (
    <div
      className={styles.wrap}
      title={`上下文 ${used}/${total} tokens (${pct}%)`}
    >
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${warn ? styles.warn : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={styles.label}>{pct}%</span>
    </div>
  );
}

import styles from './TitleBar.module.css';

export interface TitleBarProps {
  title?: string;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

/** Windows 平台自绘木纹标题栏。macOS 用系统标题栏，不渲染本组件。 */
export function TitleBar({ title = '启明', onClose, onMinimize, onToggleMaximize }: TitleBarProps) {
  return (
    <div className={styles.bar}>
      <span className={styles.title}>{title}</span>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={onMinimize} aria-label="最小化">—</button>
        <button className={styles.btn} onClick={onToggleMaximize} aria-label="最大化">▢</button>
        <button className={`${styles.btn} ${styles.close}`} onClick={onClose} aria-label="关闭">✕</button>
      </div>
    </div>
  );
}

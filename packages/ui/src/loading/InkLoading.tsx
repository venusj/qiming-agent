import styles from './loading.module.css';

export function InkLoading({ label = '研墨中…' }: { label?: string }) {
  return (
    <span className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.ink} />
      <span className={styles.label}>{label}</span>
    </span>
  );
}

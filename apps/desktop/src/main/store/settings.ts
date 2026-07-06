// apps/desktop/src/main/store/settings.ts
import type { Database } from 'better-sqlite3';

/**
 * key-value settings store（P2.1 新增）。
 * 用途：工作目录等简单持久化配置。复杂结构用 JSON.stringify 存。
 */
export function createSettingsStore(db: Database) {
  return {
    get(key: string): string | null {
      const row = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    set(key: string, value: string): void {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, value, Date.now());
    },
    all(): Record<string, string> {
      const rows = db.prepare('SELECT key, value FROM settings').all() as {
        key: string;
        value: string;
      }[];
      const out: Record<string, string> = {};
      for (const r of rows) out[r.key] = r.value;
      return out;
    },
  };
}

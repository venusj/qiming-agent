import type { Database } from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** P0 的原始 schema 作为 version 1（幂等，IF NOT EXISTS）。
 *  schema.sql 与本文件同目录，用 __dirname 解析（db.ts 同惯例，
 *  且 tsconfig.node.json 为 CommonJS，import.meta 在该配置下不可用）。 */
const initialSchema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initialSchema },
  // P1.1 会追加 version 2（memories 表 + messages.kind 列）
];

/** 版本化迁移。getDb() 启动时调用。
 *  每个 migration 必须 idempotent（IF NOT EXISTS / 重复 ALTER 安全），
 *  这样老 P0 DB 升级不丢数据、重复执行不报错。 */
export function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {
    v: number | null;
  };
  const current = row.v ?? 0;
  for (const m of migrations) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        Date.now(),
      );
    }
  }
}

/** 供测试用：获取当前已应用版本号 */
export function getAppliedVersion(db: Database): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {
    v: number | null;
  };
  return row.v ?? 0;
}

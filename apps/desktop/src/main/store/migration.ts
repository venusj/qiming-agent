import type { Database } from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Migration {
  version: number;
  name: string;
  sql: string;
  /** 可选的 JS 后置钩子：在 sql exec 完后执行。
   *  用于 SQLite 不便用纯 SQL 幂等处理的场景，如 ADD COLUMN（不支持 IF NOT EXISTS）。 */
  after?: (db: Database) => void;
}

/** P0 的原始 schema 作为 version 1（幂等，IF NOT EXISTS）。
 *  schema.sql 与本文件同目录，用 __dirname 解析（db.ts 同惯例，
 *  且 tsconfig.node.json 为 CommonJS，import.meta 在该配置下不可用）。 */
const initialSchema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initialSchema },
  {
    // P1.1: memories 表 + messages.kind 列。
    //  - memories 表用 IF NOT EXISTS 幂等（schema.sql 已含，此处重复但安全：老 DB 升级时由 version 2 加上）。
    //  - messages.kind 不能用 ADD COLUMN IF NOT EXISTS（SQLite/better-sqlite3 不支持），
    //    故在 after 钩子里用 PRAGMA table_info 检查后再 ALTER。
    version: 2,
    name: 'p1-memories-and-kind',
    sql: `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        source TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_enabled ON memories(enabled);
    `,
    after: (db) => {
      // 安全加 kind 列：已存在则跳过（重复 ALTER 会抛 duplicate column 错误）
      const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
      if (!cols.some((c) => c.name === 'kind')) {
        db.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'message'");
      }
    },
  },
  {
    // P1.8: providers 表加 embedding_model / context_window 两列。
    //  schema.sql 已含此二列（新建 DB 经 version 1 即有），此处仅为老 DB 补列。
    //  better-sqlite3 不支持 ADD COLUMN IF NOT EXISTS，用 PRAGMA 检查后安全 ALTER。
    version: 3,
    name: 'p1-provider-embedding-fields',
    sql: '',
    after: (db) => {
      const cols = db.prepare('PRAGMA table_info(providers)').all() as { name: string }[];
      if (!cols.some((c) => c.name === 'embedding_model')) {
        db.exec('ALTER TABLE providers ADD COLUMN embedding_model TEXT');
      }
      if (!cols.some((c) => c.name === 'context_window')) {
        db.exec('ALTER TABLE providers ADD COLUMN context_window INTEGER');
      }
    },
  },
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
      m.after?.(db); // 可选的 JS 后置逻辑（如安全 ADD COLUMN）
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

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { app } from 'electron';
import { runMigrations } from './migration';

let dbInstance: Database.Database | null = null;

/** Main 进程单例 db（懒加载）。启动时跑版本化迁移建表/索引。 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = app.getPath('userData'); // %APPDATA%/qiming-agent 或 ~/Library/Application Support/qiming-agent
  const dbPath = join(dir, 'data.db');
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  runMigrations(dbInstance); // 替代原 db.exec(schema)
  return dbInstance;
}

/** 测试用：内存库工厂。迁移由 runMigrations 完成（schema.sql 在 migration.ts 内读取）。 */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db); // 替代原 db.exec(schema)
  return db;
}

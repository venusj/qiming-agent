import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

let dbInstance: Database.Database | null = null;

/** Main 进程单例 db（懒加载）。读取 schema.sql 并建表/索引。 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = app.getPath('userData'); // %APPDATA%/qiming-agent 或 ~/Library/Application Support/qiming-agent
  const dbPath = join(dir, 'data.db');
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  dbInstance.exec(schema);
  return dbInstance;
}

/** 测试用：内存库工厂。schema 路径相对本文件解析。 */
export function createMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getAppliedVersion } from '../src/main/store/migration';

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('migration', () => {
  it('空 DB 跑迁移后 version=1，schema_version 有记录', () => {
    const db = freshDb();
    runMigrations(db);
    expect(getAppliedVersion(db)).toBe(1);
    // P0 表都在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('providers');
    expect(names).toContain('sessions');
    expect(names).toContain('messages');
    expect(names).toContain('schema_version');
  });

  it('重复跑迁移幂等（不报错，version 不变）', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // 再跑一次
    expect(getAppliedVersion(db)).toBe(1);
  });

  it('已含 P0 表的 DB 升级：手动建表后跑迁移，不丢数据', () => {
    const db = freshDb();
    // 模拟老 P0 DB：无 schema_version 表，但有 messages 数据
    db.exec(
      `CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, kind TEXT, base_url TEXT, api_key_ref TEXT, default_model TEXT, enabled_models TEXT, headers TEXT, created_at INTEGER, updated_at INTEGER)`,
    );
    db.exec(
      `CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, provider_id TEXT, model TEXT, created_at INTEGER, updated_at INTEGER)`,
    );
    db.exec(
      `CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tokens INTEGER, created_at INTEGER)`,
    );
    db.prepare(
      "INSERT INTO messages (id, session_id, role, content, tokens, created_at) VALUES ('m1','s1','user','hi',NULL,1)",
    ).run();
    runMigrations(db); // version 1 是 IF NOT EXISTS，不破坏现有表
    const count = db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number };
    expect(count.c).toBe(1); // 数据还在
  });
});

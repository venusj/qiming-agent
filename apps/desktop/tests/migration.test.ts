import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, getAppliedVersion } from '../src/main/store/migration';

function freshDb(): Database.Database {
  return new Database(':memory:');
}

describe('migration', () => {
  it('空 DB 跑迁移后 version=2，schema_version 有记录，含 memories 表', () => {
    const db = freshDb();
    runMigrations(db);
    expect(getAppliedVersion(db)).toBe(2);
    // P0 表都在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('providers');
    expect(names).toContain('sessions');
    expect(names).toContain('messages');
    expect(names).toContain('memories');
    expect(names).toContain('schema_version');
  });

  it('空 DB 迁移后 messages 表有 kind 列（默认 message）', () => {
    const db = freshDb();
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    expect(cols.some((c) => c.name === 'kind')).toBe(true);
    // 先插一个 session 满足 messages 的外键约束，再插消息（不指定 kind）
    db.prepare(
      "INSERT INTO sessions (id, title, created_at, updated_at) VALUES ('s', 't', 1, 1)",
    ).run();
    db.prepare(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES ('m','s','user','hi',1)",
    ).run();
    const row = db.prepare('SELECT kind FROM messages WHERE id=?').get('m') as { kind: string };
    expect(row.kind).toBe('message');
  });

  it('重复跑迁移幂等（不报错，version 不变）', () => {
    const db = freshDb();
    runMigrations(db);
    runMigrations(db); // 再跑一次（kind 列已存在，after 钩子应安全跳过）
    expect(getAppliedVersion(db)).toBe(2);
  });

  it('已含 P0 表的 DB 升级：迁移加 memories 表 + kind 列，不丢数据', () => {
    const db = freshDb();
    // 模拟老 P0 DB：无 schema_version 表，无 memories 表，messages 无 kind 列，但有数据
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
    runMigrations(db); // version 1（IF NOT EXISTS，不破坏现有表）+ version 2（加 memories + ALTER kind）
    expect(getAppliedVersion(db)).toBe(2);
    // 老数据还在
    const count = db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number };
    expect(count.c).toBe(1);
    // kind 列已通过 after 钩子 ALTER 加上，老行 kind 默认 'message'
    const row = db.prepare('SELECT kind FROM messages WHERE id=?').get('m1') as { kind: string };
    expect(row.kind).toBe('message');
    // memories 表已加
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).toContain('memories');
  });
});


// apps/desktop/tests/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/store/migration';
import { createSettingsStore } from '../src/main/store/settings';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('settingsStore', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = memDb();
  });
  it('未设置时 get 返回 null', () => {
    const s = createSettingsStore(db);
    expect(s.get('nope')).toBeNull();
  });
  it('set 后 get 返回值', () => {
    const s = createSettingsStore(db);
    s.set('workspace', '/tmp/proj');
    expect(s.get('workspace')).toBe('/tmp/proj');
  });
  it('重复 set 同 key 覆盖（不报 UNIQUE 冲突）', () => {
    const s = createSettingsStore(db);
    s.set('workspace', '/a');
    s.set('workspace', '/b');
    expect(s.get('workspace')).toBe('/b');
  });
  it('all 返回全部 key-value', () => {
    const s = createSettingsStore(db);
    s.set('workspace', '/a');
    s.set('theme', 'gufeng');
    expect(s.all()).toEqual({ workspace: '/a', theme: 'gufeng' });
  });
  it('migration v4 后 settings 表存在', () => {
    // memDb 已 runMigrations；直接查表
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();
    expect(tables).toBeDefined();
  });
});

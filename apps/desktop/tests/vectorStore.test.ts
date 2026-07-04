import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/store/migration';
import { createMemoryStore } from '../src/main/memory/vectorStore';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('createMemoryStore', () => {
  let store: ReturnType<typeof createMemoryStore>;
  beforeEach(() => { store = createMemoryStore(memDb()); });

  it('add + list + get', () => {
    const m = store.add('用户偏好 Go', [1, 0, 0], 'auto');
    expect(store.list()).toHaveLength(1);
    expect(store.get(m.id)?.content).toBe('用户偏好 Go');
    expect(store.get(m.id)?.embedding).toEqual([1, 0, 0]);
  });

  it('update content + enabled', () => {
    const m = store.add('x', [1, 0], 'manual');
    store.update(m.id, { enabled: false });
    expect(store.get(m.id)?.enabled).toBe(false);
    expect(store.listEnabled()).toHaveLength(0);
  });

  it('delete', () => {
    const m = store.add('x', [1], 'manual');
    store.delete(m.id);
    expect(store.list()).toHaveLength(0);
  });

  it('search top-K 按余弦排序', () => {
    store.add('A', [1, 0, 0], 'auto');
    store.add('B', [0, 1, 0], 'auto');
    store.add('C', [0.9, 0.1, 0], 'auto');  // 与 query 最像
    const results = store.search([1, 0, 0], 2);
    expect(results[0].memory.content).toBe('A');  // cosine=1
    expect(results[1].memory.content).toBe('C');  // cosine≈0.99
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('禁用的不参与检索', () => {
    store.add('disabled', [1, 0, 0], 'auto');
    store.update(store.list()[0].id, { enabled: false });
    expect(store.search([1, 0, 0], 3)).toHaveLength(0);
  });
});

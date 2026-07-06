import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/store/migration';
import { createProviderStore } from '../src/main/store/providers';
import { createSessionStore } from '../src/main/store/sessions';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // P1.1：用 runMigrations 建表（含 memories + messages.kind 列）。
  // 不再直接读 schema.sql —— 该文件不含 kind 列（kind 由 migration v2 的 after 钩子 ALTER 加）。
  runMigrations(db);
  return db;
}

describe('providerStore', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = memDb();
  });
  it('create + list + get', () => {
    const store = createProviderStore(db);
    const p = store.create({
      name: '我的OpenAI',
      kind: 'openai',
      apiKeyRef: 'provider:x',
      defaultModel: 'gpt-4o',
      enabledModels: ['gpt-4o'],
    });
    expect(store.list()).toHaveLength(1);
    expect(store.get(p.id)?.name).toBe('我的OpenAI');
  });
  it('update 修改字段', () => {
    const store = createProviderStore(db);
    const p = store.create({
      name: 'a',
      kind: 'openai',
      apiKeyRef: 'r',
      defaultModel: 'm',
      enabledModels: [],
    });
    const u = store.update(p.id, { name: 'b' });
    expect(u?.name).toBe('b');
  });
  it('delete', () => {
    const store = createProviderStore(db);
    const p = store.create({
      name: 'a',
      kind: 'openai',
      apiKeyRef: 'r',
      defaultModel: 'm',
      enabledModels: [],
    });
    store.delete(p.id);
    expect(store.list()).toHaveLength(0);
  });
  it('create/update 持久化 embeddingModel / contextWindow（P1.8）', () => {
    const store = createProviderStore(db);
    const p = store.create({
      name: 'emb',
      kind: 'openai',
      apiKeyRef: 'r',
      defaultModel: 'gpt-4o',
      enabledModels: [],
      embeddingModel: 'text-embedding-3-small',
      contextWindow: 128000,
    });
    const got = store.get(p.id);
    expect(got?.embeddingModel).toBe('text-embedding-3-small');
    expect(got?.contextWindow).toBe(128000);
    // update 只改 embeddingModel，contextWindow 不丢
    store.update(p.id, { embeddingModel: 'text-embedding-3-large' });
    const u = store.get(p.id);
    expect(u?.embeddingModel).toBe('text-embedding-3-large');
    expect(u?.contextWindow).toBe(128000);
    // 未配置的 provider 取出为 undefined
    const p2 = store.create({
      name: 'no-emb',
      kind: 'anthropic',
      apiKeyRef: 'r2',
      defaultModel: 'claude',
      enabledModels: [],
    });
    expect(store.get(p2.id)?.embeddingModel).toBeUndefined();
    expect(store.get(p2.id)?.contextWindow).toBeUndefined();
  });
});

describe('sessionStore 级联删除', () => {
  it('删除 session 同时删 messages', () => {
    const db = memDb();
    const ps = createProviderStore(db);
    const ss = createSessionStore(db);
    const prov = ps.create({
      name: 'a',
      kind: 'openai',
      apiKeyRef: 'r',
      defaultModel: 'm',
      enabledModels: [],
    });
    const sess = ss.createSession('test');
    ss.setBinding(sess.id, { providerId: prov.id, model: 'm' });
    ss.appendMessage(sess.id, 'user', '你好');
    ss.appendMessage(sess.id, 'assistant', '你好！');
    expect(ss.messages(sess.id)).toHaveLength(2);
    ss.delete(sess.id);
    expect(ss.messages(sess.id)).toHaveLength(0);
  });
});

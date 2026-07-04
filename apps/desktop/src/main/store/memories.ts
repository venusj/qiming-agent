import type { Database } from 'better-sqlite3';
import type { Memory } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface MemoryRow {
  id: string; content: string; embedding: string; source: string | null;
  enabled: number; created_at: number; updated_at: number;
}

function rowToMemory(r: MemoryRow): Memory {
  return {
    id: r.id, content: r.content, embedding: JSON.parse(r.embedding),
    source: (r.source ?? 'manual') as 'manual' | 'auto',
    enabled: r.enabled === 1, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function createMemoryDbStore(db: Database) {
  return {
    add(content: string, embedding: number[], source: 'manual' | 'auto'): Memory {
      const now = Date.now(), id = randomUUID();
      db.prepare('INSERT INTO memories (id,content,embedding,source,enabled,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
        .run(id, content, JSON.stringify(embedding), source, now, now);
      return this.get(id)!;
    },
    list(): Memory[] {
      return (db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all() as MemoryRow[]).map(rowToMemory);
    },
    listEnabled(): Memory[] {
      return (db.prepare('SELECT * FROM memories WHERE enabled=1 ORDER BY created_at DESC').all() as MemoryRow[]).map(rowToMemory);
    },
    get(id: string): Memory | null {
      const r = db.prepare('SELECT * FROM memories WHERE id=?').get(id) as MemoryRow | undefined;
      return r ? rowToMemory(r) : null;
    },
    update(id: string, input: { content?: string; embedding?: number[]; enabled?: boolean }): Memory | null {
      const cur = this.get(id);
      if (!cur) return null;
      const content = input.content ?? cur.content;
      const embedding = input.embedding ?? cur.embedding;
      const enabled = input.enabled ?? cur.enabled;
      db.prepare('UPDATE memories SET content=?, embedding=?, enabled=?, updated_at=? WHERE id=?')
        .run(content, JSON.stringify(embedding), enabled ? 1 : 0, Date.now(), id);
      return this.get(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM memories WHERE id=?').run(id);
    },
    replaceEmbedding(id: string, embedding: number[]): void {
      db.prepare('UPDATE memories SET embedding=?, updated_at=? WHERE id=?').run(JSON.stringify(embedding), Date.now(), id);
    },
  };
}

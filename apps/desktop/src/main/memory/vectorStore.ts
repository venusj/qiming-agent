import type { Database } from 'better-sqlite3';
import type { Memory, ScoredMemory } from '@qiming/shared';
import { createMemoryDbStore } from '../store/memories';
import { cosine } from './cosine';

export function createMemoryStore(db: Database) {
  const dbStore = createMemoryDbStore(db);
  return {
    ...dbStore,
    /** top-K 相似检索（内存余弦） */
    search(queryVec: number[], k: number): ScoredMemory[] {
      const all: Memory[] = dbStore.listEnabled();
      const scored: ScoredMemory[] = all.map((memory) => ({
        memory, score: cosine(queryVec, memory.embedding),
      }));
      return scored.sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
}

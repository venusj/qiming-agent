import type { ProviderConfig } from '@qiming/shared';
import { embedText } from './embedder';
import { getDb } from '../store/db';
import { createMemoryStore } from './vectorStore';

/** 检索 top-K 记忆，格式化成 system prompt 片段。
 *  无 embeddingModel / 无相关记忆 / 检索失败时返回 null（降级，不阻塞对话）。 */
export async function retrieveMemories(
  cfg: ProviderConfig,
  userMessage: string,
  k = 3,
  minScore = 0.3,
): Promise<string | null> {
  if (!cfg.embeddingModel) return null;
  try {
    const queryVec = await embedText(cfg, userMessage);
    const store = createMemoryStore(getDb());
    const results = store.search(queryVec, k);
    const filtered = results.filter((r) => r.score >= minScore);
    if (filtered.length === 0) return null;
    const lines = filtered.map((r) => `- ${r.memory.content}`).join('\n');
    return `以下是关于用户的长期记忆，供参考：\n${lines}`;
  } catch (e) {
    console.error('[p1] 记忆检索失败，降级', e);
    return null;
  }
}

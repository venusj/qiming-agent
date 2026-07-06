import { generateText } from 'ai';
import type { ProviderConfig } from '@qiming/shared';
import { buildModel } from '../providers/factory';
import { embedTexts } from './embedder';
import { getDb } from '../store/db';
import { createMemoryStore } from './vectorStore';
import { cosine } from './cosine';

const DEDUP_THRESHOLD = 0.9;

/** LLM 从一轮对话提取事实，去重后存库。后台异步，失败静默。 */
export async function extractAndStore(
  cfg: ProviderConfig,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  if (!cfg.embeddingModel) return;
  try {
    const model = await buildModel(cfg, cfg.defaultModel);
    const result = await generateText({
      model,
      prompt: `分析以下对话，提取值得长期记住的用户事实（偏好、身份、关键决策）。
如果没有值得记住的内容，回复"无"。
每条事实单独一行，简洁陈述。

用户：${userMessage}
助手：${assistantReply}`,
    });

    const facts = result.text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && s !== '无' && !s.startsWith('无。') && !s.startsWith('没有'));
    if (facts.length === 0) return;

    // 批量 embed
    const embeddings = await embedTexts(cfg, facts);
    const store = createMemoryStore(getDb());
    const existing = store.listEnabled();

    for (let i = 0; i < facts.length; i++) {
      const newVec = embeddings[i];
      // 去重：与现有记忆比，cosine > 0.9 跳过
      const isDup = existing.some((m) => cosine(newVec, m.embedding) > DEDUP_THRESHOLD);
      if (!isDup) {
        store.add(facts[i], newVec, 'auto');
      }
    }
  } catch (e) {
    console.error('[p1] 记忆提取失败（后台，不影响对话）', e);
  }
}

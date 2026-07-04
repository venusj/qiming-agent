import type { Message } from '@qiming/shared';

/** 估算文本 token。优先用已存准确值，无则启发式。 */
export function estimateTokens(text: string, stored?: number | null): number {
  if (stored && stored > 0) return stored;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

/** 消息列表总 token（每条 +4 overhead） */
export function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content, m.tokens) + 4, 0);
}

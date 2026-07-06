import { generateText, type LanguageModel } from 'ai';
import type { Message } from '@qiming/shared';
import { estimateTokens } from './tokenCounter';

/** 单摘要累加：把 toCompress + existingSummaries 喂给 LLM，输出整合后的新摘要。 */
export async function compressMessages(
  model: LanguageModel,
  toCompress: Message[],
  existingSummaries: Message[],
  signal?: AbortSignal,
): Promise<{ text: string; tokens: number }> {
  const transcript = toCompress
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n\n');

  const priorSummary = existingSummaries.length > 0
    ? `已有的前情摘要：\n${existingSummaries.map((s) => s.content).join('\n')}\n\n请将上述摘要融入新摘要。\n\n`
    : '';

  const result = await generateText({
    model,
    prompt: `请将以下对话历史压缩成一段简洁的摘要，保留：
- 讨论的核心主题
- 已确定的关键事实与决策
- 未解决的问题
丢弃寒暄与冗余细节。

${priorSummary}对话记录：
${transcript}`,
    abortSignal: signal,
  });

  return {
    text: result.text,
    tokens: result.usage.completionTokens ?? estimateTokens(result.text),
  };
}

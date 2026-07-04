import type { Message } from '@qiming/shared';
import { totalTokens, estimateTokens } from './tokenCounter';

export interface BudgetPlan {
  summaries: Message[];
  recent: Message[];
  toCompress: Message[];
}

export function planBudget(opts: {
  contextWindow: number;
  reservedForReply: number;
  memoryTokens: number;
  summaries: Message[];
  messages: Message[]; // 原始消息（kind='message'），时间升序
  keepRecent: number;
}): BudgetPlan {
  const budget = opts.contextWindow - opts.reservedForReply - opts.memoryTokens;
  const summaryTokens = totalTokens(opts.summaries);

  const reversed = [...opts.messages].reverse();
  const recent: Message[] = [];
  let used = summaryTokens;
  for (const m of reversed) {
    const t = estimateTokens(m.content, m.tokens) + 4;
    if (recent.length < opts.keepRecent || used + t <= budget) {
      recent.unshift(m);
      used += t;
    } else {
      break;
    }
  }
  const recentIds = new Set(recent.map((m) => m.id));
  const toCompress = opts.messages.filter((m) => !recentIds.has(m.id));

  return { summaries: opts.summaries, recent, toCompress };
}

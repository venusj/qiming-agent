import { streamText } from 'ai';
import { BrowserWindow } from 'electron';
import { IPC, type Message, type ChatDonePayload } from '@qiming/shared';
import { getDb } from '../store/db';
import { createSessionStore, createProviderStore } from '../store';
import { buildModel } from '../providers/factory';
import { getController, abortController } from './registry';
import { planBudget } from '../context/budget';
import { compressMessages } from '../context/compressor';
import { estimateTokens } from '../context/tokenCounter';
import { retrieveMemories } from '../memory/retriever';
import { extractAndStore } from '../memory/extractor';

// store barrel（T11 Step 1）已建：createSessionStore/createProviderStore/getDb 统一从
// '../store' 取。getDb 仍从 '../store/db' 取（与 store/index.ts re-export 等价，保持单一来源）。

const sessions = () => createSessionStore(getDb());
const providers = () => createProviderStore(getDb());

function activeWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

export async function runTurn(sessionId: string, userMessage: string): Promise<void> {
  const win = activeWindow();
  const session = sessions().getSession(sessionId);
  if (!session?.providerId || !session.model) {
    win?.webContents.send(IPC.CHAT_ERROR, { sessionId, message: '会话未绑定 provider 或模型' });
    return;
  }
  const provider = providers().get(session.providerId);
  if (!provider) {
    win?.webContents.send(IPC.CHAT_ERROR, { sessionId, message: 'provider 不存在' });
    return;
  }

  sessions().appendMessage(sessionId, 'user', userMessage);

  const controller = getController(sessionId);
  try {
    const model = await buildModel(provider, session.model);

    // —— 记忆检索（P1.5）：embed → search top-K → 拼 system prompt 片段 ——
    const memorySystemPrompt = await retrieveMemories(provider, userMessage);
    const memoryTokens = memorySystemPrompt ? estimateTokens(memorySystemPrompt) : 0;

    // —— 上下文预算规划（P1.3 Step 1）——
    const contextWindow = provider.contextWindow ?? 8000;
    const all = sessions().messages(sessionId);
    const summaries = all.filter((m) => m.kind === 'summary');
    const raw = all.filter((m) => m.kind === 'message' && m.role !== 'system');

    let plan = planBudget({
      contextWindow,
      reservedForReply: 4096,
      memoryTokens, // P1.5：实际记忆 system prompt token 数（0 表示无记忆注入）
      summaries,
      messages: raw,
      keepRecent: 6,
    });

    // 触发压缩：可压缩消息足够多时，整合为一条新摘要
    if (plan.toCompress.length >= 4) {
      try {
        const summary = await compressMessages(
          model,
          plan.toCompress,
          plan.summaries,
          controller.signal,
        );
        sessions().appendMessage(sessionId, 'assistant', summary.text, summary.tokens, 'summary');
        // 压缩后新摘要入库，重新读 + 重新规划
        const allNew = sessions().messages(sessionId);
        const newSummaries = allNew.filter((m) => m.kind === 'summary');
        // 单摘要累加：新摘要取代旧 summaries，重规划时只取最新一条
        const latestSummary = newSummaries[newSummaries.length - 1];
        const compressedIds = new Set(plan.toCompress.map((m) => m.id));
        const newRaw = allNew.filter(
          (m) => m.kind === 'message' && m.role !== 'system' && !compressedIds.has(m.id),
        );
        plan = planBudget({
          contextWindow,
          reservedForReply: 4096,
          memoryTokens,
          summaries: latestSummary ? [latestSummary] : [],
          messages: newRaw,
          keepRecent: 6,
        });
      } catch (e) {
        // 压缩失败不阻塞对话，用原 plan 继续（可能超限，但让 provider 报错而非卡死）
        console.error('[p1] 压缩失败，降级用原上下文', e);
      }
    }

    // 拼下发上下文：摘要带 [前情提要] 前缀 + recent
    const contextMessages = [
      ...plan.summaries.map((m) => ({
        role: m.role as 'assistant',
        content: `[前情提要] ${m.content}`,
      })),
      ...plan.recent.map((m) => ({ role: m.role, content: m.content })),
    ];

    const result = streamText({
      model,
      system: memorySystemPrompt ?? undefined,
      messages: contextMessages,
      abortSignal: controller.signal,
    });

    for await (const delta of result.textStream) {
      win?.webContents.send(IPC.CHAT_DELTA, { sessionId, delta });
    }

    const finalText = await result.text;
    // result.usage 是 Promise<LanguageModelUsage>（ai@4.x，见 dist/index.d.ts:2636）
    const usage = await result.usage;
    const completionTokens = usage?.completionTokens ?? null;
    const saved: Message = sessions().appendMessage(
      sessionId,
      'assistant',
      finalText,
      completionTokens,
    );
    // usedTokens = 当前下发上下文（摘要 + recent）的 token 估算，供 UI 进度条
    const usedTokens = plan.summaries
      .concat(plan.recent)
      .reduce((s, m) => s + estimateTokens(m.content, m.tokens) + 4, 0);
    const donePayload: ChatDonePayload = {
      sessionId,
      message: saved,
      usage: { contextWindow, usedTokens },
    };
    win?.webContents.send(IPC.CHAT_DONE, donePayload);

    // —— 记忆自动提取（P1.6）：后台 fire-and-forget，失败不影响对话 ——
    void extractAndStore(provider, userMessage, finalText).catch((e) =>
      console.error('[p1] extractAndStore 异常', e),
    );
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      win?.webContents.send(IPC.CHAT_DONE, {
        sessionId,
        message: {
          id: '',
          sessionId,
          role: 'assistant',
          content: '[已中断]',
          tokens: null,
          createdAt: Date.now(),
        },
      });
    } else {
      win?.webContents.send(IPC.CHAT_ERROR, {
        sessionId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  } finally {
    abortController(sessionId);
  }
}

export function stopTurn(sessionId: string): void {
  abortController(sessionId);
}

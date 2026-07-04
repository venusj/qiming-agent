import { streamText } from 'ai';
import { BrowserWindow } from 'electron';
import { IPC, type Message } from '@qiming/shared';
import { getDb } from '../store/db';
import { createSessionStore, createProviderStore } from '../store';
import { buildModel } from '../providers/factory';
import { getController, abortController } from './registry';

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
  const history = sessions()
    .messages(sessionId)
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = getController(sessionId);
  try {
    const model = await buildModel(provider, session.model);
    const result = streamText({
      model,
      messages: history,
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
    win?.webContents.send(IPC.CHAT_DONE, { sessionId, message: saved });
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

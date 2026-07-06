import { ipcMain } from 'electron';
import { IPC } from '@qiming/shared';
import { getDb } from '../../store/db';
import { createProviderStore } from '../../store/providers';
import { createMemoryStore } from '../../memory/vectorStore';
import { embedText, embedTexts } from '../../memory/embedder';

/**
 * 长期记忆管理 IPC handlers（P1.8）。
 *
 * add / update(content 变更) / reembed 需要调用某个 provider 的 embedding 模型生成向量。
 * 设计：由 renderer 传入 providerId（在设置页用 dropdown 选「用于 embedding 的 provider」），
 * handler 内部用 providerStore.get(providerId) 取出 ProviderConfig，再调 embedText/embedTexts。
 * providerId 无效或该 provider 未配置 embeddingModel 时，抛友好错误（renderer 侧展示给用户）。
 *
 * 进程隔离：apiKey 明文不出现在 IPC 参数与返回值，embedText 内部经 keyStore 取用。
 */
export function registerMemoryHandlers() {
  const db = getDb();
  const store = createMemoryStore(db);
  const providers = createProviderStore(db);

  /** 由 providerId 取配置并校验其支持 embedding。失败抛友好错误。 */
  const requireEmbeddingProvider = (providerId?: string) => {
    if (!providerId) {
      throw new Error('请先在「用于 embedding 的厂商」中选择一个已配置 embeddingModel 的厂商');
    }
    const cfg = providers.get(providerId);
    if (!cfg) {
      throw new Error(`找不到厂商（providerId=${providerId}）`);
    }
    if (!cfg.embeddingModel) {
      throw new Error(
        `厂商「${cfg.name}」未配置 embeddingModel，请在厂商设置中填写（如 text-embedding-3-small）`,
      );
    }
    return cfg;
  };

  ipcMain.handle(IPC.MEMORY_LIST, () => store.list());

  ipcMain.handle(IPC.MEMORY_ADD, async (_e, content: string, providerId: string) => {
    const cfg = requireEmbeddingProvider(providerId);
    const vec = await embedText(cfg, content);
    return store.add(content, vec, 'manual');
  });

  ipcMain.handle(
    IPC.MEMORY_UPDATE,
    async (
      _e,
      id: string,
      input: { content?: string; enabled?: boolean },
      providerId?: string,
    ) => {
      // 仅当 content 改变时才需重新 embed（enabled 切换不需要 provider）
      if (input.content !== undefined) {
        const cfg = requireEmbeddingProvider(providerId);
        const vec = await embedText(cfg, input.content);
        const updated = store.update(id, { ...input, embedding: vec });
        if (!updated) throw new Error(`记忆 ${id} 不存在`);
        return updated;
      }
      const updated = store.update(id, input);
      if (!updated) throw new Error(`记忆 ${id} 不存在`);
      return updated;
    },
  );

  ipcMain.handle(IPC.MEMORY_DELETE, (_e, id: string) => {
    store.delete(id);
  });

  /** 全量重新 embedding：把所有记忆的 content 用指定 provider 重新生成向量。 */
  ipcMain.handle(IPC.MEMORY_REEMBED, async (_e, providerId: string) => {
    const cfg = requireEmbeddingProvider(providerId);
    const all = store.list();
    if (all.length === 0) return { updated: 0 };
    const texts = all.map((m) => m.content);
    const vecs = await embedTexts(cfg, texts);
    all.forEach((m, i) => store.replaceEmbedding(m.id, vecs[i]));
    return { updated: all.length };
  });
}

import { ipcMain } from 'electron';
import { IPC, type ProviderInput, type TestResult } from '@qiming/shared';
import { getDb } from '../../store';
import { createProviderStore } from '../../store';
import { keyStore } from '../../keystore';
import { testConnection } from '../../providers/test';

/**
 * Provider IPC handlers.
 *
 * 安全约束：API key 明文永不出现在 list 返回值里。
 * - create/update 接收 apiKey 参数，写入 KeyStore（仅存 provider:<id> 引用）。
 * - delete 时同步清理 KeyStore。
 * - test 时在 Main 内部组装 config（含 apiKeyRef，不含明文 key）后调 testConnection。
 */
export function registerProviderHandlers() {
  const store = createProviderStore(getDb());

  ipcMain.handle(IPC.PROVIDER_LIST, () => store.list());

  ipcMain.handle(IPC.PROVIDER_CREATE, (_e, input: ProviderInput, apiKey: string) => {
    const cfg = store.create(input);
    void keyStore.set(cfg.id, apiKey);
    return cfg;
  });

  ipcMain.handle(
    IPC.PROVIDER_UPDATE,
    (_e, id: string, input: Partial<ProviderInput>, apiKey?: string) => {
      const cfg = store.update(id, input);
      if (cfg && apiKey) void keyStore.set(cfg.id, apiKey);
      return cfg;
    },
  );

  ipcMain.handle(IPC.PROVIDER_DELETE, async (_e, id: string) => {
    store.delete(id);
    await keyStore.delete(id);
  });

  ipcMain.handle(IPC.PROVIDER_TEST, async (_e, id: string): Promise<TestResult> => {
    const cfg = store.get(id);
    if (!cfg) return { ok: false, error: { kind: 'unknown', message: 'provider 不存在' } };
    return testConnection(cfg);
  });
}

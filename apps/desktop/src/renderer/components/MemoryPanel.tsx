import { useEffect, useState, type ChangeEvent } from 'react';
import { api } from '../ipc/client';
import { Button, Input, Card, Dropdown } from '@qiming/ui';
import type { Memory, ProviderConfig } from '@qiming/shared';
import styles from './MemoryPanel.module.css';

/**
 * 记忆管理面板（P1.8）：脑海拾遗。
 *
 * 功能：
 * - 列出全部记忆（content + 来源令牌 + 启用/封存态 + 删除）。
 * - 新增：输入内容 + 选择「用于 embedding 的厂商」→ api.memory.add(content, providerId)。
 * - 行内编辑 content：编辑后保存需 providerId 重新 embed。
 * - 切换封存/启用：仅 enabled，不需 providerId。
 * - 全量重嵌：切换 embedding 模型后用选定 provider 重新生成全部向量。
 *
 * providerId 来源：设置页无「当前会话」，故用一个 dropdown 让用户从已配置
 * embeddingModel 的 provider 列表中显式选择。无可选 provider 时禁用相关操作并提示。
 */
export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [providerId, setProviderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reembedInfo, setReembedInfo] = useState('');

  // 仅列出已配置 embeddingModel 的 provider（其它无法用于记忆）。
  const embProviders = providers.filter((p) => p.embeddingModel);

  const reload = async () => {
    const [mems, provs] = await Promise.all([
      api.memory.list(),
      api.provider.list(),
    ]);
    setMemories(mems);
    setProviders(provs);
  };
  useEffect(() => {
    void reload();
  }, []);

  const safeCall = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    safeCall(async () => {
      if (!newContent.trim()) return;
      await api.memory.add(newContent.trim(), providerId);
      setNewContent('');
      await reload();
    });

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditingText(m.content);
  };

  const saveEdit = (m: Memory) =>
    safeCall(async () => {
      if (editingText.trim() && editingText.trim() !== m.content) {
        await api.memory.update(m.id, { content: editingText.trim() }, providerId);
      }
      setEditingId(null);
      await reload();
    });

  const toggle = (m: Memory) =>
    safeCall(async () => {
      await api.memory.update(m.id, { enabled: !m.enabled });
      await reload();
    });

  const remove = (m: Memory) =>
    safeCall(async () => {
      await api.memory.delete(m.id);
      await reload();
    });

  const reembed = () =>
    safeCall(async () => {
      setReembedInfo('');
      const r = await api.memory.reembed(providerId);
      setReembedInfo(`已用所选厂商重新嵌入 ${r.updated} 条记忆`);
      await reload();
    });

  const enabledCount = memories.filter((m) => m.enabled).length;
  const noEmbProvider = embProviders.length === 0;

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>记忆管理 · 脑海拾遗</h2>

      <div className={styles.providerRow}>
        <label className={styles.providerLabel}>用于 embedding 的厂商：</label>
        <Dropdown
          value={providerId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setProviderId(e.target.value)
          }
          disabled={noEmbProvider}
        >
          <option value="" disabled>
            {noEmbProvider ? '尚无厂商配置 embeddingModel' : '请选择…'}
          </option>
          {embProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.embeddingModel}）
            </option>
          ))}
        </Dropdown>
        <Button
          variant="ghost"
          onClick={reembed}
          disabled={busy || noEmbProvider || !providerId || memories.length === 0}
        >
          全量重嵌
        </Button>
      </div>

      <div className={styles.addRow}>
        <Input
          placeholder="记下一笔（亲笔留下的事…）"
          value={newContent}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNewContent(e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          disabled={noEmbProvider || !providerId}
        />
        <Button
          variant="primary"
          onClick={add}
          disabled={busy || !newContent.trim() || !providerId}
        >
          + 拾遗
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {reembedInfo && <div className={styles.info}>{reembedInfo}</div>}

      <div className={styles.list}>
        {memories.length === 0 && (
          <div className={styles.empty}>尚无记忆。开启对话会自动拾得，亦可亲笔记下。</div>
        )}
        {memories.map((m) => (
          <Card
            key={m.id}
            className={`${styles.item} ${!m.enabled ? styles.disabled : ''}`}
          >
            <div className={styles.itemHead}>
              <span
                className={`${styles.tag} ${
                  m.source === 'auto' ? styles.auto : styles.manual
                }`}
              >
                {m.source === 'auto' ? '自动拾得' : '亲笔记下'}
              </span>
              {!m.enabled && <span className={styles.sealed}>已封存</span>}
            </div>

            {editingId === m.id ? (
              <div className={styles.editRow}>
                <Input
                  value={editingText}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditingText(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveEdit(m);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <div className={styles.editActions}>
                  <Button onClick={() => saveEdit(m)} disabled={busy}>
                    存
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingId(null)}>
                    弃
                  </Button>
                </div>
                {editingText.trim() !== m.content && (
                  <div className={styles.hint}>改了内容会用所选厂商重新嵌入向量</div>
                )}
              </div>
            ) : (
              <div className={styles.content}>{m.content}</div>
            )}

            <div className={styles.actions}>
              {editingId !== m.id && (
                <Button
                  variant="ghost"
                  onClick={() => startEdit(m)}
                  disabled={busy || !providerId}
                >
                  改
                </Button>
              )}
              <Button variant="ghost" onClick={() => toggle(m)} disabled={busy}>
                {m.enabled ? '封存' : '启用'}
              </Button>
              <Button variant="ghost" onClick={() => remove(m)} disabled={busy}>
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className={styles.stats}>
        共 {memories.length} 条（{enabledCount} 启用 /{' '}
        {memories.length - enabledCount} 封存）
      </div>
    </div>
  );
}

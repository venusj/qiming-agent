import { useEffect, useState } from 'react';
import { api } from '../ipc/client';
import { Button, Card, Dialog } from '@qiming/ui';
import { ProviderForm } from '../components/ProviderForm';
import { MemoryPanel } from '../components/MemoryPanel';
import type { ProviderConfig } from '@qiming/shared';
import styles from './SettingsPage.module.css';

/**
 * 设置页：Provider 厂商配置（启明之印）。
 *
 * 功能：
 * - 卡片网格列出已存 provider（APIKey 一律掩码显示）。
 * - 新增 / 编辑：Dialog 内嵌 ProviderForm（含模板快速填充 + 测试连接）。
 * - 删除：Dialog 二次确认（提示会同时清除已保存的 APIKey）。
 */
export function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProviderConfig | null>(
    null,
  );

  const reload = async () => setProviders(await api.provider.list());
  useEffect(() => {
    void reload();
  }, []);

  const closeFormDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  const doDelete = async () => {
    if (confirmDelete) {
      await api.provider.delete(confirmDelete.id);
      setConfirmDelete(null);
      void reload();
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>厂商配置 · 启明之印</h1>
      <Button variant="primary" onClick={() => setCreating(true)}>
        + 新增厂商
      </Button>

      <div className={styles.grid}>
        {providers.map((p) => (
          <Card key={p.id} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.kind}>{p.kind}</span>
            </div>
            <div className={styles.meta}>
              <div>默认模型：{p.defaultModel}</div>
              {p.baseUrl && <div>baseUrl：{p.baseUrl}</div>}
              <div>APIKey：••••••</div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => setEditing(p)}>编辑</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(p)}>
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={creating || !!editing}
        onClose={closeFormDialog}
        title={editing ? '编辑厂商' : '新增厂商'}
      >
        <ProviderForm
          initial={editing ?? undefined}
          onSaved={() => {
            closeFormDialog();
            void reload();
          }}
          onCancel={closeFormDialog}
        />
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="确认删除"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>取消</Button>
            <Button variant="primary" onClick={doDelete}>
              删除
            </Button>
          </>
        }
      >
        确定删除「{confirmDelete?.name}」？该操作会同时清除已保存的 APIKey。
      </Dialog>

      <MemoryPanel />
    </div>
  );
}

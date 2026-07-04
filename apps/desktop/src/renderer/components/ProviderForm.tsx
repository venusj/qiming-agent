import { useState, type ChangeEvent } from 'react';
import { Input, Button, Dropdown } from '@qiming/ui';
import { PROVIDER_TEMPLATES } from '../lib/templates';
import type { ProviderConfig, ProviderInput, TestResult } from '@qiming/shared';
import { api } from '../ipc/client';

/**
 * Provider 表单：新增 / 编辑。
 *
 * 功能：
 * - 模板快速填充（applyTemplate）：选模板自动填 kind/baseUrl/defaultModel/enabledModels。
 * - 测试连接（runTest）：若尚未保存（新增态），先保存再测试；测试结果以颜色区分（jade=成功，cinnabar=失败）。
 * - 保存（save）：组装 ProviderInput，apiKey 为空时不传（保留旧 key，仅 update 路径）。
 *
 * apiKey 输入框 type="password"；编辑态 placeholder 显示"已保存，留空则不改"。
 */
export function ProviderForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: ProviderConfig;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ProviderInput['kind']>(
    initial?.kind ?? 'openai',
  );
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(
    initial?.defaultModel ?? '',
  );
  const [enabledModelsText, setEnabledModelsText] = useState(
    (initial?.enabledModels ?? []).join(', '),
  );
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  // runTest 内部保存时用于避免触发 onSaved 关闭弹窗；保存后记录的 providerId 供测试使用。
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);

  const applyTemplate = (label: string) => {
    const t = PROVIDER_TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setKind(t.kind);
    setBaseUrl(t.baseUrl ?? '');
    setDefaultModel(t.defaultModel);
    setEnabledModelsText(t.enabledModels.join(', '));
  };

  /** 组装 ProviderInput。apiKeyRef：编辑态沿用旧的，新增态生成 provider:<uuid>。 */
  const buildInput = (): ProviderInput => ({
    name,
    kind,
    baseUrl: kind === 'openai-compatible' ? baseUrl : undefined,
    apiKeyRef: initial?.apiKeyRef ?? `provider:${crypto.randomUUID()}`,
    defaultModel,
    enabledModels: enabledModelsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });

  /** 保存（create 或 update）。apiKey 为空时不传，保留旧 key。 */
  const save = async (opts?: { silent?: boolean }) => {
    const input = buildInput();
    const key = apiKey || undefined;
    let saved: ProviderConfig;
    if (initial) {
      saved = await api.provider.update(initial.id, input, key);
    } else {
      saved = await api.provider.create(input, apiKey);
    }
    setSavedId(saved.id);
    // 仅显式保存（点击"保存"按钮）才触发 onSaved 关闭弹窗；
    // runTest 内部的静默保存不关闭，以便接着显示测试结果。
    if (!opts?.silent) onSaved();
    return saved;
  };

  /**
   * 测试连接。
   * - 新增态：先静默保存拿到 id，再测。
   *   注意：不能依赖 setSavedId 后的 state 刷新（React state 异步，闭包内仍为旧值），
   *   必须直接接住 save 返回值的 id。
   * - 编辑态：直接用 initial.id 测（若已静默保存过则用 savedId）。
   */
  const runTest = async () => {
    let id = savedId ?? initial?.id;
    if (!id) {
      const saved = await save({ silent: true });
      id = saved.id;
    }
    setTesting(true);
    try {
      setTest(await api.provider.test(id));
    } finally {
      setTesting(false);
    }
  };

  const keyMask = initial ? '••••••（已保存，留空则不改）' : '';

  return (
    <div className="flex flex-col gap-3">
      <Dropdown
        defaultValue=""
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          applyTemplate(e.target.value)
        }
      >
        <option value="" disabled>
          选择模板快速填充…
        </option>
        {PROVIDER_TEMPLATES.map((t) => (
          <option key={t.label} value={t.label}>
            {t.label}
          </option>
        ))}
      </Dropdown>

      <Input
        placeholder="名称（如：我的智谱）"
        value={name}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
      />

      <Dropdown
        value={kind}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          setKind(e.target.value as ProviderInput['kind'])
        }
      >
        <option value="openai">openai</option>
        <option value="openai-compatible">openai-compatible</option>
        <option value="anthropic">anthropic</option>
        <option value="google">google</option>
      </Dropdown>

      {kind === 'openai-compatible' && (
        <Input
          placeholder="baseUrl（如 https://open.bigmodel.cn/api/paas/v4）"
          value={baseUrl}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setBaseUrl(e.target.value)
          }
        />
      )}

      <Input
        type="password"
        placeholder={keyMask || 'APIKey'}
        value={apiKey}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
      />

      <Input
        placeholder="默认模型"
        value={defaultModel}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setDefaultModel(e.target.value)
        }
      />

      <Input
        placeholder="启用模型（逗号分隔）"
        value={enabledModelsText}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setEnabledModelsText(e.target.value)
        }
      />

      {test && (
        <div className={test.ok ? 'text-jade' : 'text-cinnabar'}>
          {test.ok
            ? `✓ 连接成功（${test.latencyMs}ms）`
            : `✕ ${test.error?.kind}：${test.error?.message}`}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={runTest} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </Button>
        <Button variant="primary" onClick={() => save()}>
          保存
        </Button>
      </div>
    </div>
  );
}

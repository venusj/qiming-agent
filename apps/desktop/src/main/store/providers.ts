import type { Database } from 'better-sqlite3';
import type { ProviderConfig, ProviderInput } from '@qiming/shared';
import { randomUUID } from 'node:crypto';

interface Row {
  id: string;
  name: string;
  kind: string;
  base_url: string | null;
  api_key_ref: string;
  default_model: string;
  enabled_models: string | null;
  headers: string | null;
  created_at: number;
  updated_at: number;
}

/** DB 行（snake_case）→ ProviderConfig（camelCase）。enabled_models/headers 是 JSON 字符串需 parse。 */
function rowToConfig(r: Row): ProviderConfig {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as ProviderConfig['kind'],
    baseUrl: r.base_url ?? undefined,
    apiKeyRef: r.api_key_ref,
    defaultModel: r.default_model,
    enabledModels: r.enabled_models ? JSON.parse(r.enabled_models) : [],
    headers: r.headers ? JSON.parse(r.headers) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Provider CRUD 工厂。接收 db 实例以便测试注入 :memory: 库。 */
export function createProviderStore(db: Database) {
  return {
    list(): ProviderConfig[] {
      return (db.prepare('SELECT * FROM providers ORDER BY created_at').all() as Row[]).map(
        rowToConfig,
      );
    },
    get(id: string): ProviderConfig | null {
      const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Row | undefined;
      return r ? rowToConfig(r) : null;
    },
    create(input: ProviderInput): ProviderConfig {
      const now = Date.now();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO providers
        (id, name, kind, base_url, api_key_ref, default_model, enabled_models, headers, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        input.name,
        input.kind,
        input.baseUrl ?? null,
        input.apiKeyRef,
        input.defaultModel,
        JSON.stringify(input.enabledModels),
        input.headers ? JSON.stringify(input.headers) : null,
        now,
        now,
      );
      return this.get(id)!;
    },
    /** merge 语义：Partial input 与现有合并。 */
    update(id: string, input: Partial<ProviderInput>): ProviderConfig | null {
      const cur = this.get(id);
      if (!cur) return null;
      const merged: ProviderConfig = { ...cur, ...input, updatedAt: Date.now() };
      db.prepare(
        `UPDATE providers SET name=?, kind=?, base_url=?, api_key_ref=?,
        default_model=?, enabled_models=?, headers=?, updated_at=? WHERE id=?`,
      ).run(
        merged.name,
        merged.kind,
        merged.baseUrl ?? null,
        merged.apiKeyRef,
        merged.defaultModel,
        JSON.stringify(merged.enabledModels),
        merged.headers ? JSON.stringify(merged.headers) : null,
        merged.updatedAt,
        id,
      );
      return this.get(id);
    },
    delete(id: string): void {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    },
  };
}

import { generateText } from 'ai';
import type { ProviderConfig, TestResult } from '@qiming/shared';
import { buildModel } from './factory';

/** 发最小请求验证配置。错误归类供 UI 给提示。 */
export async function testConnection(cfg: ProviderConfig): Promise<TestResult> {
  const start = Date.now();
  try {
    const model = await buildModel(cfg, cfg.defaultModel);
    await generateText({ model, prompt: 'ping', maxTokens: 1 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // 简化为显式联合类型（brief 风险提示推荐），等价于原条件类型推导
    let kind: 'auth' | 'network' | 'model' | 'unknown' = 'unknown';
    if (/401|auth|api\s?key|unauthorized/i.test(msg)) kind = 'auth';
    else if (/network|econnrefused|timeout|fetch|dns/i.test(msg)) kind = 'network';
    else if (/model|not\s*found|invalid/i.test(msg)) kind = 'model';
    return { ok: false, error: { kind, message: msg }, latencyMs: Date.now() - start };
  }
}

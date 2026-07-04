import { describe, it, expect } from 'vitest';
import { keyStore } from '../src/main/keystore';

describe.skip('KeyStore 集成测试（需真实系统密钥库，手动运行）', () => {
  it('存取删一个 key', async () => {
    await keyStore.set('test-id', 'sk-secret');
    expect(await keyStore.get('test-id')).toBe('sk-secret');
    expect(await keyStore.delete('test-id')).toBe(true);
  });
});

import keytar from 'keytar';

const SERVICE = 'qiming-agent';

/** APIKey 命名规则：provider:<providerId> */
function ref(providerId: string): string {
  return `provider:${providerId}`;
}

export const keyStore = {
  async set(providerId: string, secret: string): Promise<void> {
    await keytar.setPassword(SERVICE, ref(providerId), secret);
  },
  async get(providerId: string): Promise<string | null> {
    return keytar.getPassword(SERVICE, ref(providerId));
  },
  async delete(providerId: string): Promise<boolean> {
    return keytar.deletePassword(SERVICE, ref(providerId));
  },
};

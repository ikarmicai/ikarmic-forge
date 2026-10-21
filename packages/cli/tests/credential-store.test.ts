import { describe, expect, it, vi } from 'vitest';

vi.mock('@napi-rs/keyring', () => {
  const data = new Map<string, string>();
  return {
    Entry: class {
      private readonly key: string;
      constructor(service: string, account: string) {
        this.key = `${service}:${account}`;
      }
      getPassword(): string | null {
        return data.get(this.key) ?? null;
      }
      setPassword(value: string): void {
        data.set(this.key, value);
      }
      deletePassword(): boolean {
        const existed = data.has(this.key);
        data.delete(this.key);
        return existed;
      }
    },
  };
});

const { createKeyringCredentialStore } = await import('../src/credential-store.js');

describe('createKeyringCredentialStore', () => {
  it('stores and retrieves a key', async () => {
    const store = createKeyringCredentialStore();
    await store.set('anthropic', 'sk-test-123');
    await expect(store.get('anthropic')).resolves.toBe('sk-test-123');
  });

  it('returns undefined for a provider with no stored key', async () => {
    const store = createKeyringCredentialStore();
    await expect(store.get('openai')).resolves.toBeUndefined();
  });

  it('deletes a stored key without throwing', async () => {
    const store = createKeyringCredentialStore();
    await store.set('google', 'sk-test');
    await store.delete('google');
    await expect(store.get('google')).resolves.toBeUndefined();
  });

  it('delete on a never-set provider does not throw', async () => {
    const store = createKeyringCredentialStore();
    await expect(store.delete('minimax')).resolves.toBeUndefined();
  });
});

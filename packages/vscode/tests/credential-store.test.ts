import { describe, expect, it, vi } from 'vitest';
import { createSecretStorageCredentialStore } from '../src/credential-store.js';

function fakeSecretStorage() {
  const data = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => data.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      data.delete(key);
    }),
    onDidChange: vi.fn(),
    data,
  };
}

describe('createSecretStorageCredentialStore', () => {
  it('stores and retrieves a key under the provider-scoped account', async () => {
    const secrets = fakeSecretStorage();
    const store = createSecretStorageCredentialStore(secrets as never);
    await store.set('anthropic', 'sk-test-123');
    expect(secrets.store).toHaveBeenCalledWith('ikarmic-forge:apiKey:anthropic', 'sk-test-123');
    await expect(store.get('anthropic')).resolves.toBe('sk-test-123');
  });

  it('returns undefined for a provider with no stored key', async () => {
    const secrets = fakeSecretStorage();
    const store = createSecretStorageCredentialStore(secrets as never);
    await expect(store.get('openai')).resolves.toBeUndefined();
  });

  it('deletes a stored key', async () => {
    const secrets = fakeSecretStorage();
    const store = createSecretStorageCredentialStore(secrets as never);
    await store.set('openai', 'sk-test');
    await store.delete('openai');
    expect(secrets.delete).toHaveBeenCalledWith('ikarmic-forge:apiKey:openai');
    await expect(store.get('openai')).resolves.toBeUndefined();
  });
});

import type * as vscode from 'vscode';

import { CREDENTIAL_SERVICE_NAME, credentialAccountKey } from '@ikarmic/forge-core';
import type { CredentialStore, ProviderName } from '@ikarmic/forge-core';

/** Wraps VS Code's SecretStorage as a Forge CredentialStore. */
export function createSecretStorageCredentialStore(secrets: vscode.SecretStorage): CredentialStore {
  const keyFor = (provider: ProviderName): string =>
    `${CREDENTIAL_SERVICE_NAME}:${credentialAccountKey(provider)}`;

  return {
    async get(provider) {
      return secrets.get(keyFor(provider));
    },
    async set(provider, key) {
      await secrets.store(keyFor(provider), key);
    },
    async delete(provider) {
      await secrets.delete(keyFor(provider));
    },
  };
}

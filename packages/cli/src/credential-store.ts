import { Entry } from '@napi-rs/keyring';

import { CREDENTIAL_SERVICE_NAME, credentialAccountKey } from '@ikarmic/forge-core';
import type { CredentialStore } from '@ikarmic/forge-core';

/**
 * OS-keychain-backed CredentialStore for the CLI. Uses the same
 * service/account naming as the VS Code SecretStorage implementation
 * so a key entered on one surface is visible on the other.
 */
export function createKeyringCredentialStore(): CredentialStore {
  return {
    async get(provider) {
      try {
        const entry = new Entry(CREDENTIAL_SERVICE_NAME, credentialAccountKey(provider));
        return entry.getPassword() ?? undefined;
      } catch {
        // OS keychain unavailable (e.g. headless Linux without libsecret): 
        // treat as "not set" rather than surfacing a low-level error.
        return undefined;
      }
    },
    async set(provider, key) {
      const entry = new Entry(CREDENTIAL_SERVICE_NAME, credentialAccountKey(provider));
      entry.setPassword(key);
    },
    async delete(provider) {
      try {
        const entry = new Entry(CREDENTIAL_SERVICE_NAME, credentialAccountKey(provider));
        entry.deletePassword();
      } catch {
        // Already absent, or keychain unavailable: deleting a
        // non-existent entry is a no-op either way.
      }
    },
  };
}

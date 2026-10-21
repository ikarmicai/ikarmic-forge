import { loadForgeConfigFile, type CredentialStore } from '@ikarmic/forge-core';

import { applyProviderEnv, applyResolvedApiKeys, resolveApiKeysWithStore } from './api-keys.js';
import { readConfig, type ExtensionConfig } from './config.js';
import { applySharedModel } from './shared-model.js';

/**
 * Read `forge.*`, then make it effective for the provider SDKs: export the
 * endpoint/region settings and the secrets (CredentialStore -> legacy setting
 * -> env) to the env vars core's provider factories read. Call this at the
 * start of every run so a key added or rotated after activation is picked up.
 */
export async function loadRuntimeConfig(store?: CredentialStore): Promise<ExtensionConfig> {
  const cfg = readConfig();
  // The Settings panel saves provider/model to the shared ~/.forge/config.json (the CLI reads it too).
  // An explicit VS Code setting wins; otherwise the shared choice applies; otherwise auto-detect.
  const { config: shared } = await loadForgeConfigFile().catch(() => ({ config: {} as Awaited<ReturnType<typeof loadForgeConfigFile>>['config'] }));
  applySharedModel(cfg, shared);
  applyProviderEnv(cfg.providerEnv);
  if (store) {
    cfg.apiKeys = await resolveApiKeysWithStore(store, cfg.apiKeys);
    applyResolvedApiKeys(cfg.apiKeys);
  }
  return cfg;
}

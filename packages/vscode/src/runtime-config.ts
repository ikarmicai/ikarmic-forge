import * as vscode from 'vscode';

import {
  loadMergedForgeConfig,
  overridesFromProviders,
  registerCustomProviders,
  registerModelFilters,
  registerModelOverrides,
  type CredentialStore,
  type LoadForgeConfigFileResult,
} from '@ikarmic/forge-core';

import { applyProviderEnv, applyResolvedApiKeys, resolveApiKeysWithStore } from './api-keys.js';
import { applyCloudCredentials, type CloudCredentialStore } from './settings/cloud-credentials.js';
import { readConfig, type ExtensionConfig } from './config.js';
import { applySharedModel } from './shared-model.js';

/**
 * Read `forge.*`, then make it effective for the provider SDKs: export the
 * endpoint/region settings and the secrets (CredentialStore -> legacy setting
 * -> env) to the env vars core's provider factories read. Call this at the
 * start of every run so a key added or rotated after activation is picked up.
 */
/** Where the AWS access keys saved in Settings are kept; set once at activation. */
let cloudCredentials: CloudCredentialStore | undefined;
export function setCloudCredentialStore(store: CloudCredentialStore | undefined): void {
  cloudCredentials = store;
}

export async function loadRuntimeConfig(store?: CredentialStore): Promise<ExtensionConfig> {
  const cfg = readConfig();
  // The Settings panel saves provider/model to the shared ~/.forge/config.json (the CLI reads it too).
  // An explicit VS Code setting wins; otherwise the shared choice applies; otherwise auto-detect.
  // The workspace's .forge/config.json (trusted workspaces only) sits on top of the user file.
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const { config: shared } = await loadMergedForgeConfig(root, { trusted: vscode.workspace.isTrusted }).catch(() => ({ config: {} as LoadForgeConfigFileResult['config'] }));
  // Named providers and per-model numbers are process-wide so every model lookup sees them.
  registerCustomProviders(shared.customProviders);
  registerModelFilters(shared.modelFilters);
  registerModelOverrides({ ...overridesFromProviders(shared.customProviders), ...shared.modelOverrides });
  applySharedModel(cfg, shared);
  applyProviderEnv(cfg.providerEnv);
  if (store) {
    cfg.apiKeys = await resolveApiKeysWithStore(store, cfg.apiKeys);
    applyResolvedApiKeys(cfg.apiKeys);
  }
  if (cloudCredentials) await applyCloudCredentials(cloudCredentials);
  return cfg;
}

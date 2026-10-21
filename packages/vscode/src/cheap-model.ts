import { loadForgeConfigFile, resolveModelAlias, type CredentialStore, type ModelConfig } from '@ikarmic/forge-core';

import { resolveModel } from './config.js';
import { loadRuntimeConfig } from './runtime-config.js';

/**
 * The model for small one-shot jobs (rewriting a prompt, drafting a commit message): `forge.router.cheapModel`
 * when set, otherwise the main model. Undefined when no model resolves (no key, broken alias).
 */
export async function resolveCheapModel(store?: CredentialStore): Promise<ModelConfig | undefined> {
  try {
    const cfg = await loadRuntimeConfig(store);
    const main = resolveModel(cfg);
    const { config: shared } = await loadForgeConfigFile();
    return { ...main, ...resolveModelAlias(cfg.cheapModel.trim() || main.model, shared.aliases, main.provider) };
  } catch {
    return undefined;
  }
}

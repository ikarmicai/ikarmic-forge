import { MODEL_CATALOG, envVarForProvider, fetchProviderModels, type CredentialStore, type ModelCatalogEntry, type ProviderName } from '@ikarmic/forge-core';

export interface ModelList {
  models: ModelCatalogEntry[];
  /** `live` came from the provider just now (or within the cache window); `builtin` is the offline fallback. */
  source: 'live' | 'builtin';
  /** Why the live list was not used; only set for `builtin`. */
  error?: string;
}

interface Deps {
  store: Pick<CredentialStore, 'get'>;
  baseUrls: () => Partial<Record<ProviderName, string>>;
  fetch?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Asks each provider which models the user's key can use, remembers the answer for an hour, and
 * falls back to the short built-in list (with the reason) when it cannot. Shared by the Settings
 * page and the chat's model picker so both show the same, current list.
 */
export class ModelLister {
  private readonly cache = new Map<string, { at: number; models: ModelCatalogEntry[] }>();

  constructor(private readonly deps: Deps) {}

  async list(provider: ProviderName, refresh = false): Promise<ModelList> {
    const builtin = MODEL_CATALOG[provider] ?? [];
    const baseUrl = this.deps.baseUrls()[provider] || undefined;
    const envName = envVarForProvider(provider);
    const apiKey = (await this.deps.store.get(provider)) || (envName ? process.env[envName] : undefined) || undefined;
    // The key's tail is part of the cache key so pasting a different key refetches.
    const cacheKey = `${provider}|${baseUrl ?? ''}|${apiKey ? apiKey.slice(-4) : ''}`;
    const now = (this.deps.now ?? Date.now)();
    const hit = this.cache.get(cacheKey);
    if (!refresh && hit && now - hit.at < (this.deps.ttlMs ?? 3_600_000)) return { models: hit.models, source: 'live' };
    try {
      const models = await fetchProviderModels(provider, {
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}),
        signal: AbortSignal.timeout(8_000),
      });
      this.cache.set(cacheKey, { at: now, models });
      return { models, source: 'live' };
    } catch (err) {
      return { models: builtin, source: 'builtin', error: (err as Error).message };
    }
  }
}

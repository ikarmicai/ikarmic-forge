import { resolveModelAlias, type ModelConfig, type ProviderName } from '@ikarmic/forge-core';

/**
 * The model a `forge.model` value names when it is `id:model` on a preset or `customProviders` provider
 * (`groq:llama-3.3-70b-versatile`), else undefined and the normal provider and key logic applies.
 * vscode-free so it is unit-tested.
 */
export function namedProviderModel(model: string, provider: string): ModelConfig | undefined {
  const ref = model.trim();
  if (!ref.includes(':')) return undefined;
  const resolved = resolveModelAlias(ref, undefined, (provider === 'auto' ? 'openai' : provider) as ProviderName);
  return resolved.endpoint ? { provider: resolved.provider, model: resolved.model, endpoint: resolved.endpoint } : undefined;
}

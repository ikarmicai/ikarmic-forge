/**
 * API key resolution helpers: deliberately vscode-free (no `import
 * 'vscode'`, not even for types) so they're testable outside the
 * extension host, matching the pattern `completion-helpers.ts` and
 * `voice-input.ts` already use for their own pure logic.
 */
import { envVarForProvider, resolveApiKey } from '@ikarmic/forge-core';
import type { CredentialStore, ProviderName } from '@ikarmic/forge-core';

/** Providers that authenticate with a single secret string. */
export const KEY_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'minimax', 'bedrock', 'azure', 'openai-compatible'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];
export type ResolvedApiKeys = Record<KeyProvider, string>;

export function emptyApiKeys(): ResolvedApiKeys {
  return Object.fromEntries(KEY_PROVIDERS.map((p) => [p, ''])) as ResolvedApiKeys;
}

/**
 * Non-secret provider endpoints/regions (forge.providers.*). Empty string = unset,
 * so an existing environment variable keeps working.
 */
export interface ProviderEnvSettings {
  awsRegion: string;
  vertexProject: string;
  vertexLocation: string;
  googleCredentialsFile: string;
  azureResourceName: string;
  azureBaseUrl: string;
  openaiCompatibleBaseUrl: string;
  lmstudioBaseUrl: string;
  ollamaBaseUrl: string;
}

const PROVIDER_ENV_VARS: Record<keyof ProviderEnvSettings, string> = {
  awsRegion: 'AWS_REGION',
  vertexProject: 'GOOGLE_VERTEX_PROJECT',
  vertexLocation: 'GOOGLE_VERTEX_LOCATION',
  googleCredentialsFile: 'GOOGLE_APPLICATION_CREDENTIALS',
  azureResourceName: 'AZURE_RESOURCE_NAME',
  azureBaseUrl: 'AZURE_OPENAI_BASE_URL',
  openaiCompatibleBaseUrl: 'OPENAI_COMPATIBLE_BASE_URL',
  lmstudioBaseUrl: 'LMSTUDIO_BASE_URL',
  ollamaBaseUrl: 'OLLAMA_BASE_URL',
};

/** Export the provider settings to the env vars core's provider factories read. Unset values are left alone. */
export function applyProviderEnv(settings: ProviderEnvSettings, env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(PROVIDER_ENV_VARS) as (keyof ProviderEnvSettings)[]) {
    const value = settings[key].trim();
    if (value) env[PROVIDER_ENV_VARS[key]] = value;
  }
}

/**
 * Resolve every key provider's secret through the CredentialStore,
 * falling back to the legacy `forge.apiKeys.*` plaintext settings
 * (back-compat only: the new settings panel never writes those) and
 * then env vars. Used both for provider auto-detection (`pickProvider`
 * in config.ts) and, via {@link applyResolvedApiKeys}, for actually
 * authenticating the AI SDK's provider factories.
 */
export async function resolveApiKeysWithStore(
  store: CredentialStore,
  legacy: Partial<ResolvedApiKeys>
): Promise<ResolvedApiKeys> {
  const entries = await Promise.all(
    KEY_PROVIDERS.map(async (p) => [p, (await resolveApiKey(p as ProviderName, { store, legacySetting: legacy[p] })) ?? ''] as const)
  );
  return Object.fromEntries(entries) as ResolvedApiKeys;
}

/**
 * Apply resolved keys to the env vars the AI SDK's bare provider
 * factories (`anthropic(model)`, `openai(model)`, etc.) read
 * automatically. Without this, a key resolved from the CredentialStore
 * or a legacy setting would be used for provider auto-detection but
 * never actually reach the SDK call, causing an auth failure.
 */
export function applyResolvedApiKeys(resolved: Partial<ResolvedApiKeys>): void {
  for (const provider of KEY_PROVIDERS) {
    const key = resolved[provider];
    if (!key) continue;
    const envVar = envVarForProvider(provider);
    if (envVar) process.env[envVar] = key;
  }
}

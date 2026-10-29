import { describe, expect, it, vi } from 'vitest';
import { applyProviderEnv, applyResolvedApiKeys, resolveApiKeysWithStore } from '../src/api-keys.js';
import type { CredentialStore } from '@ikarmic/forge-core';

describe('resolveApiKeysWithStore', () => {
  it('prefers the CredentialStore over the legacy forge.apiKeys.* setting', async () => {
    const store: CredentialStore = {
      get: vi.fn().mockResolvedValue('from-store'),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const result = await resolveApiKeysWithStore(store, {
      openai: 'legacy-openai',
      anthropic: '',
      google: '',
      openrouter: '',
      minimax: '',
    });
    expect(result.openai).toBe('from-store');
  });

  it('falls back to the legacy setting when the store has nothing for a provider', async () => {
    const store: CredentialStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const result = await resolveApiKeysWithStore(store, {
      openai: '',
      anthropic: 'legacy-anthropic',
      google: '',
      openrouter: '',
      minimax: '',
    });
    expect(result.anthropic).toBe('legacy-anthropic');
  });
});

describe('applyResolvedApiKeys', () => {
  it('sets the corresponding env var for every resolved key', () => {
    const original = { ...process.env };
    try {
      applyResolvedApiKeys({
        openai: '',
        anthropic: 'sk-ant-test',
        google: '',
        openrouter: '',
        minimax: '',
      });
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    } finally {
      process.env = original;
    }
  });

  it('does not touch env vars for providers with no resolved key', () => {
    const original = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    try {
      applyResolvedApiKeys({ openai: '', anthropic: '', google: '', openrouter: '', minimax: '' });
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
    } finally {
      process.env = original;
    }
  });
});

describe('new providers', () => {
  it('resolves bedrock / azure / openai-compatible secrets through the store', async () => {
    const store: CredentialStore = {
      get: vi.fn(async (p: string) => (p === 'bedrock' ? 'bt' : p === 'azure' ? 'az' : p === 'openai-compatible' ? 'oc' : undefined)),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const r = await resolveApiKeysWithStore(store, {});
    expect(r.bedrock).toBe('bt');
    expect(r.azure).toBe('az');
    expect(r['openai-compatible']).toBe('oc');
    expect(r.openai).toBe('');
  });

  it('applyResolvedApiKeys exports the new providers env vars', () => {
    const original = { ...process.env };
    try {
      applyResolvedApiKeys({ bedrock: 'bt', azure: 'az', 'openai-compatible': 'oc' });
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe('bt');
      expect(process.env.AZURE_API_KEY).toBe('az');
      expect(process.env.OPENAI_COMPATIBLE_API_KEY).toBe('oc');
    } finally {
      process.env = original;
    }
  });
});

describe('applyProviderEnv', () => {
  const blank = {
    awsRegion: '', vertexProject: '', vertexLocation: '', googleCredentialsFile: '', azureResourceName: '', azureBaseUrl: '',
    openaiCompatibleBaseUrl: '', lmstudioBaseUrl: '', ollamaBaseUrl: '',
  };

  it('exports set values and leaves unset ones (and existing env) alone', () => {
    const env: NodeJS.ProcessEnv = { AWS_REGION: 'eu-west-1' };
    applyProviderEnv({ ...blank, vertexProject: ' my-proj ', openaiCompatibleBaseUrl: 'http://x/v1' }, env);
    expect(env.GOOGLE_VERTEX_PROJECT).toBe('my-proj');
    expect(env.OPENAI_COMPATIBLE_BASE_URL).toBe('http://x/v1');
    expect(env.AWS_REGION).toBe('eu-west-1');
    expect(env.AZURE_RESOURCE_NAME).toBeUndefined();
  });

  it('a set value overrides a stale env var', () => {
    const env: NodeJS.ProcessEnv = { AWS_REGION: 'eu-west-1' };
    applyProviderEnv({ ...blank, awsRegion: 'us-west-2' }, env);
    expect(env.AWS_REGION).toBe('us-west-2');
  });
});

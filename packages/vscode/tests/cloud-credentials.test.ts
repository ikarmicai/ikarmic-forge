import { describe, expect, it, vi } from 'vitest';

import { AWS_CREDENTIALS, applyCloudCredentials, cloudCredentialProblem, createCloudCredentialStore, savedCloudCredentials } from '../src/settings/cloud-credentials.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * AWS Bedrock reads an access key pair from the environment. A person who does not start VS Code from a shell that
 * has them had nowhere to put them. They are now kept in the editor's secret storage, like every other key, and put
 * in the environment when a run starts. Nothing is ever shown again, logged or sent back to the page.
 */
function secretStorage() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => map.get(k),
    store: async (k: string, v: string) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  };
}

describe('the store', () => {
  it('keeps each value under a name no provider key or MCP secret can collide with, and removes on empty', async () => {
    const ss = secretStorage();
    const store = createCloudCredentialStore(ss as never);
    await store.set('accessKeyId', 'AKIAEXAMPLE');
    expect([...ss.map.keys()]).toEqual(['forge.cloud:aws:accessKeyId']);
    expect(await store.get('accessKeyId')).toBe('AKIAEXAMPLE');
    await store.set('accessKeyId', '');
    expect(ss.map.size).toBe(0);
  });

  it('only keeps the three ids Forge knows', async () => {
    const store = createCloudCredentialStore(secretStorage() as never);
    await expect(store.set('anything-else', 'x')).rejects.toThrow();
    expect(AWS_CREDENTIALS.map((c) => c.id)).toEqual(['accessKeyId', 'secretAccessKey', 'sessionToken']);
  });
});

describe('applyCloudCredentials', () => {
  it('puts what is saved in the environment, over a value already there, as a saved provider key does', async () => {
    const store = createCloudCredentialStore(secretStorage() as never);
    await store.set('accessKeyId', 'SAVED-ID');
    await store.set('secretAccessKey', 'SAVED-SECRET');
    const env: Record<string, string | undefined> = { AWS_ACCESS_KEY_ID: 'from-shell', AWS_REGION: 'eu-west-1' };
    await applyCloudCredentials(store, env);
    expect(env).toMatchObject({ AWS_ACCESS_KEY_ID: 'SAVED-ID', AWS_SECRET_ACCESS_KEY: 'SAVED-SECRET', AWS_REGION: 'eu-west-1' });
    expect(env.AWS_SESSION_TOKEN).toBeUndefined();
  });

  it('leaves the environment alone when nothing is saved', async () => {
    const env: Record<string, string | undefined> = { AWS_ACCESS_KEY_ID: 'from-shell' };
    await applyCloudCredentials(createCloudCredentialStore(secretStorage() as never), env);
    expect(env).toEqual({ AWS_ACCESS_KEY_ID: 'from-shell' });
  });

  it('says which are saved, by id, never their value', async () => {
    const store = createCloudCredentialStore(secretStorage() as never);
    await store.set('secretAccessKey', 'x');
    expect(await savedCloudCredentials(store)).toEqual(['secretAccessKey']);
  });
});

describe('cloudCredentialProblem', () => {
  const ok = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };

  it('accepts a pair, with or without a session token', () => {
    expect(cloudCredentialProblem(ok)).toBeUndefined();
    expect(cloudCredentialProblem({ ...ok, sessionToken: 'tok' })).toBeUndefined();
  });

  it('asks for both halves of the pair, naming the one that is missing', () => {
    expect(cloudCredentialProblem({ accessKeyId: ok.accessKeyId })).toMatch(/Secret access key/);
    expect(cloudCredentialProblem({ secretAccessKey: ok.secretAccessKey })).toMatch(/Access key ID/);
    expect(cloudCredentialProblem({})).toMatch(/Access key ID/);
  });

  it('refuses a session token on its own', () => {
    expect(cloudCredentialProblem({ sessionToken: 'tok' })).toMatch(/Access key ID/);
  });

  it('refuses a value with a space or a line break in it, which is a paste gone wrong', () => {
    expect(cloudCredentialProblem({ ...ok, secretAccessKey: 'abc def' })).toMatch(/Secret access key/);
    expect(cloudCredentialProblem({ ...ok, accessKeyId: 'AKIA\nEXAMPLE' })).toMatch(/Access key ID/);
  });

  it('never puts a value in the sentence', () => {
    expect(cloudCredentialProblem({ ...ok, secretAccessKey: 'abc def' })).not.toContain('abc def');
  });
});

describe('host side', () => {
  function deps() {
    const cloud = {
      status: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      saved: vi.fn().mockResolvedValue(['accessKeyId']),
    };
    return { cloud, all: { cloud } as unknown as SettingsDeps };
  }
  const pair = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };

  it('saves a valid pair, then sends the new status without any value in it', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'cloudCredentialSet', values: pair }, d.all);
    expect(d.cloud.save).toHaveBeenCalledWith(pair);
    expect(r).toMatchObject({ type: 'cloudStatusLoaded', saved: ['accessKeyId'] });
    expect(JSON.stringify(r)).not.toContain('wJalrX');
  });

  it('refuses an invalid set with the sentence, and saves nothing', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'cloudCredentialSet', values: { accessKeyId: 'AKIAX' } }, d.all);
    expect(r).toMatchObject({ type: 'notice' });
    expect(d.cloud.save).not.toHaveBeenCalled();
  });

  it('ignores an id Forge does not know', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'cloudCredentialSet', values: { ...pair, evil: 'x' } }, d.all);
    expect(d.cloud.save).toHaveBeenCalledWith(pair);
  });

  it('removes the saved credentials on request', async () => {
    const d = deps();
    await handleSettingsMessage({ type: 'cloudCredentialClear' }, d.all);
    expect(d.cloud.clear).toHaveBeenCalledTimes(1);
  });
});

describe('the page', () => {
  const html = getSettingsHtml();
  it('opens one dialog for them, and sends the values once, never storing them in the page', () => {
    expect(html).toContain('function openKeyDialog');
    expect(html).toContain("type: 'cloudCredentialSet'");
    expect(html).toContain("type: 'cloudCredentialClear'");
    expect(html).toContain('Enter access keys');
    expect(html).toContain('Remove saved access keys');
  });
});

describe('wiring', () => {
  it('applies what is saved at the start of every run, next to the provider keys', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const runtime = readFileSync(join(__dirname, '..', 'src', 'runtime-config.ts'), 'utf8');
    expect(runtime).toMatch(/applyResolvedApiKeys\(cfg\.apiKeys\);[\s\S]*applyCloudCredentials\(cloudCredentials\)/);
    const ext = readFileSync(join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    expect(ext).toContain('setCloudCredentialStore(cloudCredentials)');
    expect(ext).toMatch(/new CommandRegistry\([\s\S]*cloudCredentials,/);
  });
});

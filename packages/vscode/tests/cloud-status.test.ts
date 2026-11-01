import { describe, expect, it, vi } from 'vitest';

import { cloudProviderStatus } from '../src/settings/cloud-status.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * Bedrock, Vertex and Azure read their credentials from the environment, not from a key Forge stores. The page cannot
 * ask for them, so it says, per provider, what Forge found and what is missing, without ever showing a value.
 */
const by = (env: Record<string, string>) => Object.fromEntries(cloudProviderStatus(env).map((s) => [s.provider, s]));

describe('AWS Bedrock', () => {
  it('uses access keys when both are set, and names the region it will use', () => {
    const s = by({ AWS_ACCESS_KEY_ID: 'AKIAX', AWS_SECRET_ACCESS_KEY: 'shh', AWS_REGION: 'eu-west-1' })['AWS Bedrock']!;
    expect(s.tone).toBe('ok');
    expect(s.text).toContain('access keys');
    expect(s.text).toContain('eu-west-1');
    expect(s.text).not.toContain('AKIAX');
  });

  it('uses a Bedrock API key when there is one', () => {
    expect(by({ AWS_BEARER_TOKEN_BEDROCK: 'tok' })['AWS Bedrock']!.text).toContain('Bedrock API key');
  });

  it('says a lone half of the access key pair is ignored, which is the usual mistake', () => {
    const s = by({ AWS_ACCESS_KEY_ID: 'AKIAX' })['AWS Bedrock']!;
    expect(s.tone).toBe('bad');
    expect(s.text).toContain('Only one of the two AWS access keys');
  });

  it('says what happens with nothing set: the usual AWS sign-in is tried, so it is a note and not an error', () => {
    const s = by({})['AWS Bedrock']!;
    expect(s.tone).toBe('note');
    expect(s.text).toMatch(/usual AWS sign-in/);
    expect(s.text).toContain('us-east-1');
  });
});

describe('Google Vertex AI', () => {
  it('needs a project, and says so in words when there is none', () => {
    const s = by({})['Google Vertex AI']!;
    expect(s.tone).toBe('bad');
    expect(s.text).toContain('No Google Cloud project');
    expect(s.text).toContain('under Advanced');
  });

  it('shows the project and the location, with the default location when none is set', () => {
    const s = by({ GOOGLE_VERTEX_PROJECT: 'my-proj' })['Google Vertex AI']!;
    expect(s.tone).toBe('ok');
    expect(s.text).toContain('my-proj');
    expect(s.text).toContain('us-central1');
    expect(by({ GOOGLE_VERTEX_PROJECT: 'p', GOOGLE_VERTEX_LOCATION: 'europe-west4' })['Google Vertex AI']!.text).toContain('europe-west4');
  });
});

describe('Google Vertex AI credentials file', () => {
  it('names the file when one is set, and says it signs in with it', () => {
    const s = by({ GOOGLE_VERTEX_PROJECT: 'p', GOOGLE_APPLICATION_CREDENTIALS: '/keys/sa.json' })['Google Vertex AI']!;
    expect(s.tone).toBe('ok');
    expect(s.text).toContain('/keys/sa.json');
  });

  it('says it uses the credentials set up on this machine when there is no file', () => {
    expect(by({ GOOGLE_VERTEX_PROJECT: 'p' })['Google Vertex AI']!.text).toContain('set up on this machine');
  });
});

describe('Azure OpenAI', () => {
  it('needs a key and a resource name or an address, and says which is missing', () => {
    expect(by({})['Azure OpenAI']!.text).toContain('No Azure key');
    expect(by({})['Azure OpenAI']!.text).toContain('in the list above');
    const noResource = by({ AZURE_API_KEY: 'k' })['Azure OpenAI']!;
    expect(noResource.tone).toBe('bad');
    expect(noResource.text).toContain('No Azure resource name or address');
    expect(noResource.text).toContain('under Advanced');
  });

  it('is ready with a key and either a resource name or an address', () => {
    expect(by({ AZURE_API_KEY: 'k', AZURE_RESOURCE_NAME: 'r' })['Azure OpenAI']!.tone).toBe('ok');
    expect(by({ AZURE_API_KEY: 'k', AZURE_OPENAI_BASE_URL: 'https://x' })['Azure OpenAI']!.tone).toBe('ok');
  });
});

describe('no value is ever shown', () => {
  it('leaves every secret out of the text', () => {
    const all = cloudProviderStatus({
      AWS_ACCESS_KEY_ID: 'AKIA-SECRET-ID',
      AWS_SECRET_ACCESS_KEY: 'SECRET-KEY-VALUE',
      AWS_SESSION_TOKEN: 'SESSION-TOKEN-VALUE',
      AWS_BEARER_TOKEN_BEDROCK: 'BEARER-VALUE',
      AZURE_API_KEY: 'AZURE-KEY-VALUE',
      GOOGLE_VERTEX_PROJECT: 'proj',
      AZURE_RESOURCE_NAME: 'res',
    })
      .map((s) => s.text)
      .join('\n');
    for (const secret of ['AKIA-SECRET-ID', 'SECRET-KEY-VALUE', 'SESSION-TOKEN-VALUE', 'BEARER-VALUE', 'AZURE-KEY-VALUE']) expect(all).not.toContain(secret);
  });
});

describe('no environment variable name is ever shown', () => {
  // A person reads these lines; a name like GOOGLE_VERTEX_PROJECT means nothing to most of them.
  const names = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
  const cases: Record<string, string>[] = [
    {},
    { AWS_ACCESS_KEY_ID: 'a' },
    { AWS_SECRET_ACCESS_KEY: 's' },
    { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 's' },
    { AWS_BEARER_TOKEN_BEDROCK: 't' },
    { GOOGLE_VERTEX_PROJECT: 'p' },
    { GOOGLE_VERTEX_PROJECT: 'p', GOOGLE_VERTEX_LOCATION: 'europe-west4', GOOGLE_APPLICATION_CREDENTIALS: '/k/sa.json' },
    { AZURE_API_KEY: 'k' },
    { AZURE_API_KEY: 'k', AZURE_RESOURCE_NAME: 'r' },
    { AZURE_API_KEY: 'k', AZURE_OPENAI_BASE_URL: 'https://x' },
    { AZURE_RESOURCE_NAME: 'r' },
  ];
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_i, env) => {
    for (const s of cloudProviderStatus(env)) expect(s.text, s.provider).not.toMatch(names);
  });
});

describe('cloud status: host side and page', () => {
  it('sends the three providers, read from the settings applied over the environment', async () => {
    const cloud = { status: vi.fn().mockResolvedValue(cloudProviderStatus({ GOOGLE_VERTEX_PROJECT: 'p' })) };
    const r = await handleSettingsMessage({ type: 'loadCloudStatus' }, { cloud } as unknown as SettingsDeps);
    expect(r).toMatchObject({ type: 'cloudStatusLoaded' });
    expect((r as { providers: unknown[] }).providers).toHaveLength(3);
    expect(await handleSettingsMessage({ type: 'loadCloudStatus' }, {} as SettingsDeps)).toEqual({ type: 'none' });
  });

  it('is drawn on the API keys page, with a word before each result', () => {
    const html = getSettingsHtml();
    expect(html).toContain('id="cloud-status"');
    expect(html).toContain("type: 'loadCloudStatus'");
    const at = html.indexOf('function renderCloudStatus');
    const block = at < 0 ? '' : html.slice(at, at + 1500);
    for (const word of ['Ready', 'Problem', 'Note']) expect(block, word).toContain(word);
  });
});

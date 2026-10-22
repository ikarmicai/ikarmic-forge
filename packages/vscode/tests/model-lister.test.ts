import { describe, expect, it } from 'vitest';

import { registerModelFilters } from '@ikarmic/forge-core';
import { afterEach } from 'vitest';

import { ModelLister } from '../src/model-lister.js';

const okFetch = (ids: string[], calls: { n: number }) =>
  (async () => {
    calls.n++;
    return new Response(JSON.stringify({ data: ids.map((id) => ({ id, created: 1 })) }), { status: 200 });
  }) as unknown as typeof fetch;

const lister = (over: Partial<ConstructorParameters<typeof ModelLister>[0]> = {}) =>
  new ModelLister({ store: { get: async () => 'sk-test-1234' }, baseUrls: () => ({}), ...over });

describe('ModelLister', () => {
  it('returns the provider list and serves repeats from the cache until refreshed', async () => {
    const calls = { n: 0 };
    const l = lister({ fetch: okFetch(['gpt-a', 'gpt-b'], calls) });
    expect((await l.list('openai')).models.map((m) => m.id)).toEqual(['gpt-a', 'gpt-b']);
    await l.list('openai');
    expect(calls.n).toBe(1);
    await l.list('openai', true);
    expect(calls.n).toBe(2);
  });

  it('expires the cache after the ttl', async () => {
    const calls = { n: 0 };
    let t = 0;
    const l = lister({ fetch: okFetch(['m'], calls), ttlMs: 1000, now: () => t });
    await l.list('openai');
    t = 1500;
    await l.list('openai');
    expect(calls.n).toBe(2);
  });

  it('falls back to the built-in list with the reason when there is no key', async () => {
    const out = await lister({ store: { get: async () => undefined } }).list('anthropic');
    expect(out.source).toBe('builtin');
    expect(out.error).toContain('API key');
    expect(out.models.length).toBeGreaterThan(0);
  });

  it('does not cache a failure, so a later key works', async () => {
    let key: string | undefined;
    const calls = { n: 0 };
    const l = lister({ store: { get: async () => key }, fetch: okFetch(['x'], calls) });
    expect((await l.list('openai')).source).toBe('builtin');
    key = 'sk-new-5678';
    expect((await l.list('openai')).source).toBe('live');
  });

  it('passes the configured base URL for local providers', async () => {
    let seen = '';
    const spy = (async (u: string) => {
      seen = u;
      return new Response(JSON.stringify({ models: [{ name: 'llama' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await lister({ baseUrls: () => ({ ollama: 'http://box:11434' }), fetch: spy }).list('ollama');
    expect(seen).toBe('http://box:11434/api/tags');
  });
});

describe('ModelLister.listNamed (presets and custom providers)', () => {
  const endpoint = { id: 'acme', name: 'Acme', baseUrl: 'https://llm.acme.test/v1', apiKey: 'k1', api: 'openai-compatible' as const };

  it('lists the models the endpoint serves, with its key as a bearer token', async () => {
    const seen: string[] = [];
    const f = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
      seen.push(`${String(url)} ${init?.headers?.Authorization ?? ''}`);
      return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await lister({ fetch: f }).listNamed(endpoint, undefined, undefined);
    expect(out.models.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.source).toBe('live');
    expect(seen).toEqual(['https://llm.acme.test/v1/models Bearer k1']);
  });

  it('applies the provider’s whitelist and blacklist', async () => {
    const out = await lister({ fetch: okFetch(['a', 'b', 'c'], { n: 0 }) }).listNamed(endpoint, undefined, { whitelist: ['a', 'b'], blacklist: ['b'] });
    expect(out.models.map((m) => m.id)).toEqual(['a']);
  });

  it('falls back to the models written in the config, with the reason, when the endpoint cannot be listed', async () => {
    const down = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const out = await lister({ fetch: down }).listNamed(endpoint, { fast: { name: 'Fast one' }, big: {} }, undefined);
    expect(out.source).toBe('builtin');
    expect(out.error).toContain('500');
    expect(out.models).toEqual([{ id: 'fast', label: 'Fast one' }, { id: 'big', label: 'big' }]);
  });

  it('adds configured models the endpoint did not list, once each', async () => {
    const out = await lister({ fetch: okFetch(['a'], { n: 0 }) }).listNamed(endpoint, { a: { name: 'A' }, extra: {} }, undefined);
    expect(out.models.map((m) => m.id)).toEqual(['a', 'extra']);
  });
});

describe('ModelLister with modelFilters', () => {
  afterEach(() => registerModelFilters(undefined));

  it('hides blacklisted models of a built-in provider, from a live list and from the built-in fallback', async () => {
    registerModelFilters({ openai: { blacklist: ['gpt-a'] } });
    const live = await lister({ fetch: okFetch(['gpt-a', 'gpt-b'], { n: 0 }) }).list('openai');
    expect(live.models.map((m) => m.id)).toEqual(['gpt-b']);
    registerModelFilters({ anthropic: { whitelist: ['claude-haiku-4-5'] } });
    const fallback = await lister({ store: { get: async () => undefined } }).list('anthropic');
    expect(fallback.models.map((m) => m.id)).toEqual(['claude-haiku-4-5']);
  });
});


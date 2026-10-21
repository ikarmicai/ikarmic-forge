import { describe, expect, it } from 'vitest';

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

import { describe, expect, it } from 'vitest';

import { statusItemFor } from '../src/index-status.js';
import { destinationKey, SemanticConsent, type ConsentStore } from '../src/semantic-consent.js';

const dest = { host: 'api.openai.com', model: 'text-embedding-3-small' };
const memory = (initial: string[] = []): ConsentStore & { value: string[] } => {
  const s = { value: initial, get: () => s.value, set: async (v: string[]) => void (s.value = v) };
  return s;
};

describe('SemanticConsent (F12)', () => {
  it('asks once, remembers a yes across restarts, and does not ask again', async () => {
    const store = memory();
    let asked = 0;
    const c = new SemanticConsent(store, async () => (asked++, true));
    expect(await c.check(dest)).toBe(true);
    expect(await c.check(dest)).toBe(true);
    expect(asked).toBe(1);
    expect(store.value).toEqual([destinationKey(dest)]);
    // A new window reads the stored answer.
    const again = new SemanticConsent(store, async () => (asked++, false));
    expect(await again.check(dest)).toBe(true);
    expect(asked).toBe(1);
  });

  it('remembers a no for this session only, so it neither nags nor decides for good', async () => {
    const store = memory();
    let asked = 0;
    const c = new SemanticConsent(store, async () => (asked++, false));
    expect(await c.check(dest)).toBe(false);
    expect(await c.check(dest)).toBe(false);
    expect(asked).toBe(1);
    expect(store.value).toEqual([]);
    const next = new SemanticConsent(store, async () => (asked++, true));
    expect(await next.check(dest)).toBe(true);
  });

  it('asks again for another host or another model: the answer is for that destination', async () => {
    const store = memory([destinationKey(dest)]);
    let asked = 0;
    const c = new SemanticConsent(store, async () => (asked++, false));
    expect(await c.check({ host: 'embed.example.com', model: dest.model })).toBe(false);
    expect(await c.check({ host: dest.host, model: 'other-model' })).toBe(false);
    expect(asked).toBe(2);
  });

  it('withdrawing forgets every answer, yes and no', async () => {
    const store = memory([destinationKey(dest)]);
    const c = new SemanticConsent(store, async () => false);
    expect(await c.check(dest)).toBe(true);
    await c.withdraw();
    expect(store.value).toEqual([]);
    expect(await c.check(dest)).toBe(false);
  });

  it('ignores a stored value that is not a list of text', async () => {
    const store = { get: () => 'oops' as never, set: async () => undefined };
    const c = new SemanticConsent(store, async () => true);
    expect(await c.check(dest)).toBe(true);
  });
});

describe('statusItemFor', () => {
  it('shows progress while indexing', () => {
    expect(statusItemFor({ phase: 'indexing', done: 3, total: 40 })).toMatchObject({ text: '$(sync~spin) Indexing 3/40' });
  });
  it('shows the size of a finished index', () => {
    const s = statusItemFor({ phase: 'ready', files: 120, chunks: 900 });
    expect(s.text).toBe('$(database) 120 files indexed');
    expect(s.tooltip).toContain('900');
    expect(statusItemFor({ phase: 'ready', files: 1, chunks: 3 }).text).toBe('$(database) 1 file indexed');
  });
  it('shows a failure and says what it was, and says when the person turned it off', () => {
    expect(statusItemFor({ phase: 'error', message: 'Indexing stopped: HTTP 500' })).toMatchObject({ text: '$(warning) Index problem', tooltip: expect.stringContaining('HTTP 500') });
    expect(statusItemFor({ phase: 'off' }).text).toBe('$(circle-slash) Search by meaning is off');
  });
  it('uses no identifier in what a person reads', () => {
    for (const s of [
      statusItemFor({ phase: 'indexing', done: 1, total: 2 }),
      statusItemFor({ phase: 'ready', files: 2, chunks: 3 }),
      statusItemFor({ phase: 'off' }),
    ]) expect(`${s.text} ${s.tooltip}`.replace(/\$\([a-z~-]+\)/g, '')).not.toMatch(/\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][A-Za-z]+\b/);
  });
});

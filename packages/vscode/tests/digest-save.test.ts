import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { saveSessionDigest } from '../src/chat/digest-save.js';

const items = [
  { role: 'user' as const, text: 'one' },
  { role: 'assistant' as const, text: 'a' },
  { role: 'user' as const, text: 'two' },
];
const when = new Date('2026-10-22T14:05:00');

async function ws() {
  return mkdtemp(join(tmpdir(), 'digest-'));
}

describe('saveSessionDigest', () => {
  it('writes the digest as a dated section of the project memory and says so', async () => {
    const cwd = await ws();
    const out = await saveSessionDigest({ cwd, items, now: when, generate: async () => '- Added retry' });
    expect(out).toEqual({ saved: true, heading: 'Session digest 2026-10-22 14:05' });
    const text = await readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8');
    expect(text).toContain('## Session digest 2026-10-22 14:05');
    expect(text).toContain('- Added retry');
  });

  it('keeps what the file already holds', async () => {
    const cwd = await ws();
    await mkdir(join(cwd, '.forge'), { recursive: true });
    await writeFile(join(cwd, '.forge', 'MEMORY.md'), '## Conventions\n\nUse tabs.\n');
    await saveSessionDigest({ cwd, items, now: when, generate: async () => '- x' });
    const text = await readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8');
    expect(text).toContain('Use tabs.');
    expect(text).toContain('Session digest');
  });

  it('writes nothing when the model gave no digest, and creates no file', async () => {
    const cwd = await ws();
    const out = await saveSessionDigest({ cwd, items, now: when, generate: async () => undefined });
    expect(out).toEqual({ saved: false });
    await expect(readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8')).rejects.toThrow();
  });

  it('keeps the file within its size limit by dropping older sections, never the new digest', async () => {
    const cwd = await ws();
    await mkdir(join(cwd, '.forge'), { recursive: true });
    const old = Array.from({ length: 60 }, (_, i) => `## Session digest 2026-09-${String((i % 28) + 1).padStart(2, '0')} 10:${String(i).padStart(2, '0')}\n\n- ${'filler '.repeat(120)}\n`).join('\n');
    await writeFile(join(cwd, '.forge', 'MEMORY.md'), old);
    await saveSessionDigest({ cwd, items, now: when, generate: async () => '- newest work' });
    const text = await readFile(join(cwd, '.forge', 'MEMORY.md'), 'utf8');
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(50_000);
    expect(text).toContain('newest work');
  });

  it('a conversation too short to digest is skipped without calling the model', async () => {
    const cwd = await ws();
    let called = false;
    const out = await saveSessionDigest({ cwd, items: items.slice(0, 2), now: when, generate: async () => ((called = true), 'x') });
    expect(out).toEqual({ saved: false });
    expect(called).toBe(false);
  });
});

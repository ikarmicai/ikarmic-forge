import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');
const read = (f: string) => JSON.parse(readFileSync(path.join(root, f), 'utf8')) as Record<string, unknown>;
const pkg = read('package.json');
const base = read('package.nls.json') as Record<string, string>;

/** Every %key% used anywhere in package.json. */
function usedKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    const m = /^%([^%]+)%$/.exec(node);
    if (m) out.add(m[1]!);
  } else if (Array.isArray(node)) node.forEach((n) => usedKeys(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => usedKeys(n, out));
  return out;
}

describe('package.nls.json', () => {
  it('defines every %key% that package.json references, and nothing unused', () => {
    const used = usedKeys(pkg);
    expect([...used].filter((k) => !(k in base))).toEqual([]);
    expect(Object.keys(base).filter((k) => !used.has(k))).toEqual([]);
  });

  it('leaves no raw user-visible strings behind in commands, views and settings', () => {
    const c = (pkg as { contributes: Record<string, any> }).contributes;
    for (const cmd of c.commands) expect(cmd.title, cmd.command).toMatch(/^%.+%$/);
    for (const views of Object.values<any[]>(c.views)) for (const v of views) expect(v.name, v.id).toMatch(/^%.+%$/);
    for (const [k, p] of Object.entries<any>(c.configuration.properties)) expect(p.description, k).toMatch(/^%.+%$/);
  });

  const locales = readdirSync(root).filter((f) => /^package\.nls\..+\.json$/.test(f));
  it('ships at least Spanish and Simplified Chinese', () => {
    expect(locales).toEqual(expect.arrayContaining(['package.nls.es.json', 'package.nls.zh-cn.json']));
  });

  for (const file of locales) {
    it(`${file} only translates known keys and keeps markdown command links intact`, () => {
      const tr = read(file) as Record<string, string>;
      expect(Object.keys(tr).filter((k) => !(k in base))).toEqual([]);
      for (const [k, v] of Object.entries(tr)) {
        expect(typeof v).toBe('string');
        expect(v.trim().length).toBeGreaterThan(0);
        // A translated walkthrough must keep the exact same command: links or the buttons break.
        const links = (s: string) => [...s.matchAll(/\(command:[^)]+\)/g)].map((m) => m[0]);
        expect(links(v), k).toEqual(links(base[k]!));
      }
    });
  }
});

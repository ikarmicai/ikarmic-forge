import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * RB-143: a list a person browses must not depend on one remote address. Browse catalog read only the online list, its
 * repository did not exist, and every person saw an error. Every surface loads the catalog through `loadSkillsCatalog`,
 * which adds the online list to the one that ships with Forge. `fetchSkillsCatalog` stays for core's own use and tests.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('the skills catalog is loaded with its built-in list', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const pkg of ['vscode', 'cli']) {
    it(`${pkg}: no call to fetchSkillsCatalog`, () => {
      const offenders = sources(join(root, pkg, 'src')).filter((f) => /\bfetchSkillsCatalog\b/.test(readFileSync(f, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }
});

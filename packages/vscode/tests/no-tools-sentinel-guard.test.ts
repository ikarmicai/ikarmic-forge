import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { NO_TOOLS_SENTINEL } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

/**
 * RB-29: "no tools" cannot be an empty allow list (that means every tool), so it is a sentinel name that matches no
 * tool. `modes.ts` once kept its own copy of the string; if the two ever differed, a mode with nothing allowed would
 * have been given every tool. One definition, imported from core.
 */
const srcDir = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe('the "no tools" sentinel (RB-29)', () => {
  it('is core\'s own value', () => {
    expect(NO_TOOLS_SENTINEL).toBe('__forge_no_tools__');
  });

  it('is never spelled out in the extension: it is imported from core', () => {
    const spelled = files(srcDir)
      .filter((f) => readFileSync(f, 'utf8').includes(NO_TOOLS_SENTINEL))
      .map((f) => relative(srcDir, f));
    expect(spelled, 'Import NO_TOOLS_SENTINEL from @ikarmic/forge-core instead of writing the string.').toEqual([]);
  });
});

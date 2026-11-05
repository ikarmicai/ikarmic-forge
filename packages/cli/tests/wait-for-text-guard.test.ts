/**
 * A REPL test that waits for a short common word the screen already holds returns on its first look and checks
 * nothing. `/architect` tests waited for `f.includes('plan')` while an earlier message ("set the model that applies
 * the plan first") was still on screen, so the next step ran before the planning run had started; on a slow
 * Windows runner `modelsUsed.at(-1)` was still undefined (CI, 2026-11-05).
 *
 * Wait for the line only the awaited step prints ("Done: Plan ready"), and when the same line can already be on
 * screen from an earlier step, wait for its count to grow.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const dir = __dirname;
const BARE_WORD = /\.includes\(\s*'(?:plan|spec|done|approve|ready|model|editor)'\s*\)/;

describe('REPL tests wait for text that is not already on screen', () => {
  const files = readdirSync(dir).filter((f) => /^repl.*\.test\.tsx?$/.test(f));

  it('finds the REPL test files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} never waits on a bare common word`, () => {
      const hits = readFileSync(path.join(dir, file), 'utf8')
        .split(/\r?\n/)
        .map((text, i) => ({ line: i + 1, text }))
        .filter((l) => /waitFor\(/.test(l.text) && BARE_WORD.test(l.text))
        .map((l) => `${file}:${l.line}: ${l.text.trim()}`);
      expect(hits).toEqual([]);
    });
  }
});

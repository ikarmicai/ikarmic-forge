import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A parser that reads `opts.overwrite` from a flag nobody declared gets `undefined` forever, or the whole command fails
 * with "unknown option": `forge skill install x --overwrite` and `forge mcp install x --overwrite` were documented and
 * read in code, but `--overwrite` was never declared. Every `opts.<name>` in `options.ts` must match a `.option('--…')`.
 */
const source = readFileSync(path.join(__dirname, '..', 'src', 'options.ts'), 'utf8');

const camel = (flag: string): string => flag.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Option names commander makes from `.option('--no-x')` too: `--no-cache-prompts` is read as `cachePrompts`. */
export function declaredOptions(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:\.option|new Option)\(\s*['"`](?:-\w,\s*)?--(?:no-)?([a-z][a-z0-9-]*)/g)) out.add(camel(m[1]!));
  return out;
}

/** `opts.endpoint`, `opts.provider` and `opts.model` at the model-resolution step are plain object fields, not flags. */
const NOT_FLAGS = new Set(['endpoint', 'provider', 'model']);

export function readOptions(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bopts\.([A-Za-z][A-Za-z0-9]*)/g)) if (!NOT_FLAGS.has(m[1]!)) out.add(m[1]!);
  return out;
}

describe('options.ts: every flag a parser reads is declared', () => {
  it('finds the declared flags', () => {
    expect(declaredOptions(source).has('overwrite')).toBe(true);
    expect(declaredOptions(source).has('force')).toBe(true);
    expect(declaredOptions(source).has('instructionsFile')).toBe(true);
  });

  it('catches a flag that is read and not declared', () => {
    const text = `.option('--force', 'x')\nconst a = opts.force; const b = opts.overwrite;`;
    const missing = [...readOptions(text)].filter((n) => !declaredOptions(text).has(n));
    expect(missing).toEqual(['overwrite']);
  });

  // The command entry point reads the parsed flags too. The files in commands/ are not scanned: their `opts` are each
  // function's own options object, not the command line (checked 2026-11-02).
  it('the entry point reads only declared flags', () => {
    const declared = declaredOptions(source);
    const entry = readFileSync(path.join(__dirname, '..', 'src', 'bin', 'forge.ts'), 'utf8');
    expect([...readOptions(entry)].filter((n) => !declared.has(n)).sort()).toEqual([]);
  });

  it('declares every flag it reads', () => {
    const declared = declaredOptions(source);
    const missing = [...readOptions(source)].filter((n) => !declared.has(n)).sort();
    expect(missing, 'read as opts.<name> but never declared with .option()').toEqual([]);
  });
});

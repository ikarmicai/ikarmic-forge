import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error a plain .mjs script, no types
import { missingFromVsix } from '../scripts/check-vsix.mjs';

/**
 * RB-40: the extension loads tree-sitter's wasm files from beside its bundle. `.vscodeignore` could exclude `*.wasm`
 * and every unit test would still pass, because they never open the packed file. This checks the VSIX's own file list
 * against what the build put in dist/.
 */
const script = path.join(__dirname, '..', 'scripts', 'check-vsix.mjs');
const WASM = ['tree-sitter.wasm', 'tree-sitter-typescript.wasm'];
const REQUIRED = ['extension/dist/extension.js', 'extension/dist/webview/forge-ui.js', 'extension/dist/webview/settings-ui.js'];
const complete = [...REQUIRED, ...WASM.map((w) => `extension/dist/${w}`), 'extension/package.json'];

describe('missingFromVsix', () => {
  it('has nothing to say about a complete package', () => {
    expect(missingFromVsix(complete, WASM)).toEqual([]);
  });

  it('names a wasm file the build made but the package left out', () => {
    const without = complete.filter((e) => !e.endsWith('tree-sitter-typescript.wasm'));
    expect(missingFromVsix(without, WASM)).toEqual(['extension/dist/tree-sitter-typescript.wasm']);
  });

  it('names a missing bundle', () => {
    expect(missingFromVsix(complete.filter((e) => !e.endsWith('settings-ui.js')), WASM)).toEqual(['extension/dist/webview/settings-ui.js']);
  });

  it('refuses a build that produced no wasm at all, since then there is nothing to compare', () => {
    expect(missingFromVsix(complete, [])).toEqual(['(the build put no .wasm file in dist/)']);
  });
});

describe('check-vsix.mjs run as the release step runs it (RB-100)', () => {
  let dist: string;
  beforeEach(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'forge-vsix-'));
    for (const w of WASM) writeFileSync(path.join(dist, w), '');
  });
  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  const run = (entries: string[]) => spawnSync(process.execPath, [script, '--dist', dist], { input: entries.join('\n'), encoding: 'utf8' });

  it('exits 0 and says so for a complete package', () => {
    const r = run(complete);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/contains/);
  });

  it('exits 1 and names the file for an incomplete one', () => {
    const r = run(complete.filter((e) => !e.endsWith('tree-sitter.wasm')));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('extension/dist/tree-sitter.wasm');
  });

  it('exits 1 for an empty list, not 0', () => {
    expect(run([]).status).toBe(1);
  });

  it('exits 1 when dist/ cannot be read', () => {
    mkdirSync(path.join(dist, 'x'));
    const r = spawnSync(process.execPath, [script, '--dist', path.join(dist, 'nope')], { input: complete.join('\n'), encoding: 'utf8' });
    expect(r.status).toBe(1);
  });
});

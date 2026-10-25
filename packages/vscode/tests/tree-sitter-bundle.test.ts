/**
 * RB-40: the extension bundles core into one CommonJS file. web-tree-sitter then looks for
 * `tree-sitter.wasm` next to that file, aborts when it is not there, and the symbol tools never answer.
 * This test bundles core's parser the way `esbuild.config.mjs` does and runs it in a child process.
 * Core is taken as this package sees it (a workspace link here, the npm package in the public repo), so the
 * test needs core's dist built, and never its source (RB-5).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';

const coreDir = realpathSync(path.join(__dirname, '..', 'node_modules', '@ikarmic', 'forge-core'));
const parser = path.join(coreDir, 'dist', 'code-index', 'parser.js');
const coreRequire = createRequire(path.join(coreDir, 'package.json'));
const runtimeWasm = path.join(path.dirname(coreRequire.resolve('web-tree-sitter/package.json')), 'tree-sitter.wasm');
const grammarDir = path.join(path.dirname(coreRequire.resolve('tree-sitter-wasms/package.json')), 'out');

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

/** Folders that hold core's two tree-sitter packages, for NODE_PATH: the bundle can reach them, as from node_modules. */
const nodeModulesOfDeps = [runtimeWasm, grammarDir].map((p) => path.dirname(path.dirname(p))).join(path.delimiter);

async function bundleAndRun(opts: { besideBundle?: string[]; nodePath?: string } = {}): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const outDir = path.join(mkdtempSync(path.join(tmpdir(), 'forge-ts-bundle-')), 'x');
  mkdirSync(outDir, { recursive: true });
  made.push(path.dirname(outDir));
  const entry = path.join(outDir, 'entry.ts');
  writeFileSync(
    entry,
    [
      `import { parseSource } from '${parser.replace(/\\/g, '/')}';`,
      "const t = setTimeout(() => { console.log('HANG'); process.exit(3); }, 10000);",
      "parseSource('function a() {}', '.js').then((r) => { clearTimeout(t); console.log('ok ' + r.length); }, (e) => { clearTimeout(t); console.log('rejected: ' + e.message); });",
      '',
    ].join('\n')
  );
  const out = path.join(outDir, 'dist', 'out.cjs');
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent', logOverride: { 'empty-import-meta': 'silent' } });
  for (const f of opts.besideBundle ?? []) copyFileSync(f, path.join(outDir, 'dist', path.basename(f)));
  // Only the NODE_PATH given: the test runner's would let the bundle find the repository's node_modules from anywhere.
  const env = { ...process.env };
  delete env.NODE_PATH;
  if (opts.nodePath) env.NODE_PATH = opts.nodePath;
  const r = spawnSync(process.execPath, [out], { encoding: 'utf8', timeout: 20000, env });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('tree-sitter in a CommonJS bundle (RB-40)', () => {
  it('fails with a clear error, quickly, when the wasm cannot be found', async () => {
    const r = await bundleAndRun();
    expect(r.stdout).toContain('rejected: ');
    expect(r.stdout).toMatch(/tree-sitter/i);
    expect(r.stdout).not.toContain('HANG');
    expect(r.status).toBe(0);
  }, 60000);

  it('parses when the bundle can reach web-tree-sitter, finding its wasm by package, not next to the bundle', async () => {
    const r = await bundleAndRun({ nodePath: nodeModulesOfDeps });
    expect(r.stdout.trim()).toBe('ok 1');
  }, 60000);

  it('parses from wasm files copied next to the bundle when no node_modules is reachable', async () => {
    // The packaged extension: esbuild.config.mjs copies the wasm into dist/, and the VSIX has no node_modules.
    const r = await bundleAndRun({ besideBundle: [runtimeWasm, path.join(grammarDir, 'tree-sitter-javascript.wasm')] });
    expect(r.stdout.trim()).toBe('ok 1');
  }, 60000);

  it('names the missing grammar when the runtime sits next to the bundle without it', async () => {
    const r = await bundleAndRun({ besideBundle: [runtimeWasm] });
    expect(r.stdout).toContain('rejected: ');
    expect(r.stdout).toContain('tree-sitter-javascript.wasm is missing');
  }, 60000);

  it('the build copies every grammar the parser knows next to the bundle', () => {
    const known = new Set([...readFileSync(parser, 'utf8').matchAll(/'tree-sitter-(\w+)\.wasm'/g)].map((m) => m[1]));
    const config = readFileSync(path.join(__dirname, '..', 'esbuild.config.mjs'), 'utf8');
    const copied = /TREE_SITTER_GRAMMARS = \[([^\]]*)\]/.exec(config)?.[1].match(/\w+/g) ?? [];
    expect(known.size).toBeGreaterThan(0);
    expect(new Set(copied)).toEqual(known);
  });
});

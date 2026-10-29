#!/usr/bin/env node
/**
 * Checks that a packed .vsix holds what the build put in dist/ (RB-40).
 *
 *   unzip -Z1 ikarmic-forge.vsix | node scripts/check-vsix.mjs [--dist dist]
 *
 * It reads the package's file names on stdin. Every .wasm file in dist/ must be in the package (tree-sitter loads
 * them from beside the bundle), and so must the extension and the two webview bundles. Exit 1 names what is missing.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['extension/dist/extension.js', 'extension/dist/webview/forge-ui.js', 'extension/dist/webview/settings-ui.js'];

/** Names the package lacks, given its entries and the .wasm file names the build made. */
export function missingFromVsix(entries, distWasm) {
  if (distWasm.length === 0) return ['(the build put no .wasm file in dist/)'];
  const have = new Set(entries.map((e) => e.trim()));
  return [...REQUIRED, ...distWasm.map((w) => `extension/dist/${w}`)].filter((name) => !have.has(name));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const at = process.argv.indexOf('--dist');
  const dist = path.resolve(at >= 0 ? process.argv[at + 1] : 'dist');
  let wasm;
  try {
    wasm = readdirSync(dist).filter((n) => n.endsWith('.wasm'));
  } catch (err) {
    console.error(`Cannot read ${dist}: ${err.message}`);
    process.exit(1);
  }
  const entries = (await readStdin()).split(/\r?\n/).filter((l) => l.trim() !== '');
  const missing = missingFromVsix(entries, wasm);
  if (missing.length > 0) {
    console.error(`The package is missing:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`The package contains the extension, both webview bundles and all ${wasm.length} wasm files.`);
}

// Run only as the entry script: compare file paths, never a hand-built file: URL (RB-100).
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  await main();
}

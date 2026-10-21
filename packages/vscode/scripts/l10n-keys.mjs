// Lists every English message passed to t('...') in src/, one JSON string per line.
// Usage: node scripts/l10n-keys.mjs   (translate them in l10n/bundle.l10n.<locale>.json)
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

export function hostKeys() {
  const keys = new Set();
  const call = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
  for (const file of walk(root).filter((f) => f.endsWith('.ts'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(call)) keys.add(m[1].replace(/\\'/g, "'"));
  }
  return [...keys].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const k of hostKeys()) console.log(JSON.stringify(k));
}

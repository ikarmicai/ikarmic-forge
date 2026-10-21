// Builds a static documentation site into ./site from the repository's markdown.
//   node scripts/build-docs.mjs          build
//   node scripts/build-docs.mjs --check  build and fail on broken internal links
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site');
const check = process.argv.includes('--check');
const REPO_BLOB = 'https://github.com/ikarmicai/ikarmic-forge/blob/main';

/** source path (repo-relative, posix) -> { file (output), title, nav label } */
const PAGES = [
  { src: 'README.md', file: 'index.html', label: 'Overview' },
  { src: 'docs/ENTERPRISE.md', file: 'enterprise.html', label: 'Enterprise' },
  { src: 'docs/ACP.md', file: 'acp.html', label: 'ACP / JetBrains' },
  { src: 'docs/ORCHESTRATOR.md', file: 'orchestrator.html', label: 'Orchestrator' },
  { src: 'docs/GITHUB_ACTION.md', file: 'github-action.html', label: 'GitHub Action' },
  { src: 'CHANGELOG.md', file: 'changelog.html', label: 'Changelog' },
];
const byPath = new Map(PAGES.map((p) => [p.src, p]));

/** Resolve a markdown href relative to `fromSrc` to a repo path, or null when it is not a local .md link. */
export function resolveDocLink(fromSrc, href) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return null;
  const [pathPart, hash = ''] = href.split('#');
  if (!pathPart.endsWith('.md')) return null;
  const target = posix.normalize(posix.join(posix.dirname(fromSrc), pathPart));
  return { target, hash };
}

function rewriteLinks(html, fromSrc, problems) {
  return html.replace(/href="([^"]+)"/g, (whole, href) => {
    const r = resolveDocLink(fromSrc, href);
    if (!r) return whole;
    const page = byPath.get(r.target);
    if (!page) {
      // Not a page of this site (design specs, package READMEs): point at the source on GitHub.
      return `href="${REPO_BLOB}/${r.target}${r.hash ? `#${r.hash}` : ''}"`;
    }
    return `href="${page.file}${r.hash ? `#${r.hash}` : ''}"`;
  });
}

const CSS = `
:root { --bg:#fff; --fg:#1b1f24; --muted:#59636e; --border:#d1d9e0; --code:#f6f8fa; --accent:#0969da; }
@media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --muted:#9198a1; --border:#3d444d; --code:#161b22; --accent:#4493f8; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
header { border-bottom:1px solid var(--border); padding:12px 16px; position:sticky; top:0; background:var(--bg); }
nav { display:flex; flex-wrap:wrap; gap:4px 16px; max-width:960px; margin:0 auto; }
nav a { color:var(--muted); text-decoration:none; font-size:14px; padding:2px 0; }
nav a[aria-current="page"] { color:var(--fg); font-weight:600; border-bottom:2px solid var(--accent); }
main { max-width:960px; margin:0 auto; padding:24px 16px 64px; overflow-wrap:anywhere; }
a { color:var(--accent); }
pre { background:var(--code); padding:12px 14px; border-radius:6px; overflow:auto; }
code { background:var(--code); padding:.15em .35em; border-radius:4px; font-size:.9em; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; display:block; overflow-x:auto; }
th, td { border:1px solid var(--border); padding:6px 10px; }
blockquote { margin:1em 0; padding:0 1em; border-left:4px solid var(--border); color:var(--muted); }
h1, h2, h3 { line-height:1.25; } h2 { border-bottom:1px solid var(--border); padding-bottom:.3em; }
img { max-width:100%; }
@media (max-width:600px) { main { padding:16px 12px 48px; } }
`;

function layout(page, body) {
  const nav = PAGES.map(
    (p) => `<a href="${p.file}"${p.file === page.file ? ' aria-current="page"' : ''}>${p.label}</a>`
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.label} · IKarmic AI Forge</title>
<meta name="description" content="IKarmic AI Forge: an open-source AI coding agent for the terminal and VS Code.">
<style>${CSS}</style>
</head>
<body>
<header><nav aria-label="Documentation">${nav}</nav></header>
<main>
${body}
</main>
</body>
</html>
`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const problems = [];
for (const page of PAGES) {
  const abs = join(root, page.src);
  if (!existsSync(abs)) {
    problems.push(`missing source ${page.src}`);
    continue;
  }
  const html = rewriteLinks(marked.parse(readFileSync(abs, 'utf8'), { gfm: true }), page.src, problems);
  writeFileSync(join(out, page.file), layout(page, html));
}

if (problems.length > 0) {
  for (const p of problems) console.error(`docs: ${p}`);
  if (check) process.exit(1);
}
console.log(`docs: built ${PAGES.length} pages into ${out}${problems.length ? ` (${problems.length} warning(s))` : ''}`);

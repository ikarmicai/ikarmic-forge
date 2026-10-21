/**
 * `forge skill …` subcommand: list, show, install, search, browse skills.
 *
 * Mirrors how `forge session …` works: no AI provider required, exits
 * with code 0 on success / 2 on user error / 1 on unexpected failure.
 *
 * v2.1: `install <name>` consults the marketplace catalog first; falls
 * back to the GitHub-URL / shorthand path when the name isn't found.
 * `search <query>` fetches + filters the catalog.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_SKILL_CATALOG_URL,
  discoverSkills,
  fetchSkillsCatalog,
  installSkillFromCatalog,
  loadSkillsRegistryAsync,
  searchSkills,
} from '@ikarmic/forge-core';

import type { ParsedSkillCommand } from '../options.js';

/**
 * Skill marketplace catalog URL. The default URL points at a public
 * JSON document hosted on GitHub raw content. Operators can override
 * via `FORGE_SKILL_CATALOG_URL`.
 */
function catalogUrl(): string {
  return process.env.FORGE_SKILL_CATALOG_URL ?? DEFAULT_SKILL_CATALOG_URL;
}

export async function handleSkillCommand(cmd: ParsedSkillCommand, cwd: string): Promise<number> {
  if (cmd.list) {
    return listSkills(cwd);
  }
  if (cmd.show) {
    return showSkill(cwd, cmd.show.name);
  }
  if (cmd.install) {
    return installFromSource(cmd.install.url, cwd);
  }
  if (cmd.search) {
    return searchCatalog(cmd.search.query, cmd.search.limit ?? undefined);
  }
  if (cmd.browse) {
    return browseMarketplace();
  }
  process.stderr.write(
    'forge skill: expected one of list|show|install|search|browse. Try `forge skill --help` (not yet implemented; read the README).\n'
  );
  return 2;
}

async function listSkills(cwd: string): Promise<number> {
  const skills = await discoverSkills(cwd);
  if (skills.length === 0) {
    process.stdout.write(`(no skills found in ${cwd})\n`);
    process.stdout.write('Discovery roots: ./skills/  ./.forge/skills/  ~/.forge/skills/\n');
    return 0;
  }
  for (const skill of skills) {
    const ver = skill.version ? ` v${skill.version}` : '';
    process.stdout.write(`${skill.name}${ver}  [${skill.source.kind}]  ${skill.source.path}\n`);
    if (skill.description) {
      process.stdout.write(`    ${skill.description}\n`);
    }
  }
  return 0;
}

async function showSkill(cwd: string, name: string): Promise<number> {
  const registry = await loadSkillsRegistryAsync(cwd);
  const skill = registry.get(name);
  if (!skill) {
    process.stderr.write(`forge skill: no skill named "${name}"\n`);
    return 2;
  }
  process.stdout.write(`# ${skill.name}\n`);
  if (skill.version) process.stdout.write(`version: ${skill.version}\n`);
  process.stdout.write(`source: ${skill.source.kind}  ${skill.source.path}\n`);
  if (skill.description) process.stdout.write(`description: ${skill.description}\n`);
  if (skill.allowedTools && skill.allowedTools.length > 0) {
    process.stdout.write(`allowed-tools: ${skill.allowedTools.join(', ')}\n`);
  }
  process.stdout.write('\n');
  process.stdout.write(skill.body);
  if (!skill.body.endsWith('\n')) process.stdout.write('\n');
  return 0;
}

async function installFromSource(source: string, cwd: string): Promise<number> {
  // v2.1: try the marketplace catalog first when `source` looks like a
  // name (no `/`, no scheme, no `.git`). Falls back to GitHub URL /
  // shorthand handling when the catalog fetch fails or the name isn't
  // found.
  if (looksLikeSkillName(source)) {
    const catalog = await fetchSkillsCatalog(catalogUrl());
    if (catalog) {
      const entry = catalog.skills.find((s) => s.name === source);
      if (entry) {
        const result = await installSkillFromCatalog({
          name: source,
          catalog,
        });
        if (result) {
          process.stdout.write(`installed ${result.path}\n`);
          return 0;
        }
        process.stderr.write(`forge skill install: failed to fetch ${entry.github}: falling back\n`);
      } else {
        process.stderr.write(`forge skill install: "${source}" not in marketplace: falling back\n`);
      }
    } else {
      process.stderr.write(
        `forge skill install: could not load marketplace catalog (${catalogUrl()}): falling back to URL stub\n`
      );
    }
  }

  // Fallback: scaffold a SKILL.md stub (the v1.1 behavior).
  const targetDir = path.resolve(cwd, 'skills');
  await mkdir(targetDir, { recursive: true });
  const slug = slugFromUrl(source);
  const skillPath = path.join(targetDir, `${slug}.md`);
  const content = `---
name: ${slug}
description: Skill installed from ${source}. Edit this description so the activator picks it up for matching tasks.
version: 1.0.0
---

# ${slug}

This skill was installed by \`forge skill install ${source}\`.

Replace this body with your own instructions. The activator matches on the
\`description\` field above: keep it focused (1-2 sentences) and free of
generic words ("the", "and", "use", "tool") so description-scoring
selects it for the right tasks.

Upstream: ${source}
`;
  await writeFile(skillPath, content, 'utf8');
  process.stdout.write(`installed ${skillPath}\n`);
  process.stdout.write(`Next: edit ${skillPath} and write your skill body.\n`);
  return 0;
}

/** Heuristic: does `source` look like a skill name (vs a URL)? */
function looksLikeSkillName(source: string): boolean {
  if (!source) return false;
  if (source.includes('/') || source.includes('\\')) return false;
  if (/^[a-z]+:\/\//i.test(source)) return false;
  if (source.includes('.')) return false; // skip .git, .com, etc.
  return /^[a-z0-9_-]+$/i.test(source);
}

async function searchCatalog(query: string, limit?: number): Promise<number> {
  const catalog = await fetchSkillsCatalog(catalogUrl());
  if (!catalog) {
    process.stderr.write(
      `forge skill search: could not load marketplace catalog (${catalogUrl()})\n` +
        `Set FORGE_SKILL_CATALOG_URL to override.\n`
    );
    return 1;
  }
  const result = searchSkills(catalog, query, limit);
  if (result.matches.length === 0) {
    process.stdout.write(`(no skills match "${query}" in ${result.totalScanned} catalog entries)\n`);
    return 0;
  }
  for (const skill of result.matches) {
    const ver = skill.version ? ` v${skill.version}` : '';
    process.stdout.write(`${skill.name}${ver}  ·  ${skill.displayName}\n`);
    if (skill.description) process.stdout.write(`    ${skill.description}\n`);
    if (skill.tags && skill.tags.length > 0) {
      process.stdout.write(`    tags: ${skill.tags.join(', ')}\n`);
    }
  }
  process.stdout.write(`\n${result.matches.length} of ${result.totalScanned} entries matched.\n`);
  process.stdout.write(`Install with: forge skill install <name>\n`);
  return 0;
}

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter((s) => s.length > 0);
    const last = segs[segs.length - 1] ?? 'external-skill';
    return last
      .toLowerCase()
      .replace(/\.git$/, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'external-skill';
  } catch {
    return 'external-skill';
  }
}

function browseMarketplace(): number {
  process.stdout.write(`IKarmic Forge Skills Marketplace (catalog):\n  ${catalogUrl()}\n\n`);
  process.stdout.write('Browse community skills there. To install one:\n');
  process.stdout.write('  forge skill install <github-url>           # any GitHub repo with SKILL.md\n');
  process.stdout.write('  forge skill install <name>                  # from the marketplace catalog\n');
  process.stdout.write('  forge skill search <query>                  # find skills by keyword\n');
  return 0;
}

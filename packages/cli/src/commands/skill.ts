/**
 * `forge skill …` subcommand: list, show, install, update, remove, search, browse skills.
 *
 * Mirrors how `forge session …` works: no AI provider required, exits
 * with code 0 on success / 2 on user error / 1 on unexpected failure.
 *
 * v2.1: `install <name>` consults the marketplace catalog first; falls
 * back to the GitHub-URL / shorthand path when the name isn't found.
 * `search <query>` fetches + filters the catalog.
 */

import { createInterface } from 'node:readline/promises';

import {
  configuredSkillSettings,
  DEFAULT_SKILL_CATALOG_URL,
  discoverSkills,
  loadSkillsCatalog,
  installSkillFromCatalog,
  installSkillFromSource,
  listManagedSkills,
  listSkillsInSource,
  loadSkillsRegistryAsync,
  removeManagedSkill,
  searchSkills,
  SkillInstallError,
  updateManagedSkills,
  type FoundSkill,
} from '@ikarmic/forge-core';

import type { ParsedSkillCommand } from '../options.js';
import { addSkill, newSkill, publishFromDisk } from './skill-share.js';

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
    return installFromSource(cmd.install);
  }
  if (cmd.update) {
    return updateSkills(cmd.update.names, cmd.update.force);
  }
  if (cmd.remove) {
    return removeSkill(cmd.remove.name, cmd.remove.yes);
  }
  if (cmd.search) {
    return searchCatalog(cmd.search.query, cmd.search.limit ?? undefined);
  }
  if (cmd.browse) {
    return browseMarketplace();
  }
  if (cmd.create) return newSkill(cmd.create);
  if (cmd.add) return addSkill(cmd.add, cwd);
  if (cmd.publish) return publishFromDisk(cmd.publish, cwd);
  process.stderr.write(
    'forge skill: expected one of list|show|install|update|remove|search|browse|new|add|publish. Try `forge skill --help` (not yet implemented; read the README).\n'
  );
  return 2;
}

async function listSkills(cwd: string): Promise<number> {
  const settings = await configuredSkillSettings();
  const skills = await discoverSkills(cwd, settings.skillPaths, { otherToolSkills: settings.otherToolSkills });
  if (skills.length === 0) {
    process.stdout.write(`(no skills found in ${cwd})\n`);
    process.stdout.write('Discovery roots: ./skills/  ./.forge/skills/  ./.agents/skills/  ~/.forge/skills/  ~/.agents/skills/  ~/.claude/skills/  ~/.cursor/skills/  and skillPaths in ~/.forge/config.json\n');
    return 0;
  }
  const installedFrom = new Map((await listManagedSkills()).filter((m) => m.source).map((m) => [m.path, m.source!]));
  for (const skill of skills) {
    const ver = skill.version ? ` v${skill.version}` : '';
    const from = installedFrom.get(skill.source.path);
    process.stdout.write(`${skill.name}${ver}  [${skill.source.kind}]  ${skill.source.path}${from ? `  (installed from ${from})` : ''}\n`);
    if (skill.description) {
      process.stdout.write(`    ${skill.description}\n`);
    }
  }
  return 0;
}

async function showSkill(cwd: string, name: string): Promise<number> {
  const settings = await configuredSkillSettings();
  const registry = await loadSkillsRegistryAsync(cwd, settings.skillPaths, { otherToolSkills: settings.otherToolSkills });
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

type InstallOptions = NonNullable<ParsedSkillCommand['install']>;

async function installFromSource(opts: InstallOptions): Promise<number> {
  const source = opts.url;
  // Try the marketplace catalog first when `source` looks like a name (no `/`, no scheme, no `.git`). Otherwise, or when
  // the catalog has no such name, `source` is a GitHub repository or a link.
  if (looksLikeSkillName(source)) {
    const catalog = await loadSkillsCatalog(catalogUrl());
    if (catalog) {
      const entry = catalog.skills.find((s) => s.name === source);
      if (entry) {
        let reason = '';
        const result = await installSkillFromCatalog({
          name: source,
          catalog,
          onError: (m) => void (reason = m),
        });
        if (result) {
          process.stdout.write(`installed ${result.path}\n`);
          return 0;
        }
        process.stderr.write(`forge skill install: failed to fetch ${entry.github}${reason ? `: ${reason}` : ''}\n`);
        return 1;
      } else {
        process.stderr.write(`forge skill install: "${source}" not in marketplace; trying it as a GitHub repository\n`);
      }
    } else {
      process.stderr.write(
        `forge skill install: could not load marketplace catalog (${catalogUrl()}); trying "${source}" as a GitHub repository\n`
      );
    }
  }

  // A GitHub or GitLab repository, a folder of one, or a link to a skill file: copy the skill folder to ~/.forge/skills/ (RB-115).
  try {
    let only = opts.only;
    if (opts.list || (only.length === 0 && !opts.all)) {
      const found = await listSkillsInSource(source);
      if (opts.list) {
        printFound(found);
        return 0;
      }
      // One skill installs at once. Several: choose, with a prompt when a person is there, else say how to choose.
      if (found.length > 1) {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          printFound(found);
          process.stderr.write('forge skill install: the link holds several skills. Choose with --skill name1,name2, or install all with --all.\n');
          return 2;
        }
        const chosen = await chooseSkills(found);
        if (chosen.length === 0) {
          process.stdout.write('nothing installed\n');
          return 0;
        }
        only = chosen;
      }
    }
    const got = await installSkillFromSource(source, { ...(only.length > 0 ? { only } : {}), ...(opts.overwrite ? { overwrite: true } : {}) });
    for (const s of got.installed) process.stdout.write(`installed ${s.name}  ${s.dir}  (${s.files} file${s.files === 1 ? '' : 's'})\n`);
    for (const s of got.skipped) process.stdout.write(`skipped ${s.name}: ${s.reason}\n`);
    if (got.installed.length > 0) process.stdout.write('A skill can bring scripts. Read them before you let Forge run them.\n');
    return 0;
  } catch (err) {
    process.stderr.write(`forge skill install: ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof SkillInstallError ? 2 : 1;
  }
}

function printFound(found: FoundSkill[]): void {
  found.forEach((f, i) => {
    process.stdout.write(`${i + 1}. ${f.name}  (${f.files} file${f.files === 1 ? '' : 's'})\n`);
    if (f.description) process.stdout.write(`     ${f.description}\n`);
  });
}

/** Ask which of the skills to install: numbers separated by commas, `a` for all, nothing to cancel. */
async function chooseSkills(found: FoundSkill[]): Promise<string[]> {
  printFound(found);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Install which? Numbers separated by commas, a for all, or press Enter for none: ')).trim().toLowerCase();
    if (!answer) return [];
    if (answer === 'a' || answer === 'all') return found.map((f) => f.name);
    const picked = answer.split(/[\s,]+/).map((n) => found[Number(n) - 1]?.name).filter((n): n is string => Boolean(n));
    return [...new Set(picked)];
  } finally {
    rl.close();
  }
}

/** `forge skill update [names…]`: re-read the source of each skill Forge installed and replace the ones that changed. */
async function updateSkills(names: string[], force: boolean): Promise<number> {
  const outcomes = await updateManagedSkills({ names, force });
  if (outcomes.length === 0) {
    process.stdout.write('(no skills installed by Forge; install one with forge skill install <link>)\n');
    return 0;
  }
  let failed = false;
  for (const o of outcomes) {
    if (o.status === 'updated') process.stdout.write(`updated ${o.name}\n`);
    else if (o.status === 'up to date') process.stdout.write(`${o.name} is up to date\n`);
    else if (o.status === 'changed on this computer') process.stdout.write(`${o.name} was changed on this computer, so it was left alone. Use --force to replace it.\n`);
    else if (o.status === 'not installed by Forge') process.stdout.write(`${o.name} was not installed by Forge, so it is not updated\n`);
    else {
      failed = true;
      process.stderr.write(`forge skill update: ${o.name}: ${o.message ?? 'failed'}\n`);
    }
  }
  return failed ? 1 : 0;
}

/** `forge skill remove <name> --yes`: delete a skill from ~/.forge/skills. */
async function removeSkill(name: string, yes: boolean): Promise<number> {
  const managed = (await listManagedSkills()).find((m) => m.name === name);
  if (!managed) {
    process.stderr.write(`forge skill remove: there is no skill named "${name}" in ~/.forge/skills (skills in other folders are not removed by Forge)\n`);
    return 2;
  }
  if (!yes) {
    process.stderr.write(`forge skill remove: this deletes ${managed.path.replace(/[\\/]SKILL\.md$/, '')}. Run again with --yes to confirm.\n`);
    return 2;
  }
  try {
    await removeManagedSkill(name);
  } catch (err) {
    process.stderr.write(`forge skill remove: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  process.stdout.write(`removed ${name}\n`);
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
  const catalog = await loadSkillsCatalog(catalogUrl());
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

function browseMarketplace(): number {
  process.stdout.write(`IKarmic Forge Skills Marketplace (catalog):\n  ${catalogUrl()}\n\n`);
  process.stdout.write('Browse community skills there. To install one:\n');
  process.stdout.write('  forge skill install <repo-link>             # a GitHub or GitLab repo; add --list, --skill a,b or --all\n');
  process.stdout.write('  forge skill update [name]                   # re-read the source of what you installed\n');
  process.stdout.write('  forge skill remove <name> --yes             # delete a skill from ~/.forge/skills\n');
  process.stdout.write('  forge skill install <name>                  # from the marketplace catalog\n');
  process.stdout.write('  forge skill search <query>                  # find skills by keyword\n');
  process.stdout.write('\nMake your own, and share it:\n');
  process.stdout.write('  forge skill new <name> --description "…" --instructions-file <path>   # write a skill into ~/.forge/skills\n');
  process.stdout.write('  forge skill add <folder|zip>                # copy a skill folder or zip into ~/.forge/skills\n');
  process.stdout.write('  forge skill publish <name|folder>           # open a pull request to the Forge skills repository (asks first)\n');
  return 0;
}

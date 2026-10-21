/**
 * `forge memory list|check|forget` subcommand: inspect and prune project
 * memory (`.forge/MEMORY.md` and `~/.forge/MEMORY.md`).
 *
 * Needs no AI provider. Exit codes: 0 ok, 1 `check` found stale sections or
 * `forget` found nothing, 2 usage error.
 */

import {
  checkStale,
  findProjectMemoryRoot,
  globalMemoryPath,
  loadMemory,
  projectMemoryPath,
  readMemoryFile,
  removeSection,
  staleKey,
  tokenize,
  writeMemoryFile,
  type MemorySection,
} from '@ikarmic/forge-core';

import type { ParsedMemoryCommand } from '../options.js';

/** Two sections whose heading+body word sets overlap at least this much are flagged as likely duplicates. */
const DUPLICATE_SIMILARITY = 0.6;

export async function handleMemoryCommand(cmd: ParsedMemoryCommand, cwd: string): Promise<number> {
  if (cmd.list) return listMemory(cwd);
  if (cmd.check) return checkMemory(cwd);
  if (cmd.forget) return forgetSection(cwd, cmd.forget.heading, cmd.forget.global);
  process.stderr.write('forge memory: expected one of list|check|forget <heading> [--global].\n');
  return 2;
}

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const scopeOf = (s: MemorySection): string => (s.source === globalMemoryPath() ? 'global' : 'project');

async function listMemory(cwd: string): Promise<number> {
  const { sections } = await loadMemory(cwd);
  if (sections.length === 0) {
    process.stdout.write('(no memory found)\n');
    return 0;
  }
  for (const s of sections) {
    process.stdout.write(`${scopeOf(s)} ${s.type} ${day(s.updatedAt)} ${s.heading}\n`);
  }
  return 0;
}

function similarity(a: MemorySection, b: MemorySection): number {
  const wa = new Set(tokenize(`${a.heading} ${a.body}`));
  const wb = new Set(tokenize(`${b.heading} ${b.body}`));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

async function checkMemory(cwd: string): Promise<number> {
  const { sections } = await loadMemory(cwd);
  const root = (await findProjectMemoryRoot(cwd)) ?? cwd;
  const stale = await checkStale(sections, root);
  for (const s of sections) {
    const reasons = stale.get(staleKey(s));
    if (reasons) process.stdout.write(`stale: ${s.heading} — ${reasons.join('; ')}\n`);
  }
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (similarity(sections[i]!, sections[j]!) >= DUPLICATE_SIMILARITY) {
        process.stdout.write(`duplicate?: ${sections[i]!.heading} ~ ${sections[j]!.heading}\n`);
      }
    }
  }
  if (stale.size === 0) process.stdout.write('no stale sections\n');
  return stale.size > 0 ? 1 : 0;
}

async function forgetSection(cwd: string, heading: string, global: boolean): Promise<number> {
  const root = await findProjectMemoryRoot(cwd);
  const target = global ? globalMemoryPath() : projectMemoryPath(root ?? cwd);
  const { content, removed } = removeSection(await readMemoryFile(target), heading);
  if (!removed) {
    process.stderr.write(`forge memory: no section named "${heading}" in ${target}\n`);
    return 1;
  }
  await writeMemoryFile(target, content);
  process.stdout.write(`removed "${heading}" from ${target}\n`);
  return 0;
}

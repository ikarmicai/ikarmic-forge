/**
 * `forge spec …` subcommand: list / show / cancel / sync already-approved
 * spec-driven-planning-mode output (`.forge/specs/<id>/`). `sync` is the one
 * that needs a model: it re-reads the code and updates the documents.
 *
 * Mirrors `commands/checkpoint.ts`'s soft-prefix shape: no AI provider
 * required, exits 0/1/2. Generation itself happens via `--spec "<task>"`
 * (one-shot) or `/spec <task>` (REPL): see `options.ts`'s header
 * comment on `ParsedSpecCommand` for why "approve" isn't a subcommand
 * here.
 */

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createInterface } from 'node:readline/promises';

import {
  runReasonLabel,
  changeSize,
  convertToCheckboxes,
  keepDoneTasks,
  SpecStore,
  specDrift,
  splitSpecSections,
  syncSpecTask,
  type SpecSections,
} from '@ikarmic/forge-core';

import type { ParsedSpecCommand } from '../options.js';

export interface SpecCommandDeps {
  /** Runs a read-only spec-mode agent on `task` and returns its final text and end reason. */
  runSpecAgent?: (task: string) => Promise<{ finalText: string; reason: string }>;
  /** Asks a yes/no question; defaults to a terminal prompt (no when stdin is not a TTY). */
  confirm?: (question: string) => Promise<boolean>;
}

export async function handleSpecCommand(cmd: ParsedSpecCommand, cwd: string, deps: SpecCommandDeps = {}): Promise<number> {
  const store = new SpecStore(cwd);

  if (cmd.list) {
    return listSpecs(store);
  }
  if (cmd.show) {
    return showSpec(store, cmd.show.id);
  }
  if (cmd.cancel) {
    return cancelSpec(store, cmd.cancel.id, cmd.cancel.yes);
  }
  if (cmd.sync) {
    return syncSpec(store, cwd, cmd.sync.id, cmd.sync.yes, deps);
  }
  process.stderr.write(
    'forge spec: expected one of list|show|cancel|sync. Generate a new spec with `forge --spec "<task>"` or `/spec <task>` in the REPL.\n'
  );
  return 2;
}

async function listSpecs(store: SpecStore): Promise<number> {
  const all = await store.list();
  if (all.length === 0) {
    process.stdout.write(
      '(no approved specs found: generate one with `forge --spec "<task>"` or `/spec <task>` in the REPL)\n'
    );
    return 0;
  }
  process.stdout.write('id                                  task                            when\n');
  process.stdout.write('────────────────────────────────────────────────────────────────────────\n');
  for (const s of all) {
    const id = s.id.length > 36 ? s.id.slice(0, 35) + '…' : s.id.padEnd(36);
    const task = s.task.length > 30 ? s.task.slice(0, 29) + '…' : s.task.padEnd(30);
    const when = s.approvedAt.replace('T', ' ').slice(0, 19);
    process.stdout.write(`${id} ${task} ${when}\n`);
  }
  return 0;
}

async function showSpec(store: SpecStore, id: string): Promise<number> {
  const summary = await store.get(id);
  if (!summary) {
    process.stderr.write(`forge spec: no spec with id "${id}"\n`);
    return 2;
  }
  process.stdout.write(`Spec ${summary.id}\n`);
  process.stdout.write(`  task:       ${summary.task}\n`);
  process.stdout.write(`  approved:   ${summary.approvedAt}\n`);
  process.stdout.write(`  dir:        ${summary.dir}\n\n`);
  for (const file of ['requirements.md', 'design.md', 'tasks.md']) {
    const content = await readFile(path.join(summary.dir, file), 'utf8');
    process.stdout.write(`── ${file} ──\n${content}\n\n`);
  }
  return 0;
}

async function cancelSpec(store: SpecStore, id: string, yes: boolean): Promise<number> {
  const summary = await store.get(id);
  if (!summary) {
    process.stderr.write(`forge spec: no spec with id "${id}"\n`);
    return 2;
  }
  if (!yes) {
    process.stderr.write(
      `About to permanently delete spec "${id}" (${summary.dir}).\n` +
        'Re-run with --yes to confirm. Refusing to delete without an explicit flag.\n'
    );
    return 2;
  }
  const removed = await store.delete(id);
  process.stdout.write(removed ? `deleted spec ${id}\n` : `forge spec: failed to delete "${id}"\n`);
  return removed ? 0 : 1;
}

async function askInTerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

/** Re-read the code and bring the spec's documents up to date; the old ones go to history/. */
async function syncSpec(store: SpecStore, cwd: string, id: string, yes: boolean, deps: SpecCommandDeps): Promise<number> {
  const spec = await store.get(id);
  const docs = spec ? await store.readDocs(id) : null;
  if (!spec || !docs) {
    process.stderr.write(`forge spec: no spec with id "${id}"\n`);
    return 2;
  }
  if (!deps.runSpecAgent) {
    process.stderr.write('forge spec sync: no model available\n');
    return 2;
  }
  const confirm = deps.confirm ?? askInTerminal;
  // Ask for --yes before spending on a model run whose result could not be written.
  if (!yes && !deps.confirm && !process.stdin.isTTY) {
    process.stderr.write('forge spec sync: not a terminal, so pass --yes to write the updated documents.\n');
    return 2;
  }

  const drift = await specDrift(cwd, spec, docs);
  process.stderr.write(
    `Spec ${id}: ${drift.changedFiles.length} file(s) changed since ${drift.since.slice(0, 10)}, ` +
      `${drift.missingPaths.length} mentioned path(s) gone, ${drift.tasks.done}/${drift.tasks.total} tasks ticked.\n` +
      'Re-reading the code (read-only)…\n'
  );
  const result = await deps.runSpecAgent(syncSpecTask(spec, docs, drift));
  if (result.reason !== 'spec' && result.reason !== 'completed') {
    process.stderr.write(`forge spec sync: the run ended (${runReasonLabel(result.reason)}); nothing was changed.\n`);
    return 1;
  }
  let next: SpecSections;
  try {
    next = splitSpecSections(result.finalText);
  } catch (err) {
    process.stderr.write(`forge spec sync: ${(err as Error).message}; nothing was changed.\n`);
    return 1;
  }
  next = { ...next, tasks: keepDoneTasks(docs.tasks, convertToCheckboxes(next.tasks)) };

  let any = false;
  for (const file of ['requirements', 'design', 'tasks'] as const) {
    const { added, removed } = changeSize(docs[file], next[file]);
    if (added || removed) any = true;
    process.stdout.write(`  ${file}.md: ${added || removed ? `+${added} -${removed} lines` : 'unchanged'}\n`);
  }
  if (!any) {
    process.stdout.write(`spec ${id} already matches the code\n`);
    return 0;
  }
  if (!yes && !(await confirm(`Write the updated documents to ${spec.dir}?`))) {
    process.stdout.write('not written\n');
    return 1;
  }
  const updated = await store.update(id, next);
  process.stdout.write(`updated spec ${id} (previous version in ${path.join(updated.dir, 'history')})\n`);
  return 0;
}


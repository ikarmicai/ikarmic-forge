/**
 * `forge skill new|add|publish`: make a skill, bring one in from a folder or a zip archive, and share it as a pull request
 * to the Forge skills repository. Exit codes as the rest of `forge skill`: 0 done, 2 the person's input, 1 a failure.
 * The licence Forge writes is added to what is sent, never into the person's own folder, and the token is never printed.
 */
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

import {
  githubFromEnv,
  licenceFiles,
  publishSkill,
  installedFrom,
  readSkillArchive,
  readSkillFolder,
  saveSkill,
  scaffoldSkill,
  SKILL_ZIP_MAX_BYTES,
  SKILLS_REPO,
  skillHeader,
  SkillInstallError,
  SkillPublishError,
  validateSkillFiles,
  type SkillFile,
} from '@ikarmic/forge-core';

import type { ParsedSkillCommand } from '../options.js';

const skillsDir = (): string => path.join(homedir(), '.forge', 'skills');

/** A message for the terminal: the sentence, never a stack. */
const sentence = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** `forge skill new <name> --description … --instructions-file …`: write a skill to ~/.forge/skills. */
export async function newSkill(opts: NonNullable<ParsedSkillCommand['create']>): Promise<number> {
  if (!opts.description.trim()) {
    process.stderr.write('forge skill new: say what the skill does with --description "one sentence".\n');
    return 2;
  }
  if (!opts.instructionsFile) {
    process.stderr.write('forge skill new: give the instructions with --instructions-file <path>. The file holds what the agent should do when it uses the skill.\n');
    return 2;
  }
  let instructions: string;
  try {
    instructions = await readFile(opts.instructionsFile, 'utf8');
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
    process.stderr.write(`forge skill new: ${opts.instructionsFile} ${missing ? 'cannot be found' : 'cannot be read'}.\n`);
    return 2;
  }
  let files: SkillFile[];
  try {
    files = scaffoldSkill({ name: opts.name, description: opts.description, instructions });
  } catch (err) {
    process.stderr.write(`forge skill new: ${sentence(err)}\n`);
    return 2;
  }
  try {
    const saved = await saveSkill(opts.name, files, { overwrite: opts.overwrite });
    process.stdout.write(`created ${opts.name}  ${saved.dir}\n`);
    process.stdout.write(leftoverNote(saved.leftover));
    process.stdout.write(`Share it with: forge skill publish ${opts.name} --licence MIT --holder "Your name"\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`forge skill new: ${sentence(err)}\n`);
    return err instanceof SkillInstallError ? 2 : 1;
  }
}

/** The files of a folder or a zip archive, and the folder name that wrapped them. */
async function readSkillSource(target: string): Promise<{ files: SkillFile[]; folder: string | null }> {
  const info = await lstat(target).catch(() => undefined);
  if (!info) throw new SkillInstallError(`${target} cannot be found.`);
  if (info.isDirectory() || info.isSymbolicLink()) return { files: await readSkillFolder(target), folder: path.basename(target) };
  if (!/\.zip$/i.test(target)) throw new SkillInstallError(`${target} is not a folder or a .zip file.`);
  // The archive is read whole, so its size is checked before it is read.
  if (info.size > SKILL_ZIP_MAX_BYTES) throw new SkillInstallError(`${target} is too large for a skill (at most ${SKILL_ZIP_MAX_BYTES / 1024 / 1024} MB).`);
  return readSkillArchive(await readFile(target));
}

/** A note for an old copy that could not be removed after the new one was saved. */
const leftoverNote = (leftover: string | undefined): string =>
  leftover ? `The old copy could not be removed (a file in it may be open). It is in ${leftover}; delete that folder when it is free.\n` : '';

/** `forge skill add <folder|zip>`: bring a skill in. It is checked first, and named by its SKILL.md. */
export async function addSkill(opts: NonNullable<ParsedSkillCommand['add']>, cwd: string): Promise<number> {
  try {
    const { files, folder } = await readSkillSource(path.resolve(cwd, opts.path));
    const name = skillHeader(files)?.name ?? folder;
    if (!name) throw new SkillInstallError('SKILL.md needs a name at the top.');
    const saved = await saveSkill(name, files, { overwrite: opts.overwrite });
    process.stdout.write(`added ${name}  ${saved.dir}  (${saved.files} file${saved.files === 1 ? '' : 's'})\n`);
    process.stdout.write(leftoverNote(saved.leftover));
    process.stdout.write('A skill can bring scripts. Read them before you let Forge run them.\n');
    return 0;
  } catch (err) {
    process.stderr.write(`forge skill add: ${sentence(err)}\n`);
    // A zip that cannot be read is the person's file, not a failure of Forge.
    return err instanceof SkillInstallError || /zip archive|not a zip/i.test(sentence(err)) ? 2 : 1;
  }
}

/** `forge skill publish <name|folder>`: share a skill as a pull request to the Forge skills repository (RB-76). */
export async function publishFromDisk(opts: NonNullable<ParsedSkillCommand['publish']>, cwd: string): Promise<number> {
  let files: SkillFile[];
  try {
    const byPath = /[\\/]/.test(opts.target);
    const dir = byPath ? path.resolve(cwd, opts.target) : path.join(skillsDir(), opts.target);
    if (!byPath && !(await lstat(dir).catch(() => undefined))) {
      process.stderr.write(`forge skill publish: there is no skill named "${opts.target}" in ~/.forge/skills. Give its folder instead: forge skill publish ./path/to/skill\n`);
      return 2;
    }
    // A skill installed from a link is someone else's work: Forge shares only skills the person made or brought in.
    const from = await installedFrom(dir);
    if (from) {
      process.stderr.write(`forge skill publish: ${opts.target} was installed from ${from}, so it is someone else's skill and Forge does not share it under your name.\n`);
      return 2;
    }
    files = await readSkillFolder(dir);
  } catch (err) {
    process.stderr.write(`forge skill publish: ${sentence(err)}\n`);
    return 2;
  }
  const header = skillHeader(files);
  if (!header) {
    process.stderr.write('forge skill publish: SKILL.md needs a name and a description at the top.\n');
    return 2;
  }
  const { name, description } = header;

  const choice = opts.licence ? { kind: opts.licence, holder: opts.holder ?? '', year: new Date().getFullYear() } : undefined;
  const licence = licenceFiles(files, choice);
  const all = [...files, ...licence.add];
  const found = validateSkillFiles(name, all).problems;
  const problems = [...found, ...licence.problems.filter((p) => !found.includes(p))];
  if (problems.length > 0) {
    process.stderr.write(`forge skill publish: the skill cannot be shared yet:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    if (!opts.licence && licence.problems.length > 0) process.stderr.write('Choose one with --licence MIT or --licence Apache-2.0, and name the holder with --holder "Your name".\n');
    return 2;
  }

  const token = githubFromEnv()?.token;
  if (!token) {
    process.stderr.write('forge skill publish: set GITHUB_TOKEN or GH_TOKEN to a GitHub token that may write to public repositories.\n');
    return 2;
  }

  const upstream = process.env.FORGE_SKILLS_REPO || SKILLS_REPO;
  const title = opts.title ?? `Add the ${name} skill`;
  // Every file that will be public is listed before anything is sent.
  const listed = all.map((f) => `    skills/${name}/${f.rel}${f.executable ? '  (runnable)' : ''}${licence.add.includes(f) ? '  (written by Forge)' : ''}`).join('\n');
  process.stdout.write(`Share the skill ${name}\n  to      ${upstream}, as a ${opts.ready ? 'pull request' : 'draft pull request'}\n  title   ${title}\n  files   ${all.length}\n${listed}\n`);
  if (!opts.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write('forge skill publish: nothing was sent. Run again with --yes to confirm.\n');
      return 2;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answer = '';
    try {
      answer = await rl.question('Open this pull request? [y/N] ');
    } catch {
      // Ctrl+D or Ctrl+C at the prompt ends the input: that is a no.
      answer = '';
    } finally {
      rl.close();
    }
    if (!/^y(es)?$/i.test(answer.trim())) {
      process.stdout.write('\nnothing was sent\n');
      return 0;
    }
  }

  try {
    const apiBase = process.env.FORGE_GITHUB_API_URL;
    const got = await publishSkill(
      { name, files: all, title, body: `${description}\n\nShared with forge skill publish.`, draft: !opts.ready },
      { token, upstream, ...(apiBase ? { apiBase } : {}) }
    );
    process.stdout.write(`opened ${got.url}\n`);
    if (got.draft) process.stdout.write('It is a draft. Mark it ready for review on GitHub when you are happy with it.\n');
    return 0;
  } catch (err) {
    process.stderr.write(`forge skill publish: ${sentence(err)}\n`);
    return err instanceof SkillPublishError && err.problems ? 2 : 1;
  }
}

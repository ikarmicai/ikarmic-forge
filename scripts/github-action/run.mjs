// Runs Forge for the GitHub Action: works out the task, runs the CLI, then (optionally)
// opens a draft PR with the changes and replies on the issue or PR. See action.yml.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { finalFromJsonLines, outputEntry, prTitle, taskFromEvent, taskWithContext, threadFromEvent } from './lib.mjs';

const env = process.env;
const input = (name) => (env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? '').trim();
const flag = (name) => input(name).toLowerCase() === 'true';
const output = (name, value) => {
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, outputEntry(name, value, randomBytes(8).toString('hex')));
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...env, GH_TOKEN: input('github-token') } }).trim();

const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
const task = taskFromEvent(input('prompt'), env.GITHUB_EVENT_NAME, event);
if (!task) {
  console.log('forge: no task (empty prompt input and no @forge comment); nothing to do.');
  process.exit(0);
}
const thread = threadFromEvent(event);

const version = input('forge-version') || 'latest';
// The agent may read PRs; opening one is this script's job (after the run, from the real diff).
const args = ['-y', `ikarmic-forge@${version}`, '--auto', '--json', '--github', '--deny-tools', 'github_pr_create'];
if (input('model')) args.push('--model', input('model'));
if (input('provider')) args.push('--provider', input('provider'));
if (input('max-cost')) args.push('--max-cost', input('max-cost'));
args.push('--', taskWithContext(task, thread));

console.log(`forge: running ${version} on: ${task.split('\n')[0]}`);
const run = spawnSync('npx', args, {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...env, GITHUB_TOKEN: input('github-token') },
});
const final = finalFromJsonLines(run.stdout ?? '');
const reply = final?.finalText?.trim() || '(Forge finished without a reply.)';
writeFileSync(path.join(tmpdir(), 'forge-reply.md'), reply);
output('result', reply);
output('reason', final?.reason ?? 'error');
console.log(`forge: ${final ? `finished (${final.reason}), cost $${(final.costUsd ?? 0).toFixed(4)}` : `failed (exit ${run.status})`}`);

let prUrl = '';
const changed = git('status', '--porcelain');
if (flag('create-pr') && changed && final?.reason === 'completed') {
  const branch = `forge/${env.GITHUB_RUN_ID ?? Date.now()}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`;
  git('config', 'user.name', 'forge[bot]');
  git('config', 'user.email', 'forge-bot@users.noreply.github.com');
  git('checkout', '-b', branch);
  git('add', '-A');
  git('commit', '-m', prTitle(task), '-m', `Requested in ${thread ? `#${thread.number}` : `run ${env.GITHUB_RUN_ID ?? ''}`}.\n\nForge-Commit: true`);
  git('push', '-u', 'origin', branch);
  const body = `${reply}\n\n---\n${thread ? `Requested in #${thread.number}. ` : ''}Opened by the Forge GitHub Action.`;
  writeFileSync(path.join(tmpdir(), 'forge-pr.md'), body);
  prUrl = gh('pr', 'create', '--draft', '--title', prTitle(task), '--body-file', path.join(tmpdir(), 'forge-pr.md'), '--head', branch);
  console.log(`forge: opened ${prUrl}`);
}
output('pr-url', prUrl);

if (flag('comment') && thread) {
  const note = prUrl ? `\n\nChanges: ${prUrl}` : changed && !flag('create-pr') ? '\n\n(Changes were made in the workflow but not pushed: create-pr is off.)' : '';
  writeFileSync(path.join(tmpdir(), 'forge-comment.md'), `${reply}${note}`);
  gh('issue', 'comment', String(thread.number), '--body-file', path.join(tmpdir(), 'forge-comment.md'));
}

if (!final || final.reason === 'error' || final.reason === 'no_provider_key') process.exit(1);

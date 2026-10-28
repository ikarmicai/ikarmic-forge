// Decides whether this repository's CI can run yet.
//
// The clients here get @ikarmic/forge-core from npm. A push that lands before the matching core is
// published (and approved on npmjs.com) cannot build, so the CI would be red until then. The mirror
// writes .mirror-core.json: the core version and when core last changed in the private repository.
// CI is ready once that version is on npm and was published after that change. Otherwise the test
// job is skipped, not failed. A scheduled run re-checks, so CI turns green by itself after the approval.

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @returns {{ ready: boolean, reason: string }} */
export function coreGate(stamp, times) {
  const changedAt = stamp ? Date.parse(stamp.changedAt) : NaN;
  if (!stamp || !stamp.version || Number.isNaN(changedAt)) {
    return { ready: false, reason: 'No readable .mirror-core.json: cannot tell which core this commit needs.' };
  }
  const published = times?.[stamp.version];
  if (!published) return { ready: false, reason: `@ikarmic/forge-core ${stamp.version} is not on npm yet.` };
  if (Date.parse(published) < changedAt) {
    return { ready: false, reason: `@ikarmic/forge-core ${stamp.version} on npm is older than the core this commit needs.` };
  }
  return { ready: true, reason: `@ikarmic/forge-core ${stamp.version} is on npm.` };
}

async function alreadyPassed(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?branch=main&status=success&head_sha=${env.GITHUB_SHA}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (!res.ok) return false;
  return ((await res.json()).total_count ?? 0) > 0;
}

async function main() {
  const env = process.env;
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync('.mirror-core.json', 'utf8'));
  } catch {
    // coreGate reports the missing stamp.
  }
  let times = {};
  try {
    const res = await fetch('https://registry.npmjs.org/@ikarmic%2Fforge-core');
    if (res.ok) times = (await res.json()).time ?? {};
  } catch {
    // An unreachable registry reads as "not on npm yet": skip, and the schedule tries again.
  }

  let { ready, reason } = coreGate(stamp, times);
  if (ready && env.GITHUB_EVENT_NAME === 'schedule' && (await alreadyPassed(env))) {
    ready = false;
    reason = 'This commit already passed CI.';
  }
  console.log(`${ready ? 'ready' : 'skipping the tests'}: ${reason}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `ready=${ready}\n`);
  if (env.GITHUB_STEP_SUMMARY && !ready) appendFileSync(env.GITHUB_STEP_SUMMARY, `CI tests skipped: ${reason}\n`);
}

// Compare paths, not hand-built URLs: "file:///" + "/home/…" has four slashes on Linux, so main() never ran and the
// public CI skipped its tests on every run (RB-100).
if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) await main();

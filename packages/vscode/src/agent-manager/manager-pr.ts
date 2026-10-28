/**
 * Pull requests from the Agent Manager (F8): the draft text, the check of what the page sends back, the wording of the
 * status line and the poll's back-off. Pure; the panel owns the vscode and git side.
 */
import type { PullRequestSummary } from '@ikarmic/forge-core';

import type { AgentSession } from './manager-model.js';

/** How often the status of open pull requests is read while the panel is visible. */
export const PR_POLL_MS = 60_000;
const PR_POLL_MAX_MS = 600_000;
const TITLE_MAX = 120;
const FILES_SHOWN = 30;

/** Title and description for the confirmation card: the person edits both before anything is pushed. */
export function prDraftFor(s: Pick<AgentSession, 'prompt' | 'changedFiles'>): { title: string; body: string } {
  const firstLine = (s.prompt.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
  const title = firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine || 'Changes from Forge';
  const files = s.changedFiles ?? [];
  const list = files.slice(0, FILES_SHOWN).map((f) => `- ${f}`);
  if (files.length > FILES_SHOWN) list.push(`- … and ${files.length - FILES_SHOWN} more`);
  const body = ['Opened from the Forge Agent Manager.', '', '## Request', '', s.prompt.trim(), ...(list.length > 0 ? ['', '## Files changed', '', ...list] : [])].join('\n');
  return { title, body };
}

export type PrForm = { ok: true; title: string; body: string; base: string; draft: boolean } | { ok: false; message: string };

/** What the page sent for "Push and open": checked here, because a page message is not trusted. */
export function validatePrForm(input: unknown): PrForm {
  if (!input || typeof input !== 'object') return { ok: false, message: 'The pull request form was empty.' };
  const f = input as Record<string, unknown>;
  const title = typeof f.title === 'string' ? f.title.trim() : '';
  if (!title || title.length > 256) return { ok: false, message: 'Give the pull request a title of up to 256 characters.' };
  const body = f.body === undefined ? '' : f.body;
  if (typeof body !== 'string' || body.length > 60_000) return { ok: false, message: 'The description is too long (60,000 characters at most).' };
  const base = typeof f.base === 'string' ? f.base.trim() : '';
  // A branch name goes to the GitHub API as data, but a leading dash or slash and odd characters never name a real branch here.
  if (!base || base.length > 200 || base.startsWith('-') || base.startsWith('/') || base.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(base)) {
    return { ok: false, message: 'Name the branch to merge into, for example main.' };
  }
  return { ok: true, title, body, base, draft: f.draft !== false };
}

/** The status line for a session's pull request, in words. */
export function prLine(pr: PullRequestSummary): string {
  const parts = [`Pull request #${pr.number}`, pr.state === 'open' && pr.draft ? 'draft' : pr.state];
  if (pr.checks === 'passing') parts.push('checks passing');
  else if (pr.checks === 'failing') parts.push('checks failing');
  else if (pr.checks === 'pending') parts.push('checks running');
  if (pr.review !== 'none') parts.push(pr.review);
  return parts.join(' · ');
}

/** A minute while reads succeed; doubling after each failure, up to ten minutes. */
export function nextPollDelay(current: number, failed: boolean): number {
  return failed ? Math.min(current * 2, PR_POLL_MAX_MS) : PR_POLL_MS;
}

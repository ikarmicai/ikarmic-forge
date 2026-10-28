import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { followUpAfterSuggestion, planDocument, planSlug, savePlan } from '../src/chat/plan-file.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'forge-plan-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

const DAY = new Date('2026-10-27T10:15:00Z');

describe('planSlug', () => {
  it('keeps the first few words as lowercase letters, digits and dashes', () => {
    expect(planSlug('Add OAuth login to the API, with refresh tokens and tests!')).toBe('add-oauth-login-to-the-api');
  });
  it('drops anything that could be a path', () => {
    const s = planSlug('../../etc/passwd and C:\\Windows\\x');
    expect(s).toMatch(/^[a-z0-9-]+$/);
    expect(s).not.toContain('..');
  });
  it('falls back to "plan" when nothing usable is left', () => {
    expect(planSlug('')).toBe('plan');
    expect(planSlug('中文 ✓')).toBe('plan');
  });
  it('is short', () => {
    expect(planSlug('a '.repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe('planDocument', () => {
  it('heads the plan with the request and the date', () => {
    const doc = planDocument('Add login', 'Step 1\nStep 2', DAY);
    expect(doc.startsWith('# Plan: Add login\n')).toBe(true);
    expect(doc).toContain('2026-10-27');
    expect(doc.endsWith('Step 1\nStep 2\n')).toBe(true);
  });
  it('keeps a long first line of the request short and one line', () => {
    const doc = planDocument(`${'word '.repeat(60)}\nsecond`, 'p', DAY);
    expect(doc.split('\n')[0]!.length).toBeLessThan(120);
    expect(doc.split('\n')[0]).not.toContain('second');
  });
});

describe('savePlan', () => {
  it('writes .forge/plans/<date>-<slug>.md under the project and returns where', async () => {
    const file = await savePlan(root, 'Add login', 'The plan', DAY);
    expect(path.relative(root, file).split(path.sep).join('/')).toBe('.forge/plans/2026-10-27-add-login.md');
    expect(readFileSync(file, 'utf8')).toContain('The plan');
  });
  it('never overwrites an earlier plan with the same name', async () => {
    const a = await savePlan(root, 'Add login', 'first', DAY);
    const b = await savePlan(root, 'Add login', 'second', DAY);
    expect(b).not.toBe(a);
    expect(readFileSync(a, 'utf8')).toContain('first');
    expect(readFileSync(b, 'utf8')).toContain('second');
    expect(existsSync(b)).toBe(true);
  });
  it('stays inside the project for any request', async () => {
    const file = await savePlan(root, '../../../outside', 'x', DAY);
    expect(path.relative(root, file).startsWith('..')).toBe(false);
  });
});

describe('followUpAfterSuggestion', () => {
  const ask = 'Build the billing system';
  it('"plan first" plans, in Plan mode, and does not suggest again', () => {
    const r = followUpAfterSuggestion('plan', ask);
    expect(r).toMatchObject({ modeId: 'plan', planDeclined: true });
    expect(r.text).toContain(ask);
  });
  it('"just do it" runs the request again with suggestions off', () => {
    const r = followUpAfterSuggestion('go', ask);
    expect(r.modeId).toBeUndefined();
    expect(r.planDeclined).toBe(true);
    expect(r.text).toContain(ask);
    expect(r.text).toMatch(/without a plan/i);
  });
  it('"don\'t ask again" also goes ahead', () => {
    expect(followUpAfterSuggestion('never', ask).planDeclined).toBe(true);
  });
});

import { chatHtml } from '../src/chat/html.js';

describe('the chat page and the saved plan (F2)', () => {
  const html = chatHtml();
  it('shows the saved-plan card and posts the implement choice', () => {
    expect(html).toContain("case 'plan_saved':");
    expect(html).toContain("type: 'plan_implement'");
    expect(html).toContain('Implement this plan');
  });
  it('keeps the planning card the model-suggested path reuses', () => {
    expect(html).toContain("case 'suggest_spec':");
    expect(html).toContain("['Plan first', 'plan', true]");
  });
});

describe('the host accepts the new message', () => {
  it('lists plan_implement among the messages it takes from the page', async () => {
    const src = readFileSync(path.join(__dirname, '..', 'src', 'chat', 'chat-view.ts'), 'utf8');
    expect(src).toMatch(/CHAT_TYPES = new Set\(\[[^\]]*'plan_implement'/);
  });
});

describe('requestOfFollowUp', () => {
  it('gives back the person\'s own request, for the plan file\'s title', async () => {
    const { requestOfFollowUp, followUpAfterSuggestion: f } = await import('../src/chat/plan-file.js');
    expect(requestOfFollowUp(f('plan', 'Build billing').text)).toBe('Build billing');
    expect(requestOfFollowUp('Something else')).toBe('Something else');
  });
});

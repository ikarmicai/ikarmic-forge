import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { looksLikeNewWork, shouldAutoPlan } from '../src/chat/auto-plan.js';
import { chatHtml } from '../src/chat/html.js';

const src = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('a request for a new app or feature', () => {
  it.each([
    'Build me a CRM for a small sales team',
    'Create a todo app with sign in',
    'Add a notifications feature to the project',
    'Implement user authentication for the API',
    'Add Stripe payments to checkout',
    'Integrate search into the dashboard',
    'I want to add a reporting module with charts',
    'need a CRM',
    'I need a CRM for my sales team',
    'We want a simple todo app with sign in',
    'I would like an inventory system',
  ])('is new work: %s', (text) => {
    expect(looksLikeNewWork(text, text)).toBe(true);
  });

  it.each([
    'Fix the typo in the readme',
    'Add a button to the toolbar',
    'Rename the helper in src/utils/format.ts',
    'How does the login flow work?',
    'Explain the notifications module',
    'Add a test for the search function',
    'Change the colour of the dashboard header',
    'Add a log line before the payment call',
    'what does this app do',
    'I want search to be faster',
    'I need to fix the login',
    'I want the dashboard header to be blue',
    'I need help with this app',
    '',
  ])('is not new work: %s', (text) => {
    expect(looksLikeNewWork(text, text)).toBe(false);
  });

  it('judges what the person typed, not what a command expanded it to', () => {
    expect(looksLikeNewWork('/skill-x', 'Build me a CRM for a small sales team')).toBe(false);
  });
});

describe('when the chat switches to Plan mode by itself', () => {
  const on = { modeId: 'agent', trusted: true, enabled: true, typed: 'Build me a CRM', sent: 'Build me a CRM' };

  it('switches from Agent mode for new work', () => {
    expect(shouldAutoPlan(on)).toBe(true);
  });

  it.each([
    ['another mode is chosen', { modeId: 'ask' }],
    ['Plan is already chosen', { modeId: 'plan' }],
    ['the workspace is not trusted', { trusted: false }],
    ['the setting is off', { enabled: false }],
    ['the request is small', { typed: 'Fix the typo in the readme', sent: 'Fix the typo in the readme' }],
  ])('does not when %s', (_why, change) => {
    expect(shouldAutoPlan({ ...on, ...change })).toBe(false);
  });
});

describe('the wiring', () => {
  const chatView = src('../src/chat/chat-view.ts');
  const html = chatHtml();

  it('switches before the run, ahead of the big-request card, and the run may not ask again', () => {
    const at = chatView.indexOf('shouldAutoPlan(');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(chatView.indexOf('if (this.shouldSuggestSpec('));
    expect(chatView).toMatch(/type: 'auto_plan'/);
    expect(chatView).toMatch(/runChat\(text, level, attachments, 'plan', undefined, true\)/);
  });

  it('undoes only the turn it switched, in Agent mode, and never asks twice (RB-88)', () => {
    expect(chatView).toContain("case 'auto_plan_undo'");
    expect(chatView).toMatch(/msg\.id !== this\.autoPlanId/);
    expect(chatView).toMatch(/last\.attachments, 'agent', last\.historyBefore, true\)/);
  });

  it('shows the notice with Undo, in words', () => {
    expect(html).toContain('Switched to Plan mode for a new app or feature.');
    expect(html).toContain("type: 'auto_plan_undo'");
    expect(html).not.toMatch(/Switched to [^'"]*autoPlan/);
  });

  it('is a setting that Settings can reach and that is on by default', () => {
    const pkg = JSON.parse(src('../package.json')) as { contributes: { configuration: { properties: Record<string, { default?: unknown }> } } };
    expect(pkg.contributes.configuration.properties['forge.autoPlan']?.default).toBe(true);
    expect(src('../package.nls.json')).toContain('"config.forge.autoPlan.description"');
    expect(src('../src/settings/settings-rows.ts')).toContain("b('forge.autoPlan'");
  });
});

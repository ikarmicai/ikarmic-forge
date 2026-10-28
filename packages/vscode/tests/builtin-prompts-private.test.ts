/**
 * RB-54: the built-in agents' prompts are Forge's own work. The Settings page must not show them, send them to
 * the page, or offer a way to copy them.
 */
import { describe, expect, it } from 'vitest';
import { BUILTIN_SPECIALISTS } from '@ikarmic/forge-core';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { markBuiltin } from '../src/settings/settings-protocol.js';

describe('built-in agent prompts stay private', () => {
  it('sends a built-in to the page without its prompt', () => {
    const [plan] = BUILTIN_SPECIALISTS;
    const sent = markBuiltin([plan!], BUILTIN_SPECIALISTS);
    expect(sent[0]).toMatchObject({ id: plan!.id, builtin: true });
    expect(JSON.stringify(sent)).not.toContain(plan!.systemPrompt.slice(0, 80));
    expect('systemPrompt' in sent[0]!).toBe(false);
  });

  it('treats a saved word-for-word copy of a built-in as the built-in', () => {
    const plan = BUILTIN_SPECIALISTS.find((s) => s.id === 'plan')!;
    const copy = { ...plan };
    const sent = markBuiltin([copy], BUILTIN_SPECIALISTS);
    expect(sent[0]).toMatchObject({ id: 'plan', builtin: true });
    expect('systemPrompt' in sent[0]!).toBe(false);
  });

  it('leaves an agent the person edited, or wrote, alone', () => {
    const plan = BUILTIN_SPECIALISTS.find((s) => s.id === 'plan')!;
    const edited = { ...plan, systemPrompt: plan.systemPrompt + '\nMine.' };
    const sent = markBuiltin([edited], BUILTIN_SPECIALISTS);
    expect(sent[0]).toEqual(edited);
  });

  it('offers no way to duplicate a built-in', () => {
    const html = getSettingsHtml('nonce', 'csp');
    expect(html).not.toMatch(/Duplicate/);
    expect(html).not.toContain("'-copy'");
  });
});

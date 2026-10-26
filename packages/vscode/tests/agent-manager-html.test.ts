import { describe, expect, it } from 'vitest';

import { agentManagerHtml } from '../src/agent-manager/manager-html.js';

describe('Agent Manager page', () => {
  const html = agentManagerHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

  it('has one inline script that is valid JavaScript (RB-11)', () => {
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0]!)).not.toThrow();
  });

  it('has the start form: prompt, versions 1 to 4, own worktree, autonomous, and a primary Start', () => {
    expect(html).toContain('<textarea id="prompt"');
    for (const n of ['1', '2', '3', '4']) expect(html).toContain(`<option value="${n}"`);
    expect(html).toContain('id="worktree" checked');
    expect(html).toContain('id="auto"');
    expect(html).toMatch(/<button[^>]*id="start"[^>]*class="primary"/);
  });

  it('labels every control', () => {
    for (const id of ['prompt', 'count', 'worktree', 'auto']) expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
  });

  it('renders rows from the host and posts start and row actions back', () => {
    const script = scripts[0]!;
    expect(script).toContain("msg.type === 'sessions'");
    expect(script).toContain("type: 'start'");
    expect(script).toContain("type: 'action'");
    expect(script).toContain('textContent');
    expect(script).not.toContain('innerHTML = row');
  });

  it('builds row buttons as link buttons (RB-7) and gives each status its role colour', () => {
    expect(scripts[0]).toContain("className = 'link'");
    for (const s of ['running', 'done', 'failed', 'stopped']) expect(html).toContain(`.st-${s}`);
  });

  it('says what the list is for when it is empty', () => {
    expect(html).toContain('id="empty"');
  });
});

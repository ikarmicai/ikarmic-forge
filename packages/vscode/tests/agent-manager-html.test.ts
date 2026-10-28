import { describe, expect, it } from 'vitest';

import { AGENT_MANAGER_CSS, agentManagerHtml } from '../src/agent-manager/manager-html.js';

describe('Agent Manager page', () => {
  const html = agentManagerHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const script = scripts[0]!;

  it('has one inline script that is valid JavaScript (RB-11)', () => {
    expect(scripts).toHaveLength(1);
    expect(() => new Function(script)).not.toThrow();
  });

  it('keeps backticks, dollar-brace and backslashes out of the script, which sits inside a template literal (RB-11)', () => {
    expect(script).not.toContain('`');
    expect(script).not.toContain('${');
    expect(script).not.toContain(String.fromCharCode(92));
  });

  it('is on the design system: roomy density, the root class, tokens and components first', () => {
    expect(html).toMatch(/<body class="ik-root" data-density="roomy">/);
    expect(html.indexOf('--ink-strong')).toBeGreaterThan(-1);
    expect(html.indexOf('.mgr-wrap')).toBeGreaterThan(html.indexOf('.ik-btn'));
    expect(AGENT_MANAGER_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it('has the start form: prompt, versions 1 to 4, own worktree, autonomous, and one primary Start', () => {
    expect(html).toMatch(/<textarea id="prompt" class="ik-textarea"/);
    for (const n of ['1', '2', '3', '4']) expect(html).toContain(`id="count-${n}" value="${n}"`);
    expect(html).toContain('id="worktree" checked');
    expect(html).toContain('id="auto"');
    expect(html).toMatch(/<button[^>]*id="start"[^>]*class="ik-btn ik-btn--primary ik-btn--lg/);
    expect(html.match(/ik-btn--primary/g)?.length).toBeGreaterThan(0);
  });

  it('marks Autonomous as a danger chip and says what it does when it is on', () => {
    expect(html).toMatch(/class="ik-chip ik-chip--danger" for="auto"/);
    expect(html).toContain('id="auto-note"');
    expect(script).toContain('syncAuto');
  });

  it('labels every control', () => {
    for (const id of ['prompt', 'worktree', 'auto']) expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
    expect(html).toContain('<legend>Versions</legend>');
    expect(html).toContain('aria-label="Versions at a glance"');
  });

  it('renders the view from the host and posts start, row actions, discard-the-others, health and the window move back', () => {
    expect(script).toContain("msg.type === 'sessions'");
    for (const type of ['start', 'action', 'discard_others', 'health', 'health_fix', 'pr_create', 'open_window', 'ready']) expect(script).toContain(`type: '${type}'`);
    expect(script).toContain('textContent');
  });

  it('never builds markup from text the host or a model supplied', () => {
    expect(script).not.toContain('innerHTML');
    expect(script).not.toContain('insertAdjacentHTML');
    expect(script).not.toContain('document.write');
  });

  it('gives the specs and screen readers stable hooks: a version, its status and its facts', () => {
    expect(script).toContain("'data-version'");
    expect(script).toContain("'data-status'");
    expect(script).toContain("'data-role', 'status'");
    expect(script).toContain("'data-role', 'detail'");
  });

  it('gives each status an icon and a word, so colour is never the only signal', () => {
    for (const word of ['Starting', 'Running', 'Done', 'Stopped', 'Failed', 'Merged', 'Discarded']) expect(script).toContain(`word: '${word}'`);
    expect(script).toMatch(/s\.appendChild\(icon\(st\.icon\)\)/);
  });

  it('puts the one main action in the task footer, disabled with a reason until a version is picked', () => {
    expect(script).toContain("'Pick a version first.'");
    expect(script).toContain("button('ik-btn--primary', LABELS.merge");
    expect(script).toContain('Discard the others');
  });

  it('updates a running clock in place instead of rebuilding the page', () => {
    expect(script).toContain("k === 'elapsed'");
    expect(script).toContain('elapsedNodes');
  });

  it('is a dialog that holds focus, closes on Escape and gives focus back (pull request drawer)', () => {
    expect(script).toContain("'aria-modal', 'true'");
    expect(script).toContain("ev.key === 'Escape'");
    expect(script).toContain('prOpener');
  });

  it('says what the list is for when it is empty', () => {
    expect(html).toContain('id="empty"');
  });

  it('has the link to move the manager into a window of its own', () => {
    expect(html).toMatch(/<button[^>]*id="new-window"[^>]*>Open in new window<\/button>/);
  });

  it('shows no internal name where a person reads: labels are sentences', () => {
    for (const label of ['Create pull request', 'Open in new window', 'Check worktrees', 'Push and open pull request', 'Forget listing', 'Delete folder']) expect(html).toContain(label);
    expect(html).not.toMatch(/>[a-z]+_[a-z_]+</);
  });
});

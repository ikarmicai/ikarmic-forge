import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

/**
 * The chat toolbar hid five actions behind a "..." menu, so people did not find them. Every action is an icon with
 * its name in a tooltip. Only when the sidebar is very narrow do the three planning tools fold into the menu again.
 */
const html = chatHtml();
const toolbar = html.slice(html.indexOf('<div id="toolbar"'), html.indexOf('<div id="findbar"'));
const bar = toolbar.slice(0, toolbar.indexOf('<div id="more-menu"'));
const menu = toolbar.slice(toolbar.indexOf('<div id="more-menu"'));

const NAMES: Record<string, string> = {
  'new-chat': 'New chat',
  'history-btn': 'History',
  'checkpoints-btn': 'Restore checkpoint',
  'condense-btn': 'Condense conversation',
  'specs-btn': 'Specs',
  'steering-btn': 'Steering',
  'manager-window-btn': 'Agent Manager in new window',
};

describe('every action is an icon with a name', () => {
  it.each(Object.entries(NAMES))('%s is an icon button named %s', (id, name) => {
    const tag = bar.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0] ?? '';
    expect(tag, id).toContain('class="icon');
    expect(tag).toContain(`aria-label="${name}`);
    expect(tag).toContain(`title="`);
    expect(bar.slice(bar.indexOf(tag), bar.indexOf('</button>', bar.indexOf(tag)))).toContain('<svg viewBox="0 0 16 16" aria-hidden="true">');
  });

  it('keeps the planning tools apart from the frequent ones, with Agent Manager at the far end', () => {
    const at = (id: string) => bar.indexOf(`id="${id}"`);
    expect(at('new-chat')).toBeLessThan(at('history-btn'));
    expect(at('history-btn')).toBeLessThan(at('checkpoints-btn'));
    expect(at('checkpoints-btn')).toBeLessThan(at('condense-btn'));
    expect(bar.indexOf('class="tb-sep')).toBeGreaterThan(at('condense-btn'));
    expect(bar.indexOf('class="tb-sep')).toBeLessThan(at('specs-btn'));
    expect(at('specs-btn')).toBeLessThan(at('steering-btn'));
    expect(at('steering-btn')).toBeLessThan(at('manager-window-btn'));
  });

  it('makes the buttons easy to hit', () => {
    expect(html).toMatch(/#toolbar button\.icon \{[^}]*width: 28px; height: 28px/);
  });
});

describe('the More menu is only for a very narrow sidebar', () => {
  it('holds the three planning tools, and no longer the actions that are icons now', () => {
    for (const id of ['specs-menu-btn', 'steering-menu-btn', 'manager-menu-btn']) expect(menu).toContain(`id="${id}"`);
    expect(menu).toContain('role="menuitem"');
    for (const id of ['checkpoints-btn', 'condense-btn', 'meter-stat']) expect(menu).not.toContain(`id="${id}"`);
  });

  it('is hidden until the toolbar is narrow, when the three icons fold into it', () => {
    expect(html).toMatch(/#toolbar \{[^}]*container: tb \/ inline-size/);
    expect(html).toMatch(/#more-btn \{ display: none; \}/);
    const narrow = html.match(/@container tb \(max-width: \d+px\) \{([^]*?)\n  \}/)?.[1] ?? '';
    expect(narrow).toContain('.tb-extra { display: none; }');
    expect(narrow).toContain('#more-btn { display: inline-grid; }');
  });

  // RB-141: a container query measures the inside of the box, without its padding. The toolbar pads 18px, so a default
  // 297px sidebar is 279px inside, and a limit of 279px hid Specs, Steering and Agent Manager in real VS Code.
  it('folds only when the icons really do not fit: 240px inside the padding at the most', () => {
    const limit = Number(html.match(/@container tb \(max-width: (\d+)px\)/)?.[1]);
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(240);
    // Seven 28px icons, one separator and the gaps need about 225px.
    expect(limit).toBeGreaterThanOrEqual(225);
  });

  it('does the same thing from the menu as from the icon', () => {
    expect(html).toContain("document.getElementById('specs-menu-btn').addEventListener('click', () => openWork('specs'));");
    expect(html).toContain("document.getElementById('steering-menu-btn').addEventListener('click', () => openWork('steering'));");
    expect(html).toMatch(/manager-menu-btn'\)\.addEventListener\('click', \(\) => \{ closeMore\(\); vscode\.postMessage\(\{ type: 'open_agent_manager_window' \}\); \}\);/);
  });
});

describe('the context meter moves onto the Condense icon', () => {
  it('shows a dot that turns amber when the chat is getting full, and puts the numbers in the tooltip', () => {
    expect(bar).toContain('id="condense-dot"');
    expect(html).toMatch(/condenseBtn\.classList\.toggle\('hot', level === 'warn' \|\| level === 'crit'\)/);
    expect(html).toContain("condenseBtn.title = 'Condense conversation. '");
    expect(html).not.toContain('meterStat');
  });
});

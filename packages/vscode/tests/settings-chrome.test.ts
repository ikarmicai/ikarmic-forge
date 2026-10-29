import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';

/**
 * Two small things every Settings page lacked: a way to get to the files behind it and to start again from them, and
 * an icon beside each name in the sidebar so a long list can be scanned.
 */
const html = getSettingsHtml();

describe('the bar above every page', () => {
  const bar = html.slice(html.indexOf('class="pagebar"'), html.indexOf('id="banner"'));

  it('opens the user config and the project config, and reloads, with buttons named for what they do', () => {
    for (const [id, text] of [['bar-user-config', 'Open user config'], ['bar-project-config', 'Open project config'], ['bar-reload', 'Reload settings']]) {
      expect(bar, id).toContain(`id="${id}"`);
      expect(bar, id).toContain(text);
    }
  });

  it('is quiet: link-style buttons on one row, so it does not push every page heading down or compete with the own buttons of a page', () => {
    expect(bar).not.toContain('ik-btn--secondary');
    expect((bar.match(/ik-btn--link/g) ?? []).length).toBe(3);
  });

  it('sits before the banner and the sections, so it is on every page', () => {
    expect(html.indexOf('class="pagebar"')).toBeGreaterThan(html.indexOf('<main id="pane">'));
    expect(html.indexOf('class="pagebar"')).toBeLessThan(html.indexOf('id="sec-model"'));
  });

  it('asks for everything again on Reload, so a file edited elsewhere shows up', () => {
    const at = html.indexOf("$('bar-reload')");
    const handler = html.slice(at, at + 600);
    for (const m of ['load', 'loadRows', 'loadProviders', 'loadKeys', 'loadAgents']) expect(handler, m).toContain(`'${m}'`);
  });
});

describe('the MCP Browse toolbar', () => {
  it('lets the search box wrap below a minimum width instead of squeezing to a sliver beside Add your own', () => {
    expect(html).toContain("search.style.flex = '1 1 12rem'");
  });
});

describe('the API keys rows', () => {
  it('are laid out by the width of the main column, not the window, because the column is about 450px beside the chat', () => {
    expect(html).toContain('main { container: pane / inline-size;');
    // A fixed right column, so the inputs of every row share one right edge whatever buttons a row shows.
    expect(html).toContain('@container pane (max-width: 500px) { .keyrow { grid-template-columns: minmax(0, 1fr) 9.5rem;');
  });
});

describe('the sidebar', () => {
  const nav = html.slice(html.indexOf('<div class="navlist">'), html.indexOf('</nav>'));
  const items = [...nav.matchAll(/<button type="button" class="ik-navitem" data-section="(\w+)">([\s\S]*?)<\/button>/g)];

  it('has an item for every section', () => {
    expect(items.length).toBeGreaterThanOrEqual(17);
  });

  it('gives each one an icon that is hidden from a screen reader, then its name', () => {
    for (const [, section, inner] of items) {
      expect(inner, section).toMatch(/^<svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="[^"]+"\/><\/svg>/);
    }
  });

  it('keeps the name as text, so the label is not lost', () => {
    const names = items.map(([, , inner]) => inner!.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<span[\s\S]*?<\/span>/g, '').trim());
    expect(names).toContain('MCP servers');
    expect(names).toContain('Safety and cost');
    expect(names.every((n) => n.length > 2)).toBe(true);
  });
});

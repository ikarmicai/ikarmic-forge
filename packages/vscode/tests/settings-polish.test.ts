import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COMPONENTS_CSS } from '../src/design/components.js';
import { toolLabel } from '../src/human-text.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTING_ROWS, SHORT_HELP } from '../src/settings/settings-rows.js';

const nls = JSON.parse(readFileSync(fileURLToPath(new URL('../package.nls.json', import.meta.url)), 'utf8')) as Record<string, string>;
const html = getSettingsHtml({ scriptUri: 'vscode-resource:/dist/webview/settings-ui.js', cspSource: 'vscode-resource:' });

/** What a Settings row shows as its help: the short line when there is one, else the package.nls.json description. */
function helpOf(key: string): string {
  return SHORT_HELP[key] ?? nls[`config.${key}.description`] ?? '';
}

describe('Settings help text carries words, not identifiers (STRICT rule)', () => {
  it('shows no snake_case name in the help of any row', () => {
    const bad = SETTING_ROWS.map((r) => ({ key: r.key, hit: /\b[a-z]+(?:_[a-z0-9]+)+\b/.exec(helpOf(r.key))?.[0] })).filter((x) => x.hit);
    expect(bad).toEqual([]);
  });
});

describe('tool names read as words in the Permissions list', () => {
  it.each([
    ['bg_start', 'Start background command'],
    ['bg_read', 'Read background output'],
    ['bg_stop', 'Stop background command'],
  ])('%s is "%s"', (tool, label) => {
    expect(toolLabel(tool)).toBe(label);
  });
});

describe('Settings page copy and labels', () => {
  it('does not promise a Duplicate button that no longer exists (RB-54)', () => {
    expect(html).not.toMatch(/duplicate one to start from it/i);
  });

  it('gives every field of the provider form a visible label, not only a placeholder', () => {
    for (const id of ['prov-preset', 'prov-id', 'prov-name', 'prov-url', 'prov-env', 'prov-key', 'prov-api', 'prov-timeout', 'prov-chunk']) {
      expect(html, id).toMatch(new RegExp('<label class="ik-label" for="' + id + '">'));
    }
  });

  it('tells the person what the Display page is for', () => {
    const display = /<section id="sec-display"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
    expect(display).toContain('<p class="lead">');
  });
});

describe('the note component', () => {
  it('has no thick one-sided accent bar (the side-tab look)', () => {
    const rule = /\.ik-note \{([^}]*)\}/.exec(COMPONENTS_CSS)?.[1] ?? '';
    expect(rule).not.toMatch(/border-left:\s*3px/);
    expect(rule).not.toMatch(/border-left:\s*var\(--border-strong\)/);
  });
});

describe('translated help carries words, not identifiers (STRICT rule)', () => {
  it.each(['es', 'zh-cn'])('%s: no snake_case name in the help of any row', (lang) => {
    const tr = JSON.parse(readFileSync(fileURLToPath(new URL(`../package.nls.${lang}.json`, import.meta.url)), 'utf8')) as Record<string, string>;
    const bad = SETTING_ROWS.map((r) => ({ key: r.key, hit: /\b[a-z]+(?:_[a-z0-9]+)+\b/.exec(tr[`config.${r.key}.description`] ?? '')?.[0] })).filter((x) => x.hit);
    expect(bad).toEqual([]);
  });
});

describe('MCP server rows', () => {
  it('give the state a badge with a tone and show the scope as quiet text, so the two do not weigh the same', () => {
    expect(html).not.toContain("ik-badge ik-badge--outline\">' + esc(s.scope)");
    expect(html).toContain("<span class=\"ik-muted\">' + esc(s.scope) + '</span>");
    for (const tone of ['ik-badge--success', 'ik-badge--danger', 'ik-badge--warning']) expect(html, tone).toContain(tone);
  });
});

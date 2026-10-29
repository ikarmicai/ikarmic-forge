import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';

describe('getSettingsHtml', () => {
  const html = getSettingsHtml({ scriptUri: 'vscode-resource:/dist/webview/settings-ui.js', cspSource: 'vscode-resource:' });

  it('locks the page down with a CSP and loads the settings bundle before the inline script', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'unsafe-inline' vscode-resource:");
    expect(html.indexOf('src="vscode-resource:/dist/webview/settings-ui.js"')).toBeLessThan(html.indexOf('<script>'));
  });

  it('has a nav entry and a section for every area', () => {
    for (const s of ['model', 'keys', 'agents', 'mcp', 'skills', 'perm', 'display', 'backup']) {
      expect(html).toContain(`data-section="${s}"`);
      expect(html).toContain(`id="sec-${s}"`);
    }
    expect(html).toContain('id="search"');
    expect(html).toContain('id="search-results"');
    expect(html).toContain('id="unsaved"');
  });

  it('keeps the focus ring on form fields and states MCP status in words', () => {
    expect(html).not.toMatch(/input:focus, select:focus, textarea:focus \{[^}]*outline: 0/);
    expect(html).toContain("{ connected: 'Connected', failed: 'Failed', disabled: 'Off', 'needs-auth': 'Sign-in needed' }");
    expect(html).toContain('.setting.modified .t::after');
  });

  it('tells the user what to do when a list is empty', () => {
    expect(html).toContain('No custom agents yet. Select New agent to add one.');
    expect(html).toContain('Browse the catalog to install one.');
    expect(html).not.toContain('--vscode-testing-iconPassed');
  });

  it('has one Save/Discard bar instead of per-section save buttons', () => {
    for (const old of ['save-model', 'save-agents', 'save-permissions', 'save-display']) expect(html).not.toContain(`id="${old}"`);
    expect(html).toContain('id="save-all"');
    expect(html).toContain('id="discard-all"');
  });

  it('never builds markup from raw values (escaping, .value assignment)', () => {
    expect(html).not.toMatch(/value="' \+/);
    expect(html).not.toMatch(/>' \+ a\./);
    expect(html).toContain('function esc(');
  });

  it('keeps the draft when switching sections and says when search finds nothing', () => {
    const show = html.slice(html.indexOf('function showSection('), html.indexOf('function renderSearch('));
    expect(show).not.toContain('draft =');
    expect(html).toContain('No settings match');
  });

  it('saves an API key on Enter and lets the same settings file be imported again', () => {
    expect(html).toContain("if (e.key === 'Enter' && !save.disabled) { e.preventDefault(); save.click(); }");
    expect(html).toMatch(/const file = e\.target\.files\[0\];\s*\/\/[^\n]*\n\s*e\.target\.value = '';/);
    expect(html).toContain('URL.revokeObjectURL(a.href)');
  });

  it('brings a new agent into view and marks the Agents row as modified', () => {
    expect(html).toContain('function focusAgent(i)');
    expect(html.match(/focusAgent\(draft\.agents\.length - 1\)/g)).toHaveLength(1);
    expect(html).toContain("agents: 'row-agents'");
  });

  it('emits an inline script that parses', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBe(1);
    expect(() => new Function(scripts[0]!)).not.toThrow();
  });
});

describe('combo boxes on the Settings page', () => {
  const html = getSettingsHtml({ scriptUri: 'vscode-resource:/dist/webview/settings-ui.js', cspSource: 'vscode-resource:' });

  it('gives the compaction and sub-agent model fields a list that still takes any text', () => {
    for (const id of ['compaction-model', 'subagent-model']) {
      expect(html, id).toMatch(new RegExp('<div class="ik-combo" data-combo="models"><input type="text" id="' + id + '" class="ik-input ik-input--mono" role="combobox"'));
    }
    expect(html).toContain('class="ik-combo__toggle"');
  });

  it('builds every combo with one function that the page script defines', () => {
    expect(html).toContain('function makeCombo(');
    expect(html).toContain('FS.modelGroups(');
    expect(html).toContain('FS.filterGroups(');
    expect(html).toContain('FS.isKnownValue(');
  });

  it('keeps a saved value the list does not know, and says so', () => {
    expect(html).toContain('Not in the list. Forge keeps it as typed.');
    expect(html).toContain('Use what I typed');
  });

  it('reads the alias map from the loaded config and uses the one list for every combo', () => {
    expect(html).toContain('aliases = msg.config.aliases || {}');
  });
});

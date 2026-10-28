import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { CHAT_CSS } from '../src/chat/html.js';

describe('Chat polish guard (RB-8, on the design system since RB-83)', () => {
  it('colour is a role; the amber --ember is gone', () => {
    expect(chatHtml()).not.toContain('--ember');
  });

  it('chat: working is --ion, a pending approval is --warning, Autonomous is --danger', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.cursor \{[^}]*background: var\(--ion\)/);
    expect(html).toMatch(/\.tool-row \.st\.spin \{[^}]*var\(--ion\)/);
    expect(html).toMatch(/\.approval \{ border: 1px solid var\(--warning\)/);
    expect(html).toMatch(/\.approval \.kind \{[^}]*color: var\(--warning\)/);
    expect(html).toMatch(/\.cfoot \.auto\.on \{ color: var\(--danger\)/);
    // The note is a tinted banner with a danger edge and icon; its text stays body ink so it reads on the tint in every theme.
    expect(html).toMatch(/#auto-note \{[^}]*color-mix\(in srgb, var\(--danger\)[^}]*border-left: 3px solid var\(--danger\)/);
    expect(html).toMatch(/#auto-note svg \{[^}]*color: var\(--danger\)/);
  });

  describe('chat buttons come from the design system (RB-7, RB-8, RB-83)', () => {
    const html = chatHtml();
    const baseRule = html.match(/^  button \{[^}]*\}/m)?.[0] ?? '';

    it('the plain button rule is a reset, not a filled look', () => {
      expect(baseRule).not.toBe('');
      expect(baseRule).not.toContain('padding: 4px 10px');
      expect(baseRule).not.toMatch(/background: var\(--ion\)/);
    });

    it('the page does not restyle primary, secondary or link: it uses ik-btn', () => {
      expect(CHAT_CSS).not.toMatch(/button\.(primary|secondary|link)/);
      expect(html).toContain('<button id="send" class="ik-btn ik-btn--primary" type="button"');
      expect(html).toContain('class="ik-btn ik-btn--secondary deny-note"');
      expect(html).toContain("b.className = a.secondary ? 'ik-btn ik-btn--secondary' : 'ik-btn ik-btn--primary'");
      expect(html).toContain("b.className = secondary ? 'ik-btn ik-btn--secondary' : 'ik-btn ik-btn--primary'");
    });

    it('link buttons are not re-reset per parent', () => {
      expect(html).not.toMatch(/\.(approval|run \.l2|run \.rf) \.link \{ background: none/);
    });
  });

  it('chat takes its colour, size and type only from design tokens: no host variables, no old names', () => {
    expect(CHAT_CSS).not.toContain('--vscode-');
    expect(CHAT_CSS).not.toMatch(/var\(--(fg|muted|hair|edge|chip-edge|ok|err|warn|sunken|sel|bubble|canvas|bg|accent|r-s|r-m|fs-[a-z]+)(?![a-z-])/);
  });

  it('chat: the panel opens just below the toolbar however far it wrapped (C1)', () => {
    expect(chatHtml()).toContain("panelEl.style.top = document.getElementById('toolbar').getBoundingClientRect().bottom + 'px'");
  });
});

describe('Settings: which rows save instantly (S1) and the narrow nav (S5)', () => {
  const html = getSettingsHtml();
  const section = (id: string) => html.slice(html.indexOf(`<section id="sec-${id}"`), html.indexOf('</section>', html.indexOf(`<section id="sec-${id}"`)));

  it.each(['keys', 'mcp', 'skills', 'backup'])('%s: the heading says the actions apply at once', (id) => {
    expect(section(id).match(/<h2>[\s\S]*?<\/h2>/)?.[0]).toContain('<span class="ik-badge ik-badge--outline">Saves instantly</span>');
  });

  it('the always-allowed commands row says its removals apply at once', () => {
    expect(html.match(/id="row-allowed"><div class="t">[^<]*<span class="ik-badge ik-badge--outline">Saves instantly<\/span>/)).not.toBeNull();
  });

  it.each(['model', 'agents', 'perm', 'display'])('%s: draft sections are not tagged as instant', (id) => {
    const body = section(id).replace(/id="row-allowed">[\s\S]*?<\/div><div class="d">/, '');
    expect(body).not.toContain('Saves instantly');
  });

  it('narrow screens no longer wrap the section buttons: M6 replaced the strip with a picker', () => {
    expect(html).toContain('<div class="navlist">');
    const narrow = html.slice(html.indexOf('@media (max-width: 560px)'), html.indexOf('@media (prefers-reduced-motion'));
    expect(narrow).not.toMatch(/nav {[^}]*flex-wrap: wrap/);
  });
});

describe('Settings: Ask / Allow / Block and short help (S4)', () => {
  const html = getSettingsHtml();

  it('each tool permission is a three-choice group of radios (ik-seg), not a select', () => {
    expect(html).toContain("segGroup('tool-' + t");
    expect(html).toContain("[['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']]");
    expect(html).toContain("grp.className = 'ik-seg'");
    expect(html).toContain("grp.setAttribute('role', 'group')");
    expect(html).toContain("r.type = 'radio'");
    expect(html).not.toMatch(/sel\.setAttribute\('aria-label', t \+ ': ask, allow or block'\)/);
  });

  it('a tool that must always ask cannot be set to Allow, and the segment says why', () => {
    expect(html).toContain("askOnlyTools.indexOf(t) >= 0 ? { allow: 'This tool always asks' } : null");
    expect(html).toContain('r.disabled = true; l.title = disabled[o[0]]');
  });

  it('every static lead and help line is at most two sentences and 200 characters', () => {
    const texts = [...html.matchAll(/<(?:p class="lead"|div class="d")[^>]*>([\s\S]*?)<\/(?:p|div)>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '').trim());
    expect(texts.length).toBeGreaterThan(8);
    const long = texts.filter((t) => t.split(/[.!?](?:\s|$)/).filter(Boolean).length > 2 || t.length > 200);
    expect(long).toEqual([]);
  });
});

describe('Chat: consecutive steps are one group (C8)', () => {
  const html = chatHtml();

  it('grouping is structural, not a negative margin that assumes the message gap', () => {
    expect(html).not.toMatch(/margin-top: -12px/);
    expect(html).toMatch(/\.steps \{ display: flex; flex-direction: column; gap: 2px; \}/);
  });

  it('tool calls, tool results and approval outcomes all go through appendStep', () => {
    expect(html).toContain('function appendStep(el)');
    expect((html.match(/appendStep\(/g) ?? []).length).toBeGreaterThanOrEqual(4); // definition + 3 uses
    expect(html).toMatch(/appendStep\(row\);\s*\n\s*toolEls\.set\(id, row\);/);
    expect(html).toMatch(/row\.id = 'tool-' \+ id;\s*\n\s*appendStep\(row\);/);
  });

  it('a group of three or more steps says how many', () => {
    expect(html).toContain("head.className = 'steps-head'");
    // The count and the word come from stepsHeadParts (why-ran.ts), which keeps "from three steps" when nothing ran unasked.
    expect(html).toContain('UI.stepsHeadParts(n, counts)');
    expect(html).toContain("n >= 3 ? [String(n), 'steps'] : undefined");
  });
});

describe('Chat: approval card puts the command first and names the risk (C7)', () => {
  const html = chatHtml();

  it('a destructive card colours its label and border, not the whole sentence', () => {
    expect(html).not.toMatch(/\.approval\.destructive \.q \{/);
    expect(html).toMatch(/\.approval\.destructive \.kind \{[^}]*color: var\(--danger\)/);
  });

  it('the command or path is a code-styled block that wraps', () => {
    expect(html).toMatch(/\.approval \.target \{[^}]*var\(--bg-sunken\)[^}]*overflow-wrap: anywhere/);
    // A shell command gets its own block: wraps, stops at three lines, opens in full from "Show full command".
    expect(html).toMatch(/\.approval \.cmd \{[^}]*var\(--bg-sunken\)/);
    expect(html).toMatch(/\.approval \.cmd code \{[^}]*overflow-wrap: anywhere[^}]*-webkit-line-clamp: 3/);
    expect(html).toMatch(/\.approval \.cmd\.open code \{[^}]*-webkit-line-clamp: unset/);
    expect(html).toContain('Show full command');
  });

  it('the label says in words what is needed and how a destructive run is confirmed', () => {
    expect(html).toContain("'Destructive'");
    expect(html).toContain("'Hold to confirm'");
    expect(html).toContain("'needs you'");
  });

  it('the plan is a content card: hairline edge, a segment per step, icons that are not text glyphs', () => {
    expect(html).toMatch(/#todo-chip \{[^}]*border: 1px solid var\(--line-subtle\)/);
    expect(html).toMatch(/#todo-bar span\.done \{ background: var\(--success\)/);
    expect(html).toMatch(/#todo-bar span\.doing \{ background: var\(--ion\)/);
    expect(html).toMatch(/#todo-toggle \{[^}]*min-height: 36px/);
    expect(html).not.toContain("'✓ '");
  });
});

describe('Chat: mode and model sit in the composer, the header keeps actions (C6)', () => {
  const html = chatHtml();
  const toolbar = html.slice(html.indexOf('<div id="toolbar"'), html.indexOf('<div id="panel"'));
  const composer = html.slice(html.indexOf('<div class="composer">'), html.indexOf('<div id="voice-status"'));

  it('the header no longer holds the mode select or the model button', () => {
    expect(toolbar).not.toContain('id="mode"');
    expect(toolbar).not.toContain('id="model-label"');
    expect(toolbar).not.toContain('id="model-menu"');
    for (const id of ['new-chat', 'history-btn', 'more-btn']) expect(toolbar).toContain(`id="${id}"`);
  });

  it('the composer holds mode, model and the model picker, in a chips row above the buttons', () => {
    expect(composer).toContain('<div class="cchips">');
    expect(composer.indexOf('id="mode"')).toBeGreaterThan(composer.indexOf('class="cchips"'));
    expect(composer.indexOf('id="model-label"')).toBeLessThan(composer.indexOf('class="cfoot"'));
    // The chips head the composer, above the text box, on a sunken strip with a hairline under it.
    expect(composer.indexOf('class="cchips"')).toBeLessThan(composer.indexOf('id="input"'));
    expect(html).toMatch(/\.cchips \{[^}]*background: var\(--bg-sunken\)[^}]*border-bottom: 1px solid var\(--line-subtle\)/);
    expect(html).toContain('id="model-menu"');
    expect(html.indexOf('id="model-menu"')).toBeGreaterThan(html.indexOf('id="input-area"'));
  });

  it('the model picker opens upward from the composer', () => {
    expect(html).toMatch(/#model-menu \{[^}]*bottom: calc\(100% \+ 2px\)/);
    expect(html).not.toMatch(/#model-menu \{[^}]*top: calc\(100% \+ 2px\)/);
    expect(html).toMatch(/#input-area \{[^}]*position: relative/);
  });

  it('chip styles target the composer, not the old toolbar', () => {
    expect(html).toMatch(/\.cchips select option \{ background: var\(--bg-raised/);
    expect(html).not.toMatch(/#toolbar select/);
    expect(html).not.toMatch(/#toolbar \.model/);
  });
});

describe('Edges, depth and selection (RB-8, tokens in the design-system test)', () => {
  it('chat: fill means content, edge means control', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.composer \{ border: 1px solid var\(--line-control\)[^}]*box-shadow: var\(--elev-1\)/);
    expect(html).toMatch(/\.cchips select \{[^}]*border: 1px solid var\(--line-control\)/);
    expect(html).toMatch(/\.cchips \.model \{[^}]*border: 1px solid var\(--line-control\)/);
    expect(html).toMatch(/\.msg\.user \.body \{ background: var\(--bg-overlay\); border: 1px solid var\(--line-subtle\)/);
    expect(html).toMatch(/\.approval \{[^}]*box-shadow: var\(--elev-1\)/);
    for (const menu of ['#model-menu', '#more-menu', '#panel .rowmenu']) {
      expect(html.match(new RegExp(`${menu.replace(/[.#]/g, '\$&')} \{[^}]*\}`))?.[0], menu).toContain('box-shadow: var(--elev-3)');
    }
  });

  it('settings: rows have separators, the nav marks the current section, and cards are design-system cards', () => {
    const html = getSettingsHtml();
    expect(html).toMatch(/\.setting \{[^}]*border-bottom: var\(--border-hairline\) solid var\(--line-subtle\)/);
    expect(html).toContain('class="ik-navitem" data-section="model"');
    expect(html).toContain("'ik-card card'");
  });
});

describe('Every input takes its edge from the design system (H1, H2)', () => {
  it('chat: no rule takes an edge straight from the host', () => {
    expect(chatHtml()).not.toContain('vscode-input-border');
  });
});

describe('Settings tabs follow the ARIA tab pattern (H4)', () => {
  const html = getSettingsHtml();

  it('each tab names its panel, each panel names its tab, and only the selected tab is in the tab order', () => {
    expect(html).toMatch(/id="mcp-tab-installed" aria-selected="true" aria-controls="mcp-installed" tabindex="0"/);
    expect(html).toMatch(/id="mcp-tab-browse" aria-selected="false" aria-controls="mcp-browse" tabindex="-1"/);
    expect(html).toMatch(/<div id="mcp-installed" role="tabpanel" aria-labelledby="mcp-tab-installed"/);
    expect(html).toMatch(/<div id="mcp-browse" class="hidden" role="tabpanel" aria-labelledby="mcp-tab-browse"/);
  });

  it('arrow keys, Home and End move between tabs and selection updates tabindex', () => {
    expect(html).toContain("'ArrowRight'");
    expect(html).toContain("'ArrowLeft'");
    expect(html).toContain("'Home'");
    expect(html).toContain("'End'");
    expect(html).toMatch(/setAttribute\('tabindex', which === 'installed' \? '0' : '-1'\)/);
  });
});

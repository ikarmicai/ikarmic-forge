import { describe, expect, it } from 'vitest';

import { agentManagerHtml } from '../src/agent-manager/manager-html.js';
import { chatHtml } from '../src/chat/html.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { BASE_CSS } from '../src/webview-base-css.js';

const pages: Array<[string, string]> = [
  ['chat', chatHtml()],
  ['settings', getSettingsHtml()],
  ['agent manager', agentManagerHtml()],
];

describe('UI polish guard (RB-8)', () => {
  it.each(pages)('%s: no text smaller than 12px', (_name, html) => {
    expect(html).toMatch(/--fs-xs: 12px/);
    const small = [
      ...html.matchAll(/font(?:-size)?:\s*(?:[a-z-]+\s+)?(\d+(?:\.\d+)?)px/g),
      // The same size set from the page script: style.fontSize = '11px'.
      ...html.matchAll(/fontSize\s*=\s*'(\d+(?:\.\d+)?)px'/g),
    ].filter((m) => Number(m[1]) < 12).map((m) => m[0]);
    expect(small).toEqual([]);
  });

  it.each(pages)('%s: no literal rgba() colour outside a VS Code variable fallback', (_name, html) => {
    const withoutFallbacks = html.replace(/var\(--vscode-[a-zA-Z-]+,\s*rgba\([^)]*\)\)/g, '');
    expect(withoutFallbacks).not.toMatch(/rgba\(/);
  });

  it.each(pages)('%s: --err is the text-safe error colour, not the chart red', (_name, html) => {
    expect(html).toMatch(/--err: var\(--vscode-errorForeground/);
  });

  it('settings: the error badge is a tint with error text, not error-red with editor-background text', () => {
    const rule = getSettingsHtml().match(/\.badge\.err \{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toMatch(/background: var\(--err\)/);
    expect(rule).not.toMatch(/color: var\(--vscode-editor-background\)/);
    expect(rule).toMatch(/color-mix\(/);
  });

  it.each(pages)('%s: takes tokens, focus ring and link buttons from the shared base, once', (_name, html) => {
    expect(html).toContain(BASE_CSS);
    expect(html.split('--fs-xs:').length - 1).toBe(1);
    expect((html.match(/^\s*button\.link \{/gm) ?? []).length).toBeLessThanOrEqual(2); // base + settings sizing extension
    expect(html).toMatch(/:focus-visible \{ outline: 2px solid var\(--vscode-focusBorder/);
    expect(html).not.toMatch(/:focus-visible \{ outline: 1px/);
  });

  it.each(pages)('%s: colour is a role; the amber --ember is gone', (_name, html) => {
    expect(html).not.toContain('--ember');
  });

  it('chat: working is --ion, a pending approval is --warn, Autonomous is --err', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.cursor \{[^}]*background: var\(--ion\)/);
    expect(html).toMatch(/\.tool-row \.st\.spin \{[^}]*var\(--ion\)/);
    expect(html).toMatch(/\.approval \{ border: 1px solid var\(--warn\)/);
    expect(html).toMatch(/\.approval \.kind \{[^}]*color: var\(--warn\)/);
    expect(html).toMatch(/\.cfoot \.auto\.on \{ color: var\(--err\)/);
    // The note is a tinted banner with an --err edge and icon; its text stays --fg so it reads on the tint in every theme.
    expect(html).toMatch(/#auto-note \{[^}]*color-mix\(in srgb, var\(--err\)[^}]*border-left: 3px solid var\(--err\)/);
    expect(html).toMatch(/#auto-note svg \{[^}]*color: var\(--err\)/);
  });

  describe('chat buttons are opt-in (RB-7, RB-8)', () => {
    const html = chatHtml();
    const baseRule = html.match(/^  button \{[^}]*\}/m)?.[0] ?? '';

    it('the plain button rule is a reset, not the VS Code primary look', () => {
      expect(baseRule).not.toBe('');
      expect(baseRule).not.toContain('vscode-button-background');
      expect(baseRule).not.toContain('padding: 4px 10px');
    });

    it('primary and secondary are variants with their own padding and hover', () => {
      expect(html).toMatch(/button\.primary \{[^}]*vscode-button-background[^}]*padding: 4px 10px/);
      expect(html).toMatch(/button\.primary:hover \{[^}]*vscode-button-hoverBackground/);
      expect(html).toMatch(/button\.secondary \{[^}]*padding: 4px 10px/);
    });

    it('buttons that used to be primary by default now say so', () => {
      expect(html).toContain('<button id="send" class="primary" type="button"');
      expect(html).toContain('class="secondary deny-note"');
      expect(html).toContain("b.className = a.secondary ? 'secondary' : 'primary'");
      expect(html).toContain("b.className = secondary ? 'secondary' : 'primary'");
    });

    it('link buttons are not re-reset per parent', () => {
      expect(html).not.toMatch(/\.(approval|run \.l2|run \.rf) \.link \{ background: none/);
    });
  });

  it('base: --ion follows the theme class', () => {
    expect(BASE_CSS).toMatch(/body\.vscode-light \{[^}]*--ion: #0a7d75;/);
  });

  it('chat: the panel opens just below the toolbar however far it wrapped (C1)', () => {
    expect(chatHtml()).toContain("panelEl.style.top = document.getElementById('toolbar').getBoundingClientRect().bottom + 'px'");
  });
});

describe('Settings: which rows save instantly (S1) and the narrow nav (S5)', () => {
  const html = getSettingsHtml();
  const section = (id: string) => html.slice(html.indexOf(`<section id="sec-${id}"`), html.indexOf('</section>', html.indexOf(`<section id="sec-${id}"`)));

  it.each(['keys', 'mcp', 'skills', 'backup'])('%s: the heading says the actions apply at once', (id) => {
    expect(section(id).match(/<h2>[\s\S]*?<\/h2>/)?.[0]).toContain('<span class="pill">Saves instantly</span>');
  });

  it('the always-allowed commands row says its removals apply at once', () => {
    expect(html.match(/id="row-allowed"><div class="t">[^<]*<span class="pill">Saves instantly<\/span>/)).not.toBeNull();
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

  it('each tool permission is a three-button group, not a select', () => {
    expect(html).toContain("grp.className = 'seg'");
    expect(html).toContain("grp.setAttribute('role', 'group')");
    expect(html).toContain("b.setAttribute('aria-pressed'");
    expect(html).not.toMatch(/sel\.setAttribute\('aria-label', t \+ ': ask, allow or block'\)/);
    expect(html).toMatch(/\.seg button\[aria-pressed="true"\]/);
  });

  it('a tool that must always ask cannot be set to Allow', () => {
    expect(html).toMatch(/askOnlyTools\.indexOf\(t\) >= 0\) \{ b\.disabled = true/);
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
    expect(html).toMatch(/\.approval\.destructive \.kind \{[^}]*color: var\(--err\)/);
  });

  it('the command or path is a code-styled block that wraps', () => {
    expect(html).toMatch(/\.approval \.target \{[^}]*var\(--sunken\)[^}]*overflow-wrap: anywhere/);
    // A shell command gets its own block: wraps, stops at three lines, opens in full from "Show full command".
    expect(html).toMatch(/\.approval \.cmd \{[^}]*var\(--sunken\)/);
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
    expect(html).toMatch(/#todo-chip \{[^}]*border: 1px solid var\(--hair\)/);
    expect(html).toMatch(/#todo-bar span\.done \{ background: var\(--ok\)/);
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
    expect(html).toMatch(/\.cchips \{[^}]*background: var\(--sunken\)[^}]*border-bottom: 1px solid var\(--hair\)/);
    expect(html).toContain('id="model-menu"');
    expect(html.indexOf('id="model-menu"')).toBeGreaterThan(html.indexOf('id="input-area"'));
  });

  it('the model picker opens upward from the composer', () => {
    expect(html).toMatch(/#model-menu \{[^}]*bottom: calc\(100% \+ 2px\)/);
    expect(html).not.toMatch(/#model-menu \{[^}]*top: calc\(100% \+ 2px\)/);
    expect(html).toMatch(/#input-area \{[^}]*position: relative/);
  });

  it('chip styles target the composer, not the old toolbar', () => {
    expect(html).toMatch(/\.cchips select option \{ background: var\(--vscode-dropdown-background/);
    expect(html).not.toMatch(/#toolbar select/);
    expect(html).not.toMatch(/#toolbar \.model/);
  });
});

describe('Light theme: edges, depth and selection (RB-8)', () => {
  const light = BASE_CSS.match(/body\.vscode-light \{([^}]*)\}/)?.[1] ?? '';
  const tok = (name: string) => light.match(new RegExp(`${name}: (#[0-9a-fA-F]{6})`))?.[1];
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it('the light override defines every token', () => {
    for (const t of ['--ion', '--err', '--edge', '--hair', '--canvas', '--sel', '--sunken']) expect(tok(t), t).toBeDefined();
    expect(light).toMatch(/--elev-1: [^;]*color-mix/);
    expect(light).toMatch(/--elev-3: [^;]*color-mix/);
  });

  it('light: control edges are 3:1 on white, error text is 4.5:1 (the host errorForeground is only 3.35:1 in Light Modern)', () => {
    expect(ratio(tok('--edge')!, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(ratio(tok('--err')!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tok('--ion')!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('light: a hairline is decorative (under 3:1) and a selected row is a tint, so neither can be mistaken for a control edge', () => {
    expect(ratio(tok('--hair')!, '#ffffff')).toBeLessThan(3);
    expect(ratio(tok('--sel')!, '#ffffff')).toBeLessThan(1.5);
  });

  it('chat: fill means content, edge means control', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.composer \{ border: 1px solid var\(--edge\)[^}]*box-shadow: var\(--elev-1\)/);
    expect(html).toMatch(/button\.secondary \{[^}]*border: 1px solid var\(--edge\)/);
    expect(html).toMatch(/\.cchips select \{[^}]*border: 1px solid var\(--chip-edge\)/);
    expect(html).toMatch(/\.cchips \.model \{[^}]*border: 1px solid var\(--chip-edge\)/);
    expect(html).toMatch(/\.msg\.user \.body \{ background: var\(--bubble\); border: 1px solid var\(--hair\)/);
    expect(html).toMatch(/\.approval \{[^}]*box-shadow: var\(--elev-1\)/);
    for (const menu of ['#model-menu', '#more-menu', '#panel .rowmenu']) {
      expect(html.match(new RegExp(`${menu.replace(/[.#]/g, '\$&')} \{[^}]*\}`))?.[0], menu).toContain('box-shadow: var(--elev-3)');
    }
  });

  it('settings: controls have an edge, rows have separators, nav is a panel with a marked selection', () => {
    const html = getSettingsHtml();
    expect(html).toMatch(/input, select, textarea \{[^}]*border: 1px solid var\(--edge\)/);
    expect(html).toMatch(/\.seg \{[^}]*border: 1px solid var\(--edge\)/);
    expect(html).toMatch(/\.setting \{[^}]*border-bottom: 1px solid var\(--hair\)/);
    expect(html).toMatch(/nav \{[^}]*background: var\(--canvas\)/);
    expect(html).toMatch(/nav button\[aria-current="true"\] \{[^}]*background: var\(--sel\)[^}]*inset 2px 0 0 var\(--ion\)/);
    expect(html).toMatch(/\.card \{[^}]*box-shadow: var\(--elev-1\)/);
  });
});

describe('Dark theme edges and every input (H1, H2)', () => {
  const dark = BASE_CSS.match(/body\.vscode-dark \{([^}]*)\}/)?.[1] ?? '';
  const tok = (name: string) => dark.match(new RegExp(`${name}: (#[0-9a-fA-F]{6})`))?.[1];
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it('dark: control edges are 3:1 on the editor and on an input fill (host input border is 1.49:1)', () => {
    for (const name of ['--edge', '--chip-edge']) {
      expect(tok(name), name).toBeDefined();
      expect(ratio(tok(name)!, '#1f1f1f'), `${name} on editor`).toBeGreaterThanOrEqual(3);
      expect(ratio(tok(name)!, '#313131'), `${name} on input fill`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(pages)('%s: no rule takes its input edge straight from the host', (_name, html) => {
    expect(html.replace(BASE_CSS, '')).not.toContain('vscode-input-border');
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

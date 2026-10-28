/**
 * Guard for the iKarmic UI design system (docs/design-system.md, src/design/). It fails when a token or component is
 * written in code and not in the spec (or the reverse), when a colour or size is hard-coded outside the tokens, when
 * contrast drops below the rule, and, for every page listed in MIGRATED_PAGES, when the page restyles instead of using
 * the system. Add a page to the list in the same change that moves it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENT_MANAGER_CSS, agentManagerHtml } from '../src/agent-manager/manager-html.js';
import { CHAT_CSS, chatHtml } from '../src/chat/html.js';
import { SETTINGS_CSS, getSettingsHtml } from '../src/settings/settings-html.js';
import { COMPONENTS_CSS, DARK, DENSITY, DESIGN_CSS, LIGHT, SHARED, TOKENS_CSS } from '../src/design/index.js';

const DOC = readFileSync(path.resolve(__dirname, '../../../docs/design-system.md'), 'utf8');

// ---- contrast ----
const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// ---- scanning ----
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** CSS outside the forced-colors and reduced-motion blocks and keyframes, for rules about ordinary components. */
const ordinary = (css: string): string =>
  stripComments(css)
    .replace(/@media \(forced-colors: active\) \{[\s\S]*?\n\}\n/, '')
    .replace(/@media \(prefers-reduced-motion: reduce\) \{[^\n]*\}\n/, '')
    .replace(/@keyframes [\w-]+ \{[^}]*\}/, '');
const literalColours = (css: string): string[] =>
  [...stripComments(css).matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)].map((m) => m[0]);
const smallText = (css: string): string[] => {
  const out: string[] = [];
  for (const m of stripComments(css).matchAll(/\bfont(?:-size)?:\s*([^;}]*)/g)) {
    for (const px of (m[1] ?? '').matchAll(/(\d+(?:\.\d+)?)px/g)) if (Number(px[1]) < 12) out.push(m[0]);
  }
  return out;
};

/** The rules a page that has moved onto the system must keep. Returns what is wrong, empty when it is fine. */
export function pageViolations(css: string, html: string): string[] {
  const problems: string[] = [];
  const colours = literalColours(css);
  if (colours.length > 0) problems.push(`literal colours: ${[...new Set(colours)].join(', ')}`);
  const small = smallText(css);
  if (small.length > 0) problems.push(`text under 12px: ${small.join(' | ')}`);
  // The same rules for what the page script sets: a size under 12px, a colour written as a literal (an #id selector is not one).
  const scripts = (html.match(/<script>[\s\S]*?<\/script>/g) ?? []).join('\n');
  const scriptSmall = [...scripts.matchAll(/fontSize\s*=\s*'(\d+(?:\.\d+)?)px'|font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1] ?? m[2]) < 12).map((m) => m[0]);
  if (scriptSmall.length > 0) problems.push(`script sets text under 12px: ${scriptSmall.join(' | ')}`);
  const scriptColours = [...scripts.matchAll(/['"]#[0-9a-fA-F]{3,8}['"]|\brgba?\(|\bhsla?\(/g)].map((m) => m[0]);
  if (scriptColours.length > 0) problems.push(`script holds literal colours: ${[...new Set(scriptColours)].join(', ')}`);
  const documented = new Set(DOC.match(/`ik-[a-z0-9_-]*[a-z0-9]`/g)?.map((s) => s.slice(1, -1)));
  // Every ik- name anywhere in the page, including classes the script builds, not only the ones in the static markup.
  const used = new Set(html.replace(/@keyframes [\w-]+|animation: [\w-]+/g, '').match(/\bik-[a-z0-9_-]*[a-z0-9]/g));
  for (const c of used) if (!documented.has(c)) problems.push(`undocumented class ${c}`);
  if (/body[^>]*class="/.test(html) && !/class="[^"]*\bik-root\b/.test(html)) problems.push('body is missing ik-root');
  if (!/data-density="(compact|roomy)"/.test(html)) problems.push('body does not declare a density');
  return problems;
}

/** Pages that have moved onto the system. Empty until the first one does. */
const MIGRATED_PAGES: Array<{ name: string; css: () => string; html: () => string }> = [
  { name: 'Agent Manager', css: () => AGENT_MANAGER_CSS, html: () => agentManagerHtml() },
  { name: 'Settings', css: () => SETTINGS_CSS, html: () => getSettingsHtml() },
  { name: 'Chat', css: () => CHAT_CSS, html: () => chatHtml() },
];

describe('design system: tokens', () => {
  it('both themes define exactly the same colour tokens, and so does high contrast', () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
    for (const key of Object.keys(DARK)) {
      const count = TOKENS_CSS.split(`--${key}:`).length - 1;
      expect({ key, count }).toEqual({ key, count: 3 });
    }
  });

  it('high-contrast themes take the editor\'s colours', () => {
    const block = /body\.vscode-high-contrast, body\.vscode-high-contrast-light \{([^}]*)\}/.exec(TOKENS_CSS)?.[1] ?? '';
    expect(block).toContain('--ink-strong: var(--vscode-foreground)');
    expect(block).toContain('--bg-canvas: var(--vscode-editor-background)');
    expect(block).toContain('--focus-ring: var(--vscode-focusBorder');
  });

  it('no type style is under 12px', () => {
    for (const [name, value] of Object.entries(SHARED)) {
      if (!name.startsWith('text-')) continue;
      const size = /(\d+)px\//.exec(value)?.[1];
      expect({ name, ok: Number(size) >= 12 }).toEqual({ name, ok: true });
    }
  });

  it('a control is 24px or more in every density, and roomy is never smaller than compact', () => {
    for (const key of Object.keys(DENSITY.compact) as Array<keyof typeof DENSITY.compact>) {
      expect(parseInt(DENSITY.roomy[key], 10)).toBeGreaterThanOrEqual(parseInt(DENSITY.compact[key], 10));
    }
    expect(parseInt(DENSITY.compact.control, 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(DENSITY.compact['control-lg'], 10)).toBeGreaterThan(parseInt(DENSITY.compact.control, 10));
  });

  describe.each([
    ['dark', DARK as Record<string, string>],
    ['light', LIGHT as Record<string, string>],
  ])('contrast, %s theme', (_name, t) => {
    const surfaces = ['bg-canvas', 'bg-surface', 'bg-raised', 'bg-overlay', 'bg-sunken'];
    it('body and muted text are 4.5:1 on every surface', () => {
      for (const ink of ['ink-strong', 'ink-body', 'ink-muted']) {
        for (const bg of surfaces) expect({ ink, bg, ok: ratio(t[ink]!, t[bg]!) >= 4.5 }).toEqual({ ink, bg, ok: true });
      }
    });
    it('accent and status text is 4.5:1 on the surfaces they sit on and on their own tint', () => {
      const pairs: Array<[string, string[]]> = [
        ['ion-text', ['bg-surface', 'bg-raised', 'ion-tint']],
        ['pulse', ['bg-surface', 'bg-raised', 'pulse-tint']],
        ['success', ['bg-surface', 'bg-raised', 'success-tint']],
        ['warning', ['bg-surface', 'bg-raised', 'warning-tint']],
        ['danger', ['bg-surface', 'bg-raised', 'danger-tint']],
        ['on-ion', ['ion']],
        ['code-ink', ['code-bg']],
      ];
      for (const [fg, bgs] of pairs) for (const bg of bgs) expect({ fg, bg, ok: ratio(t[fg]!, t[bg]!) >= 4.5 }).toEqual({ fg, bg, ok: true });
    });
    it('a control edge is 3:1 on the surfaces and a divider is decorative (under 3:1)', () => {
      for (const bg of ['bg-surface', 'bg-raised', 'bg-sunken']) expect(ratio(t['line-control']!, t[bg]!)).toBeGreaterThanOrEqual(3);
      for (const bg of ['bg-surface', 'bg-raised']) expect(ratio(t['line-subtle']!, t[bg]!)).toBeLessThan(3);
    });
    it('primary hover and pressed fills keep the label legible', () => {
      for (const fill of ['ion-hover', 'ion-pressed']) expect(ratio(t['on-ion']!, t[fill]!)).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('design system: components', () => {
  const css = ordinary(COMPONENTS_CSS);

  it('holds no literal colour (system colour keywords in the forced-colors block aside)', () => {
    expect(literalColours(COMPONENTS_CSS)).toEqual([]);
  });

  it('has no text under 12px', () => {
    expect(smallText(COMPONENTS_CSS)).toEqual([]);
  });

  it('every var(--x) it reads is a token, a density value or an editor variable', () => {
    const defined = new Set<string>([...Object.keys(DARK), ...Object.keys(SHARED), ...Object.keys(DENSITY.roomy)]);
    const missing = new Set<string>();
    for (const m of stripComments(COMPONENTS_CSS).matchAll(/var\(--([a-z0-9-]+)/g)) {
      const name = m[1]!;
      if (!defined.has(name) && !name.startsWith('vscode-')) missing.add(name);
    }
    expect([...missing]).toEqual([]);
  });

  it('uses only the documented fixed lengths; any other size is a token or a new, deliberate entry here', () => {
    const allowed = new Set(['1px', '2px', '3px', '4px', '12px', '14px', '20px', '72px', '440px']);
    const found = new Set<string>();
    for (const m of css.matchAll(/(?<![\w-])-?(\d+(?:\.\d+)?)px/g)) if (!allowed.has(`${m[1]}px`)) found.add(`${m[1]}px`);
    expect([...found]).toEqual([]);
  });

  it('uses only the radius tokens', () => {
    const bad = [...css.matchAll(/border-radius:\s*([^;}]*)/g)].map((m) => m[1]!.trim()).filter((v) => !/^(var\(--radius-[a-z]+\)|inherit|0|0 0 var\(--radius-md\) var\(--radius-md\))$/.test(v));
    expect(bad).toEqual([]);
  });

  it('every component with a border is listed in the forced-colors block', () => {
    const forced = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}\n/.exec(COMPONENTS_CSS)?.[1] ?? '';
    const missing = new Set<string>();
    for (const rule of css.split('}')) {
      const [selector, body] = rule.split('{');
      if (!selector || !body) continue;
      // A border that shows: not 0, none or transparent, and not a radius. (A [ ]* that may backtrack to nothing would let "border: 0" through.)
      if (!/\bborder(?:-(?!radius)[a-z]+)*:[ ]*(?![ ]|0\b|none|transparent)/.test(body) && !/\bborder-(?:left|right|top|bottom)-color/.test(body)) continue;
      const base = /\.(ik-[a-z0-9]+)/.exec(selector)?.[1];
      if (base && !forced.includes(`.${base}`)) missing.add(base);
    }
    expect([...missing]).toEqual([]);
  });

  it('has a focus ring rule and a reduced-motion rule', () => {
    expect(COMPONENTS_CSS).toContain(':focus-visible { outline: var(--border-strong) solid var(--focus-ring)');
    expect(COMPONENTS_CSS).toContain('prefers-reduced-motion');
  });

  it('is the design css a page loads: tokens first, then components', () => {
    expect(DESIGN_CSS.indexOf(TOKENS_CSS)).toBe(0);
    expect(DESIGN_CSS.indexOf(COMPONENTS_CSS)).toBe(TOKENS_CSS.length);
  });
});

describe('design system: the spec and the code agree', () => {
  const documented = new Set(DOC.match(/`ik-[a-z0-9_-]*[a-z0-9]`/g)?.map((s) => s.slice(1, -1)));

  it('every component class in the code is described in docs/design-system.md', () => {
    const inCode = new Set([...stripComments(COMPONENTS_CSS).matchAll(/\.(ik-[a-z0-9_-]*[a-z0-9])/g)].map((m) => m[1]!));
    expect([...inCode].filter((c) => !documented.has(c)).sort()).toEqual([]);
  });

  it('every class the spec names exists in the code', () => {
    const inCode = new Set([...stripComments(COMPONENTS_CSS).matchAll(/\.(ik-[a-z0-9_-]*[a-z0-9])/g)].map((m) => m[1]!));
    expect([...documented].filter((c) => !inCode.has(c)).sort()).toEqual([]);
  });

  it('every token is named in the spec', () => {
    const names = [...Object.keys(DARK), ...Object.keys(SHARED)];
    expect(names.filter((n) => !DOC.includes(`\`${n}\``)).sort()).toEqual([]);
    for (const key of Object.keys(DENSITY.roomy)) expect(DOC).toContain(`--${key}`);
  });

  it('the spec numbers its rules and the density table matches the code', () => {
    expect(DOC).toMatch(/\*\*DS-1 Tokens only\./);
    expect(DOC).toMatch(/\*\*DS-14 Words\./);
    expect(DOC).toContain(`| \`--control\` (every control) | ${parseInt(DENSITY.compact.control, 10)} | ${parseInt(DENSITY.roomy.control, 10)} |`);
    expect(DOC).toContain(`| \`--control-lg\` (the main action) | ${parseInt(DENSITY.compact['control-lg'], 10)} | ${parseInt(DENSITY.roomy['control-lg'], 10)} |`);
  });

});

describe('design system: a page that has moved onto it', () => {
  it('is caught when it restyles: a literal colour, text under 12px, an unknown class or no density', () => {
    const bad = pageViolations('.x { color: #fff; font-size: 11px; background: rgba(0,0,0,.4) }', '<body class="ik-root"><button class="ik-btn ik-btn--glow">x</button></body>');
    expect(bad.join(' | ')).toMatch(/literal colours: #fff, rgba\(/);
    expect(bad.join(' | ')).toMatch(/text under 12px/);
    expect(bad.join(' | ')).toMatch(/undocumented class ik-btn--glow/);
    expect(bad.join(' | ')).toMatch(/does not declare a density/);
  });

  it('is caught when its script sets a small size or a literal colour', () => {
    const html = '<body class="ik-root" data-density="compact"><script>el.style.fontSize = \'11px\'; el.style.color = \'#ff0000\'; q.closest(\'#adc-use\');</script></body>';
    const bad = pageViolations('.x { color: var(--ink-body); }', html).join(' | ');
    expect(bad).toMatch(/script sets text under 12px: fontSize = '11px'/);
    expect(bad).toMatch(/script holds literal colours: '#ff0000'/);
    expect(bad).not.toMatch(/adc-use/);
  });

  it('passes when it only uses tokens and documented classes', () => {
    expect(pageViolations('.x { color: var(--ink-body); font: var(--text-body); }', '<body class="ik-root" data-density="roomy"><button class="ik-btn ik-btn--primary">Go</button></body>')).toEqual([]);
  });

  for (const page of MIGRATED_PAGES) {
    it(`${page.name} keeps to the system`, () => {
      expect(pageViolations(page.css(), page.html())).toEqual([]);
    });
  }
});

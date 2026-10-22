import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTING_ROWS, groupRows, splitHint } from '../src/settings/settings-rows.js';
import { BASE_CSS } from '../src/webview-base-css.js';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const block = (css: string, selector: RegExp) => css.match(selector)?.[1] ?? '';

describe('M1: targets are at least 24px tall', () => {
  const chat = chatHtml();
  it('link, primary and secondary buttons and tool-row summaries have a 24px floor', () => {
    expect(BASE_CSS).toMatch(/button\.link \{[^}]*min-height: 24px/);
    expect(chat).toMatch(/button\.primary \{[^}]*min-height: 24px/);
    expect(chat).toMatch(/button\.secondary \{[^}]*min-height: 24px/);
    expect(chat).toMatch(/\.tool-row > summary \{[^}]*min-height: 24px/);
    expect(getSettingsHtml()).toMatch(/input, select, textarea \{[^}]*min-height: 24px/);
  });
});

describe('M2: the success colour is text-safe', () => {
  it('dark and light --ok pass 4.5:1 on the editor', () => {
    const dark = block(BASE_CSS, /body\.vscode-dark \{([^}]*)\}/).match(/--ok: (#[0-9a-f]{6})/i)?.[1];
    const light = block(BASE_CSS, /body\.vscode-light \{([^}]*)\}/).match(/--ok: (#[0-9a-f]{6})/i)?.[1];
    expect(dark).toBeDefined();
    expect(light).toBeDefined();
    expect(ratio(dark!, '#1f1f1f')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('M3: forced colours keep structure and selection', () => {
  const forced = (html: string) => html.match(/@media \(forced-colors: active\) \{([\s\S]*?)\n  \}/)?.[1] ?? html.match(/@media \(forced-colors: active\) \{([^\n]*)\}/)?.[1] ?? '';
  it('chat outlines its cards, chips and composer', () => {
    const f = forced(chatHtml());
    for (const s of ['.question', '.composer', '.steps', '.cchips', '.empty-state .ex']) expect(f, s).toContain(s);
  });
  it('settings marks the pressed segment and the selected section with system colours', () => {
    const f = forced(getSettingsHtml());
    expect(f).toContain('.seg button[aria-pressed="true"]');
    expect(f).toContain('nav button[aria-current="true"]');
    expect(f).toContain('Highlight');
  });
});

describe('M4: long Settings pages have subheadings and a way back to the default', () => {
  it('groups rows by the setting family, keeps every row once, and puts one-off settings under Other last', () => {
    for (const section of ['context', 'safety', 'tools', 'git', 'advanced'] as const) {
      const rows = SETTING_ROWS.filter((r) => r.section === section);
      const groups = groupRows(rows);
      expect(groups.flatMap((g) => g.rows.map((r) => r.key)).sort(), section).toEqual(rows.map((r) => r.key).sort());
      for (const g of groups.filter((x) => x.label !== 'Other')) expect(g.rows.length, `${section}/${g.label}`).toBeGreaterThanOrEqual(2);
      const other = groups.findIndex((g) => g.label === 'Other');
      if (other >= 0) expect(other).toBe(groups.length - 1);
    }
  });
  it('names a family from its key', () => {
    const groups = groupRows(SETTING_ROWS.filter((r) => r.section === 'git'));
    expect(groups.map((g) => g.label)).toContain('Auto commit');
  });
  it('the page draws group headings and a Reset button only when the value differs from the default', () => {
    const html = getSettingsHtml();
    expect(html).toContain('FS.groupRows(');
    expect(html).toMatch(/className = 'group-label'/);
    expect(html).toMatch(/r\.default !== undefined/);
    expect(html).toContain("'Reset'");
  });
});

describe('M5: a magic zero is a hint beside the control, not part of the title', () => {
  it('splits "(0 = default)" from the label', () => {
    expect(splitHint('Texts per embedding request (0 = default)')).toEqual({ label: 'Texts per embedding request', hint: '0 = default' });
    expect(splitHint('Condense long chats')).toEqual({ label: 'Condense long chats', hint: '' });
  });
  it('no row label keeps a parenthetical zero meaning after the split', () => {
    for (const r of SETTING_ROWS) expect(splitHint(r.label).label, r.key).not.toMatch(/\(0 = /);
  });
  it('the page uses it', () => {
    expect(getSettingsHtml()).toContain('FS.splitHint(');
  });
});

describe('M6: narrow Settings uses a section picker, not a clipped strip', () => {
  const html = getSettingsHtml();
  it('has a labelled select with every section, hidden until the page is narrow', () => {
    const sel = html.match(/<select id="section-picker"[^>]*>([\s\S]*?)<\/select>/);
    expect(sel).not.toBeNull();
    expect(html).toMatch(/<select id="section-picker" aria-label="Settings section"/);
    for (const s of ['model', 'keys', 'providers', 'agents', 'mcp', 'skills', 'perm', 'context', 'safety', 'tools', 'git', 'advanced', 'display', 'backup']) {
      expect(sel![1], s).toContain(`value="${s}"`);
    }
    expect(html).toMatch(/#section-picker \{ display: none;/);
    const narrow = html.slice(html.indexOf('@media (max-width: 560px)'), html.indexOf('@media (prefers-reduced-motion'));
    expect(narrow).toMatch(/\.navlist \{ display: none; \}/);
    expect(narrow).toMatch(/#section-picker \{ display: block;/);
  });
  it('keeps the picker and the nav in step', () => {
    expect(html).toContain("$('section-picker').value = name");
    expect(html).toContain("$('section-picker').addEventListener('change'");
  });
});

describe('L1: the composer shows a real focus ring', () => {
  it('draws a 2px outline when the textarea has focus', () => {
    expect(chatHtml()).toMatch(/\.composer:focus-within \{[^}]*outline: 2px solid var\(--vscode-focusBorder/);
  });
});

describe('L2: a disabled Send says why', () => {
  const chat = chatHtml();
  it('sets a tooltip for an empty draft and for a running task', () => {
    expect(chat).toContain("sendBtn.title = ");
    expect(chat).toContain('Type a message to send');
    expect(chat).toContain('Forge is still working');
    // The button starts disabled, before any script runs, so the markup carries the reason too.
    expect(chat).toContain('id="send" class="primary" type="button" disabled title="Type a message to send"');
  });
});

describe('L3: the approval preview is padded like code', () => {
  const chat = chatHtml();
  it('uses a class instead of an inline style with no horizontal padding', () => {
    expect(chat).not.toContain('<pre class="preview" style="margin:6px 0 0');
    expect(chat).toMatch(/\.approval \.preview \{[^}]*padding: 8px 10px/);
  });
});

describe('L4: goal and todo share one row', () => {
  const chat = chatHtml();
  it('wraps both chips in one flex row', () => {
    expect(chat).toMatch(/<div id="chipbar">\s*<div id="goal-chip"[\s\S]*?<div id="todo-chip"/);
    expect(chat).toMatch(/#chipbar \{ display: flex; flex-wrap: wrap;/);
  });
});

describe('Context wave meter under the composer (C6)', () => {
  const chat = chatHtml();
  const header = chat.slice(chat.indexOf('<div id="toolbar"'), chat.indexOf('<div id="panel"'));
  const inputArea = chat.slice(chat.indexOf('<div id="input-area"'), chat.indexOf('<div id="voice-status"'));
  const meter = inputArea.slice(inputArea.indexOf('id="meter"') - 20);

  it('is out of the header and sits after the composer', () => {
    expect(header).not.toContain('id="meter"');
    expect(inputArea.indexOf('id="meter"')).toBeGreaterThan(inputArea.indexOf('class="cfoot"'));
  });

  it('is a button with a Context label, a percentage, a wave and the cost, that opens a details dialog', () => {
    expect(meter).toMatch(/<button type="button" class="meter-btn" id="meter-btn"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*aria-controls="meter-pop"/);
    expect(meter).toContain('<span class="m-label">Context</span>');
    for (const id of ['meter-text', 'meter-cost', 'meter-wave-a', 'meter-wave-b']) expect(meter, id).toContain(`id="${id}"`);
    expect(meter).toMatch(/<div id="meter-pop" role="dialog" aria-label="Context and cost details" hidden>/);
    expect(chat).not.toContain('meter-ring');
    expect(chat).not.toContain('meter-bar');
  });

  it('the wave is decoration: hidden from assistive tech, with the numbers as text beside it', () => {
    expect(meter).toMatch(/<span class="m-cap" aria-hidden="true">/);
  });

  it('announces only when the level changes, through a status region of its own', () => {
    expect(chat).toMatch(/<span id="meter-live" class="sr-only" role="status"><\/span>/);
    expect(chat).toContain('lastMeterLevel');
  });

  it('draws the wave from the helper, tones it, and speeds it up while a run works', () => {
    expect(chat).toContain("meterWaveA.setAttribute('d', UI.wavePath(");
    expect(chat).toContain("meterEl.classList.toggle('warn'");
    expect(chat).toContain("meterEl.classList.toggle('crit'");
    expect(chat).toContain("meterEl.classList.toggle('stream', running)");
  });

  it('opens and closes the details: button toggles, Escape and a click outside close, focus returns', () => {
    expect(chat).toContain("meterBtn.addEventListener('click'");
    expect(chat).toContain('function closeMeterPop(');
    expect(chat).toMatch(/closeMeterPop\(true\)/);
    expect(chat).toContain("meterPop.addEventListener('keydown'");
  });

  it('details show real figures only: used, left, chat cost, last-run tokens, time and step, plus Condense', () => {
    const pop = chat.slice(chat.indexOf('id="meter-pop"'), chat.indexOf('id="voice-status"'));
    for (const id of ['mp-used', 'mp-of', 'mp-cost', 'mp-in', 'mp-out', 'mp-time', 'mp-step', 'mp-model', 'mp-condense']) expect(pop, id).toContain(`id="${id}"`);
    expect(pop).not.toMatch(/cache hit|tok\/s/i);
  });

  it('styles: fill is the tone, the guide marks 80%, the popover is elevated, forced colours keep the shape', () => {
    expect(chat).toMatch(/\.m-cap \{[^}]*border: 1px solid var\(--edge\)/);
    expect(chat).toMatch(/\.meter\.warn \.m-cap \{[^}]*--wave: var\(--warn\)/);
    expect(chat).toMatch(/\.meter\.crit \.m-cap \{[^}]*--wave: var\(--err\)/);
    expect(chat).toContain('@keyframes wv');
    expect(chat).toMatch(/\.m-guide \{[^}]*top: 5\.6px/);
    expect(chat).toMatch(/#meter-pop \{[^}]*box-shadow: var\(--elev-3\)/);
    expect(chat).toMatch(/\.m-cap \{ border: 1px solid ButtonText; \}/);
  });
});

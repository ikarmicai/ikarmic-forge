import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';

/**
 * The Browse tab keeps every card the same height: a server that needs a key says so on its card and asks for the
 * key in a dialog. The behaviour (focus, Escape, the empty field) is pinned in test/ui/specs/mcp-key-dialog.spec.ts;
 * these pin the shape of the page script, which a unit test can read but not run.
 */
const html = getSettingsHtml();
const block = html.slice(html.indexOf('function renderMcpCatalog'), html.indexOf('// skills (immediate)'));
const dialog = block.slice(block.indexOf('function openKeyDialog'), block.indexOf('function mcpCard'));
const card = block.slice(block.indexOf('function mcpCard'));

describe('Browse tab: a card that needs a key', () => {
  it('says what the server needs before anyone clicks, in words', () => {
    expect(card).toContain('Needs a key');
    expect(card).toContain('Needs details');
    expect(card).toContain('No key needed');
  });

  it('opens a dialog with a verb button, never a greyed-out Install', () => {
    expect(card).toContain('Enter key');
    expect(card).toContain('Enter details');
    expect(block).not.toMatch(/\.disabled\s*=\s*!ready/);
    expect(block).not.toMatch(/Enter the .* first/);
  });

  it('keeps no key field inside the card, so every card stays the same height', () => {
    expect(card).not.toContain("type = 'password'");
    expect(dialog).toContain("type = 'password'");
  });
});

describe('Browse tab: the key dialog', () => {
  it('is a modal dialog with a name, over a scrim', () => {
    expect(dialog).toContain("'role', 'dialog'");
    expect(dialog).toContain("'aria-modal', 'true'");
    expect(dialog).toContain('aria-labelledby');
    expect(dialog).toContain('ik-dialog');
    expect(dialog).toContain('ik-scrim');
  });

  it('closes on Escape and on the scrim, keeps Tab inside, and gives focus back to the button that opened it', () => {
    expect(dialog).toContain("'Escape'");
    expect(dialog).toContain("'Tab'");
    expect(dialog).toMatch(/opener\.focus\(\)/);
    expect(dialog).toContain("addEventListener('click', close)");
  });

  it('says in words which field is empty instead of disabling the button, and moves focus to it', () => {
    expect(dialog).toContain("'aria-invalid'");
    expect(dialog).toMatch(/Enter the /);
    expect(dialog).toContain('.focus()');
  });

  it('lets the person see what they typed, and says where it is kept', () => {
    expect(dialog).toContain("'Show '");
    expect(dialog).toContain('secret storage');
    expect(dialog).toContain('mcp.json');
  });

  it('sends the same install message as before, with each field by its id', () => {
    expect(dialog).toContain("type: 'mcpInstall'");
    expect(dialog).toContain('secretValues');
  });
});

describe('Browse tab: filter by setup', () => {
  it('can show only the servers that need a key, with the count in the label', () => {
    expect(block).toContain('mcpFilter');
    expect(block).toContain("'Needs a key '");
    expect(block).toContain("'No key needed '");
  });

  it('says so when the search and the filter together match nothing', () => {
    expect(block).toContain('No server matches');
  });
});

/** RB-113: the dialog layer sat inside the MCP section, which is hidden on every other page, so a dialog opened from the API keys page never showed. */
describe('the dialog layer', () => {
  it('is outside every section, so the key dialog opens from any page', () => {
    const at = html.indexOf('id="mcp-dialog-layer"');
    expect(at).toBeGreaterThan(0);
    expect(html.lastIndexOf('<section', at)).toBeLessThan(html.lastIndexOf('</section>', at));
    expect(at).toBeGreaterThan(html.indexOf('</main>'));
  });

  it('is the only fixed overlay on the page, so no sibling is hidden the same way', () => {
    expect((html.match(/position: fixed/g) ?? []).length).toBe(1);
  });
});

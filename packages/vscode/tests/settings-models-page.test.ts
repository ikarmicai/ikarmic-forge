import { describe, expect, it } from 'vitest';

import { getSettingsHtml } from '../src/settings/settings-html.js';
import { SETTINGS_INDEX } from '../src/settings/settings-model.js';

/**
 * Model, API keys and Providers were three pages that each held part of "connect a provider and pick a model": the
 * same provider appeared as a checkbox on one, a key row on another and a custom entry on the third. They are one page.
 */
const html = getSettingsHtml();
const section = (id: string): string => {
  const start = html.indexOf(`<section id="${id}"`);
  expect(start, `section ${id}`).toBeGreaterThan(-1);
  const end = html.indexOf('<section', start + 10);
  return html.slice(start, end === -1 ? undefined : end);
};

describe('one Models and providers page', () => {
  it('has no separate API keys or Providers section, button or picker entry', () => {
    expect(html).not.toContain('id="sec-keys"');
    expect(html).not.toContain('id="sec-providers"');
    expect(html).not.toContain('data-section="keys"');
    expect(html).not.toContain('data-section="providers"');
    expect(html).not.toContain('<option value="keys">');
    expect(html).not.toContain('<option value="providers">');
  });

  it('names the page in words, in the menu and the picker', () => {
    expect(html).toMatch(/data-section="model">[^]*?<\/svg>Models and providers<\/button>/);
    expect(html).toContain('<option value="model">Models and providers</option>');
    expect(section('sec-model')).toContain('<h2>Models and providers</h2>');
  });

  it('holds the key rows, the custom provider list and form, and the cloud accounts', () => {
    const page = section('sec-model');
    for (const id of ['key-rows', 'provider-list', 'prov-add', 'cloud-status']) expect(page).toContain(`id="${id}"`);
  });

  it('puts the providers before the main model, and the other models after it', () => {
    const page = section('sec-model');
    const at = (s: string) => page.indexOf(s);
    expect(at('id="key-rows"')).toBeLessThan(at('id="row-provider"'));
    expect(at('id="row-provider"')).toBeLessThan(at('id="row-compaction-model"'));
  });

  it('turns a provider on or off in its own row, not in a second list', () => {
    expect(html).not.toContain('id="hidden-providers"');
    expect(html).not.toContain('id="row-hidden"');
    expect(html).toContain('input type="checkbox" data-provider=');
    expect(html).toContain('disabledProviders');
  });

  it('asks for the cloud status when the page opens, and no longer points at a page that is gone', () => {
    expect(html).toMatch(/name === 'model'[^\n]*loadCloudStatus/);
    expect(html).not.toContain('API keys section');
  });

  it('moves chat deletion to Context and memory, where its last-run line is loaded', () => {
    expect(section('sec-model')).not.toContain('id="retention-days"');
    expect(section('sec-context')).toContain('id="retention-days"');
    expect(section('sec-context')).toContain('id="cleanup-last"');
  });

  it('leaves no search entry pointing at a page that is gone', () => {
    const sections = new Set(SETTINGS_INDEX.map((e) => e.section));
    expect(sections.has('keys')).toBe(false);
    expect(sections.has('providers')).toBe(false);
    expect(SETTINGS_INDEX.find((e) => e.rowId === 'row-retention')?.section).toBe('context');
    expect(SETTINGS_INDEX.find((e) => e.rowId === 'row-keys')?.section).toBe('model');
    expect(SETTINGS_INDEX.find((e) => e.rowId === 'row-providers')?.section).toBe('model');
  });
});

/**
 * The provider form (nine fields) and the key box on every provider row made the page long and repetitive. The form
 * opens in a dialog, and a row asks for its key in the same key dialog the AWS keys and the MCP cards use.
 */
describe('dialogs on the Models and providers page', () => {
  const script = html.slice(html.indexOf('// keys (immediate)'), html.indexOf('// model per mode (draft)'));

  it('puts the provider form in a modal dialog of its own, outside every section', () => {
    const layer = html.indexOf('<div id="prov-dialog-layer" class="dlg-layer" hidden>');
    expect(layer).toBeGreaterThan(html.indexOf('</main>'));
    const form = html.slice(layer, html.indexOf('</form>', layer));
    expect(form).toMatch(/<form id="prov-form" class="ik-dialog prov-dialog" role="dialog" aria-modal="true" aria-labelledby="prov-dlg-title"/);
    expect(form).toContain('class="ik-scrim"');
    for (const id of ['prov-preset', 'prov-id', 'prov-name', 'prov-url', 'prov-env', 'prov-key', 'prov-api', 'prov-timeout', 'prov-chunk']) expect(form).toContain(`id="${id}"`);
    expect(section('sec-model')).not.toContain('id="prov-form"');
    expect(section('sec-model')).toContain('id="prov-add"');
  });

  it('closes on Escape and the scrim, keeps Tab inside, and gives focus back to the button that opened it', () => {
    const open = html.slice(html.indexOf('function showProvDialog'), html.indexOf('function fillProviderForm'));
    expect(open).toContain("'Escape'");
    expect(open).toContain("'Tab'");
    expect(open).toMatch(/[oO]pener\.focus\(\)/);
    expect(html).toMatch(/prov-scrim'\)\.addEventListener\('click', closeProvDialog\)/);
  });

  it('saves from the dialog by submitting it, then closes it so the result shows on the page', () => {
    expect(html).toMatch(/\$\('prov-form'\)\.addEventListener\('submit'/);
    expect(html).not.toContain("$('prov-save').addEventListener('click'");
    expect(html).toMatch(/type: 'saveProvider'[^\n]*\n[^\n]*\n?[^\n]*closeProvDialog\(\)/);
  });

  it('asks for a key in the key dialog, so a row holds no key box', () => {
    expect(script).not.toContain("type = 'password'");
    expect(script).not.toContain('Paste new key');
    expect(script).toContain("'Set key'");
    expect(script).toContain("'Change key'");
    expect(script).toContain('openKeyDialog(');
    expect(script).toContain("type: 'setKey'");
  });
});

/** Removing a saved key or a custom provider cannot be undone, so it asks first, in a dialog that starts on Cancel. */
describe('Remove asks first', () => {
  const confirmFn = html.slice(html.indexOf('function confirmDialog'), html.indexOf('function openKeyDialog'));

  it('does not delete a key or a provider straight from the click', () => {
    expect(html).not.toMatch(/addEventListener\('click', \(\) => vscode\.postMessage\(\{ type: 'deleteKey'/);
    expect(html).not.toMatch(/addEventListener\('click', \(\) => vscode\.postMessage\(\{ type: 'deleteProvider'/);
    expect(html).toMatch(/confirmDialog\(\{[^\n]*\n?[^\n]*type: 'deleteKey'/);
    expect(html).toMatch(/confirmDialog\(\{[^\n]*\n?[^\n]*type: 'deleteProvider'/);
  });

  it('is a modal dialog that closes on Escape and the scrim, keeps Tab inside, and starts on Cancel', () => {
    expect(confirmFn).toContain("'role', 'dialog'");
    expect(confirmFn).toContain("'aria-modal', 'true'");
    expect(confirmFn).toContain("'Escape'");
    expect(confirmFn).toContain("'Tab'");
    expect(confirmFn).toMatch(/opener\.focus\(\)/);
    expect(confirmFn).toContain("addEventListener('click', close)");
    expect(confirmFn).toMatch(/cancel\.focus\(\)/);
    expect(confirmFn).toContain('ik-btn--danger');
  });

  it('says what is deleted and what stays, in words', () => {
    expect(html).toContain('Remove key for ');
    expect(html).toContain('Remove provider ');
    expect(html).toContain("secret storage. You can paste it again later.");
  });
});

/** A key that comes from an environment variable said "From OPENAI_API_KEY", the raw name as the whole status. */
describe('a key from the environment', () => {
  it('says so in words and does not show the variable name', () => {
    expect(html).not.toContain("'✓ From ' + envKeys");
    expect(html).not.toContain("'✓ Key from ' + envKeys");
    expect(html).toContain("'✓ From environment'");
    expect(html).toContain("'✓ Key from environment'");
    expect(html).not.toContain('kenv');
  });
});

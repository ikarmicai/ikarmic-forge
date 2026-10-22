import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { i18nScript, WEBVIEW_STRINGS, webviewDictionary } from '../src/chat/webview-i18n.js';
import { SETTINGS_STRINGS } from '../src/settings/settings-i18n.js';
// @ts-expect-error plain .mjs helper without types
import { hostKeys } from '../scripts/l10n-keys.mjs';

const root = path.join(__dirname, '..');
const bundle = (locale: string) =>
  JSON.parse(readFileSync(path.join(root, 'l10n', `bundle.l10n.${locale}.json`), 'utf8')) as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();

describe.each(['es', 'zh-cn'])('l10n bundle (%s)', (locale) => {
  const b = bundle(locale);
  const required: string[] = [...(hostKeys() as string[]), ...WEBVIEW_STRINGS, ...SETTINGS_STRINGS];

  it('translates every message the extension can show', () => {
    expect(required.filter((k) => !(k in b))).toEqual([]);
  });

  it('keeps the {n} placeholders of each message', () => {
    for (const k of required) expect(placeholders(b[k]!), k).toEqual(placeholders(k));
  });

  it('has no stale entries', () => {
    expect(Object.keys(b).filter((k) => !required.includes(k))).toEqual([]);
  });
});

describe('manifest', () => {
  it('points VS Code at the bundles', () => {
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).l10n).toBe('./l10n');
  });
});

describe('webview translation', () => {
  it('only lists labels that differ from English', () => {
    const dict = webviewDictionary((s) => (s === 'Send' ? 'Enviar' : s));
    expect(dict).toEqual({ Send: 'Enviar' });
  });

  it('emits no script for English and embeds the dictionary otherwise', () => {
    expect(i18nScript({})).toBe('');
    const html = chatHtml({ strings: { Send: 'Enviar' } });
    expect(html).toContain('"Send":"Enviar"');
    expect(chatHtml()).not.toContain('MutationObserver(function (records)');
  });

  it('cannot be broken out of the script element by a translation', () => {
    const script = i18nScript({ Send: '</script><b>x' });
    expect(script).not.toContain('</script>');
    expect(script).toContain(String.fromCharCode(92) + 'u003c/script>');
  });
});

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';

/** Ids a page's script looks up with `$('x')` or `getElementById('x')`. */
function lookedUp(html: string): string[] {
  return [...new Set([...html.matchAll(/(?:\$|getElementById)\('([A-Za-z][\w-]*)'\)/g)].map((m) => m[1]!))];
}

/** Ids in the markup, plus those the script assigns (`el.id = 'x'`). */
function declared(html: string): Set<string> {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
  for (const m of html.matchAll(/\.id\s*=\s*'([^']+)'/g)) ids.add(m[1]!);
  return ids;
}

// A lookup of an id that isn't on the page returns null and throws on first use: in Settings a
// stale `row-deny` made refreshDirty fail on every render, which also skipped the code after it.
describe.each([
  ['chat', () => chatHtml()],
  ['settings', () => getSettingsHtml()],
])('%s webview', (_name, html) => {
  it('only looks up elements that exist', () => {
    const page = html();
    const ids = declared(page);
    expect(lookedUp(page).filter((id) => !ids.has(id))).toEqual([]);
  });
});

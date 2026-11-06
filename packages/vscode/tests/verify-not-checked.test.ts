import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

// With forge.verify.lsp on and no language server installed, the chat said "Checks passed." although nothing had
// looked at the edit (2026-11-06). The page now says when nothing was checked and which server is missing.
describe('the verify line in the chat', () => {
  const html = chatHtml({ strings: {} } as never);
  const block = html.slice(html.indexOf("case 'verify':"), html.indexOf("case 'verify':") + 1600);

  it('says "Not checked" when nothing looked at the edit, instead of "Checks passed"', () => {
    expect(block).toContain("msg.checked === false ? 'Not checked.'");
  });

  it('names a language server that is not installed once per chat, with what to do', () => {
    expect(block).toContain('const newServers = (msg.unavailableServers || []).filter((s) => !namedServers.has(s));');
    expect(block).toContain("' No language server installed for: ' + newServers.join(', ') + '. Install it, or turn off Include editor problems in checks in Settings.'");
  });

  // With the language-server check on by default and no server installed, every run would end with "Not checked."
  // Once the missing server was named, a run where nothing was checked adds no line, as before the check was on.
  it('adds no line for a run where nothing was checked once the missing server was named', () => {
    expect(block).toContain('if (msg.passed && msg.checked === false && newServers.length === 0 && !(msg.slowCommands && msg.slowCommands.length)) break;');
  });

  it('gets both fields from the host', () => {
    const host = readFileSync(new URL('../src/chat/chat-view.ts', import.meta.url), 'utf8');
    const forward = host.slice(host.indexOf("case 'verify':"), host.indexOf("case 'verify':") + 500);
    expect(forward).toContain('checked: event.checked');
    expect(forward).toContain('unavailableServers: event.unavailableServers');
  });
});

/**
 * The first-run approval card and the stored default (Release 1, feature 3).
 * A stored Autonomous applies only in a trusted workspace; the picker and the shortcut never write the setting.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { startingLevel, storedApprovalOf } from '../src/chat/approval-level.js';
import { chatHtml } from '../src/chat/html.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';

const root = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('the stored approval default', () => {
  it('reads anything unknown as unset', () => {
    expect(storedApprovalOf(undefined)).toBe('unset');
    expect(storedApprovalOf('nonsense')).toBe('unset');
    expect(storedApprovalOf('edits')).toBe('edits');
  });

  it('starts new chats at the stored level, Ask first when unset', () => {
    expect(startingLevel('unset', true)).toBe('ask');
    expect(startingLevel('edits', false)).toBe('edits');
    expect(startingLevel('auto', true)).toBe('auto');
    expect(startingLevel('auto', false)).toBe('ask');
  });

  it('is declared application-scoped so a repository cannot set it', () => {
    const pkg = JSON.parse(read('package.json'));
    const prop = pkg.contributes.configuration.properties['forge.approvalDefault'];
    expect(prop.scope).toBe('application');
    expect(prop.enum).toEqual(['unset', 'ask', 'edits', 'auto']);
    expect(prop.default).toBe('unset');
  });
});

describe('host wiring', () => {
  const view = read('src/chat/chat-view.ts');
  it('passes the workspace trust to startingLevel and validates the page message', () => {
    expect(view).toMatch(/startingLevel\([^)]*vscode\.workspace\.isTrusted\)/);
    expect(view).toContain("case 'set_approval_default':");
    expect(view).toContain('ConfigurationTarget.Global');
    expect(view).toContain("'set_approval_default'");
  });
});

describe('the chat page', () => {
  const html = chatHtml();
  it('has the card and writes the default only from its button', () => {
    expect(html).toContain('approval-default-card');
    expect(html).toContain("case 'approval_default':");
    const posts = html.split("type: 'set_approval_default'").length - 1;
    expect(posts).toBe(1);
    const changeHandler = html.slice(html.indexOf("approvalSelect.addEventListener('change'"), html.indexOf("approvalSelect.addEventListener('change'") + 80);
    expect(changeHandler).not.toContain('set_approval_default');
  });
  it('translates the card text', () => {
    for (const s of ['How much should Forge do on its own?', 'Use this', 'You can change this any time in the composer.']) expect(WEBVIEW_STRINGS).toContain(s);
  });
});

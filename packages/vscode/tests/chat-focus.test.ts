/**
 * Release 1, feature 4: shortcuts that switch the chat mode and Accept edits.
 * The commands reach the chat the person last focused (sidebar or tab); the shortcut never writes forge.approvalDefault.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ChatFocus } from '../src/chat/chat-focus.js';
import { chatHtml } from '../src/chat/html.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';

const root = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('ChatFocus', () => {
  it('returns the most recently marked provider that is still registered', () => {
    const f = new ChatFocus<string>();
    expect(f.last()).toBeUndefined();
    f.mark('a');
    f.mark('b');
    expect(f.last()).toBe('b');
    f.forget('b');
    expect(f.last()).toBe('a');
    f.forget('a');
    expect(f.last()).toBeUndefined();
  });

  it('moves a provider to the front when it is marked again', () => {
    const f = new ChatFocus<string>();
    f.mark('a');
    f.mark('b');
    f.mark('a');
    expect(f.last()).toBe('a');
    f.forget('a');
    expect(f.last()).toBe('b');
  });

  it('ignores forgetting a provider that was never marked', () => {
    const f = new ChatFocus<string>();
    f.mark('a');
    f.forget('zzz');
    expect(f.last()).toBe('a');
  });
});

describe('the shortcut manifest', () => {
  const pkg = JSON.parse(read('package.json'));
  const bindings: { command: string; key: string; mac?: string; when?: string }[] = pkg.contributes.keybindings;
  // forge.chatFocused is set by the page's focus message: VS Code leaves focusedView unset while a sidebar webview has focus.
  const when = 'forge.chatFocused || focusedView == forge.chatView || activeWebviewPanelId == forge.chatTab';

  it('binds both commands with the agreed keys, only in the chat', () => {
    const mode = bindings.find((b) => b.command === 'forge.cycleChatMode');
    const edits = bindings.find((b) => b.command === 'forge.toggleAcceptEdits');
    expect(mode).toMatchObject({ key: 'ctrl+alt+m', mac: 'cmd+alt+m', when });
    expect(edits).toMatchObject({ key: 'ctrl+alt+a', mac: 'cmd+alt+a', when });
  });

  it('lets no other contributed keybinding use those keys', () => {
    for (const key of ['ctrl+alt+m', 'ctrl+alt+a']) {
      expect(bindings.filter((b) => b.key === key).length).toBe(1);
    }
  });

  it('declares both commands with titles and activation events', () => {
    const nls = JSON.parse(read('package.nls.json'));
    for (const id of ['forge.cycleChatMode', 'forge.toggleAcceptEdits']) {
      const c = pkg.contributes.commands.find((x: { command: string }) => x.command === id);
      expect(c, id).toBeTruthy();
      expect(nls[c.title.replace(/%/g, '')]).toBeTruthy();
      expect(pkg.activationEvents).toContain('onCommand:' + id);
    }
    expect(nls['command.forge.cycleChatMode.title']).toBe('Cycle Chat Mode');
    expect(nls['command.forge.toggleAcceptEdits.title']).toBe('Toggle Accept Edits');
  });
});

describe('every keybinding aimed at the chat', () => {
  // RB-51: focusedView and sidebarFocus are not set while a sidebar webview has focus, so a shortcut needs forge.chatFocused.
  const bindings: { command: string; when?: string }[] = JSON.parse(read('package.json')).contributes.keybindings;
  it('does not lean on focusedView or sidebarFocus without forge.chatFocused', () => {
    const bad = bindings.filter((b) => /focusedView\s*==\s*forge\.|sidebarFocus|workbench\.view\.extension\.forge/.test(b.when ?? '') && !/forge\.chatFocused/.test(b.when ?? ''));
    expect(bad.map((b) => b.command)).toEqual([]);
  });
  it('keeps the voice shortcut terms', () => {
    const voice = bindings.find((b) => b.command === 'forge.startVoiceInput');
    expect(voice?.when).toContain('sidebarFocus');
  });
});

describe('a hidden chat releases the focus key', () => {
  const view = read('src/chat/chat-view.ts');
  it('clears forge.chatFocused when the view or tab is hidden', () => {
    expect(view).toMatch(/view\.visible === false && chatFocus\.last\(\) === this/);
    expect(read('src/chat/chat-tab.ts')).toContain('panel.visible');
  });
});

describe('host wiring', () => {
  it('registers both commands against the last focused chat', () => {
    const cmds = read('src/commands.ts');
    expect(cmds).toContain("'forge.cycleChatMode'");
    expect(cmds).toContain("'forge.toggleAcceptEdits'");
    const view = read('src/chat/chat-view.ts');
    expect(view).toContain("case 'chat_focused':");
    expect(view).toContain("case 'chat_blurred':");
    expect(view).toContain("'forge.chatFocused'");
    expect(view).toContain('cycleMode()');
    expect(view).toContain('toggleAcceptEdits()');
    expect(view).toMatch(/chatFocus\.forget\(this\)/);
  });
});

describe('the chat page', () => {
  const html = chatHtml({ strings: {} } as never);

  it('tells the host when it gains focus', () => {
    expect(html).toContain("addEventListener('focus'");
    expect(html).toContain("type: 'chat_focused'");
    expect(html).toContain("type: 'chat_blurred'");
  });

  it('handles both messages, never reaches Autonomous and never writes the stored default', () => {
    expect(html).toContain("case 'cycle_mode':");
    expect(html).toContain("case 'toggle_accept_edits':");
    expect(html).toContain("approvalSelect.value === 'ask' ? 'edits' : 'ask'");
    expect(html.match(/set_approval_default/g)?.length).toBe(1);
  });

  it('announces in separate translatable pieces', () => {
    expect(WEBVIEW_STRINGS).toContain('Mode:');
    expect(WEBVIEW_STRINGS).toContain('Approvals:');
  });
});

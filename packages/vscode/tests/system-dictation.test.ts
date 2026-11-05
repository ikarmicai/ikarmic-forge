/**
 * The mic button hands off to the system's own dictation, because VS Code refuses the microphone to webviews.
 * Windows presses Win+H; macOS clicks "Start Dictation" in the Edit menu. The page's words must fit both.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';
import { MAC_DICTATION_SCRIPT, macDictationCommand, macDictationFailure, pressMacDictation } from '../src/chat/system-dictation.js';

describe('macDictationCommand', () => {
  it('runs the system osascript by absolute path with a fixed script and a neutral folder', () => {
    const c = macDictationCommand();
    expect(c.file).toBe('/usr/bin/osascript');
    expect(c.args).toEqual(['-e', MAC_DICTATION_SCRIPT]);
    expect(c.cwd).toBe('/');
    expect(c.timeoutMs).toBe(10_000);
  });

  it('clicks Start or Stop Dictation, so one press starts and the next stops', () => {
    expect(MAC_DICTATION_SCRIPT).toContain('Start Dictation');
    expect(MAC_DICTATION_SCRIPT).toContain('Stop Dictation');
    expect(MAC_DICTATION_SCRIPT).toContain('"Edit"');
  });
});

describe('pressMacDictation', () => {
  it('runs the fixed command once', async () => {
    const calls: unknown[][] = [];
    await pressMacDictation(async (file, args, options) => { calls.push([file, args, options]); });
    expect(calls).toEqual([['/usr/bin/osascript', ['-e', MAC_DICTATION_SCRIPT], { cwd: '/', timeout: 10_000 }]]);
  });

  it('turns a refused click into words for the person, not the raw error', async () => {
    const refused = Object.assign(new Error('Command failed: osascript'), { stderr: 'osascript is not allowed assistive access. (-25211)' });
    await expect(pressMacDictation(async () => { throw refused; })).rejects.toThrow(/Accessibility/);
  });

  it('still explains a failure that has no stderr, such as a timeout', async () => {
    await expect(pressMacDictation(async () => { throw new Error('timed out'); })).rejects.toThrow(/Fn/);
  });
});

describe('macDictationFailure', () => {
  it('tells the person to allow Accessibility when macOS refuses the click', () => {
    const msg = macDictationFailure('execution error: System Events got an error: osascript is not allowed assistive access. (-25211)');
    expect(msg).toMatch(/Accessibility/);
    expect(msg).toMatch(/Privacy/);
  });

  it('says what to do when the Dictation menu item is not there', () => {
    const msg = macDictationFailure('execution error: Dictation menu item not found (1728)');
    expect(msg).toMatch(/Dictation/);
    expect(msg).toMatch(/another language/); // the lookup is by English name: say so
    expect(msg).toMatch(/Fn/);
  });

  it('shows an unknown failure as it is and still names the manual way', () => {
    const msg = macDictationFailure('something odd');
    expect(msg).toContain('something odd');
    expect(msg).toMatch(/Fn/);
  });

  it('never shows an error code to the person', () => {
    expect(macDictationFailure('osascript is not allowed assistive access. (-25211)')).not.toMatch(/-25211/);
    expect(macDictationFailure('Dictation menu item not found (1728)')).not.toMatch(/1728/);
  });
});

describe('chat page words for voice typing', () => {
  const html = chatHtml({ strings: {} } as never);

  it('does not name a Windows-only key on a page that also runs on macOS and Linux', () => {
    expect(html).not.toContain('Win+H');
  });

  it('names Cmd, not Ctrl, in the voice tooltip on a Mac', () => {
    // The page picks the word from navigator.platform; both texts are in the script, and each is in the translated strings.
    expect(html).toMatch(/\/Mac\/i\.test\(navigator\.platform[^)]*\)\s*\?\s*'Voice input \(Cmd\+Shift\+Space\)'\s*:\s*'Voice input \(Ctrl\+Shift\+Space\)'/);
    expect(WEBVIEW_STRINGS).toContain('Voice input (Cmd+Shift+Space)');
  });
});

describe('the mic shows that voice typing is on', () => {
  const html = chatHtml({ strings: {} } as never);
  const toggle = html.slice(html.indexOf('function toggleVoice'), html.indexOf('function toggleVoice') + 900);
  const sync = html.slice(html.indexOf('function syncMicButton'), html.indexOf('function syncMicButton') + 1400);

  it('highlights the mic itself instead of writing a sentence under the box', () => {
    expect(html).not.toContain('Speak now');
    expect(toggle).not.toContain('setVoiceStatus');
    expect(toggle).toContain('osDictating = !osDictating');
    expect(sync).toContain("classList.toggle('recording', osDictating)");
    expect(sync).toContain("setAttribute('aria-pressed', String(osDictating))");
    expect(sync).toContain("'Stop voice typing'");
  });

  it('switches the highlight off when starting failed or a message was sent', () => {
    expect(html).toContain("case 'voice_os_failed':");
    const sent = html.slice(html.indexOf("case 'task_started':"), html.indexOf("case 'task_started':") + 200);
    expect(sent).toContain('osDictating = false');
  });

  it('has both labels in the translated strings', () => {
    expect(WEBVIEW_STRINGS).toContain('Voice typing');
    expect(WEBVIEW_STRINGS).toContain('Stop voice typing');
  });

  it('tells the page when the host could not press the system key', () => {
    const host = readFileSync(new URL('../src/chat/chat-view.ts', import.meta.url), 'utf8');
    const start = host.indexOf("case 'voice_os_dictation':");
    const block = host.slice(start, start + 1400);
    expect((block.match(/voice_os_failed/g) ?? []).length).toBe(2); // the unsupported system, and a press that threw
  });
});

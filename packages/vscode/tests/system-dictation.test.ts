/**
 * The mic button hands off to the system's own dictation, because VS Code refuses the microphone to webviews.
 * Windows presses Win+H; macOS clicks "Start Dictation" in the Edit menu. The page's words must fit both.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
import { WEBVIEW_STRINGS } from '../src/chat/webview-i18n.js';
import { hasSystemDictation, MAC_DICTATION_SCRIPT, macDictationCommand, macDictationFailure, pressMacDictation, pressWindowsDictation, windowsDictationCommand } from '../src/chat/system-dictation.js';

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

// Found by the person, 2026-11-06: the lit mic went backwards whenever Windows closed voice typing by itself, the
// shortcut did nothing in the chat (the page and VS Code both toggled, so Win+H was pressed twice), and a failed press
// showed the PowerShell command line. The system cannot be asked whether voice typing is on, so the mic does not guess.
describe('the mic hands one press to the system and keeps no on or off state', () => {
  const html = chatHtml({ strings: {} } as never);
  const toggle = html.slice(html.indexOf('function toggleVoice'), html.indexOf('function toggleVoice') + 600);
  const sync = html.slice(html.indexOf('function syncMicButton'), html.indexOf('function syncMicButton') + 900);

  it('has no guessed state that a press flips', () => {
    expect(html).not.toContain('osDictating');
    expect(sync).not.toContain("classList.toggle('recording', osDictating)");
    expect(toggle).toContain("vscode.postMessage({ type: 'voice_os_dictation' })");
    expect(toggle).toContain('inputEl.focus()');
  });

  it('has no key handler of its own for the shortcut, which VS Code already sends as voice_start', () => {
    expect(html).not.toMatch(/e\.key === ' ' && e\.shiftKey/);
    expect(html).toContain("case 'voice_start':");
  });

  it('names the shortcut in the tooltip, Cmd on a Mac, and both texts are translated', () => {
    expect(html).toMatch(/\/Mac\/i\.test\(navigator\.platform[^)]*\)\s*\?\s*'Voice typing \(Cmd\+Shift\+Space\)'\s*:\s*'Voice typing \(Ctrl\+Shift\+Space\)'/);
    expect(WEBVIEW_STRINGS).toContain('Voice typing (Ctrl+Shift+Space)');
    expect(WEBVIEW_STRINGS).toContain('Voice typing (Cmd+Shift+Space)');
  });

  it('hides the mic on a system with no voice typing Forge can start', () => {
    expect(sync).toContain('voiceEnabled && systemDictation');
    expect(html).toContain("if (typeof msg.systemDictation === 'boolean') systemDictation = msg.systemDictation;");
    expect(hasSystemDictation('win32')).toBe(true);
    expect(hasSystemDictation('darwin')).toBe(true);
    expect(hasSystemDictation('linux')).toBe(false);
  });

  it('logs each hand-off, so the count can be checked, and the host waits for the chat to have focus first', () => {
    const host = readFileSync(new URL('../src/chat/chat-view.ts', import.meta.url), 'utf8');
    const block = host.slice(host.indexOf("case 'voice_os_dictation':"), host.indexOf("case 'voice_os_dictation':") + 1600);
    expect(block).toContain('Voice typing: hand-off');
    expect(block).not.toContain('voice_os_failed');
    const toggleHost = host.slice(host.indexOf('async toggleVoice()'), host.indexOf('async toggleVoice()') + 700);
    expect(toggleHost).toContain("await vscode.commands.executeCommand('forge.chatView.focus');");
  });
});

describe('Windows voice typing', () => {
  it('runs the system PowerShell by absolute path with a fixed script in the Windows folder', () => {
    const c = windowsDictationCommand('C:\\Windows');
    expect(c.file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(c.args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(Buffer.from(c.args[3]!, 'base64').toString('utf16le')).toContain('keybd_event(0x5B');
    expect(c.cwd).toBe('C:\\Windows');
    expect(c.timeoutMs).toBe(10_000);
  });

  it('keeps the command line out of the message and in the detail for the log', async () => {
    const failed = Object.assign(new Error('Command failed: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -EncodedCommand QQBkAGQA'), { stderr: 'Add-Type : access denied' });
    const err = (await pressWindowsDictation(async () => { throw failed; }).catch((e: unknown) => e)) as Error & { detail: string };
    expect(err.message).not.toMatch(/EncodedCommand|powershell.exe|QQBkAGQA/);
    expect(err.detail).toBe('Add-Type : access denied');
  });

  it('says a press that took too long in words', async () => {
    const killed = Object.assign(new Error('Command failed'), { killed: true });
    const err = (await pressWindowsDictation(async () => { throw killed; }).catch((e: unknown) => e)) as Error & { detail: string };
    expect(err.detail).toBe('PowerShell did not finish within 10 seconds');
  });

  it('tells the person what to do, with no command line, in words the page can translate', () => {
    const host = readFileSync(new URL('../src/chat/chat-view.ts', import.meta.url), 'utf8');
    expect(host).toContain("t('Could not start Windows voice typing. Press Win+H yourself while the chat box has focus. The details are in Output, Forge.')");
  });
});

/**
 * The mic button hands off to the system's own dictation, because VS Code refuses the microphone to webviews.
 * Windows presses Win+H; macOS clicks "Start Dictation" in the Edit menu. The page's words must fit both.
 */
import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';
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
});

import { describe, expect, it, vi } from 'vitest';

import { indexStatusLine } from '../src/index-status.js';
import { getSettingsHtml } from '../src/settings/settings-html.js';
import { handleSettingsMessage, type SettingsDeps } from '../src/settings/settings-protocol.js';

/**
 * "Did indexing work?" was answered only by a status bar item that appears after the first search by meaning. The
 * Settings page, where the embedder is chosen, now says what the index is doing, in words, and can delete it.
 */
describe('indexStatusLine', () => {
  it('says search by meaning is off, and that matching by words is what Forge does instead', () => {
    const l = indexStatusLine(false, undefined);
    expect(l.tone).toBe('off');
    expect(l.text).toMatch(/^Off\./);
    expect(l.text).toContain('words');
  });

  it('says the index is not built yet when it is on and nothing has run', () => {
    const l = indexStatusLine(true, undefined);
    expect(l.tone).toBe('idle');
    expect(l.text).toContain('Not built yet');
  });

  it('shows progress in files, and a count that reads right for one', () => {
    expect(indexStatusLine(true, { phase: 'indexing', done: 12, total: 340 }).text).toBe('Reading your code: 12 of 340 files.');
    expect(indexStatusLine(true, { phase: 'indexing', done: 0, total: 1 }).text).toBe('Reading your code: 0 of 1 file.');
  });

  it('says what is in a finished index', () => {
    expect(indexStatusLine(true, { phase: 'ready', files: 340, chunks: 2100 })).toEqual({ tone: 'ok', text: 'Ready: 2100 pieces of 340 files.' });
    expect(indexStatusLine(true, { phase: 'ready', files: 1, chunks: 1 }).text).toBe('Ready: 1 piece of 1 file.');
  });

  it('shows a problem as the sentence it was written as', () => {
    expect(indexStatusLine(true, { phase: 'error', message: 'The embedding service said no.' })).toEqual({ tone: 'bad', text: 'Problem: The embedding service said no.' });
  });

  it('shows the word "off" when the person did not allow sending code, even though the setting is on', () => {
    const l = indexStatusLine(true, { phase: 'off' });
    expect(l.tone).toBe('off');
    expect(l.text).toContain('did not allow');
  });

  it('never shows an internal name', () => {
    for (const l of [indexStatusLine(true, { phase: 'indexing', done: 1, total: 2 }), indexStatusLine(true, { phase: 'off' }), indexStatusLine(false, undefined)]) {
      expect(l.text).not.toMatch(/\b[a-z]+_[a-z]+\b|phase|semanticSearch/);
    }
  });
});

describe('index status: host side', () => {
  function deps(over: { absent?: boolean } = {}) {
    const index = {
      status: vi.fn().mockReturnValue({ enabled: true, status: { phase: 'ready', files: 3, chunks: 9 } }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    return { index, all: (over.absent ? {} : { index }) as unknown as SettingsDeps };
  }

  it('sends whether the setting is on and what the index last said', async () => {
    const d = deps();
    expect(await handleSettingsMessage({ type: 'loadIndexStatus' }, d.all)).toEqual({
      type: 'indexStatusLoaded',
      enabled: true,
      status: { phase: 'ready', files: 3, chunks: 9 },
    });
  });

  it('deletes the index through the same confirmed path as the command, then sends the new state', async () => {
    const d = deps();
    const r = await handleSettingsMessage({ type: 'deleteIndex' }, d.all);
    expect(d.index.remove).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ type: 'indexStatusLoaded' });
  });

  it('answers with nothing where there is no index to ask about', async () => {
    expect(await handleSettingsMessage({ type: 'loadIndexStatus' }, deps({ absent: true }).all)).toEqual({ type: 'none' });
  });
});

describe('index status: the page', () => {
  const html = getSettingsHtml();

  it('has a Code index block above the Tools rows, with a button that says what it does', () => {
    expect(html).toContain('id="row-index-status"');
    expect(html.indexOf('id="row-index-status"')).toBeLessThan(html.indexOf('id="rows-tools"'));
    expect(html).toContain('Delete the index');
    expect(html).toContain("type: 'deleteIndex'");
  });

  it('asks for the status when Tools and web opens, and draws what comes back with the shared wording', () => {
    expect(html).toMatch(/name === 'tools'[^\n]*loadIndexStatus/);
    expect(html).toContain('FS.indexStatusLine(');
  });
});

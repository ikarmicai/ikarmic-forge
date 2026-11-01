import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/l10n.js', () => ({ t: (m: string, ...a: string[]) => m.replace(/\{(\d)\}/g, (_, i: string) => a[Number(i)]!) }));

import { firstFolderNotice } from '../src/multi-root.js';

describe('a workspace of several folders', () => {
  it('names the folder Forge works in and how many it cannot reach', () => {
    expect(firstFolderNotice(['api', 'web', 'docs'])).toBe('Forge works in the first folder of this workspace, api. It cannot reach the other 2 from chat.');
  });

  it('says nothing for one folder or none', () => {
    expect(firstFolderNotice(['api'])).toBeUndefined();
    expect(firstFolderNotice([])).toBeUndefined();
  });
});

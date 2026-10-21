import { describe, expect, it } from 'vitest';

import type { LoadedMemory, MemorySection } from '@ikarmic/forge-core';

import { buildMemoryItems } from '../src/memory/memory-model.js';

const GLOBAL = '/home/u/.forge/MEMORY.md';
const PROJECT = '/work/proj/.forge/MEMORY.md';

function sec(heading: string, extra: Partial<MemorySection> = {}): MemorySection {
  return { heading, body: 'b', source: PROJECT, updatedAt: Date.UTC(2026, 9, 12), type: 'convention', refs: [], pinned: false, ...extra };
}
const loaded = (sections: MemorySection[]): LoadedMemory => ({ sections, sources: [], totalBytes: 0 });

describe('buildMemoryItems', () => {
  it('groups by type (correction, decision, convention, reference) then heading', () => {
    const items = buildMemoryItems(
      loaded([
        sec('Zed', { type: 'reference' }),
        sec('Beta'),
        sec('Alpha'),
        sec('Why', { type: 'decision' }),
        sec('Never', { type: 'correction' }),
      ]),
      new Map(),
      GLOBAL
    );
    expect(items.map((i) => i.heading)).toEqual(['Never', 'Why', 'Alpha', 'Beta', 'Zed']);
    expect(items[0]!.description).toBe('correction · 2026-10-12');
  });

  it('puts stale reasons in detail and leaves it out otherwise', () => {
    const stale = new Map([[`${PROJECT}#Legacy`, ['src/gone.ts no longer exists', 'src/also.ts no longer exists']]]);
    const items = buildMemoryItems(loaded([sec('Legacy'), sec('Fresh')]), stale, GLOBAL);
    const byHeading = Object.fromEntries(items.map((i) => [i.heading, i]));
    expect(byHeading.Legacy!.detail).toBe('possibly stale: src/gone.ts no longer exists; src/also.ts no longer exists');
    expect(byHeading.Fresh!.detail).toBeUndefined();
  });

  it('labels global and project sections and keeps the source file', () => {
    const items = buildMemoryItems(loaded([sec('G', { source: GLOBAL }), sec('P')]), new Map(), GLOBAL);
    const byHeading = Object.fromEntries(items.map((i) => [i.heading, i]));
    expect(byHeading.G).toMatchObject({ scope: 'global', source: GLOBAL });
    expect(byHeading.P).toMatchObject({ scope: 'project', source: PROJECT });
  });
});

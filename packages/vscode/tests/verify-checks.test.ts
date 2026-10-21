import { describe, expect, it } from 'vitest';

import { commandsHash, planVerify } from '../src/chat/verify-checks.js';

const detected = ['pnpm run typecheck', 'pnpm run test'];
const base = { explicit: [] as string[], mode: 'ask' as const, trusted: true, detected };

describe('commandsHash', () => {
  it('is stable for the same list and changes with order or content', () => {
    expect(commandsHash(detected)).toBe(commandsHash([...detected]));
    expect(commandsHash(detected)).toMatch(/^[0-9a-f]{16}$/);
    expect(commandsHash([...detected].reverse())).not.toBe(commandsHash(detected));
    expect(commandsHash([...detected, 'pnpm run lint'])).not.toBe(commandsHash(detected));
  });
});

describe('planVerify', () => {
  it('explicit commands win, with no consent, whatever the mode or trust', () => {
    const plan = planVerify({ ...base, explicit: ['make check'], mode: 'off', trusted: false });
    expect(plan).toMatchObject({ commands: ['make check'], source: 'explicit', needsConsent: false });
  });

  it.each([
    ['mode off', { mode: 'off' as const }],
    ['untrusted workspace', { trusted: false }],
    ['nothing detected', { detected: [] as string[] }],
  ])('runs nothing for %s', (_name, over) => {
    expect(planVerify({ ...base, ...over })).toMatchObject({ commands: [], source: 'none', needsConsent: false });
  });

  it('mode on runs the detected commands without asking', () => {
    expect(planVerify({ ...base, mode: 'on' })).toMatchObject({ commands: detected, source: 'detected', needsConsent: false });
  });

  it('mode ask needs consent until the exact list was approved', () => {
    expect(planVerify(base)).toMatchObject({ commands: detected, source: 'detected', needsConsent: true });
    expect(planVerify({ ...base, approvedHash: commandsHash(detected) })).toMatchObject({ source: 'detected', needsConsent: false });
    expect(planVerify({ ...base, approvedHash: commandsHash(['something else']) })).toMatchObject({ needsConsent: true });
  });

  it('a declined list is not offered again', () => {
    expect(planVerify({ ...base, declinedHash: commandsHash(detected) })).toMatchObject({ commands: [], source: 'none', needsConsent: false });
  });

  it('asks again when a script body changed even though the command did not', () => {
    const approved = planVerify({ ...base, fingerprint: ['vitest'] });
    expect(planVerify({ ...base, fingerprint: ['vitest'], approvedHash: approved.hash }).needsConsent).toBe(false);
    expect(planVerify({ ...base, fingerprint: ['vitest && evil'], approvedHash: approved.hash }).needsConsent).toBe(true);
  });

  it('exposes the hash of the detected list', () => {
    expect(planVerify(base).hash).toBe(commandsHash(detected));
  });
});

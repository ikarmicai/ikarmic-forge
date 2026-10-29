import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * RB-112: the pure helpers are unit-tested in core and here; this pins that the chat view really feeds workspace trust
 * into both, which a unit test cannot see (the repo's pattern for wiring).
 */
const chat = readFileSync(join(__dirname, '..', 'src', 'chat', 'chat-view.ts'), 'utf8');

describe('a workspace that is not trusted, in the chat view', () => {
  it('loads the skills registry without the project\'s skills, everywhere it is loaded', () => {
    const calls = [...chat.matchAll(/loadSkillsRegistryAsync\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // The one that counts what was ignored is the only one that asks for the project on purpose.
    const trusted = calls.filter((m) => chat.slice(m.index, m.index! + 400).includes('includeProject: vscode.workspace.isTrusted'));
    const forCounting = calls.filter((m) => chat.slice(m.index, m.index! + 400).includes('includeProject: true'));
    expect(trusted.length + forCounting.length).toBe(calls.length);
    expect(trusted.length).toBeGreaterThanOrEqual(2);
  });

  it('switches project instructions off for the run', () => {
    expect(chat).toContain('disableProjectInstructions: !vscode.workspace.isTrusted');
  });

  it('gives the parallel agents (router and steps) the same limit, since they are built from it', () => {
    const agents = readFileSync(join(__dirname, '..', 'src', 'agents', 'agents-commands.ts'), 'utf8');
    expect(agents).toMatch(/runOrchestrator\(\{[\s\S]*disableProjectInstructions: !trusted/);
  });

  it('says once, in words, what it ignored', () => {
    expect(chat).toContain('This workspace is not trusted, so Forge ignored its {0}. Trust the workspace to use them.');
    expect(chat).toContain('restrictedIgnoredList(');
  });
});

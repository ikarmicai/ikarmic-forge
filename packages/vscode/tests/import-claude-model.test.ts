import type { ClaudeImportPlan } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

import { importChoices, selectPlan } from '../src/import-claude-model.js';

const plan: ClaudeImportPlan = {
  mcp: [{ name: 'fs', spec: { command: 'npx' }, scope: 'user', from: '~/.claude.json' }],
  skillPaths: ['~/.claude/skills'],
  agents: [{ name: 'rev', scope: 'project', text: 'a', from: 'f' }],
  commands: [{ name: 'fix', scope: 'user', text: 'c', from: 'f' }],
  notes: ['one note'],
};

describe('importChoices', () => {
  it('lists every item once with a kind, label and where it goes', () => {
    const c = importChoices(plan);
    expect(c.map((x) => x.kind)).toEqual(['mcp', 'skills', 'agent', 'command']);
    expect(c[0]!.label).toContain('fs');
    expect(c[3]!.label).toContain('/fix');
  });
});

describe('selectPlan', () => {
  it('keeps only the chosen items and the notes', () => {
    const choices = importChoices(plan);
    const sub = selectPlan(plan, [choices[1]!, choices[2]!]);
    expect(sub.mcp).toEqual([]);
    expect(sub.skillPaths).toEqual(['~/.claude/skills']);
    expect(sub.agents).toHaveLength(1);
    expect(sub.commands).toEqual([]);
    expect(sub.notes).toEqual(['one note']);
  });
});

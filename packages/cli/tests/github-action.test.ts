import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs helper without types
import { finalFromJsonLines, outputEntry, prTitle, taskFromEvent, taskWithContext, threadFromEvent } from '../../../scripts/github-action/lib.mjs';

const root = path.join(__dirname, '..', '..', '..');

describe('GitHub Action helpers', () => {
  it('takes the task from the input, else from the text after @forge', () => {
    expect(taskFromEvent(' fix it ', 'issue_comment', {})).toBe('fix it');
    expect(taskFromEvent('', 'issue_comment', { comment: { body: 'Hey @forge: add tests for parse()' } })).toBe('add tests for parse()');
    expect(taskFromEvent('', 'issue_comment', { comment: { body: '/forge rename x' } })).toBe('rename x');
    expect(taskFromEvent('', 'issues', { issue: { body: 'Crash on start' } })).toBe('Crash on start');
    expect(taskFromEvent('', 'push', {})).toBe('');
    // A comment that only mentions an address is not addressed to Forge.
    expect(taskFromEvent('', 'issue_comment', { comment: { body: 'mail me@forge.dev' } })).toBe('');
  });

  it('adds the issue or PR as context', () => {
    const thread = threadFromEvent({ issue: { number: 4, title: 'Crash', body: 'stack', pull_request: { url: 'x' } } });
    expect(thread).toEqual({ number: 4, title: 'Crash', body: 'stack', isPullRequest: true });
    expect(taskWithContext('fix', thread)).toBe('fix\n\n<github-pr number="4">\nPull request #4: Crash\n\nstack\n</github-pr>');
    expect(threadFromEvent({})).toBeNull();
    expect(taskWithContext('fix', null)).toBe('fix');
  });

  it('finds the final line of forge --json output', () => {
    const out = ['{"type":"iteration"}', 'noise', '{"type":"final","finalText":"done","reason":"completed"}', ''].join('\n');
    expect(finalFromJsonLines(out)).toMatchObject({ finalText: 'done', reason: 'completed' });
    expect(finalFromJsonLines('{"type":"done"}')).toBeNull();
  });

  it('makes a short title and a safe multi-line output', () => {
    expect(prTitle('\n  add   a flag\nmore')).toBe('forge: add a flag');
    expect(prTitle('x'.repeat(100))).toHaveLength(7 + 70);
    expect(outputEntry('result', 'a\nFORGE_r\nb', 'r')).toBe('result<<FORGE_r_\na\nFORGE_r\nb\nFORGE_r_\n');
  });
});

describe('action.yml', () => {
  const yml = readFileSync(path.join(root, 'action.yml'), 'utf8');

  it('is a composite action that runs the script with inputs as env, not shell interpolation', () => {
    expect(yml).toContain('using: composite');
    expect(yml).toContain('run: node "$GITHUB_ACTION_PATH/scripts/github-action/run.mjs"');
    // No ${{ }} expression inside a run: line.
    expect(yml.split('\n').filter((l) => /^\s*run:/.test(l) && l.includes('${{'))).toEqual([]);
  });

  it('declares every input the script reads', () => {
    const script = readFileSync(path.join(root, 'scripts', 'github-action', 'run.mjs'), 'utf8');
    const read = new Set([...script.matchAll(/(?:input|flag)\('([a-z-]+)'\)/g)].map((m) => m[1]!));
    for (const name of read) {
      expect(yml, name).toMatch(new RegExp(`^  ${name}:`, 'm'));
      expect(yml, name).toContain(`INPUT_${name.toUpperCase().replace(/-/g, '_')}:`);
    }
  });
});

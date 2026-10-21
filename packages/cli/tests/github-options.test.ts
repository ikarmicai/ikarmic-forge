import { describe, expect, it } from 'vitest';

import { parseOptions, resolveGitHub } from '../src/options.js';
import { toolKind } from '../src/acp/server.js';

describe('--github', () => {
  it('parses', () => {
    expect(parseOptions(['node', 'forge', '--github', 'task']).options.github).toBe(true);
    expect(parseOptions(['node', 'forge', 'task']).options.github).toBe(false);
  });

  it('takes the token from the environment, then gh, else says what to do', () => {
    expect(resolveGitHub({ GITHUB_TOKEN: 'e' }, () => 'g')).toEqual({ token: 'e' });
    expect(resolveGitHub({}, () => 'g\n')).toEqual({ token: 'g' });
    expect(() => resolveGitHub({}, () => '')).toThrow(/GITHUB_TOKEN.*gh auth login/);
  });

  it('reports PR reads as fetches over ACP', () => {
    expect(toolKind('github_pr_read')).toBe('fetch');
    expect(toolKind('github_pr_create')).toBe('other');
  });
});

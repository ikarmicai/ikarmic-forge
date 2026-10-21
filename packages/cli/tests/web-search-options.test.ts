import { describe, expect, it } from 'vitest';

import { parseOptions, parseWebSearch, resolveWebSearch } from '../src/options.js';
import { toolKind } from '../src/acp/server.js';

describe('--web-search', () => {
  it('parses a bare flag as auto and validates a named backend', () => {
    expect(parseWebSearch(undefined)).toBeNull();
    expect(parseWebSearch(true)).toBe('auto');
    expect(parseWebSearch('Brave')).toBe('brave');
    expect(() => parseWebSearch('google')).toThrow(/one of brave, tavily, searxng/);
    expect(parseOptions(['node', 'forge', '--web-search', 'tavily', 'task']).options.webSearch).toBe('tavily');
  });

  it('resolves the backend from the environment, or says what to set', () => {
    expect(resolveWebSearch('auto', { BRAVE_API_KEY: 'k' })).toEqual({ provider: 'brave', apiKey: 'k' });
    expect(resolveWebSearch('searxng', { SEARXNG_URL: 'http://s' })).toEqual({ provider: 'searxng', baseUrl: 'http://s' });
    expect(() => resolveWebSearch('auto', {})).toThrow(/TAVILY_API_KEY, BRAVE_API_KEY or SEARXNG_URL/);
    expect(() => resolveWebSearch('brave', { TAVILY_API_KEY: 't' })).toThrow(/set BRAVE_API_KEY/);
  });

  it('is an ACP fetch-kind tool', () => {
    expect(toolKind('web_search')).toBe('fetch');
  });
});

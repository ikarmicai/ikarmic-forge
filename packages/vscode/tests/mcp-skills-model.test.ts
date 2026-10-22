import { describe, expect, it } from 'vitest';

import { BUILTIN_MCP_CATALOG } from '@ikarmic/forge-core';
import type { McpServerStatus } from '@ikarmic/forge-core';

import { catalogPickItems, commandPreview, serverDescription } from '../src/mcp/mcp-model.js';
import { skillPickItems } from '../src/skills/skills-model.js';

const st = (o: Partial<McpServerStatus>): McpServerStatus => ({ name: 's', state: 'connected', scope: 'user', toolCount: 2, ...o });

describe('mcp model', () => {
  it('describes each state', () => {
    expect(serverDescription(st({}))).toBe('connected · 2 tools');
    expect(serverDescription(st({ toolCount: 1, scope: 'workspace' }))).toBe('connected · 1 tool · workspace');
    expect(serverDescription(st({ state: 'disabled' }))).toBe('disabled');
    expect(serverDescription(st({ state: 'failed' }))).toBe('failed');
    expect(serverDescription(st({ state: 'needs-auth' }))).toBe('needs sign-in');
  });

  it('shows the exact command a catalog entry will run', () => {
    const fs = BUILTIN_MCP_CATALOG.find((e) => e.name === 'filesystem')!;
    expect(commandPreview(fs)).toBe('npx -y @modelcontextprotocol/server-filesystem ${workspaceFolder}');
    expect(commandPreview({ name: 'x', displayName: 'X', description: '', github: 'o/r' })).toBe('git clone o/r');
  });

  it('marks installed catalog entries', () => {
    const items = catalogPickItems(BUILTIN_MCP_CATALOG, new Set(['memory']));
    expect(items.find((i) => i.entry.name === 'memory')).toMatchObject({ installed: true });
    expect(items.find((i) => i.entry.name === 'memory')!.label).toContain('$(check)');
    expect(items.find((i) => i.entry.name === 'git')!.detail).toContain('runs: uvx mcp-server-git');
  });
});

describe('skills model', () => {
  it('marks installed catalog skills', () => {
    const items = skillPickItems([{ name: 'a', displayName: 'A', description: 'd', github: 'o/r' }], new Set(['a']));
    expect(items[0]).toMatchObject({ installed: true });
  });
});

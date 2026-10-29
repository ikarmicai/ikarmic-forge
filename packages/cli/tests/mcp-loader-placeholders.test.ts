import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expandServers, loadMcpTools } from '../src/mcp-loader.js';

describe('the terminal app fills placeholders before it starts an MCP server', () => {
  let dir: string;
  let stderr: string[];
  // The loader also reads ~/.forge/mcp.json: keep it away from the real home (RB-4).
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'forge-cli-mcp-ph-'));
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    stderr = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as never);
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('expands environment variables, defaults and the workspace folder in command, args, env, url and headers', () => {
    const out = expandServers(
      {
        mcpServers: {
          local: { command: 'npx', args: ['-y', 'pkg', '${REGION:-eu}', '${workspaceFolder}'], env: { TOKEN: '${GH_TOKEN}' } },
          hosted: { type: 'streamable-http', url: 'https://h/${REGION:-eu}', headers: { Authorization: 'Bearer ${GH_TOKEN}' } },
        },
      },
      '/work',
      { GH_TOKEN: 'abc' }
    );
    expect(out.mcpServers.local).toMatchObject({ args: ['-y', 'pkg', 'eu', '/work'], env: { TOKEN: 'abc' } });
    expect(out.mcpServers.hosted).toMatchObject({ url: 'https://h/eu', headers: { Authorization: 'Bearer abc' } });
  });

  it('leaves out a server whose variable is missing, says which one, and keeps the others', () => {
    const out = expandServers({ mcpServers: { bad: { command: 'npx', env: { T: '${GH_TOKEN}' } }, good: { command: 'npx' } } }, '/work', {});
    expect(Object.keys(out.mcpServers)).toEqual(['good']);
    expect(stderr.join('')).toContain('"bad"');
    expect(stderr.join('')).toContain('Missing environment variable GH_TOKEN.');
  });

  it('says stored secrets belong to the editor and points to a variable instead', () => {
    const out = expandServers({ mcpServers: { s: { command: 'npx', env: { T: '${input:token}' } } } }, '/work', {});
    expect(Object.keys(out.mcpServers)).toEqual([]);
    expect(stderr.join('')).toMatch(/editor/i);
    expect(stderr.join('')).toContain('variable');
  });

  it('never starts a server with literal placeholder text: nothing connects when the only server is missing a variable', async () => {
    const config = path.join(dir, 'mcp.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { bad: { command: 'node', args: ['-e', 'process.exit(0)', '${FORGE_TEST_NOPE_VAR}'] } } }));
    delete process.env.FORGE_TEST_NOPE_VAR;
    const r = await loadMcpTools(config);
    expect(r.servers).toEqual([]);
    expect(stderr.join('')).toContain('Missing environment variable FORGE_TEST_NOPE_VAR.');
    expect(stderr.join('')).not.toContain('failed to connect');
  });
});

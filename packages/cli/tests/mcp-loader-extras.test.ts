import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMcpTools } from '../src/mcp-loader.js';

/**
 * A tiny MCP server written without the SDK (the cli package does not depend on it, and the public repository must
 * build from the cli package alone): newline-delimited JSON-RPC over stdio, answering just what the loader asks.
 */
const SERVER = `
let buf = '';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const handlers = {
  initialize: (id, p) => send({ jsonrpc: '2.0', id, result: { protocolVersion: p.protocolVersion, capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'mini', version: '0.0.1' }, instructions: 'Be brief with mini.' } }),
  'tools/list': (id) => send({ jsonrpc: '2.0', id, result: { tools: [] } }),
  'resources/list': (id) => send({ jsonrpc: '2.0', id, result: { resources: [{ uri: 'note://a', name: 'A note' }] } }),
  'resources/read': (id, p) => send({ jsonrpc: '2.0', id, result: { contents: [{ uri: p.uri, text: 'note body' }] } }),
};
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && handlers[msg.method]) handlers[msg.method](msg.id, msg.params || {});
  }
});
`;

describe('loadMcpTools with resources and instructions', () => {
  // The loader also reads ~/.forge/mcp.json and global plugins: keep it away from the real home (RB-4).
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  beforeAll(async () => {
    const home = await mkdtemp(join(tmpdir(), 'cli-mcp-home-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('adds the resource tools and returns what the server says about itself', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cli-mcp-'));
    const serverPath = join(dir, 'mini-server.cjs');
    await writeFile(serverPath, SERVER);
    const configPath = join(dir, 'forge.mcp.json');
    await writeFile(configPath, JSON.stringify({ mcpServers: { mini: { command: process.execPath, args: [serverPath] } } }));
    const loaded = await loadMcpTools(configPath);
    try {
      expect(loaded.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['mcp_list_resources', 'mcp_read_resource']));
      expect(loaded.instructions).toContain('Be brief with mini.');
      const list = loaded.tools.find((t) => t.name === 'mcp_list_resources')!;
      const out = (await list.execute({}, { cwd: process.cwd(), auto: false })) as { resources: Array<{ uri: string }> };
      expect(out.resources.map((r) => r.uri)).toEqual(['note://a']);
    } finally {
      await loaded.cleanup();
    }
  }, 30_000);

  it('with no servers there are no resource tools and no instructions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cli-mcp-'));
    const configPath = join(dir, 'forge.mcp.json');
    await writeFile(configPath, JSON.stringify({ mcpServers: {} }));
    const loaded = await loadMcpTools(configPath);
    expect(loaded.tools.map((t) => t.name)).not.toContain('mcp_list_resources');
    expect(loaded.instructions ?? '').toBe('');
    await loaded.cleanup();
  });
});

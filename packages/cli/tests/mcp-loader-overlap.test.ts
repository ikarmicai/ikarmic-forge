import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMcpTools } from '../src/mcp-loader.js';

// A server that offers one tool Forge already has (read_file) and one it does not (create_issue).
const SERVER = `
let buf = '';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const schema = { type: 'object', properties: {} };
const handlers = {
  initialize: (id, p) => send({ jsonrpc: '2.0', id, result: { protocolVersion: p.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mini', version: '0.0.1' } } }),
  'tools/list': (id) => send({ jsonrpc: '2.0', id, result: { tools: [{ name: 'read_file', description: 'r', inputSchema: schema }, { name: 'create_issue', description: 'c', inputSchema: schema }] } }),
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

describe('the terminal app hides tools that repeat a Forge tool', () => {
  // The loader reads ~/.forge/mcp.json and ~/.forge/config.json: keep it away from the real home (RB-4).
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  let home: string;
  let config: string;
  let stderr: string[];

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'cli-mcp-overlap-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    await mkdir(join(home, '.forge'), { recursive: true });
    await writeFile(join(home, 'server.cjs'), SERVER);
    config = join(home, 'mcp.json');
    await writeFile(config, JSON.stringify({ mcpServers: { mini: { command: process.execPath, args: [join(home, 'server.cjs')] } } }));
    stderr = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as never);
  });
  afterEach(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
    await rm(home, { recursive: true, force: true });
  });

  it('offers the other tool and says how many were hidden', async () => {
    const loaded = await loadMcpTools(config);
    try {
      const names = loaded.tools.map((t) => t.name);
      expect(names).toContain('mcp__mini__create_issue');
      expect(names).not.toContain('mcp__mini__read_file');
      expect(stderr.join('')).toContain('1 tool');
      expect(stderr.join('')).toContain('mcpShowDuplicates');
    } finally {
      await loaded.cleanup();
    }
  }, 30_000);

  it('offers every tool for a server the person turned duplicates on for in their config', async () => {
    await writeFile(join(home, '.forge', 'config.json'), JSON.stringify({ mcpShowDuplicates: ['mini'] }));
    const loaded = await loadMcpTools(config);
    try {
      const names = loaded.tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['mcp__mini__create_issue', 'mcp__mini__read_file']));
    } finally {
      await loaded.cleanup();
    }
  }, 30_000);
});

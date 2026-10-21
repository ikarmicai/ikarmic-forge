/**
 * `forge acp`: speak the Agent Client Protocol on stdin/stdout so an ACP
 * client (JetBrains AI Chat, Zed, ...) can use Forge as its agent.
 *
 * stdout carries protocol messages only. Anything human-readable goes to
 * stderr, otherwise a stray log line would corrupt the JSON-RPC stream.
 */
import { createInterface } from 'node:readline';

import { Agent, type ModelConfig } from '@ikarmic/forge-core';

import { AcpServer } from '../acp/server.js';
import { toAgentConfig, type CliOptions } from '../options.js';

export async function handleAcpCommand(options: CliOptions, resolveModel: () => ModelConfig, version: string): Promise<number> {
  const server = new AcpServer((line) => process.stdout.write(`${line}\n`), {
    agentInfo: { name: 'forge', version },
    // The model is resolved per session so a missing key becomes a clear error on the
    // first prompt instead of killing the process before the client has connected.
    createAgentConfig: (cwd) => toAgentConfig({ ...options, cwd }, resolveModel(), async () => false, []),
    runAgent: (config, run) => new Agent(config).run(run),
  });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // Lines are handled concurrently: a long session/prompt must not block session/cancel
  // or the client's reply to a permission request.
  const inflight = new Set<Promise<void>>();
  rl.on('line', (line) => {
    const p: Promise<void> = server.handleLine(line).catch((err: Error) => {
      process.stderr.write(`forge acp: ${err.message}\n`);
    });
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
  });

  await new Promise<void>((resolve) => rl.on('close', resolve));
  server.close();
  await Promise.allSettled([...inflight]);
  return 0;
}

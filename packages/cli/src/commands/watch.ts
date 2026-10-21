/**
 * `forge watch`: runs a filesystem watcher that dispatches FileChanged
 * hook events independent of any active Agent.run(). Runs until
 * SIGINT (Ctrl+C). No agent loop involved.
 *
 * Loads hooks config exactly the way toAgentConfig does elsewhere
 * (loadHooksConfig -> new HooksBus). trustedProjectHooks is never set
 * to true here, same as every other CLI call site: project-level
 * FileChanged hooks stay blocked by default.
 */

import process from 'node:process';

import { createAiCommentHandler } from './ai-comments.js';

import {
  Agent,
  createAgentHookRunner,
  FileChangeCoalescer,
  HooksBus,
  loadHooksConfig,
  watchFilesystem,
  type AgentHookRunner,
  type FileChangeType,
  type HooksConfig,
  type ModelConfig,
} from '@ikarmic/forge-core';

function hasAgentHooks(config: HooksConfig): boolean {
  return Object.values(config).some((entries) => entries?.some((e) => e.hooks.some((h) => h.type === 'agent')));
}

export async function handleWatchCommand(
  cwd: string,
  resolveModel?: () => ModelConfig,
  watchOptions: { aiComments?: boolean } = {}
): Promise<number> {
  const { config, sources, warnings } = await loadHooksConfig(cwd);
  for (const warning of warnings) {
    process.stderr.write(`forge watch: warning: ${warning}\n`);
  }
  if (sources.length === 0) {
    process.stdout.write(
      '(no hooks configured: neither ~/.forge/settings.json nor .forge/settings.json exists; watching anyway, but nothing will run)\n'
    );
  }

  // `type: 'agent'` hooks need a model. Resolve it only when one is configured, so a
  // shell-only watch keeps working with no API key.
  let agentRunner: AgentHookRunner | undefined;
  if (hasAgentHooks(config)) {
    try {
      if (!resolveModel) throw new Error('no model resolver');
      agentRunner = createAgentHookRunner({ model: resolveModel(), cwd });
    } catch (err) {
      process.stderr.write(`forge watch: agent hooks disabled: ${(err as Error).message}
`);
    }
  }

  const bus = new HooksBus(config, agentRunner ? { agentRunner } : {});
  const coalescer = new FileChangeCoalescer((relPath, changeType) => {
    void dispatchAndReport(bus, cwd, relPath, changeType);
  });
  const onAiComments = watchOptions.aiComments
    ? createAiCommentHandler({
        cwd,
        run: async (task, mode) => {
          if (!resolveModel) throw new Error('no model configured');
          const agent = new Agent({
            model: resolveModel(),
            cwd,
            auto: true,
            ...(mode === 'question' ? { planMode: true } : {}),
          });
          return (await agent.run({ task })).finalText;
        },
      })
    : null;
  const watcherHandle = watchFilesystem(cwd, (relPath, changeType) => {
    coalescer.notify(relPath, changeType);
    if (onAiComments && changeType !== 'deleted') void onAiComments(relPath);
  });

  process.stdout.write(`forge watch: watching ${cwd}${watchOptions.aiComments ? ' for AI!/AI? comments' : ''} (Ctrl+C to stop)\n`);

  return new Promise<number>((resolve) => {
    const shutdown = (): void => {
      coalescer.dispose();
      void watcherHandle.close().then(() => {
        process.stdout.write('\nforge watch: stopped\n');
        resolve(130);
      });
    };
    process.on('SIGINT', shutdown);
  });
}

async function dispatchAndReport(
  bus: HooksBus,
  cwd: string,
  relPath: string,
  changeType: FileChangeType
): Promise<void> {
  const log = await bus.dispatch({ type: 'FileChanged', path: relPath, changeType, cwd });
  const ranCount = log.results.length;
  if (ranCount > 0) {
    process.stdout.write(`[${changeType}] ${relPath} -> ${ranCount} hook${ranCount === 1 ? '' : 's'} run\n`);
  }
}

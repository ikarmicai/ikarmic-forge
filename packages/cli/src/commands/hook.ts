/**
 * `forge hook …` subcommand: list, test, log hooks.
 *
 * Hooks are loaded from `~/.forge/settings.json` + `.forge/settings.json`
 * exactly the way the agent does, so what you see here matches what the
 * agent runs.
 */

import { HOOK_EVENT_NAMES, HooksBus, loadHooksConfig, type HookEventName } from '@ikarmic/forge-core';

import type { ParsedHookCommand } from '../options.js';

export async function handleHookCommand(cmd: ParsedHookCommand, cwd: string): Promise<number> {
  if (cmd.list) {
    return listHooks(cwd);
  }
  if (cmd.test) {
    return testHook(cwd, cmd.test.event, cmd.test.tool);
  }
  if (cmd.log) {
    process.stderr.write('forge hook log: not yet implemented (run the agent with hooks configured; entries appear in memory until you wire a logger)\n');
    return 2;
  }
  process.stderr.write(`forge hook: expected one of list|test|log. Events: ${HOOK_EVENT_NAMES.join(', ')}\n`);
  return 2;
}

async function listHooks(cwd: string): Promise<number> {
  const { config, sources, warnings } = await loadHooksConfig(cwd);
  if (sources.length === 0) {
    process.stdout.write('(no hooks configured: neither ~/.forge/settings.json nor .forge/settings.json exists)\n');
    return 0;
  }
  process.stdout.write(`Sources:\n${sources.map((s) => `  ${s}`).join('\n')}\n\n`);
  const events = Object.keys(config);
  if (events.length === 0) {
    process.stdout.write('(no hooks defined in any settings file)\n');
    return 0;
  }
  for (const event of events) {
    const entries = config[event as HookEventName] ?? [];
    process.stdout.write(`${event}:\n`);
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const timeout = hook.timeout ? ` (timeout ${hook.timeout}ms)` : '';
        process.stdout.write(`  [${entry.matcher || '*'}] ${hook.type}: ${hook.type === 'agent' ? hook.prompt : hook.command}${timeout}\n`);
      }
    }
  }
  if (warnings.length > 0) {
    process.stdout.write('\nWarnings:\n');
    for (const w of warnings) process.stdout.write(`  ${w}\n`);
  }
  return 0;
}

async function testHook(cwd: string, eventName: string, toolName?: string): Promise<number> {
  if (!HOOK_EVENT_NAMES.includes(eventName as HookEventName)) {
    process.stderr.write(`forge hook test: unknown event "${eventName}". Known: ${HOOK_EVENT_NAMES.join(', ')}\n`);
    return 2;
  }
  const { config, warnings } = await loadHooksConfig(cwd);
  if (warnings.length > 0) {
    process.stdout.write('Warnings:\n');
    for (const w of warnings) process.stdout.write(`  ${w}\n`);
  }
  const bus = new HooksBus(config);
  const synthetic = syntheticEventFor(eventName as HookEventName, toolName, cwd);
  process.stdout.write(`dispatching synthetic ${eventName}${toolName ? ` (tool=${toolName})` : ''}...\n`);
  const log = await bus.dispatch(synthetic);
  if (log.results.length === 0) {
    process.stdout.write('(no hooks matched: nothing ran)\n');
    return 0;
  }
  for (const r of log.results) {
    process.stdout.write(`\n  command: ${r.command}\n`);
    process.stdout.write(`  exit:    ${r.exitCode === null ? 'killed' : r.exitCode}\n`);
    process.stdout.write(`  timeout: ${r.timedOut}\n`);
    if (r.stdout) process.stdout.write(`  stdout:  ${r.stdout.trim()}\n`);
    if (r.stderr) process.stdout.write(`  stderr:  ${r.stderr.trim()}\n`);
    if (r.error) process.stdout.write(`  error:   ${r.error}\n`);
    process.stdout.write(`  dur:     ${r.durationMs}ms\n`);
  }
  return 0;
}

function syntheticEventFor(event: HookEventName, toolName: string | undefined, cwd: string) {
  const t = toolName ?? 'read_file';
  switch (event) {
    case 'SessionStart':
      return { type: event, cwd, startedAt: Date.now() };
    case 'SessionEnd':
      return { type: event, cwd, reason: 'completed', endedAt: Date.now() };
    case 'UserPromptSubmit':
      return { type: event, prompt: 'test prompt', cwd };
    case 'PreToolUse':
      return { type: event, toolName: t, toolArgs: { path: '.' }, toolCallId: 'test-call', cwd };
    case 'PostToolUse':
      return {
        type: event,
        toolName: t,
        toolArgs: { path: '.' },
        toolCallId: 'test-call',
        result: '(synthetic result)',
        isError: false,
        durationMs: 0,
        cwd,
      };
    case 'PreCompact':
      return { type: event, messagesCount: 10, tokens: 1000, cwd };
    case 'SubagentStart':
      return { type: event, task: 'synthetic subagent task', cwd, startedAt: Date.now() };
    case 'SubagentStop':
      return { type: event, task: 'synthetic subagent task', cwd, endedAt: Date.now(), reason: 'completed' };
    case 'Notification':
      return { type: event, message: 'synthetic notification', level: 'info' as const, cwd };
    case 'Stop':
      return { type: event, reason: 'completed', cwd };
    case 'FileChanged':
      return { type: event, path: 'synthetic/path.ts', changeType: 'modified' as const, cwd };
  }
}
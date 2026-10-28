/**
 * `forge orchestrator …` subcommand: multi-agent routing.
 *
 * `forge orchestrator list`: show available specialists
 * `forge orchestrator run "<task>"`: dispatch the task via the orchestrator
 * `forge orchestrator plan "<task>"`: preview the routing plan without running it
 *
 * Mirrors the other soft-prefix subcommands: no special parsing,
 * exits 0/1/2.
 */

import process from 'node:process';

import {
  BUILTIN_SPECIALISTS,
  runReasonLabel,
  listSpecialists,
  loadForgeConfigFile,
  loadToolSandboxConfig,
  parseRouterOutput,
  resolveAutoApprove,
  runOrchestrator,
  runRouter,
  type ForgeConfigFile,
  type ToolSandbox,
} from '@ikarmic/forge-core';

import type { ParsedOrchestratorCommand } from '../options.js';

export async function handleOrchestratorCommand(
  cmd: ParsedOrchestratorCommand,
  cwd: string,
  model: { provider: string; model: string },
  options: {
    worktrees?: 'auto' | 'always' | 'never';
    /** v2.14: delete orchestrator-created branches alongside their worktrees. */
    cleanupBranches?: boolean;
    /** Commit worktree specialists' edits onto kept branches. */
    commitChanges?: boolean;
  } = {}
): Promise<number> {
  if (cmd.list) {
    return printSpecialistsList();
  }
  if (cmd.run) {
    return runOrchestratorCli(cmd.run.task, cwd, model, {
      preview: false,
      worktrees: options.worktrees ?? 'auto',
      cleanupBranches: options.cleanupBranches ?? true,
      commitChanges: options.commitChanges ?? false,
    });
  }
  if (cmd.plan) {
    return runOrchestratorCli(cmd.plan.task, cwd, model, { preview: true });
  }
  process.stderr.write(
    'forge orchestrator: expected one of list|run|plan. Try `forge orchestrator --help` (not yet implemented; read docs/ORCHESTRATOR.md).\n'
  );
  return 2;
}

async function printSpecialistsList(): Promise<number> {
  const builtinIds = new Set(BUILTIN_SPECIALISTS.map((s) => s.id));
  const all = listSpecialists();
  process.stdout.write('Available specialists:\n');
  for (const s of all) {
    const tag = builtinIds.has(s.id) ? 'core' : 'custom';
    process.stdout.write(`  ${s.id.padEnd(8)} ${tag.padEnd(6)} ${s.description}\n`);
  }
  const customCount = all.length - BUILTIN_SPECIALISTS.length;
  if (customCount > 0) {
    process.stdout.write(`\n${customCount} custom specialist${customCount === 1 ? '' : 's'} loaded from ~/.forge/specialists.json\n`);
  }
  return 0;
}

/**
 * The person's limits for orchestrator steps, which have no one to ask (RB-39): the auto-approve list and
 * permission rules from ~/.forge/config.json and the tool sandbox from ~/.forge/settings.json, loaded the
 * way the CLI's own runs load them (project settings are never trusted by the CLI). Paths are for tests.
 */
export async function orchestratorLimits(
  cwd: string,
  paths: { configPath?: string; settingsPath?: string } = {}
): Promise<{ autoApproveTools: string[]; permissionRules?: NonNullable<ForgeConfigFile['permission']>; toolSandbox?: ToolSandbox }> {
  const shared = (await loadForgeConfigFile(paths.configPath)).config;
  const { sandbox } = await loadToolSandboxConfig(cwd, { trustedProjectSettings: false }, paths.settingsPath);
  return {
    autoApproveTools: resolveAutoApprove(shared.autoApproveTools),
    ...(shared.permission && Object.keys(shared.permission).length > 0 ? { permissionRules: shared.permission } : {}),
    ...(sandbox && Object.keys(sandbox).length > 0 ? { toolSandbox: sandbox } : {}),
  };
}

async function runOrchestratorCli(
  task: string,
  cwd: string,
  model: { provider: string; model: string },
  opts: {
    preview: boolean;
    worktrees?: 'auto' | 'always' | 'never';
    /** v2.14: opt in/out of branch deletion after worktree removal. */
    cleanupBranches?: boolean;
    commitChanges?: boolean;
  }
): Promise<number> {
  try {
    if (opts.preview) {
      const result = await runRouter({
        task,
        model: model as never,
        cwd,
        auto: true,
        maxIterations: 5,
      });
      const plan = parseRouterOutput(result.finalText, task);
      process.stdout.write(`Plan:\n  rationale: ${plan.rationale ?? '(none)'}\n`);
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        process.stdout.write(
          `  ${i + 1}. [${step.specialist}] ${step.task}${step.parallelGroup ? ` (group: ${step.parallelGroup})` : ''}\n`
        );
      }
      return 0;
    }

    const result = await runOrchestrator({
      task,
      model: model as never,
      cwd,
      auto: true,
      ...(await orchestratorLimits(cwd)),
      worktrees: opts.worktrees ?? 'auto',
      // v2.14: delete auto-created branches (default true). Mirror
      // the user's CLI flag via the dispatchOpts field below.
      ...(opts.cleanupBranches !== undefined
        ? { cleanupBranches: opts.cleanupBranches }
        : {}),
      ...(opts.commitChanges ? { commitChanges: true } : {}),
      onWorktreeEvent: (event) => {
        // Surface worktree lifecycle in stderr (so it doesn't pollute
        // the plan/results output). Cheap progress signal.
        process.stderr.write(
          `forge orchestrator: ${event.kind} worktree ${event.path} (${event.branch})\n`
        );
      },
    });
    process.stdout.write(`Plan (${result.plan.rationale ?? 'no rationale'}):\n`);
    for (let i = 0; i < result.steps.length; i++) {
      const s = result.steps[i]!;
      const wtInfo = s.worktreePath
        ? ` worktree=${s.worktreeBranch}`
        : '';
      process.stdout.write(
        `  ${i + 1}. [${s.step.specialist}] ${runReasonLabel(s.reason)} (${s.durationMs}ms)${wtInfo}${s.error ? ` ERROR: ${s.error}` : ''}\n`
      );
      if (s.finalText) {
        const preview = s.finalText.length > 200 ? s.finalText.slice(0, 200) + '…' : s.finalText;
        process.stdout.write(`     → ${preview.replace(/\n/g, ' ')}\n`);
      }
    }
    const kept = result.steps.filter((s) => s.worktreeCommit && s.worktreeBranch);
    if (kept.length > 0) {
      process.stdout.write('\nBranches with committed work (review, then merge or delete):\n');
      for (const s of kept) {
        process.stdout.write(
          `  ${s.worktreeBranch}  (${s.changedFiles?.length ?? 0} file${s.changedFiles?.length === 1 ? '' : 's'})\n` +
            `    review: git diff HEAD...${s.worktreeBranch}\n` +
            `    merge:  git merge --no-ff ${s.worktreeBranch}\n` +
            `    drop:   git branch -D ${s.worktreeBranch}\n`
        );
      }
    }
    process.stdout.write(
      `\ntotal: ${result.durationMs}ms, ${result.totalInputTokens} in / ${result.totalOutputTokens} out tokens` +
        (result.costKnown ? `, $${result.totalCostUsd.toFixed(4)}` : '') +
        '\n'
    );
    return 0;
  } catch (err) {
    process.stderr.write(`forge orchestrator: ${(err as Error).message}\n`);
    return 1;
  }
}
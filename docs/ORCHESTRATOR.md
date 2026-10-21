# Orchestrator Mode
*Tier 2, v2.0.0 — multi-agent routing.*

The orchestrator is a top-level coordinator that takes one user
task, decides which specialist(s) to dispatch to, runs them, and
returns aggregated results.

## Specialists

Five built-in specialists ship with v2.0. Each is a tightly-scoped
sub-agent with a focused system prompt + a narrow tool allowlist:

| Id | Role | Tools | Iteration cap | Auto? |
|---|---|---|---|---|
| `plan` | Read-only investigation → structured plan | read-only | 8 | no |
| `code` | Focused file edits + tests | full + write | 20 | yes |
| `debug` | Reproduce + identify root cause | read + run_command | 15 | no |
| `ask` | Pure Q&A | read + fetch_url | 5 | no |
| `review` | Code review | read-only | 6 | no |

Every specialist disallows `sub_agent` — no recursion. Library users
can register custom specialists (Tier 2 follow-up).

## Usage

```bash
# Show the available specialists.
forge orchestrator list

# Preview the routing plan for a task (no execution).
forge orchestrator plan "implement dark mode toggle in the settings page"

# Run the orchestrator end-to-end.
forge orchestrator run "refactor the auth middleware to use async/await"
```

The orchestrator's `run` command is equivalent to a one-shot agent
run, but routes through the router + specialists first. Output
includes per-step duration, token usage, and aggregated cost.

## How routing works

1. The orchestrator runs a **router agent** — a regular `Agent` with a
   system prompt that asks for a structured JSON plan (no tools).
2. The router's final text is parsed by `parseRouterOutput`, which
   tolerates ```json fences and leading prose. On parse failure we
   fall back to a single `code` step (never crash on a malformed plan).
3. Steps are grouped via `groupStepsByParallel(plan.steps)`. Steps
   that share a `parallelGroup` label **and are consecutive** in
   declaration order collapse into one group; everything else ends
   up in its own group of size 1 (sequential). Each group runs
   internally via `Promise.allSettled` (with a `maxParallelism`
   cap of 5, hard max 10). Groups themselves stay sequential —
   group N+1 only starts after group N has fully settled.
4. The orchestrator aggregates the per-step results + token counts
   + costs and prints them as a table.

## Library API

```ts
import { runOrchestrator, runRouter, groupStepsByParallel, BUILTIN_SPECIALISTS } from '@ikarmic/forge-core';

const result = await runOrchestrator({
  task: 'implement dark mode toggle in the settings page',
  model: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  cwd: process.cwd(),
  // Optional: cap concurrent specialists within a parallel group.
  // Default 5; clamped to a hard max of 10.
  maxParallelism: 5,
});

console.log(result.plan.rationale);
for (const step of result.steps) {
  console.log(`[${step.step.specialist}] ${step.finalText}`);
}
```

`runRouter` runs only the router (no specialist dispatch) and returns
the parsed plan — useful for previews and tests.

`groupStepsByParallel(steps)` is the pure helper that converts a flat
plan into a `step[][]` of execution batches. Call it directly when you
want to preview dispatch ordering or build your own executor:

```ts
import { groupStepsByParallel } from '@ikarmic/forge-core';

const plan = parseRouterOutput(routerText, task);
const groups = groupStepsByParallel(plan.steps);
for (const [i, group] of groups.entries()) {
  const parallel = group.length > 1 ? 'parallel' : 'sequential';
  console.log(`Group ${i} (${parallel}, ${group.length} step${group.length === 1 ? '' : 's'}):`);
  for (const step of group) {
    console.log(`  - [${step.specialist}] ${step.task}`);
  }
}
```

### Parallel dispatch contract

The grouping rule is **consecutive same-label** — a different label (or
no label) between two matching labels breaks the group:

| Plan | Groups |
| --- | --- |
| `[A, B(X), C(X), D, E(X)]` | `[[A], [B, C], [D], [E]]` |
| `[A(X), B(X), C(X), D(X)]` | `[[A, B, C, D]]` |
| `[A, B, C]` | `[[A], [B], [C]]` |
| `[A(X), B(Y), C(X), D(Y)]` | `[[A], [B], [C], [D]]` |

So if you want two `code` specialists to run concurrently, they MUST be
adjacent in the plan — the router won't know they belong together
otherwise. The router prompt now documents this rule explicitly.

Within a group, one specialist throwing does not affect the others
(`Promise.allSettled` semantics — siblings always complete).

## Custom specialists

Beyond the five built-ins, you can register your own specialist
profiles. Either at runtime (library) or via the on-disk config file
(CLI).

### Library API

```ts
import { registerSpecialist } from '@ikarmic/forge-core';

registerSpecialist({
  id: 'docs',
  description: 'Documentation writer',
  systemPrompt: 'You are the docs specialist. Read existing code, write JSDoc, never run commands.',
  allowedTools: ['read_file', 'write_file', 'edit_file', 'search_files'],
  maxIterations: 10,
});
```

After registration the orchestrator can dispatch to it:

```ts
const result = await runOrchestrator({
  task: 'document the public API',
  model: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
// router will pick `docs` when it matches the task shape
```

Use `unregisterSpecialist(id)` to remove a custom registration, and
`listSpecialists()` to enumerate everything (built-ins first, custom
second).

### CLI: `~/.forge/specialists.json`

The CLI auto-loads this file on startup, before any orchestrator
command runs. Missing file → silent no-op; malformed file → stderr
warning but the CLI still works (built-ins remain).

Format:

```json
{
  "version": 1,
  "specialists": [
    {
      "id": "docs",
      "description": "Documentation writer",
      "systemPrompt": "...",
      "allowedTools": ["read_file", "write_file", "edit_file", "search_files"],
      "maxIterations": 10
    },
    {
      "id": "refactor",
      "description": "Refactor only — no behavior changes",
      "systemPromptFile": "prompts/refactor.md",
      "allowedTools": ["read_file", "edit_file", "search_files", "run_command"],
      "maxIterations": 15
    }
  ]
}
```

- `systemPrompt` (inline) or `systemPromptFile` (path relative to
  the JSON file) — exactly one required.
- `allowedTools` — array of tool names; empty array is allowed (no
  tools).
- `forbiddenTools` — optional; `sub_agent` is always added.
- `maxIterations` — optional; defaults to 10.
- `auto` — optional; defaults to false.

See the loaded specialists via `forge orchestrator list` — custom
entries are tagged `[custom]` and the CLI prints a footer with the
count.

### Safety invariant

`'sub_agent'` is **never** allowed in a custom specialist's
`allowedTools`. The validator enforces this — attempts throw with
a descriptive message. The orchestrator's sub-orchestrator pattern
recursion is a hard NO.

## Try it

```bash
forge orchestrator list   # 5 specialists
forge orchestrator plan "add a logout button"
```

## Commit, review and merge (v4.4)

By default a worktree specialist's uncommitted edits disappear with its worktree; only its final text survives. With `commitChanges` (library) or `--orchestrator-commit` (CLI), each specialist's edits are committed onto its own `forge/<label>-<sha>` branch, the branch is kept, and only the worktree directory is removed. The run result carries `worktreeBranch`, `worktreeCommit` and `changedFiles` per step.

```bash
forge orchestrator run "fix the auth tests and update the docs" --orchestrator-commit --orchestrator-worktrees always
# then, per branch it prints:
git diff HEAD...forge/code-fix-the-auth-tests-1a2b3c     # review
git merge --no-ff forge/code-fix-the-auth-tests-1a2b3c   # keep it
git branch -D forge/code-fix-the-auth-tests-1a2b3c       # or drop it
```

Library helpers: `commitAllInWorktree`, `branchChangedFiles`, `branchDiff`, `mergeBranch` (aborts cleanly on conflicts and reports the files; refuses to start over uncommitted changes) and `deleteBranch`. `runOrchestrator({ onProgress })` streams the plan and each step's start and finish.

In VS Code the **Parallel Agents** view runs the same flow: `Forge: Run Parallel Agents...`, watch each specialist, then review, merge or discard each branch.

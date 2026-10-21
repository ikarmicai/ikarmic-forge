# @ikarmic/forge-eval

Eval harness for [IKarmic AI Forge](https://github.com/ikarmicai/ikarmic-forge). Runs agent
tasks against isolated workspaces and grades the results with deterministic checks: 
no API keys needed to *grade*, only to *run*.

## What's in the box

- **5 free graders**: `regex`, `contains`, `equals`, `file-exists`, `command-runs`.
  Deterministic, no LLM-as-judge, no API spend.
- **10 curated tasks** spanning three categories:
  - **read**: list / read / search style tasks
  - **edit**: write / modify / delete style tasks
  - **multi-step**: tasks that need search + edit, run + report, or read + summarize
- **Per-task isolated cwd**: every task runs in its own temp directory so tasks can't
  affect each other or your real project.
- **CLI**: `forge-eval run [--model X] [--task Y] [--json]` plus
  `forge-eval list` for browsing the task catalog.
- **Markdown + JSON reports** so you can diff runs over time.

## Install / build

This package lives in the Forge monorepo. From the repo root:

```bash
pnpm -r build
pnpm --filter @ikarmic/forge-eval test
```

## CLI usage

```bash
# Run the full suite against whatever model FORGE_DEFAULT_* resolves to.
pnpm forge-eval run

# Run a single task by id.
pnpm forge-eval run --task read-package-version

# Pin a specific model.
pnpm forge-eval run --model anthropic/claude-3-5-haiku-latest

# JSON output (one event per line) for piping into scripts.
pnpm forge-eval run --json | tee run.jsonl

# Browse the task catalog.
pnpm forge-eval list
```

The CLI exits 0 if all tasks passed, 1 if any failed, 2 if the run couldn't start
(missing model, bad task id, etc.).

## Task authoring

A task is just an object: setup writes fixture files into a temp dir, the agent runs
against that dir, then graders inspect the result + filesystem.

```ts
import { defineTask, regex, fileExists, commandRuns } from '@ikarmic/forge-eval';

export default defineTask({
  id: 'my-task',
  name: 'My task',
  category: 'edit',
  description: 'Does X then Y',
  task: 'Write "hi" to greeting.txt',
  setup: async (cwd) => {
    await fs.writeFile(path.join(cwd, '.gitkeep'), '');
  },
  graders: [
    fileExists('greeting.txt'),
    commandRuns({ command: 'node -e "require(\'fs\').readFileSync(\'greeting.txt\',\'utf8\')"', contains: 'hi' }),
  ],
});
```

Drop the task file in `src/tasks/your-task.ts`, register it in `src/tasks/index.ts`, done.

## Grader reference

| Grader | What it checks |
|---|---|
| `regex(pattern, opts?)` | `result.finalText` matches a regex (and optionally case-insensitive / multiline) |
| `contains(substring)` | `result.finalText` contains a substring (case-sensitive) |
| `equals(text)` | `result.finalText.trim()` equals `text.trim()` |
| `fileExists(relPath)` | A file exists at `cwd/relPath` |
| `commandRuns(opts)` | Runs a shell command via `child_process.exec` in `cwd`; checks exit code 0 + optional stdout predicate |

All graders receive `{ cwd, task, result, toolInvocations }` so you can also write
custom graders against `result.messages` or the recorded tool calls.

## Limitations

- Free graders only: no LLM-as-judge in v1 (that needs API keys per task).
- 10 tasks in v1: the catalog is intentionally small. More tasks are welcome
  via PR.
- Tasks assume a writable temp dir and a working `node` on PATH (for `command-runs`).

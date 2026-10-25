#!/usr/bin/env node
import process from 'node:process';

import { DEFAULT_TASKS, findTask, TASKS } from '../tasks/index.js';
import { formatJsonReport, formatMarkdownReport, formatTerminalSummary } from '../report.js';
import { resolveModel, runSuite } from '../runner.js';

interface CliArgs {
  command: 'run' | 'list' | 'help';
  model?: string;
  task?: string;
  /** Run only tasks carrying this tag. */
  tag?: string;
  /** Run each selected task this many times (default 1). */
  runs: number;
  json: boolean;
  markdown: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const out: CliArgs = {
    command: 'run',
    runs: 1,
    json: false,
    markdown: false,
    help: false,
  };

  const takeNext = (flag: string): string => {
    const v = args.shift();
    if (v === undefined || v.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    return v;
  };

  // Subcommand.
  if (args[0] === 'list') {
    args.shift();
    out.command = 'list';
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    args.shift();
    out.command = 'help';
    out.help = true;
  } else if (args[0] === 'run') {
    args.shift();
    out.command = 'run';
  }

  while (args.length > 0) {
    const a = args.shift();
    if (a === '--model') {
      out.model = takeNext('--model');
    } else if (a === '--task') {
      out.task = takeNext('--task');
    } else if (a === '--tag') {
      out.tag = takeNext('--tag');
    } else if (a === '--runs') {
      const n = Number(takeNext('--runs'));
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('--runs must be a whole number from 1 to 50');
      out.runs = n;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--markdown') {
      out.markdown = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  return out;
}

function printHelp(): void {
  process.stdout.write(
    `forge-eval: run Forge agent tasks and grade the results.\n\n` +
      `Usage:\n` +
      `  forge-eval run [--model <provider>/<model>] [--task <id> | --tag <tag>] [--runs <n>] [--json | --markdown]\n` +
      `  forge-eval list\n` +
      `  forge-eval help\n\n` +
      `Flags:\n` +
      `  --model <p>/<m>   Override the model. Defaults to FORGE_DEFAULT_MODEL / provider env vars.\n` +
      `  --task <id>       Run only the named task (see \`forge-eval list\`).\n` +
      `  --tag <tag>       Run only tasks with this tag (for example: agents).\n` +
      `  --runs <n>        Run each selected task n times, for pass counts (1-50).\n` +
      `  --json            Emit a single JSON report on stdout.\n` +
      `  --markdown        Emit a markdown report on stdout (in addition to terminal summary).\n\n` +
      `Exit codes: 0 = all passed, 1 = any failed, 2 = run couldn't start.\n`
  );
}

function printList(): void {
  process.stdout.write(`# Tasks (${TASKS.length})\n\n`);
  for (const t of TASKS) {
    process.stdout.write(`## ${t.id}: ${t.name} [${t.category}]\n${t.description}\n\n`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === 'help' || args.help) {
    printHelp();
    return;
  }
  if (args.command === 'list') {
    printList();
    return;
  }

  // command === 'run' from here on
  // Task lookup first: it doesn't need a model, so we can fail fast on a
  // bogus --task id before bothering to resolve credentials.
  let tasks: readonly import('../graders/index.js').TaskDefinition[];
  if (args.task) {
    const t = findTask(args.task);
    if (!t) {
      process.stderr.write(`forge-eval: unknown task id "${args.task}". Run \`forge-eval list\` to see options.\n`);
      process.exit(2);
      return;
    }
    tasks = [t];
  } else {
    tasks = args.tag ? TASKS.filter((t) => t.tags?.includes(args.tag!)) : DEFAULT_TASKS;
    if (tasks.length === 0) {
      process.stderr.write(`forge-eval: no task has the tag "${args.tag}".
`);
      process.exit(2);
      return;
    }
  }

  let model;
  try {
    model = resolveModel(args.model);
  } catch (err) {
    process.stderr.write(`forge-eval: ${(err as Error).message}\n`);
    process.exit(2);
    return;
  }

  if (!args.json) {
    process.stderr.write(
      `forge-eval: running ${tasks.length} task(s) against ${model.provider}/${model.model}...\n`
    );
  }

  try {
    const suite = await runSuite(Array.from({ length: args.runs }, () => tasks).flat(), model);

    if (args.json) {
      const report = formatJsonReport(suite);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write('\n' + formatTerminalSummary(suite) + '\n');
      if (args.markdown) {
        process.stdout.write('\n' + formatMarkdownReport(suite) + '\n');
      }
    }

    process.exit(suite.summary.failed === 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`forge-eval: ${(err as Error).message}\n`);
    process.exit(2);
  }
}

main().catch((err: Error) => {
  process.stderr.write(`forge-eval: ${err.message}\n`);
  process.exit(1);
});

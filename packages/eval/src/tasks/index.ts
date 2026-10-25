import type { TaskDefinition } from '../graders/index.js';

import readListFiles from './read.list-files.js';
import readPackageVersion from './read.package-version.js';
import readSearchTodos from './read.search-todos.js';
import editWriteHello from './edit.write-hello.js';
import editReplaceGreeting from './edit.replace-greeting.js';
import editRemoveSection from './edit.remove-section.js';
import editRenameSymbol from './edit.rename-symbol.js';
import multiRunAndReport from './multi.run-and-report.js';
import multiRefactorMove from './multi.refactor-move.js';
import multiSummarize from './multi.summarize.js';
import memoryRecallRelevant from './memory.recall-relevant.js';
import agentsPlanFeature from './agents.plan-feature.js';
import agentsCodeFix from './agents.code-fix.js';
import agentsCodeInstalledApi from './agents.code-installed-api.js';
import agentsDebugOffByOne from './agents.debug-off-by-one.js';
import agentsAskWhere from './agents.ask-where.js';
import agentsReviewPlantedBug from './agents.review-planted-bug.js';
import agentsSecurityFind from './agents.security-find.js';
import agentsSecurityNoFix from './agents.security-no-fix.js';
import { askDeepChain, askTraced, codeManyFiles, codeRememberedApi, debugIndirect, planCallers } from './agents.hard.js';

/**
 * The full task catalog. Order is the default run order. Keep grouped by
 * category so the report reads naturally.
 */
export const TASKS: readonly TaskDefinition[] = [
  // read
  readListFiles,
  readPackageVersion,
  readSearchTodos,
  // edit
  editWriteHello,
  editReplaceGreeting,
  editRemoveSection,
  editRenameSymbol,
  // multi-step
  multiRunAndReport,
  multiRefactorMove,
  multiSummarize,
  // memory (appended so the indexes of the tasks above stay stable)
  memoryRecallRelevant,
  // agents: each run as a built-in agent (`specialist`); select with --tag agents
  agentsPlanFeature,
  agentsCodeFix,
  agentsCodeInstalledApi,
  agentsDebugOffByOne,
  agentsAskWhere,
  agentsReviewPlantedBug,
  agentsSecurityFind,
  agentsSecurityNoFix,
  // agents, harder: select with --tag agents-hard
  planCallers,
  codeRememberedApi,
  debugIndirect,
  askTraced,
  codeManyFiles,
  askDeepChain,
];

/** What a plain `forge-eval run` runs: everything but the agent tasks, which are opt-in with --tag agents (or agents-hard). */
export const DEFAULT_TASKS: readonly TaskDefinition[] = TASKS.filter((t) => t.category !== 'agents');

/** Lookup by id; returns undefined if missing. */
export function findTask(id: string): TaskDefinition | undefined {
  return TASKS.find((t) => t.id === id);
}

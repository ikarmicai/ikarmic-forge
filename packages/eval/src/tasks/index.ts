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
];

/** Lookup by id; returns undefined if missing. */
export function findTask(id: string): TaskDefinition | undefined {
  return TASKS.find((t) => t.id === id);
}

// Graders
export {
  regex,
  contains,
  equals,
  fileExists,
  fileMatches,
  fileMissing,
  directoryHas,
  commandRuns,
  toolWasCalled,
  toolNotCalled,
  finalTextNonEmpty,
  completed,
  defineTask,
} from './graders/index.js';
export type {
  Grader,
  GraderContext,
  GraderResult,
  TaskCategory,
  TaskDefinition,
  TaskInfo,
  ToolInvocation,
  RegexGraderOptions,
  CommandRunsOptions,
} from './graders/index.js';

// Tasks
export { TASKS, findTask } from './tasks/index.js';

// Runner
export { runTask, runSuite, resolveModel } from './runner.js';
export type { TaskRunResult, SuiteRunResult, RunTaskOptions } from './runner.js';

// Report
export { formatJsonReport, formatMarkdownReport, formatTerminalSummary } from './report.js';
export type { JsonReport } from './report.js';

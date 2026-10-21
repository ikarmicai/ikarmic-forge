export type {
  Grader,
  GraderContext,
  GraderResult,
  TaskCategory,
  TaskDefinition,
  TaskInfo,
  ToolInvocation,
} from './types.js';
export { regex, contains, equals, type RegexGraderOptions } from './text.js';
export { fileExists, fileMatches, fileMissing, directoryHas } from './fs.js';
export { commandRuns, type CommandRunsOptions } from './shell.js';
export {
  toolWasCalled,
  toolNotCalled,
  toolCalledWith,
  toolCount,
  noToolErrors,
  finalTextNonEmpty,
  completed,
  type ToolCountOptions,
} from './behavior.js';
// v2.12: JSON-schema / Zod-schema graders for structured-output tasks.
export { jsonSchema, jsonSchemaPartial, type JsonSchemaGraderOptions } from './schema.js';
// v2.13: Budget / throughput graders over AgentRunResult aggregates.
export {
  tokensUnder,
  costUnder,
  durationUnder,
  iterationsUnder,
  type TokensUnderOptions,
} from './metrics.js';
// v2.13: Content extraction graders (fenced code blocks, predicate JSON).
export {
  languageBlock,
  jsonContains,
  type LanguageBlockOptions,
} from './content.js';

/**
 * Helper for task authors: stamps a `TaskDefinition` with sensible defaults
 * and gives the call site a single import. Functionally identical to the
 * raw object: purely ergonomic.
 */
export function defineTask<T extends import('./types.js').TaskDefinition>(def: T): T {
  return def;
}

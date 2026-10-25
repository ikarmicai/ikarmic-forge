/**
 * Smoke test for the eval package's public API. Confirms every export is
 * present and callable — guards against accidental breakage when the package
 * is imported by external users.
 */
import { describe, expect, it } from 'vitest';

import * as pkg from '../src/index.js';

describe('@ikarmic/forge-eval public API', () => {
  it('exports all graders', () => {
    expect(typeof pkg.regex).toBe('function');
    expect(typeof pkg.contains).toBe('function');
    expect(typeof pkg.equals).toBe('function');
    expect(typeof pkg.fileExists).toBe('function');
    expect(typeof pkg.fileMatches).toBe('function');
    expect(typeof pkg.fileMissing).toBe('function');
    expect(typeof pkg.directoryHas).toBe('function');
    expect(typeof pkg.commandRuns).toBe('function');
    expect(typeof pkg.toolWasCalled).toBe('function');
    expect(typeof pkg.toolNotCalled).toBe('function');
    expect(typeof pkg.finalTextNonEmpty).toBe('function');
    expect(typeof pkg.completed).toBe('function');
    expect(typeof pkg.defineTask).toBe('function');
  });

  it('exports the task catalog and lookup', () => {
    expect(Array.isArray(pkg.TASKS)).toBe(true);
    expect(pkg.TASKS.length).toBe(25);
    expect(typeof pkg.findTask).toBe('function');
    expect(pkg.findTask('read-package-version')?.id).toBe('read-package-version');
    expect(pkg.findTask('nope')).toBeUndefined();
  });

  it('exports the runner', () => {
    expect(typeof pkg.runTask).toBe('function');
    expect(typeof pkg.runSuite).toBe('function');
    expect(typeof pkg.resolveModel).toBe('function');
  });

  it('exports the report formatters', () => {
    expect(typeof pkg.formatMarkdownReport).toBe('function');
    expect(typeof pkg.formatTerminalSummary).toBe('function');
    expect(typeof pkg.formatJsonReport).toBe('function');
  });
});

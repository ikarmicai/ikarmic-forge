import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * RB-149: on Windows, Node 24 aborts with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" and exit code 127
 * when `process.exit` runs soon after a `fetch`. `forge skill publish` with a refused token printed its sentence, then
 * crashed, and a script saw 127 instead of 1; `forge skill install` of a missing repository did the same. The commands in
 * `main` end through `exitWhenIdle`, which sets the code and lets Node finish.
 */
const source = readFileSync(path.join(__dirname, '..', 'src', 'bin', 'forge.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('the CLI ends its commands without process.exit right after a request', () => {
  it('main returns through exitWhenIdle, never process.exit', () => {
    const start = source.indexOf('async function main(): Promise<void> {');
    const end = source.indexOf('// awaits `session.cleanup()` explicitly');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body.match(/process\.exit\(/g) ?? []).toEqual([]);
    expect((body.match(/return exitWhenIdle\(/g) ?? []).length).toBeGreaterThan(15);
  });

  it('the last-chance handler ends the same way', () => {
    const handler = source.slice(source.indexOf('main().catch('));
    expect(handler).toContain('void exitWhenIdle(1);');
    expect(handler).not.toContain('process.exit(');
  });

  it('exitWhenIdle sets the code first, and its fallback does not keep the process alive', () => {
    const fn = source.slice(source.indexOf('export function exitWhenIdle'), source.indexOf('async function main()'));
    expect(fn.indexOf('process.exitCode = code;')).toBeGreaterThan(0);
    expect(fn).toContain('.unref()');
  });
});

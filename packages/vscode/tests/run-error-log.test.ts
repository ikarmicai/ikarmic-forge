import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runErrorLogLine } from '../src/chat/run-error-log.js';

describe('the line Output > Forge gets when a chat run fails (RB-84)', () => {
  it('says what failed, in one line', () => {
    expect(runErrorLogLine('invalid params, 400 (2013)')).toBe('Chat run failed: invalid params, 400 (2013)');
    expect(runErrorLogLine('first\nsecond\r\n  third')).toBe('Chat run failed: first second third');
  });

  it('removes a secret the provider echoed back', () => {
    const line = runErrorLogLine('Incorrect API key provided: sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD');
    expect(line).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD');
    expect(line).toContain('REDACTED');
  });

  it('keeps a long provider body short', () => {
    expect(runErrorLogLine('x'.repeat(5000)).length).toBeLessThan(700);
  });

  it('is written for both ways a run can fail: the error event and a thrown error', () => {
    const source = readFileSync(path.join(__dirname, '..', 'src', 'chat', 'chat-view.ts'), 'utf8');
    const calls = source.match(/this\.log\?\.warn\(runErrorLogLine\(/g) ?? [];
    expect(calls).toHaveLength(2);
  });
});

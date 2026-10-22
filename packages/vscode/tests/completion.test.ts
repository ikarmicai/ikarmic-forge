/**
 * Unit tests for completion-helpers.ts. These cover the pure functions the
 * inline completion provider depends on — no VS Code host required.
 */
import { describe, expect, it } from 'vitest';

import {
  buildPrompt,
  isInsideStringOrComment,
  sanitize,
  shouldSuppressAt,
  suppressAtCursor,
} from '../src/completion-helpers.js';

describe('sanitize', () => {
  it('strips leading code fences', () => {
    expect(sanitize('```ts\nfoo()\n```')).toBe('foo()');
  });

  it('strips trailing code fences', () => {
    expect(sanitize('foo()\n```')).toBe('foo()');
  });

  it('trims a leading newline (annoying when inserted mid-line)', () => {
    expect(sanitize('\n  const x = 1;')).toBe('const x = 1;');
  });

  it('trims trailing whitespace', () => {
    expect(sanitize('const x = 1;   \n\n')).toBe('const x = 1;');
  });

  it('passes through clean text unchanged', () => {
    expect(sanitize('return 42;')).toBe('return 42;');
  });

  it('returns empty string when given empty string', () => {
    expect(sanitize('')).toBe('');
  });
});

describe('buildPrompt', () => {
  it('includes language hint when provided', () => {
    const out = buildPrompt('typescript', 'const x', ';\n');
    expect(out).toContain('Language: typescript');
    expect(out).toContain('<CURSOR>');
  });

  it('omits language hint when empty', () => {
    const out = buildPrompt('', 'const x', ';');
    expect(out).not.toContain('Language:');
  });

  it('caps oversized prefix with an ellipsis', () => {
    const big = 'a'.repeat(5000);
    const out = buildPrompt('ts', big, 'tail');
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(big.length + 1000);
  });

  it('does not cap short prefixes', () => {
    const out = buildPrompt('ts', 'const x', ';');
    expect(out).not.toContain('…');
  });
});

describe('isInsideStringOrComment', () => {
  it('detects cursor inside a double-quoted string', () => {
    const prefix = 'const greeting = "hello wor';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(true);
  });

  it('returns false when the quote is closed', () => {
    const prefix = 'const greeting = "hello";\nconst x = ';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(false);
  });

  it('detects cursor inside a single-quoted string (Python)', () => {
    const prefix = "name = 'Ada Lovel";
    expect(isInsideStringOrComment(prefix, 'python')).toBe(true);
  });

  it('detects cursor inside a template literal', () => {
    const prefix = 'const msg = `hello ${name';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(true);
  });

  it('detects cursor inside a line comment', () => {
    const prefix = 'const x = 1; // TODO: fix thi';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(true);
  });

  it('detects cursor on a Python comment line', () => {
    const prefix = 'x = 1  # TODO: fix thi';
    expect(isInsideStringOrComment(prefix, 'python')).toBe(true);
  });

  it('returns false for code outside string/comment', () => {
    const prefix = 'function greet(name) {\n  return name.toUpperCas';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(false);
  });

  it('handles escaped quotes correctly', () => {
    // The string is closed (escaped quote doesn't open a new one).
    const prefix = 'const s = "He said \\"hi\\"";\nconst x = ';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(false);
  });

  it('ignores block comments when counting quotes', () => {
    // Even though /*...*/ contains a quote-like char, the surrounding code
    // should still be evaluated for quote balance.
    const prefix = '/* "note" */ const x = "hel';
    expect(isInsideStringOrComment(prefix, 'typescript')).toBe(true);
  });
});

describe('suppressAtCursor: judged on the character just before the cursor, wherever the cursor is in the file', () => {
  const lines = ['// add two numbers', 'function add(a, b) {', '  return '];

  it('a cursor after a space on a later line is a place to suggest, whatever the first line ends with', () => {
    expect(suppressAtCursor(lines.join('\n'))).toBe(false);
    // The old call passed the column (9) as an offset into the whole text, so it looked at "r" of the first line.
    expect(shouldSuppressAt(lines.join('\n'), '  return '.length)).toBe(true);
  });

  it('a cursor in the middle of a word on a later line is still skipped', () => {
    expect(suppressAtCursor([...lines.slice(0, 2), '  return ab'].join('\n'))).toBe(true);
  });

  it('after an opening bracket or a dot is a place to suggest', () => {
    expect(suppressAtCursor('const total = items.reduce(')).toBe(false);
    expect(suppressAtCursor('const first = list.')).toBe(false);
  });
});

describe('shouldSuppressAt', () => {
  it('suppresses when prefix is empty', () => {
    expect(shouldSuppressAt('', 0)).toBe(true);
  });

  it('suppresses when prefix is shorter than 2 non-whitespace chars', () => {
    expect(shouldSuppressAt('a', 1)).toBe(true);
    expect(shouldSuppressAt('  ', 2)).toBe(true);
  });

  it('suppresses when prefix exceeds 8000 chars', () => {
    expect(shouldSuppressAt('a'.repeat(8001), 8001)).toBe(true);
  });

  it('suppresses mid-word positions', () => {
    // Cursor right after `world` — VS Code's word completion handles this.
    expect(shouldSuppressAt('hello world', 11)).toBe(true);
  });

  it('allows completion after whitespace', () => {
    expect(shouldSuppressAt('const x = ', 10)).toBe(false);
  });

  it('allows completion after newline', () => {
    expect(shouldSuppressAt('const x = 1;\n', 12)).toBe(false);
  });

  it('allows completion after trigger characters (. : ( [ { ,)', () => {
    expect(shouldSuppressAt('obj.', 4)).toBe(false);
    expect(shouldSuppressAt('foo(', 4)).toBe(false);
    expect(shouldSuppressAt('arr[', 4)).toBe(false);
  });
});

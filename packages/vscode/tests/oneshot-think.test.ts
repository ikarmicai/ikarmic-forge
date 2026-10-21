import { describe, expect, it } from 'vitest';

import { sanitize } from '../src/completion-helpers.js';
import { extractReplacement } from '../src/editor/editor-tasks.js';

describe('inline completion sanitize with reasoning models', () => {
  it('drops an inline <think> block so reasoning is never inserted into the editor', () => {
    expect(sanitize('<think>The user is typing a call.</think>\nfoo(bar)')).toBe('foo(bar)');
  });

  it('returns nothing, so no completion is shown, when only an unfinished <think> block came back', () => {
    expect(sanitize('<think>maybe a function call here')).toBe('');
  });

  it('still strips code fences as before', () => {
    expect(sanitize('```ts\nfoo(bar)\n```')).toBe('foo(bar)');
  });
});

describe('inline edit extractReplacement with reasoning models', () => {
  it('drops an inline <think> block before unwrapping the code fence', () => {
    expect(extractReplacement('<think>Rename the variable.</think>\n```js\nconst total = 1;\n```', 'const t = 1;')).toBe('const total = 1;');
  });

  it('keeps the original when only reasoning came back, instead of proposing to delete the selection', () => {
    expect(extractReplacement('<think>thinking about how to rewrite this', 'const t = 1;')).toBe('const t = 1;');
  });

  it('still returns an empty replacement for a genuinely empty reply', () => {
    expect(extractReplacement('', 'const t = 1;')).toBe('');
  });
});

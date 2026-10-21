import { describe, expect, it } from 'vitest';

import { contextAround, explainTask, extractReplacement, fixTask, inlineEditPrompt } from '../src/editor/editor-tasks.js';

describe('extractReplacement', () => {
  it('unwraps a single fenced reply', () => {
    expect(extractReplacement('```ts\nconst a = 1;\n```', 'const a = 0;')).toBe('const a = 1;');
    expect(extractReplacement('~~~\nx\n~~~\n', 'y')).toBe('x');
  });

  it('keeps or drops the trailing newline to match the selection', () => {
    expect(extractReplacement('a\nb\n\n', 'old\n')).toBe('a\nb\n');
    expect(extractReplacement('a\nb', 'old\n')).toBe('a\nb\n');
    expect(extractReplacement('a\n', 'old')).toBe('a');
    expect(extractReplacement('', 'old\n')).toBe('');
  });

  it('leaves inner fences alone', () => {
    const md = 'text\n```js\ncode\n```\nmore';
    expect(extractReplacement(md, 'x')).toBe(md);
  });
});

describe('contextAround', () => {
  it('takes up to n lines on each side', () => {
    const lines = ['0', '1', '2', '3', '4', '5'];
    expect(contextAround(lines, 2, 3, 1)).toEqual({ before: '1', after: '4' });
    expect(contextAround(lines, 0, 5, 10)).toEqual({ before: '', after: '' });
  });
});

describe('prompts', () => {
  it('inline edit marks the selection and its surroundings', () => {
    const p = inlineEditPrompt({ instruction: 'make it async', file: 'a.ts', language: 'typescript', before: 'B', selection: 'S', after: 'A' });
    expect(p).toContain('Instruction: make it async');
    expect(p).toMatch(/<before_selection>\nB\n<\/before_selection>\n<selection>\nS\n<\/selection>\n<after_selection>\nA/);
  });

  it('fix and explain tasks carry the location and code', () => {
    const fix = fixTask({ message: "Cannot find name 'x'.", line: 12, source: 'ts', code: '2304' }, 'src/a.ts', 'typescript', '12: x + 1');
    expect(fix).toContain("Fix this problem at src/a.ts:12 (ts 2304):\nCannot find name 'x'.");
    expect(fix).toContain('```typescript\n12: x + 1\n```');
    expect(explainTask('a.py', 'python', 'print(1)', 4)).toMatch(/from line 4.*Do not change any files/s);
  });
});

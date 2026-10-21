/**
 * Tests for the v2.13 grader expansions: budget/metrics graders
 * (`tokensUnder`, `costUnder`, `durationUnder`, `iterationsUnder`),
 * content extraction (`languageBlock`, `jsonContains`), and
 * behaviour extras (`toolCalledWith`, `toolCount`, `noToolErrors`).
 *
 * Each grader is exercised against a happy path, a failing path, and
 * an edge case (where one exists). No filesystem or subprocess work
 * required for this file.
 */
import { describe, expect, it } from 'vitest';

import type { AgentRunResult } from '@ikarmic/forge-core';

import {
  contains,
  costUnder,
  durationUnder,
  iterationsUnder,
  jsonContains,
  languageBlock,
  noToolErrors,
  tokensUnder,
  toolCalledWith,
  toolCount,
} from '../src/graders/index.js';
import type { GraderContext, ToolInvocation } from '../src/graders/index.js';

/**
 * Build a synthetic GraderContext for unit tests. Lets each test
 * customize just the fields its grader cares about.
 */
function makeCtx(overrides: Partial<GraderContext> = {}): GraderContext {
  const task = overrides.task ?? {
    id: 't',
    name: 'T',
    category: 'read' as const,
    description: 'd',
  };
  const result: AgentRunResult = {
    finalText: '',
    iterations: 1,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    reason: 'completed',
    costUsd: 0,
    costKnown: false,
    messages: [],
    ...(overrides.result ?? {}),
  };
  return {
    cwd: overrides.cwd ?? process.cwd(),
    task,
    result,
    toolInvocations: overrides.toolInvocations ?? [],
  };
}

describe('tokensUnder', () => {
  it('passes on total tokens under the cap (default kind)', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, inputTokens: 300, outputTokens: 200 },
    });
    expect(tokensUnder(600)(ctx).passed).toBe(true);
  });

  it('passes when total equals the cap exactly', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, inputTokens: 300, outputTokens: 300 },
    });
    expect(tokensUnder(600)(ctx).passed).toBe(true);
  });

  it('fails when total exceeds the cap', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, inputTokens: 400, outputTokens: 300 },
    });
    expect(tokensUnder(600)(ctx).passed).toBe(false);
  });

  it('checks input tokens only when kind=input', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, inputTokens: 500, outputTokens: 500 },
    });
    expect(tokensUnder(600, { kind: 'input' })(ctx).passed).toBe(true);
    expect(tokensUnder(600, { kind: 'output' })(ctx).passed).toBe(true);
    expect(tokensUnder(600, { kind: 'total' })(ctx).passed).toBe(false);
  });
});

describe('costUnder', () => {
  it('passes when cost is under the cap and pricing is known', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, costUsd: 0.0042, costKnown: true },
    });
    const r = costUnder(0.01)(ctx);
    expect(r.passed).toBe(true);
    expect(r.message).toMatch(/0\.0042/);
  });

  it('fails when cost exceeds the cap', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, costUsd: 0.5, costKnown: true },
    });
    expect(costUnder(0.1)(ctx).passed).toBe(false);
  });

  it('fails when pricing is unknown (cannot verify)', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, costUsd: 0, costKnown: false },
    });
    expect(costUnder(0.01)(ctx).passed).toBe(false);
  });
});

describe('durationUnder', () => {
  it('passes on fast runs', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, durationMs: 1000 },
    });
    expect(durationUnder(2000)(ctx).passed).toBe(true);
  });

  it('fails on slow runs', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, durationMs: 5000 },
    });
    expect(durationUnder(2000)(ctx).passed).toBe(false);
  });
});

describe('iterationsUnder', () => {
  it('passes when iterations are under the cap', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, iterations: 5 },
    });
    expect(iterationsUnder(10)(ctx).passed).toBe(true);
  });

  it('fails when iterations exceed the cap', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, iterations: 12 },
    });
    expect(iterationsUnder(10)(ctx).passed).toBe(false);
  });
});

describe('languageBlock', () => {
  it('passes when a matching fenced block exists and the predicate accepts', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: 'Sure, here:\n\n```ts\nexport const x = 1;\n```\n',
      },
    });
    const r = languageBlock('ts', (code) => /export const/.test(code))(ctx);
    expect(r.passed).toBe(true);
  });

  it('fails when the predicate rejects', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: '```ts\nconst x = 1;\n```\n',
      },
    });
    expect(
      languageBlock('ts', (code) => /export/.test(code))(ctx).passed
    ).toBe(false);
  });

  it('matches language tag case-insensitively', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: '```Python\nprint("hi")\n```\n',
      },
    });
    const r = languageBlock('python', () => true)(ctx);
    expect(r.passed).toBe(true);
  });

  it('fails when the fenced block is missing and requireBlock=true', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: 'no fences here',
      },
    });
    const r = languageBlock('rust', () => true)(ctx);
    expect(r.passed).toBe(false);
    expect(r.message).toContain('rust');
  });

  it('passes when the fenced block is missing and requireBlock=false', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: 'no fences here',
      },
    });
    const r = languageBlock('rust', () => true, { requireBlock: false })(ctx);
    expect(r.passed).toBe(true);
  });

  it('only inspects blocks tagged with the requested language', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: '```ts\nnot rust\n```\n```rs\nfn main() {}\n```\n',
      },
    });
    const r = languageBlock('rs', (code) => /fn main/.test(code))(ctx);
    expect(r.passed).toBe(true);
  });
});

describe('jsonContains', () => {
  it('passes when the JSON parses and the predicate accepts', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, finalText: '{"name":"widget","price":42}' },
    });
    const r = jsonContains((v) => {
      return (
        typeof v === 'object' && v !== null && 'name' in v &&
        (v as Record<string, unknown>).price === 42
      );
    })(ctx);
    expect(r.passed).toBe(true);
  });

  it('parses JSON inside a fenced block', () => {
    const ctx = makeCtx({
      result: {
        ...makeCtx().result,
        finalText: 'Here you go:\n\n```json\n{"ok": true}\n```\n',
      },
    });
    expect(jsonContains((v) => v && typeof v === 'object' && (v as { ok?: boolean }).ok === true)(ctx).passed).toBe(true);
  });

  it('fails when the predicate rejects', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, finalText: '{"price":0}' },
    });
    expect(jsonContains((v) => (v as { price?: number })?.price! > 0)(ctx).passed).toBe(false);
  });

  it('fails on unparseable text', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, finalText: 'totally not json' },
    });
    const r = jsonContains(() => true)(ctx);
    expect(r.passed).toBe(false);
    expect(r.details).toContain('JSON');
  });
});

describe('toolCalledWith', () => {
  it('passes when at least one call had matching args', () => {
    const calls: ToolInvocation[] = [
      { name: 'write_file', args: { path: 'a.ts' }, result: 'ok', isError: false },
      { name: 'write_file', args: { path: 'b.ts', content: 'hi' }, result: 'ok', isError: false },
    ];
    const r = toolCalledWith(
      'write_file',
      (args) => typeof args === 'object' && args !== null && 'content' in args
    )(makeCtx({ toolInvocations: calls }));
    expect(r.passed).toBe(true);
  });

  it('fails when no calls match the predicate but the tool was called', () => {
    const calls: ToolInvocation[] = [
      { name: 'write_file', args: { path: 'a.ts' }, result: 'ok', isError: false },
    ];
    const r = toolCalledWith('write_file', () => false)(
      makeCtx({ toolInvocations: calls })
    );
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/no call's args matched/);
  });

  it('fails when the tool was never called', () => {
    const r = toolCalledWith('read_file', () => true)(
      makeCtx({ toolInvocations: [] })
    );
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/never called/);
  });
});

describe('toolCount', () => {
  const calls: ToolInvocation[] = [
    { name: 'read_file', args: {}, result: '', isError: false },
    { name: 'read_file', args: {}, result: '', isError: false },
    { name: 'read_file', args: {}, result: '', isError: false },
  ];

  it('honors min', () => {
    expect(toolCount('read_file', { min: 2 })(makeCtx({ toolInvocations: calls })).passed).toBe(true);
    expect(toolCount('read_file', { min: 5 })(makeCtx({ toolInvocations: calls })).passed).toBe(false);
  });

  it('honors max', () => {
    expect(toolCount('read_file', { max: 3 })(makeCtx({ toolInvocations: calls })).passed).toBe(true);
    expect(toolCount('read_file', { max: 1 })(makeCtx({ toolInvocations: calls })).passed).toBe(false);
  });

  it('honors exact', () => {
    expect(toolCount('read_file', { exact: 3 })(makeCtx({ toolInvocations: calls })).passed).toBe(true);
    expect(toolCount('read_file', { exact: 2 })(makeCtx({ toolInvocations: calls })).passed).toBe(false);
  });

  it('throws when no constraint is provided', () => {
    expect(() => toolCount('x', {} as Parameters<typeof toolCount>[1])).toThrow();
  });
});

describe('noToolErrors', () => {
  it('passes when no tool returned an error', () => {
    const calls: ToolInvocation[] = [
      { name: 'read_file', args: {}, result: 'ok', isError: false },
      { name: 'edit_file', args: {}, result: 'ok', isError: false },
    ];
    expect(noToolErrors()(makeCtx({ toolInvocations: calls })).passed).toBe(true);
  });

  it('fails when any tool returned an error, with details', () => {
    const calls: ToolInvocation[] = [
      { name: 'read_file', args: {}, result: 'no such file', isError: true },
      { name: 'edit_file', args: {}, result: 'ok', isError: false },
    ];
    const r = noToolErrors()(makeCtx({ toolInvocations: calls }));
    expect(r.passed).toBe(false);
    expect(r.message).toContain('1 tool');
    expect(r.details).toContain('read_file');
  });

  it('counts multiple errors', () => {
    const calls: ToolInvocation[] = [
      { name: 'read_file', args: {}, result: 'err1', isError: true },
      { name: 'read_file', args: {}, result: 'err2', isError: true },
    ];
    const r = noToolErrors()(makeCtx({ toolInvocations: calls }));
    expect(r.message).toContain('2 tool');
  });
});

describe('cooperation with contains (sanity)', () => {
  // Smoke test that the new ones compose with existing ones in the
  // same graders array the way task authors expect.
  it('multiple graders all contribute to the verdict', () => {
    const ctx = makeCtx({
      result: { ...makeCtx().result, finalText: 'Answer: 1.2.3' },
    });
    expect(contains('1.2.3')(ctx).passed).toBe(true);
    expect(contains('9.9.9')(ctx).passed).toBe(false);
  });
});

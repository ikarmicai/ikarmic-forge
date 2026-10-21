/**
 * Tests for the v2.12 JSON-schema grader (`jsonSchema` /
 * `jsonSchemaPartial`).
 *
 * Covers the validator against a variety of payloads:
 *   - valid JSON matching the schema (pass)
 *   - invalid JSON (parse error)
 *   - JSON wrapped in markdown fences (parse via fence extraction)
 *   - JSON missing required fields (schema mismatch)
 *   - JSON with wrong types (schema mismatch, includes path)
 *   - jsonSchemaPartial tolerates extra fields
 *   - empty finalText
 *   - nested objects + arrays
 *   - truncation of details
 *   - schemaIsPath: loading a Zod schema from a file path
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { jsonSchema, jsonSchemaPartial } from '../src/graders/index.js';
import type { GraderContext, TaskInfo } from '../src/graders/index.js';
import type { AgentRunResult } from '@ikarmic/forge-core';

function ctx(finalText: string): GraderContext {
  const task: TaskInfo = {
    id: 't',
    name: 't',
    category: 'read',
    description: 'd',
  };
  const result = {
    finalText,
    iterations: 1,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    reason: 'completed',
    costUsd: 0,
    costKnown: true,
  } as unknown as AgentRunResult;
  return { cwd: '/tmp', task, result, toolInvocations: [] };
}

describe('jsonSchema grader', () => {
  const prSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(20),
  });

  it('passes when finalText matches the schema', () => {
    const r = jsonSchema(prSchema)(ctx('{"title":"fix bug","body":"This PR fixes the auth flow in the login screen."}'));
    expect(r.passed).toBe(true);
    expect(r.message).toMatch(/matched/);
  });

  it('extracts JSON from a ```json fenced block', () => {
    const r = jsonSchema(prSchema)(ctx(
      'Here is the result:\n\n```json\n{"title":"feat","body":"Implements the v2.12 structured-output grader for the eval harness."}\n```\n\nDone.'
    ));
    expect(r.passed).toBe(true);
  });

  it('extracts JSON from a bare ``` fenced block', () => {
    const r = jsonSchema(prSchema)(ctx(
      '```\n{"title":"feat","body":"Implements the v2.12 structured-output grader for the eval harness."}\n```'
    ));
    expect(r.passed).toBe(true);
  });

  it('fails when JSON is missing required fields', () => {
    const r = jsonSchema(prSchema)(ctx('{"title":"only title"}'));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/mismatch/);
    expect(r.details).toContain('body');
  });

  it('fails when JSON has wrong types', () => {
    const r = jsonSchema(prSchema)(ctx('{"title":123,"body":"Implements the v2.12 structured-output grader for the eval harness."}'));
    expect(r.passed).toBe(false);
    expect(r.details).toContain('title');
  });

  it('fails when finalText is not JSON and contains no fence', () => {
    const r = jsonSchema(prSchema)(ctx('This is just prose, no JSON here.'));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/not valid JSON/);
  });

  it('fails when fenced contents are not valid JSON', () => {
    const r = jsonSchema(prSchema)(ctx('```json\nnot really json\n```'));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/not valid JSON/);
  });

  it('fails when finalText is empty', () => {
    const r = jsonSchema(prSchema)(ctx(''));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/not valid JSON/);
    // The empty-input cause shows up in `details` (the top-level
    // message is intentionally generic so CI scripts can grep for it).
    expect(r.details).toMatch(/empty/i);
  });

  it('passes nested objects + arrays in the schema', () => {
    const nestedSchema = z.object({
      prs: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      ),
    });
    const r = jsonSchema(nestedSchema)(ctx('{"prs":[{"id":"1","title":"first"},{"id":"2","title":"second"}]}'));
    expect(r.passed).toBe(true);
  });

  it('reports the offending path in details for nested mismatches', () => {
    const nestedSchema = z.object({
      items: z.array(z.object({ name: z.string() })),
    });
    const r = jsonSchema(nestedSchema)(ctx('{"items":[{"name":"a"},{"name":42}]}'));
    expect(r.passed).toBe(false);
    expect(r.details).toContain('items.1');
  });

  it('truncates details to maxDetailChars', () => {
    const r = jsonSchema(prSchema, { maxDetailChars: 50 })(ctx('not json, just a long string that should be truncated in the report so it does not blow up the markdown'));
    expect(r.passed).toBe(false);
    // The truncation marker is the ellipsis character.
    expect(r.details).toContain('…');
  });

  it('passes union types', () => {
    const unionSchema = z.union([
      z.object({ kind: z.literal('a'), value: z.string() }),
      z.object({ kind: z.literal('b'), count: z.number() }),
    ]);
    const r1 = jsonSchema(unionSchema)(ctx('{"kind":"a","value":"hello"}'));
    expect(r1.passed).toBe(true);
    const r2 = jsonSchema(unionSchema)(ctx('{"kind":"b","count":42}'));
    expect(r2.passed).toBe(true);
    const r3 = jsonSchema(unionSchema)(ctx('{"kind":"c","unknown":true}'));
    expect(r3.passed).toBe(false);
  });
});

describe('jsonSchema grader — schemaIsPath', () => {
  // Fixtures are written to os.tmpdir() (not a path under the repo) — Vite's
  // dev-server module graph (which vitest runs on) mishandles dynamic
  // `import()` of file:// URLs whose path contains a space, which the repo
  // checkout path here does. loadSchemaFile()'s own dynamic import works
  // correctly under plain Node either way; this is purely a test-fixture
  // placement concern, mirroring how core's own structured-schema
  // test places its loadSchemaFile fixtures.
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'forge-eval-schema-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function writeFixture(): string {
    // A schema file imports `zod` from its own location, so the fixture directory gets a link to the
    // zod this package uses. Without it the import only resolves when vitest handles it, which is the
    // case in the monorepo but not when core comes from node_modules (the public repository).
    const zodDir = path.dirname(createRequire(import.meta.url).resolve('zod/package.json'));
    mkdirSync(path.join(workDir, 'node_modules'), { recursive: true });
    symlinkSync(zodDir, path.join(workDir, 'node_modules', 'zod'), 'junction');
    const file = path.join(workDir, 'pr-summary-schema.mjs');
    writeFileSync(
      file,
      "import { z } from 'zod';\n" +
        'export default z.object({ title: z.string().min(1), body: z.string().min(20) });\n'
    );
    return file;
  }

  it('loads a Zod schema from a file path and validates against it', async () => {
    const grader = jsonSchema(writeFixture());
    const r = await grader(ctx('{"title":"fix bug","body":"This PR fixes the auth flow in the login screen."}'));
    expect(r.passed).toBe(true);
  });

  it('fails validation using the path-loaded schema the same as a direct schema', async () => {
    const grader = jsonSchema(writeFixture());
    const r = await grader(ctx('{"title":"only title"}'));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/mismatch/);
  });

  it('caches the loaded schema across multiple grader calls', async () => {
    const grader = jsonSchema(writeFixture());
    const r1 = await grader(ctx('{"title":"a","body":"This PR fixes the auth flow in the login screen."}'));
    const r2 = await grader(ctx('{"title":"b","body":"This PR fixes the auth flow in the login screen."}'));
    expect(r1.passed).toBe(true);
    expect(r2.passed).toBe(true);
  });

  it('fails with a clear message when the schema file does not exist', async () => {
    const grader = jsonSchema(path.join(workDir, 'does-not-exist.ts'));
    const r = await grader(ctx('{"title":"a","body":"whatever"}'));
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/failed to load schema file/);
  });

  it('throws immediately when schemaIsPath is false for a string schema', () => {
    expect(() => jsonSchema('./schemas/pr-summary.ts', { schemaIsPath: false })).toThrow(
      /schemaIsPath is false/
    );
  });

  it('keeps direct Zod-schema calls fully synchronous (no Promise)', () => {
    const prSchema = z.object({ title: z.string() });
    const r = jsonSchema(prSchema)(ctx('{"title":"ok"}'));
    // Not a Promise — verifies no behavior change for the common path.
    expect(r).not.toBeInstanceOf(Promise);
    expect((r as { passed: boolean }).passed).toBe(true);
  });
});

describe('jsonSchemaPartial grader', () => {
  const schema = z.object({
    required: z.string(),
  });

  it('tolerates extra fields not in the schema', () => {
    const r = jsonSchemaPartial(schema)(ctx('{"required":"yes","extra":"ignored","another":42}'));
    expect(r.passed).toBe(true);
  });

  it('still fails when required fields are missing', () => {
    const r = jsonSchemaPartial(schema)(ctx('{"extra":"only extra"}'));
    expect(r.passed).toBe(false);
    expect(r.details).toContain('required');
  });

  it('still fails on type mismatches in the required fields', () => {
    const r = jsonSchemaPartial(schema)(ctx('{"required":123}'));
    expect(r.passed).toBe(false);
  });
});

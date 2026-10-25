import { describe, expect, it } from 'vitest';
import type { ModelConfig, SpecialistConfig } from '@ikarmic/forge-core';

import { DEFAULT_MODE_ID, customSpecialistIds, listModes, modeModelProblem, modeOverrides, modeCanWrite, readOnlySandbox, resolveModeId, retargetSystemPrompt } from '../src/chat/modes.js';
import { BUILTIN_SPECIALISTS, DEFAULT_SYSTEM_PROMPT } from '@ikarmic/forge-core';

const ask: SpecialistConfig = {
  id: 'ask',
  description: 'Pure Q&A.',
  systemPrompt: 'ASK PROMPT',
  allowedTools: ['read_file', 'list_files', 'fetch_url'],
  forbiddenTools: ['fetch_url'],
  maxIterations: 5,
  auto: false,
};
const code: SpecialistConfig = {
  id: 'code',
  description: 'Edits.',
  systemPrompt: 'CODE PROMPT',
  allowedTools: ['read_file', 'write_file', 'edit_file'],
  forbiddenTools: [],
  auto: true,
};
const orchestrator: SpecialistConfig = {
  id: 'orchestrator', description: 'router', systemPrompt: 'R', allowedTools: [], forbiddenTools: [],
};
const effective = (s: SpecialistConfig) => s.allowedTools.filter((t) => !s.forbiddenTools.includes(t));
const baseModel: ModelConfig = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
const ctx = (over: Partial<Parameters<typeof modeOverrides>[1]> = {}) => ({
  specialists: [ask, code, orchestrator],
  baseSandbox: undefined,
  baseModel,
  effectiveToolsFor: effective,
  ...over,
});

describe('listModes', () => {
  it('offers the Security agent from core as a mode', () => {
    expect(listModes(BUILTIN_SPECIALISTS)).toContainEqual(expect.objectContaining({ id: 'security', label: 'Security' }));
  });

  it('puts Agent first and excludes the orchestrator router', () => {
    const modes = listModes([ask, code, orchestrator]);
    expect(modes.map((m) => m.id)).toEqual(['agent', 'ask', 'code']);
    expect(modes[0]).toMatchObject({ label: 'Agent' });
    expect(modes[1]).toEqual({ id: 'ask', label: 'Ask', description: 'Pure Q&A.' });
  });

  it('does not duplicate a specialist that is itself named agent', () => {
    const agentSpec = { ...ask, id: 'agent' };
    expect(listModes([agentSpec]).map((m) => m.id)).toEqual(['agent']);
  });
});

describe('resolveModeId', () => {
  it('keeps a known id', () => expect(resolveModeId('ask', [ask])).toBe('ask'));
  it('falls back to agent for unknown / undefined / orchestrator', () => {
    expect(resolveModeId('deleted-custom', [ask])).toBe(DEFAULT_MODE_ID);
    expect(resolveModeId(undefined, [ask])).toBe(DEFAULT_MODE_ID);
    expect(resolveModeId('orchestrator', [orchestrator])).toBe(DEFAULT_MODE_ID);
  });
});

describe('modeOverrides', () => {
  it('agent mode passes the base sandbox through and sets no prompt', () => {
    const baseSandbox = { denyTools: ['run_command'] };
    expect(modeOverrides('agent', ctx({ baseSandbox }))).toEqual({ toolSandbox: baseSandbox });
    expect(modeOverrides('agent', ctx())).toEqual({});
  });

  it('unknown mode behaves like agent', () => {
    expect(modeOverrides('nope', ctx())).toEqual({});
  });

  it('specialist mode sets prompt, iterations and effective tool allowlist', () => {
    expect(modeOverrides('ask', ctx())).toEqual({
      systemPrompt: 'ASK PROMPT',
      maxIterations: 5,
      toolSandbox: { allowTools: ['read_file', 'list_files'] },
    });
  });

  it('defaults maxIterations to 10', () => {
    expect(modeOverrides('code', ctx()).maxIterations).toBe(10);
  });

  it('intersects with user allowTools so a mode never widens the sandbox', () => {
    const out = modeOverrides('code', ctx({ baseSandbox: { allowTools: ['read_file', 'run_command'] } }));
    expect(out.toolSandbox?.allowTools).toEqual(['read_file']);
  });

  it('keeps user denyTools and policies', () => {
    const policies = { run_command: { allowCommands: ['ls'] } } as never;
    const out = modeOverrides('code', ctx({ baseSandbox: { denyTools: ['edit_file'], policies } }));
    expect(out.toolSandbox).toMatchObject({ denyTools: ['edit_file'], policies });
  });

  it('never carries the specialist auto flag', () => {
    expect(modeOverrides('code', ctx())).not.toHaveProperty('auto');
  });

  it('applies a same-provider model override keeping base fields', () => {
    const custom = { ...ask, id: 'fast', model: 'claude-haiku-4-5-20251001' };
    const base = { ...baseModel, reasoningEffort: 'low' } as ModelConfig;
    expect(modeOverrides('fast', ctx({ specialists: [custom], baseModel: base })).model).toEqual({
      ...base,
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it('uses only provider+model when the override switches provider', () => {
    const custom = { ...ask, id: 'gpt', model: 'gpt-5', provider: 'openai' as const };
    const base = { ...baseModel, reasoningEffort: 'low' } as ModelConfig;
    expect(modeOverrides('gpt', ctx({ specialists: [custom], baseModel: base })).model).toEqual({
      provider: 'openai',
      model: 'gpt-5',
    });
  });
});

describe('modeOverrides with modeModels', () => {
  it('gives a built-in specialist without its own model the model named in modeModels', () => {
    expect(modeOverrides('ask', ctx({ modeModels: { ask: 'openai:gpt-5' } })).model).toEqual({ provider: 'openai', model: 'gpt-5' });
  });

  it('keeps the base provider when the entry is a bare model id', () => {
    expect(modeOverrides('ask', ctx({ modeModels: { ask: 'claude-haiku-4-5' } })).model).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });

  it('lets the specialist own model win over modeModels', () => {
    const own = { ...ask, model: 'claude-opus-5-5' };
    expect(modeOverrides('ask', ctx({ specialists: [own], modeModels: { ask: 'openai:gpt-5' } })).model).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
  });

  it('expands aliases from the shared config', () => {
    expect(modeOverrides('ask', ctx({ modeModels: { ask: 'fast' }, aliases: { fast: 'openai:gpt-5-mini' } })).model).toEqual({ provider: 'openai', model: 'gpt-5-mini' });
  });

  it('sets no model for an empty entry or an alias loop, so the run uses the base model', () => {
    expect(modeOverrides('ask', ctx({ modeModels: { ask: '  ' } })).model).toBeUndefined();
    expect(modeOverrides('ask', ctx({ modeModels: { ask: 'a' }, aliases: { a: 'b', b: 'a' } })).model).toBeUndefined();
  });

  it('does not throw on a non-string entry from a hand-edited config; the run uses the base model', () => {
    expect(() => modeOverrides('ask', ctx({ modeModels: { ask: 42 as never } }))).not.toThrow();
    expect(modeOverrides('ask', ctx({ modeModels: { ask: 42 as never } })).model).toBeUndefined();
  });

  it('modeModelProblem names the broken entry of the selected mode and stays quiet otherwise', () => {
    const loop = { a: 'b', b: 'a' };
    expect(modeModelProblem('ask', ctx({ modeModels: { ask: 'a' }, aliases: loop }))).toMatch(/loop/i);
    expect(modeModelProblem('ask', ctx({ modeModels: { ask: 42 as never } }))).toMatch(/ask/);
    expect(modeModelProblem('ask', ctx({ modeModels: { ask: 'openai:gpt-5' } }))).toBeUndefined();
    expect(modeModelProblem('ask', ctx({ modeModels: { ask: '  ' } }))).toBeUndefined();
    expect(modeModelProblem('ask', ctx({}))).toBeUndefined();
    expect(modeModelProblem('ask', ctx({ modeModels: { code: 'a' }, aliases: loop }))).toBeUndefined();
  });

  it('ignores entries for modes that are not selected, and for Agent mode', () => {
    expect(modeOverrides('ask', ctx({ modeModels: { code: 'openai:gpt-5' } })).model).toBeUndefined();
    expect(modeOverrides('agent', ctx({ modeModels: { agent: 'openai:gpt-5' } })).model).toBeUndefined();
  });
});

describe('a custom agent that reuses a built-in id (RB-38)', () => {
  const override: SpecialistConfig = { ...ask, description: 'My ask', systemPrompt: 'MY ASK PROMPT' };
  // listSpecialists() puts the built-ins first and appends the custom entry, so the id is in the list twice.
  const listed = [ask, code, orchestrator, override];

  it('is one mode in the picker, not two', () => {
    const ids = listModes(listed).map((m) => m.id);
    expect(ids).toEqual(['agent', 'ask', 'code']);
  });

  it('shows the custom description, since it replaces the built-in', () => {
    expect(listModes(listed).find((m) => m.id === 'ask')?.description).toBe('My ask');
  });

  it('runs with the custom prompt, the same one the orchestrator uses', () => {
    expect(modeOverrides('ask', ctx({ specialists: listed })).systemPrompt).toContain('MY ASK PROMPT');
  });

  it('keeps every mode once when all five built-ins are copied into the custom file', () => {
    const copies = [ask, code].map((s) => ({ ...s }));
    const ids = listModes([ask, code, ...copies]).map((m) => m.id);
    expect(ids).toEqual(['agent', 'ask', 'code']);
  });
});

describe("customSpecialistIds", () => {
  it("returns the registered (non built-in) ids, including ones shadowing a built-in, so they can be unregistered before a reload", () => {
    const shadow = { ...ask, description: "override" };
    const custom = { ...ask, id: "my-agent" };
    // listSpecialists() order: built-ins first, then customs in registration order
    expect(customSpecialistIds([ask, code, shadow, custom], [ask, code])).toEqual(["ask", "my-agent"]);
    expect(customSpecialistIds([ask, code], [ask, code])).toEqual([]);
  });
});

describe('modeOverrides with an empty tool list', () => {
  // Core applySandbox treats an empty allowTools as "no whitelist" (every tool exposed),
  // so an empty mode/user intersection must be encoded as a list that matches nothing.
  it('does not emit an empty allowTools when the user allowlist and mode tools do not intersect', () => {
    const web = { ...ask, id: 'web', allowedTools: ['fetch_url'], forbiddenTools: [] };
    const out = modeOverrides('web', ctx({ specialists: [web], baseSandbox: { allowTools: ['read_file'] } }));
    expect(out.toolSandbox?.allowTools?.length).toBeGreaterThan(0);
    expect(out.toolSandbox?.allowTools).not.toContain('read_file');
    expect(out.toolSandbox?.allowTools).not.toContain('fetch_url');
  });

  it('does not emit an empty allowTools for a specialist that allows no tools', () => {
    const chat = { ...ask, id: 'chat', allowedTools: [], forbiddenTools: [] };
    const out = modeOverrides('chat', ctx({ specialists: [chat] }));
    expect(out.toolSandbox?.allowTools?.length).toBeGreaterThan(0);
    expect(out.toolSandbox?.allowTools).not.toContain('write_file');
  });
});

describe("readOnlySandbox", () => {
  const RO = ["read_file", "search_files", "list_files"];
  it("allows only the given tools when the user has no allowlist, keeping deny lists and policies", () => {
    const policies = { read_file: {} } as never;
    expect(readOnlySandbox({ denyTools: ["x"], policies }, RO)).toEqual({ denyTools: ["x"], policies, allowTools: RO });
    expect(readOnlySandbox(undefined, RO)).toEqual({ allowTools: RO });
  });
  it("intersects with the user allowlist", () => {
    expect(readOnlySandbox({ allowTools: ["read_file", "write_file"] }, RO).allowTools).toEqual(["read_file"]);
  });
  it("never returns an empty allowlist (core would treat it as every tool)", () => {
    const out = readOnlySandbox({ allowTools: ["write_file"] }, RO);
    expect(out.allowTools!.length).toBeGreaterThan(0);
    expect(out.allowTools).not.toContain("write_file");
  });
});

describe("modeCanWrite", () => {
  const mctx = { specialists: [ask, code], effectiveToolsFor: effective };
  it("is true for Agent mode and unknown modes", () => {
    expect(modeCanWrite("agent", mctx)).toBe(true);
    expect(modeCanWrite("deleted-custom", mctx)).toBe(true);
  });
  it("is true only when the mode allows write_file or edit_file", () => {
    expect(modeCanWrite("code", mctx)).toBe(true);
    expect(modeCanWrite("ask", mctx)).toBe(false);
  });
  it("counts apply_patch as a write tool", () => {
    const patcher = { id: 'patcher', description: 'd', systemPrompt: 'p', allowedTools: ['apply_patch'], forbiddenTools: [] } as never;
    const only = (spec: { allowedTools: string[] }) => spec.allowedTools;
    expect(modeCanWrite('patcher', { specialists: [patcher], effectiveToolsFor: only })).toBe(true);
  });
});

describe('retargetSystemPrompt', () => {
  const specs = [{ id: 'ask', description: 'd', systemPrompt: 'You are ASK.', allowedTools: [], forbiddenTools: [] }] as never;
  const blocks = '\n\n<instructions>keep</instructions>';
  const sys = (base: string) => ({ role: 'system' as const, content: base + blocks });
  const user = { role: 'user' as const, content: 'hi' };

  it('swaps the base prompt and keeps the blocks after it, in both directions', () => {
    const toAsk = retargetSystemPrompt([sys(DEFAULT_SYSTEM_PROMPT), user], 'You are ASK.', specs)!;
    expect(toAsk[0]!.content).toBe('You are ASK.' + blocks);
    expect(toAsk[1]).toBe(user);
    const back = retargetSystemPrompt(toAsk, undefined, specs)!;
    expect(back[0]!.content).toBe(DEFAULT_SYSTEM_PROMPT + blocks);
  });

  it('leaves history alone when the prompt already matches, is unknown, or there is no system message', () => {
    const same = [sys('You are ASK.'), user];
    expect(retargetSystemPrompt(same, 'You are ASK.', specs)).toEqual(same);
    const custom = [{ role: 'system' as const, content: 'something else entirely' }, user];
    expect(retargetSystemPrompt(custom, 'You are ASK.', specs)).toEqual(custom);
    expect(retargetSystemPrompt([user], 'You are ASK.', specs)).toEqual([user]);
    expect(retargetSystemPrompt(undefined, 'x', specs)).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const h = [sys(DEFAULT_SYSTEM_PROMPT), user];
    retargetSystemPrompt(h, 'You are ASK.', specs);
    expect(h[0]!.content).toBe(DEFAULT_SYSTEM_PROMPT + blocks);
  });
});


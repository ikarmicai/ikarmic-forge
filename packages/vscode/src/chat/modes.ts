/**
 * Chat modes: the Code / Ask / Debug / … switcher. Each mode
 * maps onto a core specialist (built-in or user-defined) and turns into a
 * set of AgentConfig overrides for a single agent run. vscode-free so it
 * is unit-testable; `effectiveToolsFor` is injected for the same reason.
 *
 */
import { DEFAULT_SYSTEM_PROMPT, resolveModelAlias, type ModelAliases, type ModelConfig, type SpecialistConfig, type ToolSandbox } from '@ikarmic/forge-core';
import type { ModelMessage } from 'ai';

export const DEFAULT_MODE_ID = 'agent';

const NO_TOOLS_SENTINEL = '__forge_no_tools__';

/** Specialists that only make sense inside the orchestrator loop. */
const EXCLUDED_IDS = new Set(['orchestrator']);

export interface ModeOption {
  id: string;
  label: string;
  description: string;
}

export interface ModeOverrides {
  systemPrompt?: string;
  maxIterations?: number;
  toolSandbox?: ToolSandbox;
  model?: ModelConfig;
}

export interface ModeContext {
  specialists: readonly SpecialistConfig[];
  baseSandbox: ToolSandbox | undefined;
  baseModel: ModelConfig;
  effectiveToolsFor: (spec: SpecialistConfig) => string[];
  /** `modeModels` from the shared config: a model for modes whose specialist names none. */
  modeModels?: Record<string, string>;
  /** Shared-config aliases, for resolving `modeModels` entries. */
  aliases?: ModelAliases;
}

/** The model `modeModels` names for `modeId`; undefined when unset, blank or unresolvable (the run then uses the base model). */
function modeModelFor(modeId: string, ctx: ModeContext): { provider: ModelConfig['provider']; model: string } | undefined {
  const raw: unknown = ctx.modeModels?.[modeId];
  // A hand-edited config can hold anything; only a non-blank string is a model name.
  const ref = typeof raw === 'string' ? raw.trim() : '';
  if (!ref) return undefined;
  try {
    return resolveModelAlias(ref, ctx.aliases, ctx.baseModel.provider);
  } catch {
    return undefined;
  }
}

/**
 * Why the `modeModels` entry for `modeId` cannot be used, or undefined when it is fine, blank or absent.
 * The run falls back to the base model either way; this is the text for the one warning the chat posts.
 */
export function modeModelProblem(modeId: string, ctx: Pick<ModeContext, 'modeModels' | 'aliases' | 'baseModel'>): string | undefined {
  const raw: unknown = ctx.modeModels?.[modeId];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return `modeModels.${modeId} must be a model name, such as "provider:model" or an alias.`;
  if (!raw.trim()) return undefined;
  try {
    resolveModelAlias(raw.trim(), ctx.aliases, ctx.baseModel.provider);
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

/**
 * `listSpecialists()` puts the built-ins first and appends the custom ones, so a custom agent that
 * reuses a built-in id is in the list twice. The custom one replaces the built-in (as it does for
 * the orchestrator): keep one entry per id, in the position of the first, with the last one's content.
 */
function dedupeById(specialists: readonly SpecialistConfig[]): SpecialistConfig[] {
  const byId = new Map<string, SpecialistConfig>();
  for (const s of specialists) byId.set(s.id, s);
  return [...byId.values()];
}

function findSpecialist(modeId: string | undefined, specialists: readonly SpecialistConfig[]): SpecialistConfig | undefined {
  if (!modeId || modeId === DEFAULT_MODE_ID || EXCLUDED_IDS.has(modeId)) return undefined;
  return dedupeById(specialists).find((s) => s.id === modeId);
}

export function listModes(specialists: readonly SpecialistConfig[]): ModeOption[] {
  const out: ModeOption[] = [
    { id: DEFAULT_MODE_ID, label: 'Agent', description: 'Full agent with every enabled tool (default).' },
  ];
  for (const s of dedupeById(specialists)) {
    if (s.id === DEFAULT_MODE_ID || EXCLUDED_IDS.has(s.id)) continue;
    out.push({ id: s.id, label: s.id.charAt(0).toUpperCase() + s.id.slice(1), description: s.description });
  }
  return out;
}

/**
 * Ids of the custom (non built-in) registrations in a `listSpecialists()`
 * snapshot, which lists built-ins first, then customs. Includes customs that
 * shadow a built-in id. The chat unregisters these before re-reading the
 * config so an agent deleted in Settings stops being selectable.
 */
export function customSpecialistIds(
  specialists: readonly SpecialistConfig[],
  builtins: readonly SpecialistConfig[]
): string[] {
  return specialists.slice(builtins.length).map((s) => s.id);
}

export function resolveModeId(modeId: string | undefined, specialists: readonly SpecialistConfig[]): string {
  return findSpecialist(modeId, specialists) ? (modeId as string) : DEFAULT_MODE_ID;
}

export function modeOverrides(modeId: string, ctx: ModeContext): ModeOverrides {
  const spec = findSpecialist(modeId, ctx.specialists);
  if (!spec) return ctx.baseSandbox ? { toolSandbox: ctx.baseSandbox } : {};

  const modeTools = ctx.effectiveToolsFor(spec);
  const userAllow = ctx.baseSandbox?.allowTools;
  const narrowed = userAllow ? modeTools.filter((t) => userAllow.includes(t)) : modeTools;
  // Core's applySandbox treats an empty allowTools as "no whitelist" (every tool), so
  // "no tools" must be a non-empty list that matches nothing.
  const allowTools = narrowed.length > 0 ? narrowed : [NO_TOOLS_SENTINEL];

  const out: ModeOverrides = {
    systemPrompt: spec.systemPrompt,
    maxIterations: spec.maxIterations ?? 10,
    toolSandbox: { ...(ctx.baseSandbox ?? {}), allowTools },
  };
  const chosen = spec.model
    ? { provider: spec.provider ?? ctx.baseModel.provider, model: spec.model }
    : modeModelFor(modeId, ctx);
  if (chosen) {
    out.model = chosen.provider === ctx.baseModel.provider
      ? { ...ctx.baseModel, model: chosen.model }
      : { provider: chosen.provider, model: chosen.model };
  }
  return out;
}

/**
 * A conversation keeps its system prompt as its first message, so changing the mode mid-chat
 * would leave the old mode's instructions in force. Swap the mode's part of that message (the
 * base prompt; instructions, memory and the repo map after it stay) for the new mode's.
 * The old prompt is found by matching the known ones, so a chat resumed from disk works too;
 * history that doesn't start with a known prompt is returned as it is.
 */
export function retargetSystemPrompt<M extends ModelMessage>(
  history: readonly M[] | undefined,
  newPrompt: string | undefined,
  specialists: readonly SpecialistConfig[]
): M[] | undefined {
  if (!history) return undefined;
  const first = history[0];
  if (!first || first.role !== 'system' || typeof first.content !== 'string') return [...history];
  const target = newPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const known = [DEFAULT_SYSTEM_PROMPT, ...specialists.map((s) => s.systemPrompt)].filter((p): p is string => !!p);
  // Longest first, so a prompt that begins with another is not mistaken for it.
  const current = known.sort((a, b) => b.length - a.length).find((p) => (first.content as string).startsWith(p));
  if (current === undefined || current === target) return [...history];
  return [{ ...first, content: target + (first.content as string).slice(current.length) } as M, ...history.slice(1)];
}

/** Whether runs in this mode can edit files (Agent mode and unknown modes can). */
export function modeCanWrite(modeId: string, ctx: Pick<ModeContext, 'specialists' | 'effectiveToolsFor'>): boolean {
  const spec = findSpecialist(modeId, ctx.specialists);
  if (!spec) return true;
  return ctx.effectiveToolsFor(spec).some((t) => t === 'write_file' || t === 'edit_file' || t === 'edit_notebook' || t === 'apply_patch');
}

/** Sandbox for read-only runs (spec generation): only `tools`, never widening the user's allowlist. */
export function readOnlySandbox(base: ToolSandbox | undefined, tools: readonly string[]): ToolSandbox {
  const userAllow = base?.allowTools;
  const narrowed = userAllow ? tools.filter((t) => userAllow.includes(t)) : [...tools];
  return { ...(base ?? {}), allowTools: narrowed.length > 0 ? narrowed : [NO_TOOLS_SENTINEL] };
}

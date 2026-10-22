/**
 * Pure helpers behind the REPL's slash commands (/model, /run, /test, /tokens, ...),
 * kept out of the React component so they can be unit tested.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import {
  MODEL_CATALOG,
  createLanguageModel,
  formatAliasTable,
  getModelWindowTokens,
  mediaPartTokens,
  redact,
  shellEnv,
  resolveModelAlias,
} from '@ikarmic/forge-core';
import type { LanguageModel } from 'ai';
import type { ModelAliases, ModelConfig, ProviderName } from '@ikarmic/forge-core';

export interface SlashCommand {
  name: string;
  args: string;
}

/** `/name args`, or `!cmd` as shorthand for `/run cmd`. Null for ordinary text. */
export function parseSlashCommand(input: string): SlashCommand | null {
  const text = input.trim();
  if (text.startsWith('!') && text.length > 1) return { name: 'run', args: text.slice(1).trim() };
  const m = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text);
  return m ? { name: m[1]!.toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

export const describeModel = (m: ModelConfig): string => `${m.provider}:${m.model}`;

export type ModelSwitch = { ok: true; model: ModelConfig } | { ok: false; error: string };

/**
 * Resolve `/model <id | alias | provider:model>` against the current model. Builds the
 * language model once so a missing API key or bad base URL is reported now, not on the next turn.
 */
export function switchModel(
  arg: string,
  current: ModelConfig,
  aliases: ModelAliases | undefined,
  factory: (cfg: ModelConfig) => LanguageModel = createLanguageModel
): ModelSwitch {
  const ref = arg.trim();
  if (!ref) return { ok: false, error: 'usage: give a model id, alias, or provider:model' };
  const { provider, model } = resolveModelAlias(ref, aliases, current.provider);
  if (!model) return { ok: false, error: `"${ref}" does not name a model` };
  const next: ModelConfig = { ...current, provider, model };
  // A different provider needs its own endpoint and key, not the current model's.
  if (provider !== current.provider) {
    delete (next as { baseUrl?: string }).baseUrl;
    delete (next as { apiKey?: string }).apiKey;
  }
  try {
    factory(next);
  } catch (err) {
    return { ok: false, error: `cannot use ${describeModel(next)}: ${(err as Error).message}` };
  }
  return { ok: true, model: next };
}

/** `/models [query]`: aliases, then the curated catalog, optionally filtered by a substring. */
export function formatModels(aliases: ModelAliases | undefined, query = ''): string {
  const q = query.trim().toLowerCase();
  const lines: string[] = [];
  const aliasTable = formatAliasTable(aliases);
  if (aliasTable && (!q || aliasTable.toLowerCase().includes(q))) {
    lines.push(
      q
        ? aliasTable
            .split('\n')
            .filter((l, i) => i === 0 || l.toLowerCase().includes(q))
            .join('\n')
        : aliasTable
    );
  }
  for (const [provider, entries] of Object.entries(MODEL_CATALOG) as Array<[ProviderName, Array<{ id: string; label: string }>]>) {
    const hits = entries.filter((e) => !q || `${provider}:${e.id} ${e.label}`.toLowerCase().includes(q));
    if (hits.length > 0) lines.push(`${provider}: ${hits.map((e) => e.id).join(', ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : `no models match "${query.trim()}"`;
}

export interface ShellResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

const MAX_CAPTURE_CHARS = 1_000_000;
const MAX_CONTEXT_CHARS = 8000;

/** Kill `child` and everything it started (a shell leaves grandchildren holding the output pipes). */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // the child leads its own process group (detached)
    }
  } catch {
    child.kill('SIGKILL');
  }
}

/** Run a shell command for `/run` and `/test`: the user typed it, so no approval, but with a timeout. */
export function runShell(command: string, cwd: string, timeoutMs = 120_000): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', env: shellEnv(process.env) });
    let output = '';
    let settled = false;
    const finish = (result: ShellResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const take = (d: Buffer): void => {
      if (output.length < MAX_CAPTURE_CHARS) output += d.toString('utf8');
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => {
      killTree(child);
      finish({ exitCode: null, output, timedOut: true });
    }, timeoutMs);
    child.on('error', (err) => finish({ exitCode: null, output: `${output}${err.message}`, timedOut: false }));
    child.on('close', (code) => finish({ exitCode: code, output, timedOut: false }));
  });
}

/** The last part of command output (where failures are), with secrets redacted. */
export function contextOutput(output: string): string {
  const t = output.trim();
  const tail = t.length <= MAX_CONTEXT_CHARS ? t : `...\n${t.slice(t.length - MAX_CONTEXT_CHARS)}`;
  return redact(tail).text;
}

const statusOf = (r: ShellResult): string => (r.timedOut ? 'timed out' : `exit ${r.exitCode ?? 'none'}`);

/** The note `/run` adds to the conversation so the model sees what happened. */
export function runContextNote(command: string, r: ShellResult): string {
  return `I ran \`${command}\` (${statusOf(r)}). Output:\n\`\`\`\n${contextOutput(r.output) || '(no output)'}\n\`\`\``;
}

/** The task `/test` and `/lint` send to the model when the command fails. */
export function fixTask(kind: 'test' | 'lint', command: string, r: ShellResult): string {
  return `The ${kind} command \`${command}\` failed (${statusOf(r)}). Fix the code so it passes, then run it again.\n\n\`\`\`\n${contextOutput(r.output)}\n\`\`\``;
}

export const OK_TASK = 'Ok, please go ahead and make those changes.';

export interface TokensReport {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | undefined;
  model: ModelConfig;
  /** Estimated tokens in the next prompt (history size). */
  contextTokens: number;
  attachedFiles: number;
}

/** `/tokens`. */
export function formatTokens(r: TokensReport): string {
  const window = getModelWindowTokens(r.model);
  const pct = window > 0 ? Math.min(100, Math.round((r.contextTokens / window) * 100)) : 0;
  const lines = [
    `context: ~${r.contextTokens.toLocaleString('en-US')} of ${window.toLocaleString('en-US')} tokens (${pct}%): ${describeModel(r.model)}`,
    `used this session: ${r.inputTokens.toLocaleString('en-US')} in / ${r.outputTokens.toLocaleString('en-US')} out${
      r.costUsd !== undefined ? `, $${r.costUsd.toFixed(4)}` : ''
    }`,
  ];
  if (r.attachedFiles > 0) lines.push(`${r.attachedFiles} attached file${r.attachedFiles === 1 ? '' : 's'} are re-sent every turn`);
  return lines.join('\n');
}

/** Rough size of the conversation in tokens (4 characters each). */
export function estimateContextTokens(messages: ReadonlyArray<{ content: unknown }>): number {
  let chars = 0;
  // Attached images and PDFs are counted by core's estimate, not by the length of their base64.
  let media = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        const tokens = mediaPartTokens(part);
        if (tokens > 0) media += tokens;
        else chars += JSON.stringify(part).length;
      }
    } else chars += JSON.stringify(m.content).length;
  }
  return Math.ceil(chars / 4) + media;
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export const REASONING_LEVELS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export type EffortChange = { ok: true; effort: ReasoningEffort | undefined } | { ok: false; error: string };

/** `/reasoning-effort <level|default>`: `default` clears it, so the provider's own default applies. */
export function parseReasoningEffort(arg: string): EffortChange {
  const v = arg.trim().toLowerCase();
  if (v === 'default' || v === 'auto') return { ok: true, effort: undefined };
  if ((REASONING_LEVELS as readonly string[]).includes(v)) return { ok: true, effort: v as ReasoningEffort };
  return { ok: false, error: `reasoning effort must be one of ${REASONING_LEVELS.join(', ')}, or "default" (got "${arg.trim()}")` };
}

/** A token count such as `8000`, `8k` or `1.5m`; null when it is not one. */
export function parseTokenCount(arg: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([km])?$/i.exec(arg.trim());
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Forge passes the model an effort level (the SDK turns that into a thinking budget per provider), not an
 * exact token count, so `/think-tokens` picks the nearest level.
 */
export function effortForThinkTokens(tokens: number): ReasoningEffort {
  if (tokens <= 0) return 'none';
  if (tokens <= 1024) return 'minimal';
  if (tokens <= 4096) return 'low';
  if (tokens <= 16384) return 'medium';
  if (tokens <= 32768) return 'high';
  return 'xhigh';
}

export type ThinkTokensChange = { ok: true; effort: ReasoningEffort | undefined; note: string } | { ok: false; error: string };

export function parseThinkTokens(arg: string): ThinkTokensChange {
  const v = arg.trim().toLowerCase();
  if (v === 'default' || v === 'auto') return { ok: true, effort: undefined, note: 'thinking budget → the provider default' };
  const n = parseTokenCount(v);
  if (n === null) return { ok: false, error: 'give a token count such as 8000 or 8k, 0 to turn thinking off, or "default"' };
  const effort = effortForThinkTokens(n);
  return {
    ok: true,
    effort,
    note: `thinking budget ${n === 0 ? 'off' : `~${n.toLocaleString('en-US')} tokens`} → reasoning effort "${effort}" (Forge sets a level, not an exact token count)`,
  };
}

/** The lines of a `/load` script: blank lines and `#` comments dropped. */
export function scriptLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** `/save-script`: the commands that recreate the model and attached files in a new session. */
export function formatScript(state: {
  model: ModelConfig;
  weakModel?: ModelConfig | undefined;
  editorModel?: ModelConfig | undefined;
  files: { editable: string[]; readOnly: string[] };
}): string {
  const lines = ['# Forge session script. Replay it with: /load <this file>', `/model ${describeModel(state.model)}`];
  if (state.model.reasoningEffort) lines.push(`/reasoning-effort ${state.model.reasoningEffort}`);
  if (state.weakModel) lines.push(`/weak-model ${describeModel(state.weakModel)}`);
  if (state.editorModel) lines.push(`/editor-model ${describeModel(state.editorModel)}`);
  const quote = (f: string): string => (/\s/.test(f) ? `"${f}"` : f);
  for (const f of state.files.editable) lines.push(`/add ${quote(f)}`);
  for (const f of state.files.readOnly) lines.push(`/read-only ${quote(f)}`);
  return `${lines.join('\n')}\n`;
}

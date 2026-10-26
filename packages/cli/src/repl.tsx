import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import TextInput from 'ink-text-input';

import type { ModelMessage } from 'ai';

import {
  Agent,
  type AgentConfig,
  type AgentEvent,
  type AgentRunResult,
  type ApprovalRequest,
  formatSteeringLine,
  type ForgeConfigFile,
  type ModelConfig,
  defaultSessionDir,
  generateSessionId,
  expandCustomCommand,
  formatCustomCommands,
  listSessions,
  loadCustomCommands,
  loadSession,
  saveSession,
  searchSessions,
  type SessionMatch,
  SPEC_READONLY_TOOLS,
  SpecStore,
  splitSpecSections,
  slugifyTaskForSpecId,
  type Session,
} from '@ikarmic/forge-core';

import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildRepoMap,
  changedFiles,
  createExploreEditRouter,
  fetchUrlTool,
  lintFile,
  redact,
  commitFiles,
  diffForFiles,
  generateCommitMessage,
  isGitRepo,
  undoLastForgeCommit,
} from '@ikarmic/forge-core';
import type { Notifier } from './notify.js';
import { Approval } from './components/Approval.js';
import { ChatFiles, stripAttachedFiles } from './chat-files.js';
import { copyToClipboard, readClipboard } from './clipboard.js';
import { buildProgram } from './options.js';
import {
  composeInEditor,
  conversationMarkdown,
  helpQuestionTask,
  lastAssistantText,
  reportUrl,
  type EditorResult,
} from './repl-extras.js';
import { formatCommitLine, gitCommitOptions } from './git-workflow.js';
import {
  OK_TASK,
  describeModel,
  formatScript,
  parseReasoningEffort,
  parseThinkTokens,
  scriptLines,
  estimateContextTokens,
  fixTask,
  formatModels,
  formatTokens,
  parseSlashCommand,
  runContextNote,
  runShell,
  switchModel,
} from './repl-commands.js';
import type { GitWorkflow } from './git-workflow.js';
import { Header } from './components/Header.js';
import { Spinner } from './components/Spinner.js';
import { sessionCheckpointStore, sessionCheckpointsConfig } from './session-checkpoints.js';
import { getUnifiedDiffText, summarizeResult as summarizeToolResult } from './tool-display.js';

/**
 * Persistent interactive REPL: multi-turn chat with the agent.
 *
 * Each turn:
 *   1. User types a task, presses Enter.
 *   2. We append a user message to history.
 *   3. We run `new Agent(config).run({ task, history })`.
 *   4. We stream events into the visible transcript.
 *   5. After completion, we append the agent's new messages to history.
 *   6. Repeat.
 *
 * The conversation history is what enables multi-turn context: every tool
 * result the agent saw is preserved across turns.
 */
export interface PageFetch {
  url: string;
  title?: string;
  status: number;
  excerpt: string;
  truncated: boolean;
}

export interface ReplServices {
  copy?: typeof copyToClipboard;
  read?: typeof readClipboard;
  /** Open the user's editor on `initial` and return what they wrote. */
  edit?: (initial: string) => Promise<EditorResult>;
  fetchPage?: (url: string, cwd: string) => Promise<PageFetch>;
}

/** The text of `/help`. */
function replHelpText(sessionId: string): string {
  return [
    'Slash commands: /help [question] /clear /reset /save [label] /plan <task> /spec <task> /compact /rewind /ok /model /weak-model /models /add /read-only /drop /ls /run /test /lint /tokens /settings /commit /undo /diff /map /map-refresh /copy /copy-context /paste /web /editor /report /reasoning-effort /think-tokens /editor-model /architect /load /save-script /retry /edit-last /sessions /exit /quit.',
    '/retry [new text] runs your last message again (or an edited one) in place of the last turn; /edit-last opens it in your editor first. Files the dropped turn changed stay changed: /undo or /rewind reverts them.',
    '/sessions [words] lists recent sessions, or searches all of them; resume one with forge --resume <id>. Messages typed while a turn runs wait in a queue and run in order.',
    'Custom commands: a Markdown file in .forge/commands/<name>.md (project) or ~/.forge/commands/<name>.md becomes /<name> [args]; $ARGUMENTS and $1..$9 in it are filled in.',
    '/commit commits all pending changes with a drafted message; /undo reverts the last Forge commit; /diff shows uncommitted changes.',
    '/model [id|alias|provider:model] switches (or shows) the model; /weak-model sets the cheap model; /models [query] lists aliases and known models.',
    '/add <files> and /read-only <files> attach files to every turn (images and PDFs go to the model as they are); /drop [files] detaches; /ls lists them. /run <cmd> (or !<cmd>) runs a command and shows the model its output on the next turn; /test [cmd] and /lint [files] send failures to the model to fix; with no argument they run your --test-cmd / --lint-cmd commands.',
    '/ok says "go ahead"; /reset detaches files and clears the conversation; /tokens shows context use; /settings shows the effective settings.',
    '/map shows the repo map (--map-tokens sets the size sent to the model); /map-refresh re-parses every file first.',
    '/copy copies the last reply to the clipboard; /copy-context copies the whole conversation as Markdown; /paste adds the clipboard text to your next message; /web <url> adds a web page to it.',
    '/editor [text] (or /edit) writes your message in $VISUAL / $EDITOR and sends it; /report prints a prefilled GitHub issue link with diagnostics only; /help <question> answers a question about Forge.',
    '/reasoning-effort <level|default> sets how hard the model thinks; /think-tokens <n|8k|0> picks the nearest level for a thinking budget (Forge sets a level, not an exact count).',
    '/editor-model <model> and /architect <task>: the main model plans without tools (like /plan), you approve, then the editor model applies it. Attach files (/add) and use /map to give the planner context.',
    '/load <file> runs the commands and messages in a file, one per line (# for comments); /save-script <file> writes the model and attached files as such a script.',
    'Otherwise type a task and press Enter.',
    `Session: ${sessionId} (auto-saved after each turn).`,
    'Plan review: when a plan is proposed, type a (approve), e (edit), or c (cancel).',
    'Spec review: same a/e/c keys: approve writes requirements.md/design.md/tasks.md to .forge/specs/<id>/.',
  ].join('\n');
}

async function defaultFetchPage(url: string, cwd: string): Promise<PageFetch> {
  const r = await fetchUrlTool.execute({ url }, { cwd, auto: false } as never);
  return { url: r.url, ...(r.title ? { title: r.title } : {}), status: r.status, excerpt: r.excerpt, truncated: r.truncated };
}

export interface ReplProps {
  baseConfig: AgentConfig;
  model: ModelConfig;
  onExit: () => void;
  /**
   * Either a fresh session id (start a new session) or an existing id
   * (resume from `~/.forge/sessions/<id>.json`). Either way, the REPL
   * auto-saves after every turn so the user can pick up where they left off.
   */
  sessionId: string;
  /** Pre-loaded history, if resuming. */
  initialHistory?: ModelMessage[];
  /** Initial label, if any. */
  initialLabel?: string;
  /** Where to persist sessions. */
  sessionDir: string;
  display?: ForgeConfigFile['display'];
  /** `--auto-commit` workflow; null/absent when off. */
  gitWorkflow?: GitWorkflow | null;
  /** Commit options (attribution, hooks) used by `/commit`. */
  gitOptions?: { noAttribute: boolean; gitCommitVerify: boolean };
  /** Called when a turn finishes (`--notifications`). */
  notify?: Notifier;
  /** Model that drafts commit messages for `/commit`. */
  commitModel?: ModelConfig;
  /** `aliases` from ~/.forge/config.json, for `/model` and `/models`. */
  aliases?: Record<string, string>;
  /** Forge's version, for `/report`. */
  version?: string;
  /** Replaceable system access (clipboard, editor, web), for tests. */
  services?: ReplServices;
  /** `--lint-cmd` commands: what `/lint` runs with no argument. */
  lintCmds?: string[];
  /** `--test-cmd` commands: what `/test` runs with no argument. */
  testCmds?: string[];
}

interface DisplayMessage {
  kind: 'user' | 'assistant' | 'reasoning' | 'tool_call' | 'tool_result' | 'status';
  /** Stable identifier for React keys. */
  id: string;
  text?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  isError?: boolean;
  /** Indicates the assistant message is still streaming. */
  streaming?: boolean;
  /** Tokens used up to this point. */
  inputTokens?: number;
  outputTokens?: number;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}

export function Repl({
  baseConfig,
  model: initialModel,
  onExit,
  sessionId,
  initialHistory,
  initialLabel,
  sessionDir,
  display = {},
  gitWorkflow = null,
  gitOptions = { noAttribute: false, gitCommitVerify: false },
  commitModel,
  notify,
  aliases,
  version = 'unknown',
  services,
  lintCmds = [],
  testCmds = [],
}: ReplProps): React.ReactElement {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [iter, setIter] = useState(0);
  const [maxIter, setMaxIter] = useState(baseConfig.maxIterations ?? 50);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [currentLabel, setCurrentLabel] = useState<string | undefined>(initialLabel);
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const [redactedCount, setRedactedCount] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);
  /** When set, the user is reviewing a proposed plan. */
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  /** Task that the plan was generated FOR: re-runs with this when approved. */
  const [pendingPlanTask, setPendingPlanTask] = useState<string | null>(null);
  /** When set, the user is reviewing a proposed spec (raw, unsplit text). */
  const [pendingSpec, setPendingSpec] = useState<string | null>(null);
  /** Task that the spec was generated FOR: used as the spec's `task` field on approve. */
  const [pendingSpecTask, setPendingSpecTask] = useState<string | null>(null);

  // History sent to the agent: seeded from the resumed session if any,
  // otherwise starts empty (the agent creates the system prompt on turn 1).
  const historyRef = useRef<ModelMessage[]>(initialHistory ?? []);
  const agentConfigRef = useRef(baseConfig);
  /** The model in use; `/model` changes it for the rest of the session. */
  const [model, setModel] = useState<ModelConfig>(initialModel);
  /** Files attached with /add and /read-only; sent with every turn. */
  const chatFilesRef = useRef(new ChatFiles(baseConfig.cwd ?? process.cwd()));
  /** Output of /run commands, handed to the model with the next turn. */
  const pendingNotesRef = useRef<string[]>([]);
  /** `/weak-model`: cheap model for read-only exploration steps and commit messages. */
  const [weakModel, setWeakModel] = useState<ModelConfig | undefined>(undefined);
  /** `/editor-model`: the model that applies a plan made with `/architect`. */
  const [editorModel, setEditorModel] = useState<ModelConfig | undefined>(undefined);
  /** Set while an `/architect` plan awaits approval: the model to apply it with. */
  const architectEditorRef = useRef<ModelConfig | null>(null);
  /** True while a `/load` script runs, so a script cannot load another. */
  const loadingRef = useRef(false);
  /** The latest `handleSubmit`, for `/load` to replay lines through. */
  const submitRef = useRef<((raw: string) => Promise<void>) | null>(null);
  /** The last chat message and the history before it, for `/retry` and `/edit-last`. */
  const lastTurnRef = useRef<{ task: string; historyBefore: ModelMessage[] } | null>(null);
  /** Messages typed while a submission is being handled; they run in order afterwards. */
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(false);
  const { setRawMode, isRawModeSupported } = useStdin();
  /** Hand the terminal to the editor: leave raw mode while it runs, then take it back. */
  const editInTerminal = async (initial: string): Promise<EditorResult> => {
    if (services?.edit) return services.edit(initial);
    if (isRawModeSupported) setRawMode(false);
    try {
      return await composeInEditor(initial);
    } finally {
      if (isRawModeSupported) setRawMode(true);
    }
  };
  // Per-turn AbortController so Escape can cancel a running agent turn (see
  // the useInput handler below). Stored in a ref so it survives re-renders
  // across the async run and stays reachable from the key handler.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Aggregate token + cost counters across turns so we can write them into
  // the session on save.
  const tokensRef = useRef({ input: 0, output: 0 });
  const costRef = useRef(0);
  const redactionsRef = useRef(0);

  const handleSubmit = useCallback(
    async (raw: string): Promise<void> => {
      const task = raw.trim();
      // No `running` check: submitFromUser queues what arrives mid-turn, and this callback's
      // `running` can be a render behind when a queued message or a /load line comes in.
      if (!task) return;
      setInput('');

      // Slash commands
      if (task === '/exit' || task === '/quit') {
        onExit();
        return;
      }
      if (task === '/clear') {
        setMessages([]);
        historyRef.current = [];
        return;
      }
      if (task === '/save' || task.startsWith('/save ')) {
        const label = task.replace(/^\/save\s*/, '').trim();
        if (label) setCurrentLabel(label);
        const savedPath = await persistSession({
          id: currentSessionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(label || currentLabel ? { label: label || currentLabel! } : {}),
          cwd: process.cwd(),
          model,
          messages: historyRef.current,
          totalInputTokens: tokensRef.current.input,
          totalOutputTokens: tokensRef.current.output,
          totalCostUsd: costRef.current,
          costKnown: costUsd !== undefined,
        });
        setMessages((m) => [
          ...m,
          {
            kind: 'status',
            id: cryptoId(),
            text: savedPath
              ? `saved session ${currentSessionId}${label ? ` [${label}]` : ''} → ${savedPath}`
              : 'save failed: no completed turns yet',
          },
        ]);
        return;
      }
      if (task === '/help') {
        const custom = await loadCustomCommands(agentConfigRef.current.cwd ?? process.cwd()).catch(() => new Map());
        const extra = custom.size > 0 ? `\nYour commands:\n${formatCustomCommands(custom)}` : '';
        setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: replHelpText(currentSessionId) + extra }]);
        return;
      }
      if (task === '/id') {
        setMessages((m) => [
          ...m,
          {
            kind: 'status',
            id: cryptoId(),
            text: `session id: ${currentSessionId}: pick up later with: forge --resume ${currentSessionId}`,
          },
        ]);
        return;
      }
      // /rewind: list the agent's per-turn checkpoints so the user can
      // restore a file's pre-tool state. Pair with the `forge checkpoint …`
      // CLI for non-interactive restore (which requires --yes). Within
      // the REPL we just list; the next iteration of this command will
      // accept an `<id>` argument and call `store.restore()` directly.
      if (task === '/rewind' || task.startsWith('/rewind ')) {
        const arg = task.replace(/^\/rewind\s*/, '').trim();
        const store = sessionCheckpointStore(sessionDir, currentSessionId, agentConfigRef.current.cwd ?? process.cwd());
        const items = await store.list();
        if (items.length === 0) {
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'no checkpoints yet (they appear after the first file-mutating tool call)' },
          ]);
          return;
        }
        if (!arg) {
          const lines = items.slice(-10).map(
            (cp) => `  ${cp.id}  turn ${cp.turnIndex}  ${cp.description}  (${cp.fileCount} files)`
          );
          setMessages((m) => [
            ...m,
            {
              kind: 'status',
              id: cryptoId(),
              text:
                `checkpoints (most recent 10 of ${items.length}):\n` +
                lines.join('\n') +
                `\nusage: /rewind <id>: restore files to that checkpoint\n` +
                `       forge checkpoint restore <id> --yes: same, from another shell`,
            },
          ]);
          return;
        }
        // Restore requires explicit confirmation: refuse without it.
        if (arg !== '!') {
          setMessages((m) => [
            ...m,
            {
              kind: 'status',
              id: cryptoId(),
              text: `restore requires confirmation. Re-run as: /rewind ${arg} !   (note the trailing '!')`,
            },
          ]);
          return;
        }
        const targetId = task.replace(/^\/rewind\s+/, '').replace(/\s+!\s*$/, '').trim();
        const result = await store.restore(targetId);
        if (!result) {
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: `checkpoint "${targetId}" not found` },
          ]);
          return;
        }
        const parts: string[] = [];
        if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
        if (result.modified.length > 0) parts.push(`${result.modified.length} modified`);
        if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);
        setMessages((m) => [
          ...m,
          { kind: 'status', id: cryptoId(), text: `restored ${targetId}: ${parts.join(', ') || 'no changes'}` },
        ]);
        return;
      }
      // Plan-mode approval flow.
      if (pendingPlan !== null) {
        const action = task.toLowerCase();
        if (action === 'a' || action === 'approve') {
          const approvedPlan = pendingPlan;
          const approvedTask = pendingPlanTask ?? task;
          const applyWith = architectEditorRef.current;
          architectEditorRef.current = null;
          setPendingPlan(null);
          setPendingPlanTask(null);
          await runWithPlan(approvedTask, approvedPlan, applyWith ?? undefined);
          return;
        }
        if (action === 'c' || action === 'cancel') {
          architectEditorRef.current = null;
          setPendingPlan(null);
          setPendingPlanTask(null);
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'plan cancelled.' },
          ]);
          return;
        }
        if (action === 'e' || action === 'edit') {
          // User wants to edit the plan: the NEXT input they type becomes
          // the edited plan. We signal this with a sentinel value.
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'enter the edited plan (empty line to cancel):' },
          ]);
          setPendingPlan('\u0001edit\u0001');
          return;
        }
        // Sentinel: we're capturing the next input as the edited plan.
        if (pendingPlan === '\u0001edit\u0001') {
          if (!task.trim()) {
            setPendingPlan(null);
            setPendingPlanTask(null);
            setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: 'edit cancelled.' }]);
            return;
          }
          setPendingPlan(task);
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'edited plan saved. approve (a) or cancel (c)?' },
          ]);
          return;
        }
        // Unknown action while a real plan is pending.
        setMessages((m) => [
          ...m,
          { kind: 'status', id: cryptoId(), text: 'enter: a (approve), e (edit), c (cancel)' },
        ]);
        return;
      }
      // Spec-mode approval flow. Mirrors the plan-mode block above, except
      // "approve" writes the three documents to disk via SpecStore instead
      // of re-running the task: spec approval is terminal, per design
      // decision #5 (no auto-chain into execution). Positioned before the
      // /plan and /spec slash-command checks below: same precedence as
      // pendingPlan above it: so a stray /plan or /spec while a spec
      // review is pending falls through to "enter: a/e/c" instead of
      // silently starting a new run.
      if (pendingSpec !== null) {
        const action = task.toLowerCase();
        if (action === 'a' || action === 'approve') {
          try {
            const sections = splitSpecSections(pendingSpec);
            const specTask = pendingSpecTask ?? task;
            const id = slugifyTaskForSpecId(specTask);
            const store = new SpecStore(process.cwd());
            const summary = await store.approve(id, specTask, sections);
            setPendingSpec(null);
            setPendingSpecTask(null);
            setMessages((m) => [
              ...m,
              {
                kind: 'status',
                id: cryptoId(),
                text: `✓ spec approved → ${summary.dir}\n  requirements.md, design.md, tasks.md written.`,
              },
            ]);
          } catch (err) {
            // Splitting failed (e.g. an edit removed a section header): 
            // keep pendingSpec set so the user can fix it with 'e' rather
            // than losing their edit.
            setMessages((m) => [
              ...m,
              {
                kind: 'status',
                id: cryptoId(),
                text: `error: ${(err as Error).message}\nFix with e (edit) or discard with c (cancel).`,
                isError: true,
              },
            ]);
          }
          return;
        }
        if (action === 'c' || action === 'cancel') {
          setPendingSpec(null);
          setPendingSpecTask(null);
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'spec cancelled: nothing written to disk.' },
          ]);
          return;
        }
        if (action === 'e' || action === 'edit') {
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'enter the edited spec text (empty line to cancel):' },
          ]);
          setPendingSpec('\u0001edit\u0001');
          return;
        }
        if (pendingSpec === '\u0001edit\u0001') {
          if (!task.trim()) {
            setPendingSpec(null);
            setPendingSpecTask(null);
            setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: 'edit cancelled.' }]);
            return;
          }
          setPendingSpec(task);
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'edited spec saved. approve (a) or cancel (c)?' },
          ]);
          return;
        }
        setMessages((m) => [
          ...m,
          { kind: 'status', id: cryptoId(), text: 'enter: a (approve), e (edit), c (cancel)' },
        ]);
        return;
      }
      if (task === '/plan' || task.startsWith('/plan ')) {
        const planTask = task.replace(/^\/plan\s*/, '').trim();
        if (!planTask) {
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'usage: /plan <task to plan>' },
          ]);
          return;
        }
        await runInPlanMode(planTask);
        return;
      }
      if (task === '/spec' || task.startsWith('/spec ')) {
        const specTask = task.replace(/^\/spec\s*/, '').trim();
        if (!specTask) {
          setMessages((m) => [
            ...m,
            { kind: 'status', id: cryptoId(), text: 'usage: /spec <task to design>' },
          ]);
          return;
        }
        await runInSpecMode(specTask);
        return;
      }
      if (task === '/compact') {
        await compactNow();
        return;
      }
      const slash = parseSlashCommand(task);
      if (slash && ['model', 'weak-model', 'models', 'run', 'test', 'lint', 'ok', 'add', 'read-only', 'drop', 'ls', 'reset', 'tokens', 'settings', 'help', 'copy', 'copy-context', 'paste', 'web', 'editor', 'edit', 'report', 'reasoning-effort', 'think-tokens', 'editor-model', 'architect', 'load', 'save-script'].includes(slash.name)) {
        const say = (text: string, isError?: boolean) =>
          setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text, ...(isError ? { isError } : {}) }]);
        const cwd = agentConfigRef.current.cwd ?? process.cwd();
        const { name, args } = slash;
        /** Run one command, showing the command and its output tail. */
        const runShown = async (command: string): Promise<Awaited<ReturnType<typeof runShell>>> => {
          say(`$ ${command}`);
          setRunning(true);
          setStatus('running');
          let result;
          try {
            result = await runShell(command, cwd);
          } finally {
            setRunning(false);
            setStatus('idle');
          }
          const tail = result.output.trim().split('\n').slice(-40).join('\n');
          say(`${tail || '(no output)'}\n[${result.timedOut ? 'timed out' : `exit ${result.exitCode ?? 'none'}`}]`, result.exitCode !== 0);
          return result;
        };
        /** Run checks in order; the first failure goes to the model to fix. */
        const runChecks = async (kind: 'test' | 'lint', commands: string[]): Promise<void> => {
          for (const command of commands) {
            const result = await runShown(command);
            if (result.exitCode === 0) continue;
            const fix = fixTask(kind, command, result);
            setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: fix }]);
            await runAgent(fix, { planMode: false });
            return;
          }
        };
        try {
          if (name === 'model' || name === 'weak-model') {
            const weak = name === 'weak-model';
            if (!args) {
              say(weak ? `weak model: ${weakModel ? describeModel(weakModel) : '(none; --cheap-model or /weak-model <model>)'}` : `model: ${describeModel(model)}`);
              return;
            }
            const res = switchModel(args, model, aliases);
            if (!res.ok) {
              say(res.error, true);
              return;
            }
            const next = weak ? model : res.model;
            const cheap = weak ? res.model : weakModel;
            if (weak) setWeakModel(res.model);
            else setModel(res.model);
            agentConfigRef.current = {
              ...agentConfigRef.current,
              model: next,
              ...(cheap ? { modelRouter: createExploreEditRouter({ strong: next, cheap }) } : {}),
            };
            say(weak ? `weak model → ${describeModel(res.model)} (read-only exploration steps and commit messages)` : `model → ${describeModel(res.model)}`);
            return;
          }
          if (name === 'models') {
            say(formatModels(aliases, args));
            return;
          }
          if (name === 'reasoning-effort' || name === 'think-tokens') {
            if (!args) {
              say(
                `reasoning effort: ${model.reasoningEffort ?? 'default (the provider decides)'}\n` +
                  (name === 'reasoning-effort' ? 'usage: /reasoning-effort <none|minimal|low|medium|high|xhigh|default>' : 'usage: /think-tokens <tokens, e.g. 8k | 0 | default>')
              );
              return;
            }
            const change = name === 'reasoning-effort' ? parseReasoningEffort(args) : parseThinkTokens(args);
            if (!change.ok) {
              say(change.error, true);
              return;
            }
            const { reasoningEffort: _dropped, ...rest } = model;
            const next: ModelConfig = change.effort ? { ...rest, reasoningEffort: change.effort } : rest;
            setModel(next);
            agentConfigRef.current = {
              ...agentConfigRef.current,
              model: next,
              ...(weakModel ? { modelRouter: createExploreEditRouter({ strong: next, cheap: weakModel }) } : {}),
            };
            const note = 'note' in change && typeof change.note === 'string' ? change.note : undefined;
            say(note ?? `reasoning effort → ${change.effort ?? 'default (the provider decides)'}`);
            return;
          }
          if (name === 'editor-model') {
            if (!args) {
              say(`editor model: ${editorModel ? describeModel(editorModel) : '(none) set one with /editor-model <model>, then use /architect <task>'}`);
              return;
            }
            if (args.toLowerCase() === 'off') {
              setEditorModel(undefined);
              say('editor model cleared');
              return;
            }
            const res = switchModel(args, model, aliases);
            if (!res.ok) {
              say(res.error, true);
              return;
            }
            setEditorModel(res.model);
            say(`editor model → ${describeModel(res.model)} (applies plans made with /architect)`);
            return;
          }
          if (name === 'architect') {
            if (!editorModel) {
              say('set the model that applies the plan first: /editor-model <model>', true);
              return;
            }
            if (!args) {
              say('usage: /architect <task>  (the main model plans, you approve, then the editor model applies it)', true);
              return;
            }
            architectEditorRef.current = editorModel;
            setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: `/architect ${args}` }]);
            await runAgent(args, { planMode: true });
            return;
          }
          if (name === 'load') {
            if (!args) {
              say('usage: /load <file>  (one command or message per line; blank lines and # comments are skipped)', true);
              return;
            }
            if (loadingRef.current) {
              say('a script cannot /load another script', true);
              return;
            }
            const file = path.resolve(cwd, args);
            let text: string;
            try {
              text = await readFile(file, 'utf8');
            } catch {
              say(`cannot read ${args}`, true);
              return;
            }
            const lines = scriptLines(text);
            if (lines.length === 0) {
              say(`${args} has no commands`, true);
              return;
            }
            if (lines.length > 500) {
              say(`${args} has ${lines.length} lines; scripts are limited to 500`, true);
              return;
            }
            loadingRef.current = true;
            try {
              for (const line of lines) {
                say(`> ${line}`);
                await submitRef.current?.(line);
              }
            } finally {
              loadingRef.current = false;
            }
            return;
          }
          if (name === 'save-script') {
            if (!args) {
              say('usage: /save-script <file>  (writes the model and attached files as commands for /load)', true);
              return;
            }
            const target = path.resolve(cwd, args);
            const rel = path.relative(cwd, target);
            if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
              say('the script must be inside the working directory', true);
              return;
            }
            const script = formatScript({ model, weakModel, editorModel, files: chatFilesRef.current.list() });
            await writeFile(target, script, 'utf8');
            say(`wrote ${scriptLines(script).length} commands to ${rel.split(path.sep).join('/')}`);
            return;
          }
          if (name === 'help') {
            // /help <question>: answered from the command reference; read-only tools only.
            const reference = `${replHelpText(currentSessionId)}\n\nCommand-line options:\n${buildProgram().helpInformation()}`;
            const question = helpQuestionTask(args, reference);
            setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: `/help ${args}` }]);
            await runAgent(question, { planMode: false, readOnlyTools: true });
            return;
          }
          if (name === 'copy' || name === 'copy-context') {
            const text = name === 'copy' ? lastAssistantText(historyRef.current) : conversationMarkdown(historyRef.current);
            if (!text) {
              say(name === 'copy' ? 'nothing to copy yet: no reply from the model' : 'nothing to copy yet: the conversation is empty', true);
              return;
            }
            const res = await (services?.copy ?? copyToClipboard)(text);
            say(res.ok ? `copied ${text.length.toLocaleString('en-US')} characters to the clipboard (${res.tool})` : `copy failed: ${res.error}`, !res.ok);
            return;
          }
          if (name === 'paste') {
            const res = await (services?.read ?? readClipboard)();
            if (!res.ok) {
              say(`paste failed: ${res.error}`, true);
              return;
            }
            if (!res.text.trim()) {
              say('the clipboard is empty', true);
              return;
            }
            pendingNotesRef.current.push(`Pasted from the clipboard:\n\`\`\`\n${redact(res.text.trimEnd()).text}\n\`\`\``);
            say(`pasted ${res.text.length.toLocaleString('en-US')} characters (sent with your next message)`);
            return;
          }
          if (name === 'web') {
            if (!args) {
              say('usage: /web <url>', true);
              return;
            }
            say(`fetching ${args} ...`);
            const page = await (services?.fetchPage ?? defaultFetchPage)(args, cwd);
            pendingNotesRef.current.push(
              `Web page ${page.url}${page.title ? ` ("${page.title}")` : ''}${page.truncated ? ' (truncated)' : ''}:\n\`\`\`\n${page.excerpt}\n\`\`\``
            );
            say(`fetched ${page.url} (HTTP ${page.status}, ${page.excerpt.length.toLocaleString('en-US')} characters${page.truncated ? ', truncated' : ''}); sent with your next message`);
            return;
          }
          if (name === 'editor' || name === 'edit') {
            const res = await editInTerminal(args);
            if (!res.ok) {
              say(`/${name}: ${res.error}`, true);
              return;
            }
            await chatTurn(res.text, res.text);
            return;
          }
          if (name === 'report') {
            const url = reportUrl({ version, platform: `${process.platform} ${process.arch}`, node: process.version, model, sessionId: currentSessionId });
            say(`Open this link to file an issue. It is prefilled with diagnostics only (version, platform, model): no keys, paths or prompts.\n${url}`);
            return;
          }
          if (name === 'ls') {
            const { editable, readOnly } = chatFilesRef.current.list();
            say(
              editable.length + readOnly.length === 0
                ? 'no files attached (/add <file>, /read-only <file>)'
                : [...editable.map((f) => `  ${f}`), ...readOnly.map((f) => `  ${f} (read-only)`)].join('\n')
            );
            return;
          }
          if (name === 'add' || name === 'read-only') {
            const res = await chatFilesRef.current.add(args, name === 'add' ? 'editable' : 'read-only');
            const lines = [
              ...(res.added.length > 0 ? [`attached ${res.added.join(', ')}${name === 'read-only' ? ' (read-only)' : ''}`] : []),
              ...res.errors,
            ];
            say(lines.join('\n'), res.added.length === 0);
            return;
          }
          if (name === 'drop') {
            const res = chatFilesRef.current.drop(args);
            const lines = [
              ...(res.dropped.length > 0 ? [`detached ${res.dropped.join(', ')}`] : args ? [] : ['nothing attached']),
              ...res.notFound.map((f) => `${f}: not attached`),
            ];
            say(lines.join('\n'), res.dropped.length === 0 && args !== '');
            return;
          }
          if (name === 'reset') {
            chatFilesRef.current.drop('');
            pendingNotesRef.current = [];
            historyRef.current = [];
            setMessages([]);
            say('detached all files and cleared the conversation');
            return;
          }
          if (name === 'tokens') {
            say(
              formatTokens({
                inputTokens,
                outputTokens,
                costUsd,
                model,
                contextTokens: estimateContextTokens(historyRef.current),
                attachedFiles: chatFilesRef.current.size,
              })
            );
            return;
          }
          if (name === 'settings') {
            const c = agentConfigRef.current;
            say(
              [
                `model: ${describeModel(model)}${weakModel ? `   weak model: ${describeModel(weakModel)}` : ''}`,
                `mode: ${c.auto ? 'autonomous' : 'interactive'}   max iterations: ${c.maxIterations ?? 50}   cwd: ${cwd}`,
                `repo map: ${c.repoMap?.tokens ? `${c.repoMap.tokens} tokens` : 'off'}   auto-lint: ${c.autoLint ? 'on' : 'off'}   auto-commit: ${gitWorkflow ? 'on' : 'off'}`,
                `verify: ${c.verify?.commands.length ? c.verify.commands.join(' && ') : 'off'}`,
                `attached files: ${chatFilesRef.current.size}   session: ${currentSessionId}`,
              ].join('\n')
            );
            return;
          }
          if (name === 'ok') {
            setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: OK_TASK }]);
            await runAgent(OK_TASK, { planMode: false });
            return;
          }
          if (name === 'lint' && !args && lintCmds.length > 0) {
            await runChecks('lint', lintCmds);
            return;
          }
          if (name === 'lint') {
            const aut = agentConfigRef.current.autoLint ?? { syntax: true };
            const named = args ? args.split(/\s+/).filter(Boolean) : [];
            const targets = named.length > 0 ? named : [...new Set([...chatFilesRef.current.focusFiles(), ...(await isGitRepo(cwd) ? await changedFiles(cwd) : [])])];
            if (targets.length === 0) {
              say('nothing to lint: attach files with /add, or have uncommitted changes');
              return;
            }
            setRunning(true);
            setStatus('running');
            const problems: string[] = [];
            try {
              for (const file of targets) {
                const rep = await lintFile(file, aut, { cwd } as never);
                problems.push(...rep.problems);
              }
            } finally {
              setRunning(false);
              setStatus('idle');
            }
            if (problems.length === 0) {
              say(`lint clean (${targets.length} file${targets.length === 1 ? '' : 's'})`);
              return;
            }
            const report = problems.join('\n');
            say(`✘ lint: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${report}`, true);
            const fix = `Linting found problems. Fix them:\n\n${report}`;
            setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: fix }]);
            await runAgent(fix, { planMode: false });
            return;
          }
          // /run runs one command; /test with no argument runs every --test-cmd.
          if (name === 'test' && !args) {
            if (testCmds.length === 0) {
              say('usage: /test <command>  (or start forge with --test-cmd <command>)', true);
              return;
            }
            await runChecks('test', testCmds);
            return;
          }
          if (!args) {
            say(name === 'test' ? 'usage: /test <command>  (or start forge with --test-cmd <command>)' : 'usage: /run <command>  (or !<command>)', true);
            return;
          }
          if (name === 'test') {
            await runChecks('test', [args]);
            return;
          }
          const result = await runShown(args);
          pendingNotesRef.current.push(runContextNote(args, result));
          say('(output will be sent to the model with your next message)');
        } catch (err) {
          setRunning(false);
          setStatus('idle');
          say(`/${name}: ${(err as Error).message}`, true);
        }
        return;
      }
      if (task === '/map' || task === '/map-refresh') {
        const say = (text: string, isError?: boolean) =>
          setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text, ...(isError ? { isError } : {}) }]);
        const cwd = agentConfigRef.current.cwd ?? process.cwd();
        try {
          // /map-refresh drops the cached symbol index so every file is parsed again.
          if (task === '/map-refresh') await rm(path.join(cwd, '.forge', 'index', 'symbols.json'), { force: true });
          const map = await buildRepoMap(cwd, { tokens: agentConfigRef.current.repoMap?.tokens });
          say(map.text ? `${map.text}\n\n(${map.files.length} file${map.files.length === 1 ? '' : 's'}, ~${map.tokens} tokens)` : 'no source files to map');
        } catch (err) {
          say(`${task}: ${(err as Error).message}`, true);
        }
        return;
      }
      if (task === '/commit' || task === '/undo' || task === '/diff') {
        const say = (text: string, isError?: boolean) =>
          setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text, ...(isError ? { isError } : {}) }]);
        const cwd = agentConfigRef.current.cwd ?? process.cwd();
        try {
          if (!(await isGitRepo(cwd))) {
            say(`${task}: ${cwd} is not a git repository`, true);
            return;
          }
          if (task === '/undo') {
            const result = await undoLastForgeCommit(cwd);
            say(
              result.ok
                ? `undid ${result.commit.slice(0, 7)} ${result.message.split('\n')[0]} (${result.files.length} file${result.files.length === 1 ? '' : 's'} restored)`
                : result.reason,
              !result.ok
            );
            return;
          }
          const files = await changedFiles(cwd);
          if (files.length === 0) {
            say('no uncommitted changes');
            return;
          }
          const diff = await diffForFiles(cwd, files);
          if (task === '/diff') {
            say(diff.trim() || `${files.length} changed file(s), no textual diff:\n${files.join('\n')}`);
            return;
          }
          const message = await generateCommitMessage(diff, files, weakModel ?? commitModel ?? model);
          const commit = await commitFiles(cwd, files, message, gitCommitOptions(gitOptions));
          say(commit ? formatCommitLine(commit) : 'nothing to commit');
        } catch (err) {
          say(`${task}: ${(err as Error).message}`, true);
        }
        return;
      }

      const say = (text: string, isError?: boolean) =>
        setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text, ...(isError ? { isError } : {}) }]);
      if (task === '/retry' || task.startsWith('/retry ') || task === '/edit-last') {
        const last = lastTurnRef.current;
        if (!last) {
          say('nothing to retry yet: send a message first', true);
          return;
        }
        let next = task.replace(/^\/retry\s*/, '').trim() || last.task;
        if (task === '/edit-last') {
          const res = await editInTerminal(last.task);
          if (!res.ok) {
            say(`/edit-last: ${res.error}`, true);
            return;
          }
          next = res.text;
        }
        // Drop the last turn from the conversation and run the message again in its place.
        historyRef.current = last.historyBefore;
        say(`retrying${next !== last.task ? ' with your edit' : ''}: the last turn is dropped from the conversation (files it changed stay changed; /undo or /rewind reverts them)`);
        await chatTurn(next, next);
        return;
      }
      if (task === '/sessions' || task.startsWith('/sessions ')) {
        const query = task.replace(/^\/sessions\s*/, '').trim();
        try {
          if (!query) {
            const recent = (await listSessions(sessionDir)).slice(0, 10);
            say(
              recent.length === 0
                ? 'no saved sessions yet'
                : `recent sessions (resume with forge --resume <id>):\n${recent.map((e) => `  ${e.id}${e.label ? ` [${e.label}]` : ''}  ${e.updatedAt.slice(0, 16).replace('T', ' ')}  ${e.preview ?? ''}`).join('\n')}`
            );
            return;
          }
          const found = await searchSessions(sessionDir, query, { limit: 10 });
          say(
            found.length === 0
              ? `no session mentions "${query}"`
              : `sessions mentioning "${query}" (resume with forge --resume <id>):\n${found.map((f: SessionMatch) => `  ${f.entry.id}${f.entry.label ? ` [${f.entry.label}]` : ''}  ${f.entry.updatedAt.slice(0, 10)}  ${f.snippet}`).join('\n')}`
          );
        } catch (err) {
          say(`/sessions: ${(err as Error).message}`, true);
        }
        return;
      }
      const customSlash = parseSlashCommand(task);
      if (customSlash && !task.startsWith('!')) {
        const custom = (await loadCustomCommands(agentConfigRef.current.cwd ?? process.cwd()).catch(() => new Map())).get(customSlash.name);
        if (custom) {
          await chatTurn(task, expandCustomCommand(custom, customSlash.args));
          return;
        }
      }

      await chatTurn(task, task);
    },
    [
      running,
      onExit,
      inputTokens,
      outputTokens,
      currentSessionId,
      currentLabel,
      model,
      sessionDir,
      costUsd,
      pendingPlan,
      pendingPlanTask,
      pendingSpec,
      pendingSpecTask,
      // Everything the handler reads from props or state: a value missing here is stale after it changes.
      weakModel,
      editorModel,
      aliases,
      services,
      version,
      lintCmds,
      testCmds,
      gitWorkflow,
      gitOptions,
      commitModel,
    ]
  );
  submitRef.current = handleSubmit;

  /** One chat message: shown as `shown`, sent as `task`, and remembered for /retry. */
  async function chatTurn(shown: string, task: string): Promise<void> {
    lastTurnRef.current = { task, historyBefore: historyRef.current };
    setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: shown }]);
    await runAgent(task, { planMode: false });
  }

  /**
   * What Enter does: handle the message now, or queue it while an earlier one is still being
   * handled (a turn, a /test run, a script). Queued messages then run one by one, in order.
   */
  const submitFromUser = (raw: string): void => {
    const task = raw.trim();
    if (!task) return;
    if (inFlightRef.current) {
      queueRef.current.push(task);
      setInput('');
      setMessages((m) => [
        ...m,
        { kind: 'status', id: cryptoId(), text: `queued (${queueRef.current.length} waiting): ${task.length > 60 ? `${task.slice(0, 57)}...` : task}` },
      ]);
      return;
    }
    inFlightRef.current = true;
    void (async () => {
      try {
        await submitRef.current?.(task);
      } finally {
        inFlightRef.current = false;
        const next = queueRef.current.shift();
        if (next !== undefined) submitFromUser(next);
      }
    })();
  };

  /**
   * Run the agent for a single turn. `options.planMode: true` makes the
   * agent emit a plan instead of executing; the returned finalText holds
   * the plan. `options.planContext` puts an `<approved-plan>` block at the
   * start of this turn's message so the agent knows what to do.
   *
   * Declared as a regular function (not `useCallback`) so it can be
   * referenced by `handleSubmit` below: function declarations are hoisted
   * while `const` callbacks are not.
   */
  async function runAgent(
    task: string,
    options: { planMode: boolean; planContext?: string; specMode?: boolean; readOnlyTools?: boolean; modelOverride?: ModelConfig }
  ): Promise<void> {
      setRunning(true);
      setStatus('running');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const approvals = new Map<string, (approved: boolean) => void>();

      const overrides: Partial<AgentConfig> = {
        // An /architect plan is applied by the editor model; its cost router must not route back to the planner.
        ...(options.modelOverride ? { model: options.modelOverride, modelRouter: undefined } : {}),
        planMode: options.planMode,
        specMode: options.specMode === true,
        // Spec mode always gets exactly the six read-only tools: a hard
        // override of whatever toolSandbox the user configured via
        // --allow-tools/--deny-tools, matching options.ts's toAgentConfig
        // wiring for one-shot `--spec`.
        ...(options.specMode === true || options.readOnlyTools === true ? { toolSandbox: { allowTools: [...SPEC_READONLY_TOOLS] } } : {}),
      };

      const localConfig: AgentConfig = {
        ...agentConfigRef.current,
        ...overrides,
        checkpoints: agentConfigRef.current.checkpoints ?? sessionCheckpointsConfig(sessionDir, currentSessionId, agentConfigRef.current.cwd ?? process.cwd()),
        abortSignal: controller.signal,
        approve: (req: ApprovalRequest) =>
          new Promise<boolean>((resolve) => {
            approvals.set(req.id, resolve);
            setPendingApproval({ request: req, resolve });
          }),
      };

      // Attached files are re-read every turn; /run output is handed over once.
      const attached = await chatFilesRef.current.render();
      for (const note of attached.notes) setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: note }]);
      // The approved plan rides in this turn's message: a system-prompt override is ignored once the
      // conversation has history (and it always has, right after the plan run), which also dropped edited plans.
      const planBlock = options.planContext
        ? `<approved-plan>\n${options.planContext}\n</approved-plan>\nFollow the plan above. You may deviate if you find an issue, but explain why in your final summary.`
        : '';
      const turnContext = [planBlock, ...pendingNotesRef.current.splice(0), attached.block].filter((part) => part.length > 0).join('\n\n');
      if (localConfig.repoMap && chatFilesRef.current.size > 0) {
        localConfig.repoMap = { ...localConfig.repoMap, focusFiles: chatFilesRef.current.focusFiles() };
      }

      const agent = new Agent(localConfig);
      const gitRun = gitWorkflow && !options.planMode && !options.specMode ? gitWorkflow : null;
      if (gitRun) {
        const saved = await gitRun.before().catch(() => null);
        if (saved) setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: `${formatCommitLine(saved)} (your earlier changes)` }]);
      }
      const messageIdsByToolCallId = new Map<string, string>();

      let agentRunResult: import('@ikarmic/forge-core').AgentRunResult | undefined;

      try {
        agentRunResult = await agent.run({
          task,
          ...(turnContext ? { context: turnContext } : {}),
          ...(attached.attachments.length > 0 ? { attachments: attached.attachments } : {}),
          history: historyRef.current,
          abortSignal: controller.signal,
          onEvent: (event: AgentEvent): void => {
            switch (event.type) {
              case 'iteration':
                setIter(event.iteration);
                setMaxIter(event.maxIterations);
                break;
              case 'text_delta': {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.kind === 'assistant' && m.streaming);
                  if (idx === -1) {
                    return [
                      ...prev,
                      {
                        kind: 'assistant',
                        id: cryptoId(),
                        text: event.text,
                        streaming: true,
                      },
                    ];
                  }
                  const copy = prev.slice();
                  const cur = copy[idx]!;
                  copy[idx] = { ...cur, text: (cur.text ?? '') + event.text };
                  return copy;
                });
                break;
              }
              case 'retry':
                // The step is asked again: drop what it streamed so far.
                setMessages((prev) => prev.filter((m) => !(m.kind === 'assistant' && m.streaming)));
                break;
              case 'text_done': {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.kind === 'assistant' && m.streaming);
                  if (idx === -1) {
                    return [
                      ...prev,
                      {
                        kind: 'assistant',
                        id: cryptoId(),
                        text: event.text,
                      },
                    ];
                  }
                  const copy = prev.slice();
                  copy[idx] = { ...copy[idx]!, text: event.text, streaming: false };
                  return copy;
                });
                break;
              }
              case 'reasoning_delta': {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.kind === 'reasoning' && m.streaming);
                  if (idx === -1) {
                    return [...prev, { kind: 'reasoning', id: cryptoId(), text: event.text, streaming: true }];
                  }
                  const copy = prev.slice();
                  const cur = copy[idx]!;
                  copy[idx] = { ...cur, text: (cur.text ?? '') + event.text };
                  return copy;
                });
                break;
              }
              case 'reasoning_done': {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.kind === 'reasoning' && m.streaming);
                  if (idx === -1) return prev;
                  const copy = prev.slice();
                  copy[idx] = { ...copy[idx]!, text: event.text, streaming: false };
                  return copy;
                });
                break;
              }
              case 'plan': {
                // Plan-mode result: render the plan and set pendingPlan so
                // the user can approve / edit / cancel.
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'status',
                    id: cryptoId(),
                    text: `📋 plan:\n\n${event.plan}`,
                  },
                ]);
                setPendingPlan(event.plan);
                setPendingPlanTask(task);
                break;
              }
              case 'spec': {
                // Spec-mode result: render the raw three-section text and
                // set pendingSpec so the user can approve / edit / cancel.
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'status',
                    id: cryptoId(),
                    text: `📐 spec drafted:\n\n${event.spec}`,
                  },
                ]);
                setPendingSpec(event.spec);
                setPendingSpecTask(task);
                break;
              }
              case 'tool_call': {
                const id = cryptoId();
                messageIdsByToolCallId.set(event.id, id);
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'tool_call',
                    id,
                    toolName: event.name,
                    toolArgs: event.args,
                  },
                ]);
                break;
              }
              case 'tool_result': {
                if (event.redacted !== undefined && event.redacted > 0) {
                  redactionsRef.current += event.redacted;
                  setRedactedCount(redactionsRef.current);
                  setMessages((prev) => [
                    ...prev,
                    {
                      kind: 'status',
                      id: cryptoId(),
                      text: `🔒 ${event.redacted} secret${event.redacted === 1 ? '' : 's'} redacted from ${event.name} result`,
                    },
                  ]);
                }
                setMessages((prev) => {
                  const id = messageIdsByToolCallId.get(event.id);
                  if (!id) return prev;
                  return [
                    ...prev,
                    {
                      kind: 'tool_result',
                      id: cryptoId(),
                      toolName: event.name,
                      toolResult: event.result,
                      isError: event.isError,
                    },
                  ];
                });
                break;
              }
              case 'approval_requested':
                break;
              case 'usage':
                tokensRef.current.input = event.inputTokens;
                tokensRef.current.output = event.outputTokens;
                setInputTokens(event.inputTokens);
                setOutputTokens(event.outputTokens);
                break;
              case 'cost':
                costRef.current = event.runningCostUsd;
                setCostUsd(event.runningCostUsd);
                break;
              case 'cache_stats':
                setCacheHits(event.hits);
                setCacheMisses(event.misses);
                break;
              case 'compaction':
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'status',
                    id: cryptoId(),
                    text: `🗜 compacted ${event.droppedCount} older turn${event.droppedCount === 1 ? '' : 's'} (saved ~${event.savedTokens} tokens)`,
                  },
                ]);
                break;
              case 'steering':
                setMessages((prev) => [...prev, { kind: 'status', id: cryptoId(), text: formatSteeringLine(event) }]);
                break;
              case 'verify':
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'status',
                    id: cryptoId(),
                    text: event.passed
                      ? `✔ verification passed (pass ${event.attempt})`
                      : `✘ verification failed (pass ${event.attempt}): ${event.failedCommands.join(', ')}`,
                  },
                ]);
                break;
              case 'lint':
                if (!event.passed) {
                  setMessages((prev) => [
                    ...prev,
                    { kind: 'status', id: cryptoId(), text: `✘ lint: ${event.problems} problem${event.problems === 1 ? '' : 's'} in ${event.path}` },
                  ]);
                }
                break;
              case 'model_route':
                setMessages((prev) => [
                  ...prev,
                  { kind: 'status', id: cryptoId(), text: `⇄ step ${event.iteration} → ${event.provider}/${event.model}` },
                ]);
                break;
              case 'error':
                setMessages((prev) => [
                  ...prev,
                  { kind: 'status', id: cryptoId(), text: `error: ${event.error}`, isError: true },
                ]);
                break;
              case 'done':
                setStatus(event.reason === 'error' ? 'error' : 'done');
                setMessages((prev) => [
                  ...prev,
                  {
                    kind: 'status',
                    id: cryptoId(),
                    text: `done (${event.reason})`,
                    inputTokens,
                    outputTokens,
                  },
                ]);
                break;
            }
          },
        });
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { kind: 'status', id: cryptoId(), text: `error: ${(err as Error).message}`, isError: true },
        ]);
        setStatus('error');
      } finally {
        setRunning(false);
        setPendingApproval(null);
        approvals.clear();
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }

      notify?.(agentRunResult ? `Forge finished (${agentRunResult.reason}) - waiting for you` : 'Forge stopped - waiting for you');

      if (gitRun && agentRunResult?.reason === 'completed') {
        const commit = await gitRun.after(task).catch(() => null);
        if (commit) setMessages((m) => [...m, { kind: 'status', id: cryptoId(), text: formatCommitLine(commit) }]);
      }

      if (agentRunResult) {
        // The attached files were for this turn; keep them out of the stored history.
        historyRef.current =
          attached.block || attached.attachments.length > 0 ? agentRunResult.messages.map(stripAttachedFiles) : agentRunResult.messages;
        if (historyRef.current.length > 0 && !options.planMode && !options.specMode) {
          const savedPath = await persistSession({
            id: currentSessionId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...(currentLabel ? { label: currentLabel } : {}),
            cwd: process.cwd(),
            model,
            messages: historyRef.current,
            totalInputTokens: tokensRef.current.input,
            totalOutputTokens: tokensRef.current.output,
            totalCostUsd: costRef.current,
            costKnown: costUsd !== undefined,
          });
          if (!savedPath) {
            setMessages((m) => [
              ...m,
              {
                kind: 'status',
                id: cryptoId(),
                text: `warning: auto-save failed (couldn't write ${currentSessionId}.json)`,
                isError: true,
              },
            ]);
          }
        }
      }
  }

  /** Run the agent in plan mode for a task. */
  function runInPlanMode(planTask: string): Promise<void> {
    architectEditorRef.current = null; // a plain /plan is applied by the main model
    setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: `/plan ${planTask}` }]);
    return runAgent(planTask, { planMode: true });
  }

  /** Run a normal (non-plan) agent turn with a previously-approved plan injected. */
  function runWithPlan(realTask: string, plan: string, applyWith?: ModelConfig): Promise<void> {
    setMessages((m) => [
      ...m,
      { kind: 'status', id: cryptoId(), text: applyWith ? `✓ plan approved: ${describeModel(applyWith)} is applying it…` : '✓ plan approved: executing…' },
      { kind: 'user', id: cryptoId(), text: realTask },
    ]);
    return runAgent(realTask, { planMode: false, planContext: plan, ...(applyWith ? { modelOverride: applyWith } : {}) });
  }

  /**
   * Run the agent in spec mode for a task. Unlike `runWithPlan`, there is
   * no re-run-on-approve counterpart: spec approval writes files directly
   * via `SpecStore.approve` in the pendingSpec branch above, with no
   * second agent run: spec approval is terminal (design decision #5).
   */
  function runInSpecMode(specTask: string): Promise<void> {
    setMessages((m) => [...m, { kind: 'user', id: cryptoId(), text: `/spec ${specTask}` }]);
    return runAgent(specTask, { planMode: false, specMode: true });
  }

  /**
   * Force a compaction pass now. Useful in long sessions where the user
   * wants to free context space before the next turn. Uses the agent's
   * configured summarizer (default: the same model the agent runs on).
   */
  async function compactNow(): Promise<void> {
    if (historyRef.current.length <= 2) {
      setMessages((m) => [
        ...m,
        { kind: 'status', id: cryptoId(), text: 'nothing to compact (history too short)' },
      ]);
      return;
    }
    setRunning(true);
    setStatus('running');
    try {
      const summarizer = agentConfigRef.current.modelFactory
        ? await import('@ikarmic/forge-core').then((m) =>
            m.buildLlmSummarizer(
              agentConfigRef.current.compactionModel ?? agentConfigRef.current.model,
              agentConfigRef.current.modelFactory
            )
          )
        : await import('@ikarmic/forge-core').then((m) =>
            m.buildLlmSummarizer(agentConfigRef.current.compactionModel ?? agentConfigRef.current.model)
          );
      const result = await (
        await import('@ikarmic/forge-core')
      ).compactMessages(historyRef.current, summarizer, {
        keepRecent: agentConfigRef.current.compactionKeepRecent,
      });
      if (result.droppedCount > 0) {
        historyRef.current = result.messages;
        setMessages((m) => [
          ...m,
          {
            kind: 'status',
            id: cryptoId(),
            text: `🗜 compacted ${result.droppedCount} older turn${result.droppedCount === 1 ? '' : 's'} (saved ~${result.savedTokens} tokens)`,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { kind: 'status', id: cryptoId(), text: 'nothing to compact (everything is recent)' },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { kind: 'status', id: cryptoId(), text: `compact failed: ${(err as Error).message}`, isError: true },
      ]);
    } finally {
      setStatus('idle');
      setRunning(false);
    }
  }

  const handleApproval = useCallback(
    (approved: boolean): void => {
      if (pendingApproval) {
        pendingApproval.resolve(approved);
        setPendingApproval(null);
      }
    },
    [pendingApproval]
  );

  // Esc cancels the in-flight turn. Only active while a turn is running
  // (Approval.tsx handles Escape itself during an approval prompt, and
  // TextInput owns input while idle).
  useInput(
    (_input, key) => {
      if (key.escape) abortControllerRef.current?.abort();
    },
    { isActive: running }
  );

  useEffect(() => {
    // Welcome banner
    setMessages([
      {
        kind: 'status',
        id: cryptoId(),
        text: `Interactive REPL - type a task and press Enter. Type /help for the slash commands`,
      },
    ]);
  }, []);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        model={model}
        iteration={iter}
        maxIterations={maxIter}
        status={status}
        auto={baseConfig.auto ?? false}
      />
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {messages.map((m) => (
          <MessageView key={m.id} message={m} display={display} />
        ))}
        {pendingApproval && (
          <Approval request={pendingApproval.request} onResolve={handleApproval} />
        )}
      </Box>
      <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1} flexDirection="row">
        <Text color="cyan" bold>
          forge ❯
        </Text>
        <Box marginLeft={1} flexGrow={1}>
          {pendingApproval ? (
            <Box>
              <Spinner />
              <Text color="gray"> waiting for your answer above</Text>
            </Box>
          ) : running ? (
            <Box>
              <Spinner />
              <Text color="gray"> running… (esc to cancel) </Text>
              <TextInput value={input} onChange={setInput} onSubmit={submitFromUser} placeholder="type to queue a message" />
            </Box>
          ) : (
            <TextInput value={input} onChange={setInput} onSubmit={submitFromUser} placeholder="ask forge anything…" />
          )}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          ↑{inputTokens} ↓{outputTokens} tokens
          {costUsd !== undefined && (
            <>
              {' · '}
              <Text color="green">{costUsd < 0.01 ? '$' + costUsd.toFixed(4) : '$' + costUsd.toFixed(3)}</Text>
            </>
          )}
          {redactedCount > 0 && (
            <>
              {' · '}
              <Text color="red">🔒 {redactedCount}</Text>
            </>
          )}
          {' · '}
          {running ? 'busy' : 'ready'}
        </Text>
      </Box>
    </Box>
  );
}

function MessageView({
  message,
  display,
}: {
  message: DisplayMessage;
  display: ForgeConfigFile['display'];
}): React.ReactElement | null {
  switch (message.kind) {
    case 'user':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">┌─ you</Text>
          <Box marginLeft={2}>
            <Text>{message.text}</Text>
          </Box>
        </Box>
      );
    case 'assistant':
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">├─ forge</Text>
          <Box marginLeft={2}>
            <Text>
              {message.text}
              {message.streaming ? '▌' : ''}
            </Text>
          </Box>
        </Box>
      );
    case 'reasoning':
      if (display?.showReasoning === false) return null;
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">├─ reasoning</Text>
          <Box marginLeft={2}>
            <Text color="gray">
              {message.text}
              {message.streaming ? '▌' : ''}
            </Text>
          </Box>
        </Box>
      );
    case 'tool_call':
      return (
        <Box marginLeft={2}>
          <Text color="blue" bold>
            ◌ {message.toolName}
          </Text>
          <Text color="gray"> {summarizeArgs(message.toolArgs)}</Text>
        </Box>
      );
    case 'tool_result': {
      const diffText = getUnifiedDiffText(message.toolName!, message.toolArgs, message.toolResult);
      return (
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text color={message.isError ? 'red' : 'green'} bold>
              {message.isError ? '✗' : '✓'} {message.toolName}
            </Text>
          </Box>
          {diffText && (
            <Box flexDirection="column" marginLeft={2}>
              {diffText.replace(/\n$/, '').split('\n').map((line, i) => (
                <Text key={i} color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'gray'}>
                  {line}
                </Text>
              ))}
            </Box>
          )}
          {!diffText && message.toolResult !== undefined && (
            <Box marginLeft={2}>
              <Text color={message.isError ? 'red' : 'gray'}>
                {summarizeToolResult(message.toolResult, message.isError, display?.detail ?? 'compact')}
              </Text>
            </Box>
          )}
        </Box>
      );
    }
    case 'status':
      return (
        <Box marginLeft={2} marginTop={1}>
          <Text color={message.isError ? 'red' : 'gray'}>
            {message.text}
            {message.inputTokens !== undefined && ` · ↑${message.inputTokens} ↓${message.outputTokens}`}
          </Text>
        </Box>
      );
  }
}

function summarizeArgs(args: unknown): string {
  if (args === undefined || args === null) return '()';
  const obj = args as Record<string, unknown>;
  if (typeof obj !== 'object') return `(${String(args)})`;
  const keys = Object.keys(obj);
  if (keys.length === 0) return '()';
  return `(${keys
    .slice(0, 3)
    .map((k) => `${k}=${shortVal(obj[k])}`)
    .join(' ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''})`;
}

function summarizeResult(result: unknown): string {
  let text: string;
  if (typeof result === 'string') {
    text = result;
  } else {
    try {
      text = JSON.stringify(result);
    } catch {
      text = String(result);
    }
  }
  if (text.length > 240) text = text.slice(0, 240) + '…';
  return text;
}

function shortVal(v: unknown): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}

async function persistSession(s: Session): Promise<string | null> {
  try {
    return await saveSession(s, defaultSessionDir());
  } catch {
    return null;
  }
}

let _id = 0;
function cryptoId(): string {
  _id++;
  return `${Date.now().toString(36)}-${_id}`;
}

/**
 * Build a CoreMessage history from the agent run. Removed in favor of
 * snapshotting the final `messages` array directly from `Agent.run()`. Kept
 * here as a placeholder for future session-export functionality.
 */
function _unusedBuildHistory(
  _initial: ModelMessage[],
  _agent: Agent,
  _task: string
): ModelMessage[] {
  return [];
}
void _unusedBuildHistory;

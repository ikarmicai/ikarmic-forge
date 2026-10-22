import * as vscode from 'vscode';

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  Agent,
  githubFromEnv,
  loadAttachment,
  type Attachment,
  autoRunCommands,
  autoRunFingerprint,
  BUILTIN_SPECIALISTS,
  BUILTIN_TOOLS,
  agentToSpecialist,
  createMcpResourceTools,
  generateSessionDigest,
  mcpInstructionsBlock,
  loadAgentFiles,
  registerAgentDefs,
  registerSpecialist,
  type AgentDef,
  buildLlmSummarizer,
  CheckpointStore,
  compactMessages,
  defaultSessionDir,
  detectProjectChecks,
  deleteSession,
  effectiveToolsFor,
  envVarForProvider,
  formatProjectCommandsBlock,
  isAlwaysAllowable,
  previewPatch,
  type PatchPreview,
  generateSessionId,
  listSessions,
  formatSessionMarkdown,
  loadCustomCommands,
  searchSessions,
  listSpecialists,
  enhancePrompt,
  loadForgeConfigFile,
  loadMergedForgeConfig,
  resolveAutoApprove,
  saveForgeConfigFile,
  loadSession,
  BackgroundAgents,
  backgroundResultsBlock,
  loadSkillsRegistryAsync,
  loadSpecialistsFromConfig,
  loadSteering,
  loadToolSandboxConfig,
  projectScriptsFingerprint,
  applyResolved,
  knownProviderIds,
  registeredCustomProviders,
  resolveModelAlias,
  redact,
  resolveProviderEndpoint,
  splitModelRef,
  runArchitect,
  saveSession,
  SPEC_READONLY_TOOLS,
  stripSteering,
  SUPPORTED_PROVIDERS,
  unregisterSpecialist,
  type AgentConfig,
  type AgentEvent,
  type AgentRunResult,
  type ApprovalDecision,
  type ApprovalRequest,
  type CommandRunner,
  type CredentialStore,
  type GoalState,
  type HooksBus,
  type McpManager,
  type ModelConfig,
  type ProviderName,
  type TodoItem,
  type ToolDefinition,
} from '@ikarmic/forge-core';

import { readConfig, resolveModel } from '../config.js';
import { loadRuntimeConfig } from '../runtime-config.js';

import type { RunCardView } from '../agents/agents-model.js';
import type { ModelLister } from '../model-lister.js';
import { bgStripView } from './bg-strip.js';
import { modelHint, toggleFavourite } from './model-menu.js';
import { syncModelPin } from '../model-setting.js';
import { PROVIDER_LABELS } from '../provider-labels.js';
import type { SpecAction, SpecsView, SteeringAction, SteeringView } from '../work/work-model.js';
import { parseSpecAction, parseSteeringAction } from '../work/work-model.js';

import { denyAllPending, toApprovalDecision } from './approval-protocol.js';
import { friendlyError } from './error-text.js';
import { ChatSession, type ChatHistory, type ChatSessionDeps } from './chat-session.js';
import { SessionFollower } from './session-follow.js';
import { webviewDictionary } from './webview-i18n.js';
import { isHunkReviewable, isPreviewable, proposedContent, resolveInsideWorkspace } from './edit-preview.js';
import { handleHistoryMessage, isHistoryMessage, sameDir, transcriptFromMessages, type HistoryDeps, type HistoryMessage } from './history-protocol.js';
import { chatHtml } from './html.js';
import { decisionFromSelection, hunksFor } from './hunk-review.js';
import { hunkExcerpt, hunkLabel } from './hunks.js';
import { cleanName, decodeDataUrl, PendingAttachments } from './pending-attachments.js';
import { createMentionResolvers, findMentionFiles } from './mention-resolvers.js';
import { mentionSuggestions, resolveMentions, stripContextBlocks } from './mentions.js';
import { startAutoCommit, describeCommit } from './auto-commit.js';
import { GoalController } from './goal-controller.js';
import { BUILTIN_SLASH, expandSkillCommand, parseSlash, type SlashEntry } from './slash-commands.js';
import { agentDirs } from '../agent-dirs.js';
import type { SwitchLink } from '../switch-link.js';
import { expandAgentMention } from './agent-mention.js';
import { planCommandRun, type CommandRunPlan } from './command-run.js';
import { chatTranscriptText, findChatEntry } from './chat-ref.js';
import { saveSessionDigest } from './digest-save.js';
import { runMemoryCommand } from './memory-command.js';
import { buildReviewPrompt, parseReviewScope, reviewDiffArgs, reviewScopeLabel } from './review.js';
import { runSlash } from './slash-run.js';
import { effortLabel, nextEffort } from './variant.js';
import { aliasProblem, buildRunExtras, permissionExtras } from './run-extras.js';
import { notifyChannels, notifyKind } from './notify.js';
import { KeepAwake } from './keep-awake.js';
import { runOs, soundCommand, toastCommand } from './notify-os.js';
import { resolveCheapModel } from '../cheap-model.js';
import { activeCommands, withEntry } from './command-allow-store.js';
import { looksLargeMessage } from './large-request.js';
import { planVerify } from './verify-checks.js';
import { createVsCodeCommandRunner } from './terminal-runner.js';
import { parseSpecCommand } from '../specs/spec-command.js';
import type { RunMode, RunOutcome } from '../specs/spec-controller.js';
import { changedFilesFromToolResult } from '../specs/spec-paths.js';

import {
  DEFAULT_MODE_ID,
  customSpecialistIds,
  listModes,
  modeCanWrite,
  modeModelProblem,
  modeOverrides,
  readOnlySandbox,
  resolveModeId,
  retargetSystemPrompt,
  type ModeOverrides,
} from './modes.js';
import { PROPOSED_SCHEME, type ProposedContentProvider } from './proposed-content-provider.js';
import { t } from '../l10n.js';

/** `modeId` runs this one turn in another mode without changing the chat's selected mode. */
export type RunOptions =
  | { kind: 'chat'; modeId?: string; attachments?: Attachment[]; extraTools?: ToolDefinition[]; disableAskUser?: boolean }
  | { kind: 'spec-generate' };

const MODE_STATE_KEY = 'forge.chat.mode';
/** workspaceState: the goal of one chat session. */
const goalKey = (sessionId: string): string => `forge.goal.${sessionId}`;
/** workspaceState: hash of the detected check commands the user approved to run after edits. */
const VERIFY_APPROVED_KEY = 'forge.verify.approved';

/**
 * Sidebar chat view for Forge. One provider per VS Code window: the view
 * persists across sidebar hide/show cycles but its conversation resets when
 * the extension reloads.
 */
const execFileAsync = promisify(execFile);

const FAVOURITE_MODELS_KEY = 'forge.favouriteModels';

/** What the chat needs from the place it is shown: the sidebar view, or an editor tab (see chat-tab.ts). */
export type ChatHost = Pick<vscode.WebviewView, 'webview' | 'onDidDispose' | 'onDidChangeVisibility'>;

export class ForgeChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'forge.chatView';

  private view: ChatHost | undefined;
  private controller: AbortController | undefined;
  private model: ModelConfig | null = null;
  /**
   * Outstanding approval requests keyed by id. Reset each task. The webview
   * sends back `{ type: 'approval_response', id, approved }` when the user
   * clicks Approve/Deny, and we resolve the corresponding promise.
   */
  private pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>();
  /** name/args of outstanding approvals, for "Open diff". Reset each task. */
  private pendingApprovalArgs = new Map<string, { name: string; args: unknown }>();
  private readonly sessionDeps: ChatSessionDeps = { sessionDir: defaultSessionDir(), saveSession, generateSessionId };
  private session = new ChatSession(this.sessionDeps);
  private modeId: string = DEFAULT_MODE_ID;
  /** Reloads the open session when the CLI (or another window) continues it. */
  private follower: SessionFollower | undefined;
  /** True while runTask awaits its config, before `controller` exists. */
  private starting = false;
  /** Set once the webview script has posted `ready`; host messages sent earlier are dropped. */
  private webviewReady = false;
  private specHandler: ((task: string) => void) | undefined;
  /** The message held back while the "this looks big" card is on screen; the webview only sends a choice. */
  private pendingLarge: { text: string; auto: boolean; attachments: Attachment[] } | undefined;
  /** The last chat message as typed (with its files), and the history before it: what Retry and Edit replace. */
  private lastTurn: { text: string; attachments: Attachment[]; historyBefore: ChatHistory | undefined } | undefined;
  /** Files pasted, dropped or picked for the next message. */
  private readonly attachments = new PendingAttachments();
  /** The newest run that changed files; the only one "Revert this run" can undo. */
  private latestRun: { startedAtIso: string; count: number } | undefined;
  /** Hash of the detected check list the user declined this session; not offered again until it changes. */
  private declinedVerifyHash: string | undefined;
  private readonly keepAwake = new KeepAwake();
  /** Sub-agents the model started with `background: true`; they outlive a run and are shown in the strip above the message box. */
  private readonly background = new BackgroundAgents();
  private bgTicker: NodeJS.Timeout | undefined;
  private readonly steeringWarned = new Set<string>();
  private readonly mcpWarned = new Set<string>();
  private readonly terminal = createVsCodeCommandRunner();
  /** Tail of what the agent ran in the Forge terminal, for the @terminal mention. */
  private terminalLog = '';
  private readonly commandRunner: CommandRunner = async (req) => {
    const res = await this.terminal.runner(req);
    if (res) this.recordTerminal(req.command, res.stdout, res.exitCode);
    return res;
  };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly hooksBus?: HooksBus,
    private readonly credentialStore?: CredentialStore,
    private readonly proposed?: ProposedContentProvider,
    private readonly mcp?: McpManager,
    private readonly models?: ModelLister
  ) {
    this.modeId = context.workspaceState.get<string>(MODE_STATE_KEY) ?? DEFAULT_MODE_ID;
    this.background.onChange(() => this.postBackground());
  }

  /** Send the strip's content to the page; while something runs, keep the elapsed times moving. */
  private postBackground(): void {
    const view = bgStripView(this.background.list(), Date.now());
    this.post({ type: 'bg_agents', ...view });
    if (view.canStopAll && !this.bgTicker) {
      this.bgTicker = setInterval(() => this.postBackground(), 1000);
    } else if (!view.canStopAll && this.bgTicker) {
      clearInterval(this.bgTicker);
      this.bgTicker = undefined;
    }
  }

  dispose(): void {
    this.follower?.stop();
    this.terminal.dispose();
    this.keepAwake.dispose();
    this.background.clear();
    if (this.bgTicker) clearInterval(this.bgTicker);
  }

  private recordTerminal(command: string, output: string, exitCode: number | null): void {
    const entry = `$ ${command}\n${output.trimEnd()}\n[exit ${exitCode ?? 'unknown'}]\n\n`;
    this.terminalLog = (this.terminalLog + entry).slice(-8000);
  }

  /**
   * Resolve API keys through the CredentialStore (falling back to the
   * legacy `forge.apiKeys.*` setting, then env vars) and apply them to
   * the env vars the AI SDK's provider factories read automatically.
   * Without this, a key resolved from the store would be used for
   * provider auto-detection but never actually reach the SDK call.
   */
  private async resolveConfigWithKeys(): Promise<ReturnType<typeof readConfig>> {
    return loadRuntimeConfig(this.credentialStore);
  }

  /** The model that rewrites a draft prompt: the cheap model when one is set, else the main model; undefined when none resolves. */
  private async enhanceModel(): Promise<ModelConfig | undefined> {
    return resolveCheapModel(this.credentialStore);
  }

  /** Settings the page needs to know about (it cannot read VS Code settings itself); resent when one changes. */
  private postUiFlags(): void {
    this.post({ type: 'ui_flags', shiftTabVariant: vscode.workspace.getConfiguration('forge').get<boolean>('shiftTabCyclesVariant') === true });
  }

  resolveWebviewView(view: ChatHost): void {
    this.view = view;
    const configWatch = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('forge.shiftTabCyclesVariant')) this.postUiFlags();
    });
    view.onDidDispose(() => configWatch.dispose());
    this.followSession();
    this.webviewReady = false;
    // The webview needs to load two local scripts we ship in dist/:
    //   - dist/extension.js is the extension host (loaded by VS Code)
    //   - dist/webview/voice-input.js is the voice input module (loaded by
    //     the webview itself via a `<script>` tag in chatHtml)
    // We expose both directories as localResourceRoots so the webview can
    // resolve the script src with a vscode-resource URI.
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    // Build the voice-script URI once at resolve time. The webview HTML
    // embeds it as a `<script src>` tag.
    const voiceScriptUri = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'voice-input.js')
    );
    const forgeUiScriptUri = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'forge-ui.js')
    );
    const mermaidScriptUri = view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'mermaid.js')
    );
    view.webview.html = chatHtml({
      voiceScriptUri: voiceScriptUri.toString(),
      forgeUiScriptUri: forgeUiScriptUri.toString(),
      mermaidScriptUri: mermaidScriptUri.toString(),
      cspSource: view.webview.cspSource,
      strings: webviewDictionary((s) => t(s)),
    });

    view.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (!isChatMessage(msg) && !isHistoryMessage(msg)) return;
      await this.handleMessage(msg);
    });

    view.onDidChangeVisibility(() => {
      // No-op for now: could pause/resume streams if we had any
    });
  }

  // ---- Specs and Steering: shown in the chat panel, driven by the spec and steering modules.
  private specsSource: WorkSource<SpecsView, SpecAction> | undefined;
  private steeringSource: WorkSource<SteeringView, SteeringAction> | undefined;

  setSpecsSource(source: WorkSource<SpecsView, SpecAction>): void {
    this.specsSource = source;
  }

  setSteeringSource(source: WorkSource<SteeringView, SteeringAction>): void {
    this.steeringSource = source;
  }

  /** A spec or steering file changed: refresh the panel (the page ignores it while that panel is closed). */
  workChanged(panel: 'specs' | 'steering'): void {
    void this.sendWork(panel);
  }

  private async sendWork(panel: 'specs' | 'steering'): Promise<void> {
    const source = panel === 'specs' ? this.specsSource : this.steeringSource;
    // No source means there is no workspace folder to keep specs or steering in.
    if (!source) {
      this.post({ type: 'work_data', panel, view: null });
      return;
    }
    try {
      this.post({ type: 'work_data', panel, view: await source.load() });
    } catch (err) {
      this.post({ type: 'work_data', panel, view: null, error: (err as Error).message });
    }
  }

  private async actOnWork(panel: string, raw: unknown): Promise<void> {
    try {
      if (panel === 'specs' && this.specsSource) {
        const action = parseSpecAction(raw);
        if (action) await this.specsSource.act(action);
      } else if (panel === 'steering' && this.steeringSource) {
        const action = parseSteeringAction(raw);
        if (action) await this.steeringSource.act(action);
      } else {
        return;
      }
      await this.sendWork(panel);
    } catch (err) {
      void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
    }
  }

  /**
   * The chat's model picker: every provider the user can actually call (a saved or environment
   * key, or a local server that answers), with the models it offers right now.
   */
  private async sendModelMenu(refresh: boolean): Promise<void> {
    if (!this.models || !this.credentialStore) return;
    const store = this.credentialStore;
    const lister = this.models;
    const local: readonly ProviderName[] = ['ollama', 'lmstudio'];
    const groups = await Promise.all(
      SUPPORTED_PROVIDERS.map(async (provider) => {
        const envName = envVarForProvider(provider);
        const keyed = Boolean(await store.get(provider)) || Boolean(envName && process.env[envName]);
        const explicit = provider === 'openai-compatible' && Boolean(readConfig().providerEnv.openaiCompatibleBaseUrl);
        if (!keyed && !explicit && !local.includes(provider)) return null;
        const list = await lister.list(provider, refresh);
        // A local server that is not running is not worth a row of its own.
        if (local.includes(provider) && list.source === 'builtin') return null;
        return { provider, label: PROVIDER_LABELS[provider], ...list };
      })
    );
    // Presets with a key in the environment, and every provider the user defined under customProviders.
    await loadRuntimeConfig(store).catch(() => undefined);
    const custom = registeredCustomProviders();
    const named = await Promise.all(
      knownProviderIds(custom).map(async (id) => {
        const endpoint = resolveProviderEndpoint(id, custom);
        if (!endpoint || (!custom?.[id] && !endpoint.apiKey)) return null;
        const list = await lister.listNamed(endpoint, custom?.[id]?.models, undefined, refresh);
        return { provider: id, label: endpoint.name, ...list };
      })
    );
    // Each row carries its context window and price, so choosing a model is not guesswork.
    const withHints = <G extends { provider: string; models: Array<{ id: string }> }>(g: G) => ({
      ...g,
      models: g.models.map((m) => {
        const h = modelHint(g.provider, m.id);
        return { ...m, hint: h.text, hintTitle: h.title };
      }),
    });
    this.view?.webview.postMessage({
      type: 'model_menu',
      favourites: this.context.globalState.get<string[]>(FAVOURITE_MODELS_KEY) ?? [],
      groups: [...groups, ...named].filter((g): g is NonNullable<typeof g> => g !== null).map(withHints),
      current: this.model ? { provider: this.model.endpoint?.id ?? this.model.provider, model: this.model.model } : null,
    });
  }

  /** Picking a model in the chat changes it everywhere it is stored, so no other copy overrides it. */
  /**
   * A `vscode://ikarmic.ikarmic-forge/switch` link: change the model and/or mode it names, after asking, since any web
   * page can open such a link. Unknown modes and models are reported, never half-applied.
   */
  async applySwitchLink(link: SwitchLink | undefined): Promise<void> {
    if (!link) return;
    const modes = listModes(listSpecialists()).map((m) => m.id);
    if (link.agent && !modes.includes(link.agent)) {
      void vscode.window.showWarningMessage(t('Forge: the link names a mode "{0}" that does not exist.', link.agent));
      return;
    }
    const what = [link.model ? t('model {0}', link.model) : '', link.agent ? t('mode {0}', link.agent) : ''].filter(Boolean).join(' + ');
    const apply = t('Switch');
    if ((await vscode.window.showWarningMessage(t('A link asks Forge to switch to {0}.', what), { modal: true }, apply)) !== apply) return;
    if (link.agent) {
      this.modeId = resolveModeId(link.agent, listSpecialists());
      this.announceModes();
    }
    if (link.model) {
      const idx = link.model.indexOf(':');
      const prefix = idx > 0 ? link.model.slice(0, idx) : '';
      if (prefix && knownProviderIds(registeredCustomProviders()).includes(prefix)) {
        await this.selectModel(prefix as ProviderName, link.model.slice(idx + 1));
      } else {
        const ref = splitModelRef(link.model);
        await this.selectModel(ref.provider ?? this.model?.provider ?? 'anthropic', ref.model);
      }
    }
    await vscode.commands.executeCommand('forge.chatView.focus');
  }

  private async selectModel(provider: ProviderName, model: string): Promise<void> {
    // A preset or custom provider is stored as `id:model` on the openai-compatible provider.
    if (model && !SUPPORTED_PROVIDERS.includes(provider) && knownProviderIds(registeredCustomProviders()).includes(provider)) {
      await saveForgeConfigFile({ provider: 'openai-compatible', model: `${provider}:${model}` });
      await syncModelPin({ provider: 'openai-compatible', model: `${provider}:${model}` });
      await this.announceModel();
      return;
    }
    if (!SUPPORTED_PROVIDERS.includes(provider) || !model) return;
    // The shared file serves the CLI and Settings; any value pinned in VS Code settings is kept in step.
    await saveForgeConfigFile({ provider, model });
    await syncModelPin({ provider, model });
    await this.announceModel();
  }

  /**
   * Push the current model label to the webview (called after config changes
   * or on first show).
   */
  async announceModel(): Promise<void> {
    try {
      const cfg = await this.resolveConfigWithKeys();
      this.model = resolveModel(cfg);
      this.view?.webview.postMessage({
        type: 'model',
        provider: this.model.provider,
        model: this.model.model,
      });
      // Also push the voice config so the webview's controller picks up
      // any changes (settings UI edits, etc.) without waiting for a
      // `ready` round-trip.
      this.view?.webview.postMessage({
        type: 'voice_config',
        config: cfg.voice,
      });
      // Same for display config (block-default/detail/reasoning-visibility)
      //: read from the shared config file since `cfg` (readConfig()) only
      // covers VS Code-local settings, not ~/.forge/config.json.
      const { config: sharedConfig } = await loadMergedForgeConfig(this.workspaceRoot(), { trusted: vscode.workspace.isTrusted });
      this.view?.webview.postMessage({
        type: 'display_config',
        config: sharedConfig.display ?? {},
      });
    } catch (err) {
      this.view?.webview.postMessage({ type: 'error', message: (err as Error).message });
    }
  }

  /**
   * Abort the in-flight task, if any. Used by the `forge.cancelTask` command
   * and the webview's Cancel button.
   */
  cancel(): boolean {
    const wasRunning = this.controller !== undefined;
    if (this.controller) {
      this.controller.abort();
      this.controller = undefined;
    }
    // A run waiting on an approval never sees the abort; answering "no" lets it unwind.
    denyAllPending(this.pendingApprovals);
    return wasRunning;
  }

  private workspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  }

  private checkpointStore(session: ChatSession = this.session): CheckpointStore {
    return new CheckpointStore(session.sessionPath, this.workspaceRoot());
  }

  /** Agent files read at the last refresh; primary ones become modes, the rest are reachable through sub_agent. */
  private agentDefs: AgentDef[] = [];

  /** Read `~/.forge/agents` and the workspace's `.forge/agents`, tell sub_agent about them, then rebuild the mode list. */
  private async refreshAgentFiles(): Promise<void> {
    const { agents, problems } = await loadAgentFiles(agentDirs(homedir(), this.workspaceRoot(), vscode.workspace.isTrusted));
    this.agentDefs = agents;
    registerAgentDefs(agents);
    for (const p of problems) this.post({ type: 'warning', message: t('Agent file: {0}', p) });
  }

  /** Re-read custom specialists (Settings → Agents may have changed them) and push the mode list. */
  private announceModes(): void {
    // The registry only ever grows: drop previously loaded custom agents first so one
    // deleted in Settings stops being selectable (and a removed override reverts to the built-in).
    for (const id of customSpecialistIds(listSpecialists(), BUILTIN_SPECIALISTS)) unregisterSpecialist(id);
    const loaded = loadSpecialistsFromConfig(undefined, { override: true });
    for (const e of loaded.errors) this.post({ type: 'warning', message: t('Custom agents: {0}', e) });
    const toolNames = BUILTIN_TOOLS.map((tool) => tool.name);
    for (const d of this.agentDefs) {
      if (d.mode === 'subagent' || d.hidden) continue;
      try {
        registerSpecialist(agentToSpecialist(d, toolNames), { override: true });
      } catch (err) {
        this.post({ type: 'warning', message: t('Agent file: {0}', `${d.name}: ${(err as Error).message}`) });
      }
    }
    const specialists = listSpecialists();
    this.modeId = resolveModeId(this.modeId, specialists);
    this.post({ type: 'modes', modes: listModes(specialists), current: this.modeId });
  }

  private historyDeps(): HistoryDeps {
    return {
      sessionDir: this.sessionDeps.sessionDir,
      activeSessionId: () => this.session.id,
      listSessions,
      searchSessions,
      loadSession,
      deleteSession,
      saveSession,
      askName: (current) =>
        Promise.resolve(vscode.window.showInputBox({ title: t('Rename chat'), prompt: t('A name to find this chat by. Leave empty to remove the name.'), value: current ?? '', ignoreFocusOut: true })),
      renameActive: (label) => {
        this.session.setLabel(label);
      },
      removeDir: (dir) => rm(dir, { recursive: true, force: true }),
      checkpoints: () => this.checkpointStore(),
      activeCwd: () => this.session.cwd,
      workspaceRoot: () => this.workspaceRoot(),
      stripSteering: (text: string) => stripContextBlocks(stripSteering(text)),
      confirm: async (message, action) =>
        (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action,
    };
  }

  private goal: GoalController | undefined;
  /** Reasoning effort picked with /variant for this window's chat; undefined = use the configured one. */
  private effortOverride: string | undefined;
  /** A model named by the command being run (its front matter `model`); lasts for that run only. */
  private modelRefOverride: string | undefined;

  /** Built-in slash commands plus the user's own `.forge/commands` files. */
  private async slashEntries(): Promise<SlashEntry[]> {
    const custom = await loadCustomCommands(this.workspaceRoot()).catch(() => new Map());
    const taken = new Set([...BUILTIN_SLASH.map((e) => e.name), ...custom.keys()]);
    const skills = (await this.skillsFor().catch(() => undefined))?.list() ?? [];
    return [
      ...BUILTIN_SLASH,
      ...[...custom.values()].map((c): SlashEntry => ({ name: c.name, description: c.description ?? t('Your command'), source: 'custom', takesArgs: true })),
      // A skill whose name is a built-in or a command of yours is still reachable by the model; the slash name is taken.
      ...skills
        .filter((s) => /^[A-Za-z][\w-]*$/.test(s.name) && !taken.has(s.name.toLowerCase()))
        .map((s): SlashEntry => ({ name: s.name.toLowerCase(), description: s.description, source: 'skill', takesArgs: true })),
    ];
  }

  /** `/review`: take the diff for the scope, add the project's REVIEW.md rules, and ask the model to review it (read-only mode when there is one). */
  private async reviewChanges(args: string): Promise<void> {
    const parsed = parseReviewScope(args);
    if ('error' in parsed) {
      this.post({ type: 'warning', message: parsed.error });
      return;
    }
    const cwd = this.workspaceRoot();
    const git = (gitArgs: string[]) => execFileAsync('git', gitArgs, { cwd, maxBuffer: 20 * 1024 * 1024 }).then((r) => r.stdout);
    let base = 'main';
    for (const candidate of ['main', 'master']) {
      if (await git(['rev-parse', '--verify', '--quiet', candidate]).then(() => true, () => false)) {
        base = candidate;
        break;
      }
    }
    let diff: string;
    try {
      diff = await git(reviewDiffArgs(parsed, base));
    } catch (err) {
      this.post({ type: 'warning', message: t('Review: git could not produce the diff: {0}', (err as Error).message.split('\n')[0] ?? '') });
      return;
    }
    const rules = await readFile(path.join(cwd, 'REVIEW.md'), 'utf8').catch(() => '');
    const prompt = buildReviewPrompt({ diff, scopeLabel: reviewScopeLabel(parsed, base), rules });
    if (!prompt) {
      this.post({ type: 'warning', message: t('Review: there is nothing to review in {0}.', reviewScopeLabel(parsed, base)) });
      return;
    }
    // The request the user made, not the diff it expands to: without this the transcript starts with the model's reply.
    this.post({ type: 'user_message', text: args.trim() ? `/review ${args.trim()}` : '/review' });
    await this.runChat(prompt, false, [], resolveModeId('ask', listSpecialists()));
  }

  private readonly remoteSkillWarned = new Set<string>();

  /** A skill URL that failed is reported once per window, not on every message. */
  private warnRemoteSkillOnce(warning: string): void {
    if (this.remoteSkillWarned.has(warning)) return;
    this.remoteSkillWarned.add(warning);
    this.post({ type: 'warning', message: t('Skills: {0}', warning) });
  }

  /** Skills visible from the workspace, with the folders of the `skillPaths` setting. */
  private async skillsFor() {
    const { config } = await loadMergedForgeConfig(this.workspaceRoot(), { trusted: vscode.workspace.isTrusted });
    return loadSkillsRegistryAsync(this.workspaceRoot(), config.skillPaths ?? [], { onWarning: (w) => this.warnRemoteSkillOnce(w) });
  }

  private async postSlashCommands(): Promise<void> {
    this.post({ type: 'slash_commands', entries: await this.slashEntries() });
  }

  private slashDeps(): Parameters<typeof runSlash>[2] {
    return {
      newChat: () => this.newChat(),
      compact: () => this.condense(),
      exportChat: () => this.exportChat(),
      openModelMenu: () => this.post({ type: 'open_model_menu' }),
      openModeSelect: () => this.post({ type: 'open_mode_select' }),
      cycleVariant: () => {
        this.effortOverride = nextEffort(this.effortOverride ?? '');
        this.post({ type: 'warning', message: t('Reasoning effort for this chat: {0}', effortLabel(this.effortOverride)) });
      },
      goal: (args) => this.goalController().command(args),
      memory: (args) =>
        runMemoryCommand(args, {
          cwd: this.workspaceRoot(),
          open: async () => void (await vscode.commands.executeCommand('forge.openMemory')),
          say: (text) => this.post({ type: 'notice', message: text }),
        }),
      openSettings: async () => void (await vscode.commands.executeCommand('forge.openSettings')),
      review: (args) => this.reviewChanges(args),
      reload: async () => {
        await this.refreshAgentFiles();
        this.announceModes();
        await this.mcp?.reload().catch(() => undefined);
        await this.postSlashCommands();
        this.post({ type: 'warning', message: t('Reloaded agents, skills, commands and MCP servers.') });
      },
      // Answers to a command stay on screen (a warning fades after a few seconds).
      help: (text) => this.post({ type: 'notice', message: text }),
    };
  }

  /** Save the open chat as a Markdown file (from the saved session, so it matches History and the CLI). */
  private async exportChat(): Promise<void> {
    try {
      const session = await loadSession(this.session.id, this.sessionDeps.sessionDir);
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(this.workspaceRoot(), `forge-chat-${this.session.id}.md`)),
        filters: { Markdown: ['md'] },
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(formatSessionMarkdown(session)));
      this.post({ type: 'warning', message: t('Saved the chat to {0}.', target.fsPath) });
    } catch {
      this.post({ type: 'warning', message: t('There is nothing to export yet: send a message first.') });
    }
  }
  /** The todo list of the chat on screen; handed to each run so it survives between turns. */
  private todos: TodoItem[] = [];
  private readonly pendingQuestions = new Map<string, (answer: string) => void>();
  private questionSeq = 0;

  /** Answer (or, with an empty answer, drop) one open `ask_user` question and tell the page to remove its card. */
  private closeQuestion(id: string, answer: string): void {
    const resolve = this.pendingQuestions.get(id);
    if (!resolve) return;
    this.pendingQuestions.delete(id);
    resolve(answer);
    this.post({ type: 'question_closed', id });
  }

  private closeAllQuestions(): void {
    for (const id of [...this.pendingQuestions.keys()]) this.closeQuestion(id, '');
  }

  /** The session's goal: created on first use, one per provider, its state saved per session. */
  private goalController(): GoalController {
    this.goal ??= new GoalController({
      maxTurns: readConfig().goalMaxTurns,
      abortTurn: () => this.controller?.abort(),
      onState: (goal) => {
        this.post({ type: 'goal_state', goal: goal ?? null });
        void this.context.workspaceState.update(goalKey(this.session.id), goal ?? undefined);
      },
      onMessage: (message) => this.post({ type: 'warning', message }),
      runTurn: async (prompt, opts) => {
        this.post({ type: 'user_message', text: t('Continuing the goal') });
        this.lastTurn = undefined;
        const outcome = await this.runTask(prompt, false, { kind: 'chat', extraTools: opts.tools, disableAskUser: opts.disableAskUser });
        if (!outcome) return { toolCalls: 0, error: true };
        return {
          toolCalls: outcome.toolCalls ?? 0,
          ...(outcome.reason === 'aborted' ? { stopped: true } : {}),
          ...(['error', 'no_provider_key', 'loop_detected', 'budget_exceeded'].includes(outcome.reason) ? { error: true } : {}),
          ...(outcome.denied ? { rejected: true } : {}),
        };
      },
    });
    return this.goal;
  }

  /** Show the saved goal of the session now on screen (paused if it was running when the window closed). */
  private restoreGoal(): void {
    const saved = this.context.workspaceState.get<GoalState>(goalKey(this.session.id));
    if (saved) this.goalController().restore(saved);
    else if (this.goal) this.goal.restore(undefined);
  }

  /**
   * With `forge.memory.sessionDigest` on, the chat that is ending is summarised by the cheap model into a dated
   * section of the project memory. Runs in the background and never blocks or fails the new chat.
   */
  private digestEndingChat(): void {
    const cfg = vscode.workspace.getConfiguration('forge');
    if (cfg.get<boolean>('memory.sessionDigest') !== true || cfg.get<boolean>('memory.enabled') === false) return;
    const history = this.session.history;
    if (!history || history.length === 0) return;
    const cwd = this.workspaceRoot();
    const items = transcriptFromMessages(history, (x) => stripContextBlocks(stripSteering(x)));
    void (async () => {
      const model = await resolveCheapModel(this.credentialStore);
      const out = await saveSessionDigest({ cwd, items, now: new Date(), generate: (it) => generateSessionDigest(it, model) });
      if (out.saved) this.post({ type: 'notice', message: t('Saved a summary of the last chat to project memory ({0}).', out.heading) });
    })().catch(() => undefined);
  }

  private newChat(): void {
    this.digestEndingChat();
    this.goal?.stop();
    this.cancel();
    // A fresh object, not reset(): the aborted run still holds the old session and will
    // record its final turn there, not into the new conversation.
    this.session = new ChatSession(this.sessionDeps);
    this.background.clear();
    this.lastTurn = undefined;
    this.proposed?.clear();
    this.post({ type: 'session', id: this.session.id });
    this.todos = [];
    this.post({ type: 'todo_updated', todos: [] });
    this.restoreGoal();
    this.post({ type: 'meter_reset' });
    this.post({ type: 'transcript', items: [] });
    this.repostRuns();
    this.announceModes();
  }

  private followSession(): void {
    this.follower ??= new SessionFollower({
      dir: this.sessionDeps.sessionDir,
      current: () => ({ id: this.session.id, history: this.session.history }),
      busy: () => Boolean(this.controller || this.starting),
      onExternal: (session) => {
        void this.handleHistory({ type: 'resumeSession', id: session.id }).then(() =>
          this.post({ type: 'warning', message: t('This session was updated from another Forge window or the CLI; reloaded.') })
        );
      },
    });
    this.follower.start();
  }

  /** Open a saved session (from the CLI or an earlier chat) with its full history. */
  async resumeSession(id: string): Promise<void> {
    if (!(await this.ensureView())) return;
    await this.handleHistory({ type: 'resumeSession', id });
  }

  private async handleHistory(msg: HistoryMessage): Promise<void> {
    if (msg.type === 'resumeSession') this.cancel();
    const res = await handleHistoryMessage(msg, this.historyDeps());
    if (res.type === 'sessionDeleted' && res.active) this.newChat();
    if (res.type === 'sessionResumed') {
      this.session = ChatSession.fromSession(this.sessionDeps, res.session);
      this.background.clear();
      this.lastTurn = undefined;
      this.post({ type: 'session', id: this.session.id });
      this.todos = [];
      this.post({ type: 'todo_updated', todos: [] });
      this.restoreGoal();
      this.post({ type: 'transcript', items: res.transcript });
      this.repostRuns();
      this.post({ type: 'meter_reset', costUsd: this.session.totalCostUsd });
      this.announceModes();
      if (res.session.cwd && res.session.cwd !== this.workspaceRoot()) {
        this.post({
          type: 'warning',
          message: `This session started in ${res.session.cwd}, not the open workspace. Its checkpoints can only be restored there.`,
        });
      }
      return;
    }
    this.post(res);
  }

  /** Per-hunk review of a pending write_file / edit_file approval. */
  private async reviewHunks(id: string): Promise<void> {
    const pending = this.pendingApprovalArgs.get(id);
    if (!pending || !this.pendingApprovals.has(id)) return;
    if (pending.name !== 'write_file' && pending.name !== 'edit_file') return;
    const args = (pending.args ?? {}) as Record<string, unknown>;
    const rawPath = args.path;
    if (typeof rawPath !== 'string') return;
    const abs = resolveInsideWorkspace(this.workspaceRoot(), rawPath);
    if (!abs) {
      this.post({ type: 'warning', message: t('Refusing to review a path outside the workspace: {0}', rawPath) });
      return;
    }
    let current: string | null;
    try {
      current = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(abs)));
    } catch {
      current = null;
    }
    const preview = proposedContent(pending.name, pending.args, current);
    if (!preview.ok) {
      this.post({ type: 'warning', message: preview.reason });
      return;
    }
    const subject = {
      toolName: pending.name as 'write_file' | 'edit_file',
      args: args as Record<string, unknown> & { path: string },
      current,
      proposed: preview.content,
    };
    const hunks = hunksFor(subject);
    if (hunks.length === 0) {
      this.post({ type: 'warning', message: t('This edit changes nothing.') });
      return;
    }
    const picks = await vscode.window.showQuickPick(
      hunks.map((hunk) => ({ label: hunkLabel(hunk), detail: hunkExcerpt(hunk), picked: true, hunk })),
      {
        canPickMany: true,
        title: `Review changes to ${rawPath}`,
        placeHolder: t('Uncheck the hunks you want to reject, then press Enter'),
        matchOnDetail: true,
      }
    );
    if (!picks) return; // dismissed: the approval stays pending
    const accepted = new Set(picks.map((p) => p.hunk.id));
    const decision = decisionFromSelection(subject, hunks, accepted);
    this.post({
      type: 'approval_resolved',
      id,
      approved: typeof decision === 'boolean' ? decision : decision.approved,
      partial: accepted.size > 0 && accepted.size < hunks.length,
    });
    this.resolveApproval(id, decision);
  }

  /** Summarize older turns now (the toolbar Condense button). */
  private async condense(): Promise<void> {
    if (this.controller || this.starting) {
      this.post({ type: 'warning', message: t('Wait for the running task to finish, then condense.') });
      return;
    }
    const session = this.session;
    const history = session.history;
    if (!history || history.length <= 2) {
      this.post({ type: 'warning', message: t('Nothing to condense yet.') });
      return;
    }
    try {
      const cfg = await this.resolveConfigWithKeys();
      const model = resolveModel(cfg);
      const { config: sharedConfig } = await loadMergedForgeConfig(this.workspaceRoot(), { trusted: vscode.workspace.isTrusted });
      const summarizerModel: ModelConfig = sharedConfig.compactionModel
        ? { provider: model.provider, model: sharedConfig.compactionModel }
        : model;
      this.post({ type: 'warning', message: t('Condensing the conversation...') });
      const result = await compactMessages(history, buildLlmSummarizer(summarizerModel), {});
      if (result.droppedCount === 0) {
        this.post({ type: 'warning', message: t('The conversation is already short enough.') });
        return;
      }
      const saved = await session.recordTurn(
        { messages: result.messages, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true },
        model,
        this.workspaceRoot()
      );
      if (!saved.ok) this.post({ type: 'warning', message: t('Session not saved: {0}', saved.error) });
      this.post({ type: 'compaction', droppedCount: result.droppedCount, savedTokens: result.savedTokens });
    } catch (err) {
      this.post({ type: 'error', message: t('Could not condense: {0}', (err as Error).message) });
    }
  }

  private postAttachments(): void {
    this.post({ type: 'attachments', items: this.attachments.chips() });
  }

  /** A file pasted or dropped into the input, as a data URL from the webview. */
  private attachPasted(name: unknown, dataUrl: unknown): void {
    const decoded = decodeDataUrl(dataUrl);
    const label = cleanName(name, 'pasted file');
    const outcome = decoded ? this.attachments.add(label, decoded.bytes, decoded.mime) : { ok: false as const, reason: 'not a file' };
    if (!outcome.ok) this.post({ type: 'warning', message: t('Could not attach {0}: {1}', label, outcome.reason) });
    this.postAttachments();
  }

  /** Files from disk: picked in the open dialog, or dragged in from the Explorer. */
  private async attachPaths(paths: readonly string[]): Promise<void> {
    for (const p of paths) {
      const label = path.basename(p);
      try {
        const attachment = await loadAttachment(p);
        const outcome = this.attachments.addAttachment(attachment, Buffer.byteLength(attachment.data, 'base64'));
        if (!outcome.ok) throw new Error(outcome.reason);
      } catch (err) {
        this.post({ type: 'warning', message: t('Could not attach {0}: {1}', label, (err as Error).message.replace(/^Cannot attach [^:]*: /, '')) });
      }
    }
    this.postAttachments();
  }

  private async pickAttachments(): Promise<void> {
    const root = this.workspaceRoot();
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: t('Attach'),
      ...(root ? { defaultUri: vscode.Uri.file(root) } : {}),
    });
    if (picked && picked.length > 0) await this.attachPaths(picked.map((u) => u.fsPath));
  }

  private async openDiff(id: string): Promise<void> {
    const pending = this.pendingApprovalArgs.get(id);
    if (!pending || !this.proposed) return;
    if (pending.name === 'apply_patch') {
      await this.openPatchDiff(id, String((pending.args as { patch?: unknown }).patch ?? ''));
      return;
    }
    const rawPath = (pending.args as { path?: unknown }).path;
    if (typeof rawPath !== 'string') return;
    const abs = resolveInsideWorkspace(this.workspaceRoot(), rawPath);
    if (!abs) {
      this.post({ type: 'warning', message: t('Refusing to preview a path outside the workspace: {0}', rawPath) });
      return;
    }
    const fileUri = vscode.Uri.file(abs);
    let current: string | null = null;
    try {
      current = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
    } catch {
      current = null;
    }
    const preview = proposedContent(pending.name, pending.args, current);
    if (!preview.ok) {
      this.post({ type: 'warning', message: preview.reason });
      return;
    }
    const right = this.proposed.set(id, preview.content);
    const left = current === null ? vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/empty-${id}` }) : fileUri;
    await vscode.commands.executeCommand('vscode.diff', left, right, `${rawPath} (proposed)`);
  }

  /** A patch can change several files: show the one the person picks (or the only one) as a diff before approval. */
  private async openPatchDiff(id: string, patch: string): Promise<void> {
    if (!this.proposed) return;
    const root = this.workspaceRoot();
    let previews: PatchPreview[];
    try {
      previews = await previewPatch(patch, async (p) => {
        const abs = resolveInsideWorkspace(root, p);
        if (!abs) return null;
        try {
          return new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(abs)));
        } catch {
          return null;
        }
      });
    } catch (err) {
      this.post({ type: 'warning', message: (err as Error).message });
      return;
    }
    const inside = previews.filter((p) => resolveInsideWorkspace(root, p.path));
    if (inside.length === 0) return;
    const chosen =
      inside.length === 1
        ? inside[0]
        : (
            await vscode.window.showQuickPick(
              inside.map((p) => ({ label: p.path, description: p.error ? t('does not apply') : p.before === null ? t('new file') : p.after === null ? t('deleted') : t('changed'), p })),
              { title: t('This patch changes {0} files: which one to show?', inside.length) }
            )
          )?.p;
    if (!chosen) return;
    if (chosen.error) {
      this.post({ type: 'warning', message: chosen.error });
      return;
    }
    const abs = resolveInsideWorkspace(root, chosen.path)!;
    const empty = (tag: string): vscode.Uri => vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/empty-${id}-${tag}` });
    const left = chosen.before === null ? empty('before') : vscode.Uri.file(abs);
    const right = chosen.after === null ? empty('after') : this.proposed.set(`${id}:${chosen.path}`, chosen.after);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${chosen.path} (proposed)`);
  }

  private async handleMessage(msg: ChatMessage | HistoryMessage): Promise<void> {
    if (isHistoryMessage(msg)) {
      await this.handleHistory(msg);
      return;
    }
    switch (msg.type) {
      case 'ready':
        this.webviewReady = true;
        await this.announceModel();
        await this.refreshAgentFiles();
        this.announceModes();
        this.postUiFlags();
        this.post({ type: 'session', id: this.session.id });
        this.repostRuns();
        this.postAttachments();
        this.postBackground();
        await this.postSlashCommands();
        return;
      case 'bg_stop':
        this.background.stop(msg.id);
        return;
      case 'bg_stop_all':
        this.background.stopAll();
        return;
      case 'bg_dismiss':
        this.background.dismiss(msg.id);
        return;
      case 'user_input': {
        const slash = parseSlash(msg.text, await this.slashEntries());
        if (slash && slash.entry.source === 'builtin') {
          await runSlash(slash.name, slash.args, this.slashDeps(), await this.slashEntries());
          return;
        }
        const spec = parseSpecCommand(msg.text);
        if (spec && this.specHandler) {
          this.specHandler(spec.task);
          return;
        }
        if (this.pendingLarge) this.attachments.restore(this.pendingLarge.attachments);
        this.pendingLarge = undefined;
        // Pasted/dropped files ride on this message; a message of files alone still needs a task.
        const attachments = this.attachments.take();
        this.postAttachments();
        const mention = expandAgentMention(msg.text, this.agentDefs.map((a) => a.name));
        const plan: CommandRunPlan = mention ? { text: mention } : await this.planMessage(msg.text);
        const typed = plan.text;
        const text = typed.trim() || (attachments.length > 0 ? t('Take a look at the attached files.') : typed);
        if (this.shouldSuggestSpec(msg.text, text)) {
          this.pendingLarge = { text, auto: msg.auto ?? false, attachments };
          this.post({ type: 'suggest_spec' });
          return;
        }
        await this.withOverrides(plan, () => this.runChat(text, msg.auto ?? false, attachments, plan.modeId));
        return;
      }
      case 'retry_last': {
        const last = this.lastTurn;
        if (!last) return;
        if (this.controller || this.starting) {
          this.post({ type: 'warning', message: t('A task is already running. Cancel it first.') });
          return;
        }
        const edited = msg.text?.trim() ? await this.planMessage(msg.text) : undefined;
        const text = edited ? edited.text : last.text;
        // Drop the last turn: the conversation goes back to before it, on screen too.
        this.session.rewindTo(last.historyBefore);
        this.post({ type: 'transcript', items: transcriptFromMessages(last.historyBefore ?? [], (x) => stripContextBlocks(stripSteering(x))) });
        this.post({ type: 'user_message', text: msg.text?.trim() || last.text, retry: true });
        this.post({ type: 'notice', message: t('Retrying. Files the earlier attempt changed stay changed; use Revert this run or a checkpoint to undo them.') });
        // The files that went with the message go again.
        await this.withOverrides(edited, () => this.runChat(text, msg.auto ?? false, last.attachments, edited?.modeId, last.historyBefore));
        return;
      }
      case 'revert_run':
        await this.revertLatestRun();
        return;
      case 'allow_command':
        await this.rememberCommand(msg.id);
        return;
      case 'suggest_choice': {
        const held = this.pendingLarge;
        this.pendingLarge = undefined;
        if (!held) return;
        if (msg.choice === 'never') {
          await vscode.workspace.getConfiguration('forge').update('suggestSpec', false, vscode.ConfigurationTarget.Global);
        }
        if (msg.choice === 'spec' && this.specHandler) {
          // Spec generation reads the workspace, not attachments: keep them for the next message.
          this.attachments.restore(held.attachments);
          this.postAttachments();
          this.specHandler(held.text);
        } else await this.runChat(held.text, held.auto, held.attachments, msg.choice === 'plan' ? 'plan' : undefined);
        return;
      }
      case 'run_action':
        if (msg.action === 'clear') void vscode.commands.executeCommand('forge.agents.clear');
        else void vscode.commands.executeCommand('forge.agents.stepAction', msg.runId, msg.index, msg.action);
        return;
      case 'approval_response':
        this.resolveApproval(msg.id, toApprovalDecision(msg.approved, msg.note));
        return;
      case 'cancel':
        this.goal?.stop();
        this.controller?.abort();
        return;
      case 'goal_command':
        await this.goalController().command(msg.args);
        return;
      case 'question_answer':
        this.closeQuestion(msg.id, msg.answer.slice(0, 4000));
        return;
      case 'slash_list':
        await this.postSlashCommands();
        return;
      case 'slash_run':
        await runSlash(msg.name.toLowerCase(), msg.args.trim(), this.slashDeps(), await this.slashEntries());
        return;
      case 'new_chat':
        this.pendingLarge = undefined;
        this.latestRun = undefined;
        this.lastTurn = undefined;
        this.newChat();
        return;
      case 'set_mode':
        // Allowed mid-chat: the next turn swaps the mode's system prompt into the conversation.
        this.modeId = resolveModeId(msg.id, listSpecialists());
        await this.context.workspaceState.update(MODE_STATE_KEY, this.modeId);
        this.announceModes();
        return;
      case 'open_diff':
        await this.openDiff(msg.id);
        return;
      case 'review_hunks':
        await this.reviewHunks(msg.id);
        return;
      case 'condense':
        await this.condense();
        return;
      case 'open_settings':
        await vscode.commands.executeCommand('forge.openSettings');
        return;
      case 'list_models':
        await this.sendModelMenu(msg.refresh === true);
        return;
      case 'work_load':
        if (msg.panel === 'specs' || msg.panel === 'steering') await this.sendWork(msg.panel);
        return;
      case 'work_act':
        await this.actOnWork(msg.panel, msg.action);
        return;
      case 'select_model':
        await this.selectModel(msg.provider as ProviderName, msg.model);
        return;
      case 'toggle_favourite_model':
        await this.context.globalState.update(FAVOURITE_MODELS_KEY, toggleFavourite(this.context.globalState.get<string[]>(FAVOURITE_MODELS_KEY) ?? [], msg.provider, msg.model));
        await this.sendModelMenu(false);
        return;
      case 'copy_resume':
        await vscode.env.clipboard.writeText(`forge --resume ${msg.id}`);
        this.post({ type: 'warning', message: t('Copied: forge --resume {0}. Run it in a terminal to continue this session in the CLI.', msg.id) });
        return;
      case 'mention_query': {
        const files = await findMentionFiles(msg.q).catch(() => []);
        this.post({ type: 'mention_suggestions', items: mentionSuggestions(msg.q, files, 8, Object.keys(readConfig().docs)) });
        return;
      }
      case 'attach_file':
        this.attachPasted(msg.name, msg.dataUrl);
        return;
      case 'attach_uris':
        await this.attachPaths(
          msg.uris.flatMap((u) => {
            try {
              const uri = vscode.Uri.parse(u, true);
              return uri.scheme === 'file' ? [uri.fsPath] : [];
            } catch {
              return [];
            }
          })
        );
        return;
      case 'pick_attachments':
        await this.pickAttachments();
        return;
      case 'enhance_prompt':
        // Never throws: a missing key or a model error hands the draft back unchanged. With no model at all, say why nothing changed.
        {
          const model = await this.enhanceModel();
          if (!model) this.post({ type: 'warning', message: t('Enhance needs a model. Pick one in the toolbar, or add an API key in Settings.') });
          this.post({ type: 'enhanced', text: await enhancePrompt(msg.text, model, undefined, vscode.workspace.getConfiguration('forge').get<string>('enhancePrompt.instruction') || undefined) });
        }
        return;
      case 'remove_attachment':
        this.attachments.remove(msg.id);
        this.postAttachments();
        return;
      case 'voice_started':
        // No host-side action needed: the webview drives its own UI.
        return;
      case 'voice_stopped':
        return;
      case 'voice_error':
        // The webview already surfaces the friendly message; nothing extra
        // for the host to do. We could log here if a debug channel existed.
        return;
      case 'voice_unsupported':
        return;
    }
  }

  /**
   * Toggle the chat webview's voice input. Triggered by the
   * `forge.startVoiceInput` command and its keybinding. We focus the chat
   * first so the user sees the mic button highlight; the webview handles
   * the actual start/stop via `voice_start`.
   */
  toggleVoice(): void {
    if (!this.view) {
      vscode.window.setStatusBarMessage(t('Forge: open the chat first, then start voice input.'), 4000);
      return;
    }
    void vscode.commands.executeCommand('workbench.view.extension.forge');
    void vscode.commands.executeCommand('forge.chatView.focus');
    this.view.webview.postMessage({ type: 'voice_start' });
  }

  /**
   * Push just the voice config to the webview. Lighter than
   * {@link announceModel} for voice-only settings changes (no model
   * re-resolution needed).
   */
  async announceVoiceConfig(): Promise<void> {
    try {
      const cfg = readConfig();
      this.view?.webview.postMessage({ type: 'voice_config', config: cfg.voice });
    } catch {
      // No view yet: extension just installed; harmless.
    }
  }

  setSpecHandler(handler: (task: string) => void): void {
    this.specHandler = handler;
  }

  /** Offer a spec before running a request that asks for a whole system (default mode only). */
  private shouldSuggestSpec(typed: string, sent: string): boolean {
    return (
      !!this.specHandler &&
      this.modeId === DEFAULT_MODE_ID &&
      vscode.workspace.isTrusted &&
      vscode.workspace.getConfiguration('forge').get<boolean>('suggestSpec', true) &&
      looksLargeMessage(typed, sent)
    );
  }

  /** A GitHub token: GITHUB_TOKEN / GH_TOKEN, else VS Code's GitHub sign-in (never prompts mid-run). */
  private async githubToken(): Promise<{ token: string } | undefined> {
    const fromEnv = githubFromEnv();
    if (fromEnv) return fromEnv;
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false, silent: true });
      return session ? { token: session.accessToken } : undefined;
    } catch {
      return undefined;
    }
  }

  /** Open and focus the chat, waiting up to 5 s for its webview to be ready. */
  private async ensureView(): Promise<boolean> {
    if (!this.view || !this.webviewReady) {
      await vscode.commands.executeCommand('workbench.view.extension.forge');
      await vscode.commands.executeCommand('forge.chatView.focus');
      for (let i = 0; i < 50 && !(this.view && this.webviewReady); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (this.view && this.webviewReady) return true;
    void vscode.window.showErrorMessage(t('Forge: Open the Forge chat and try again.'));
    return false;
  }

  /** A task from an editor command (Fix / Explain with Forge): shown as `label`, run in the chat. */
  async runFromEditor(label: string, task: string, modeId?: string): Promise<void> {
    if (!(await this.ensureView())) return;
    this.post({ type: 'user_message', text: label });
    await this.runTask(task, false, modeId ? { kind: 'chat', modeId } : undefined);
  }

  /** Agents, modes and commands changed on disk (an import wrote new files): make them usable without a reload. */
  async reloadExtras(): Promise<void> {
    await this.refreshAgentFiles();
    this.announceModes();
    await this.postSlashCommands();
  }

  /** Put text (an @ mention from "Add to Context") at the end of the message being typed. */
  async addToComposer(text: string): Promise<void> {
    if (!(await this.ensureView())) return;
    this.post({ type: 'insert_text', text });
  }

  /** Read-only spec generation, streamed in the chat but not recorded into the session. */
  async runSpecGeneration(task: string, echo: boolean | string): Promise<RunOutcome | null> {
    if (!(await this.ensureView())) return null;
    // A string is the label to show instead of the (long) task, e.g. for a spec sync.
    if (echo) this.post({ type: 'user_message', text: typeof echo === 'string' ? echo : `/spec ${task}` });
    this.lastTurn = undefined; // Retry and Edit are for chat messages only
    return this.runTask(task, false, { kind: 'spec-generate' });
  }

  /** Run one spec task. Fresh runs start a new chat in Agent mode (not persisted). */
  async runSpecTask(prompt: string, label: string, mode: RunMode): Promise<RunOutcome | null> {
    if (!(await this.ensureView())) return null;
    if (this.controller || this.starting) {
      this.post({ type: 'warning', message: t('A task is already running. Cancel it first.') });
      return null;
    }
    // A read-only mode (Ask / Plan / Review) can't do the task, but a "completed" run would
    // still tick it. Refuse instead of ticking work that never happened.
    if (mode === 'current' && !modeCanWrite(this.modeId, { specialists: listSpecialists(), effectiveToolsFor })) {
      this.post({
        type: 'warning',
        message: `The current chat mode (${this.modeId}) cannot edit files. Switch to Agent mode or use "Run (fresh session)".`,
      });
      return null;
    }
    if (mode === 'fresh') {
      this.newChat();
      this.modeId = DEFAULT_MODE_ID;
      this.announceModes();
    }
    this.post({ type: 'user_message', text: label });
    this.lastTurn = undefined; // Retry and Edit are for chat messages only
    return this.runTask(prompt, false);
  }

  /** `/<name> args` for a command in .forge/commands or ~/.forge/commands; other text unchanged. */
  private async planMessage(text: string): Promise<CommandRunPlan> {
    const m = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!m) return { text };
    const name = m[1]!.toLowerCase();
    const command = (await loadCustomCommands(this.workspaceRoot()).catch(() => new Map())).get(name);
    if (command) {
      const plan = planCommandRun(command, m[2] ?? '', {
        agentNames: this.agentDefs.map((a) => a.name),
        modeIds: listModes(listSpecialists()).map((x) => x.id),
      });
      if (plan.problem) this.post({ type: 'warning', message: t('Command /{0}: {1}', name, plan.problem) });
      return plan;
    }
    if (BUILTIN_SLASH.some((e) => e.name === name)) return { text };
    const skill = (await this.skillsFor().catch(() => undefined))?.list().find((s) => s.name.toLowerCase() === name);
    return { text: skill ? expandSkillCommand(skill, m[2] ?? '') : text };
  }

  /** Run `work` with this effort for its duration only (a command's `variant`), then put the chat's own setting back. */
  private async withOverrides<T>(plan: Pick<CommandRunPlan, 'variant' | 'model'> | undefined, work: () => Promise<T>): Promise<T> {
    if (!plan?.variant && !plan?.model) return work();
    const before = { effort: this.effortOverride, model: this.modelRefOverride };
    if (plan.variant) this.effortOverride = plan.variant;
    if (plan.model) this.modelRefOverride = plan.model;
    try {
      return await work();
    } finally {
      this.effortOverride = before.effort;
      this.modelRefOverride = before.model;
    }
  }

  /** `@chat:<ref>`: the text of another saved chat (never the open one), with secrets scrubbed. */
  private async readChatMention(ref: string): Promise<string | null> {
    const dir = this.sessionDeps.sessionDir;
    const entry = findChatEntry(await listSessions(dir), ref, this.session.id);
    if (!entry) return null;
    const session = await loadSession(entry.id, dir);
    const items = transcriptFromMessages(session.messages, (x) => stripContextBlocks(stripSteering(x)));
    if (items.length === 0) return null;
    return redact(chatTranscriptText(items, 18_000)).text;
  }

  /** A chat message: resolve its @mentions, then run it with its attachments; remembered for Retry and Edit. */
  private async runChat(text: string, auto: boolean, attachments: Attachment[], modeId?: string, historyBefore = this.session.history): Promise<void> {
    this.lastTurn = { text, attachments, historyBefore };
    // @mentions: attach the referenced files / diagnostics / git diff as context for this turn.
    const resolved = await resolveMentions(text, createMentionResolvers(this.workspaceRoot(), () => this.terminalLog, readConfig().docs, (ref) => this.readChatMention(ref)));
    if (resolved.attached.length > 0 || resolved.unresolved.length > 0) {
      this.post({ type: 'mentions_attached', attached: resolved.attached, unresolved: resolved.unresolved });
    }
    // Background agents that finished since the last message: the model has not seen their answers yet.
    const finished = backgroundResultsBlock(this.background.takeUndelivered());
    const outcome = await this.runTask(finished ? `${finished}\n\n${resolved.prompt}` : resolved.prompt, auto, { kind: 'chat', ...(modeId ? { modeId } : {}), attachments });
    if (outcome === null && attachments.length > 0) {
      // Nothing ran (no model, a run already going): don't lose what the user attached.
      this.attachments.restore(attachments);
      this.postAttachments();
    }
  }

  /**
   * Run a task via the agent. Streams events into the webview. Resolves any
   * approval prompts interactively via the webview. Returns the run outcome,
   * or null when nothing ran (refused, no view, no model).
   */
  async runTask(task: string, auto: boolean, options: RunOptions = { kind: 'chat' }): Promise<RunOutcome | null> {
    const generating = options.kind === 'spec-generate';
    const attachments = options.kind === 'chat' ? (options.attachments ?? []) : [];
    if (!this.view) return null;
    // Refuse instead of aborting the running turn: the new turn would be built from
    // history that lacks the old one, and both would then save into the same session.
    if (this.controller || this.starting) {
      this.post({ type: 'warning', message: t('A task is already running. Cancel it first.') });
      return null;
    }
    this.starting = true;
    let cfg: ReturnType<typeof readConfig>;
    try {
      cfg = await this.resolveConfigWithKeys();
    } finally {
      this.starting = false;
    }
    let model: ModelConfig;
    try {
      model = resolveModel(cfg);
    } catch (err) {
      this.post(errorPost((err as Error).message, true));
      return null;
    }
    // Spec: 2026-09-28-settings-panel-design.md item 11: compactionModel
    // is a bare model-id string in the shared config file; provider is
    // inherited from the main model, same convention defaultModelFor/
    // fastDefaultFor already use for per-purpose model overrides.
    const { config: sharedConfig } = await loadMergedForgeConfig(this.workspaceRoot(), { trusted: vscode.workspace.isTrusted });
    // Model aliases (and provider:model) apply to forge.model, the cheap model and
    // the editor model. Report a broken alias before claiming the run slot.
    const aliasError = aliasProblem([model.model, cfg.cheapModel.trim(), cfg.architect.editorModel], sharedConfig.aliases);
    if (aliasError) {
      this.post(errorPost(aliasError, true));
      return null;
    }
    // A model from a named provider already carries its endpoint; its API id must not be read as an alias again.
    if (!model.endpoint) model = applyResolved(model, resolveModelAlias(model.model, sharedConfig.aliases, model.provider));
    if (this.modelRefOverride) {
      try {
        model = applyResolved(model, resolveModelAlias(this.modelRefOverride, sharedConfig.aliases, model.provider));
      } catch (err) {
        this.post({ type: 'warning', message: t('Command model: {0}', (err as Error).message) });
      }
    }
    this.model = model;

    const session = this.session; // pinned: new_chat / resume swap this.session mid-run
    const controller = new AbortController();
    this.controller = controller;
    denyAllPending(this.pendingApprovals);
    this.pendingApprovalArgs.clear();

    if (!model.reasoningEffort && sharedConfig.reasoningEffort) {
      model.reasoningEffort = sharedConfig.reasoningEffort;
    }
    if (this.effortOverride !== undefined) {
      if (this.effortOverride) model.reasoningEffort = this.effortOverride as NonNullable<ModelConfig['reasoningEffort']>;
      else delete model.reasoningEffort;
    }
    const workspaceRoot = this.workspaceRoot();
    const { sandbox: toolSandbox } = await loadToolSandboxConfig(workspaceRoot, {
      trustedProjectSettings: vscode.workspace.isTrusted,
    });
    // Steering (SP3a): project steering only in trusted workspaces; each warning once per window.
    const steering = await loadSteering(workspaceRoot, { includeProject: vscode.workspace.isTrusted }).catch(
      () => ({ docs: [], warnings: [] as string[] })
    );
    for (const w of steering.warnings) {
      if (this.steeringWarned.has(w)) continue;
      this.steeringWarned.add(w);
      this.post({ type: 'warning', message: w });
    }
    const editorUri = vscode.window.activeTextEditor?.document.uri;
    const activeFile = editorUri?.scheme === 'file' ? editorUri.fsPath : undefined;
    const runModeId = (options.kind === 'chat' && options.modeId) || this.modeId;
    const modeCtx = {
      specialists: listSpecialists(),
      baseSandbox: toolSandbox,
      baseModel: model,
      effectiveToolsFor,
      ...(sharedConfig.modeModels ? { modeModels: sharedConfig.modeModels } : {}),
      ...(sharedConfig.aliases ? { aliases: sharedConfig.aliases } : {}),
    };
    const overrides: ModeOverrides = generating ? {} : modeOverrides(runModeId, modeCtx);
    const modeProblem = generating ? undefined : modeModelProblem(runModeId, modeCtx);
    if (modeProblem) {
      this.post({ type: 'warning', message: t('The model set for the {0} mode (modeModels) cannot be used, so Forge uses the main model: {1}', runModeId, modeProblem) });
    }
    const runSandbox = generating ? readOnlySandbox(toolSandbox, SPEC_READONLY_TOOLS) : overrides.toolSandbox;
    const runModel = overrides.model ?? model;
    // Verify by default: the project's own checks, only in a trusted workspace and (in 'ask' mode) after the
    // user approved this exact command list. Detection only reads files; nothing runs until the plan says so.
    const trustedForChecks = !generating && vscode.workspace.isTrusted;
    const detected = trustedForChecks ? await detectProjectChecks(workspaceRoot) : { checks: [] };
    const declined = this.declinedVerifyHash;
    const plan = planVerify({
      explicit: cfg.verifyCommands,
      mode: cfg.verifyAuto,
      trusted: trustedForChecks,
      detected: autoRunCommands(detected),
      fingerprint: autoRunFingerprint(detected),
      ...(this.context.workspaceState.get<string>(VERIFY_APPROVED_KEY) ? { approvedHash: this.context.workspaceState.get<string>(VERIFY_APPROVED_KEY)! } : {}),
      ...(declined ? { declinedHash: declined } : {}),
    });
    const verifyAuto =
      plan.source === 'detected'
        ? plan.needsConsent
          ? { approve: (commands: string[]) => this.askToRunChecks(commands, plan.hash, controller.signal) }
          : {}
        : undefined;
    const allowedCommands = generating
      ? []
      : activeCommands(
          sharedConfig.autoApproveCommands,
          workspaceRoot,
          await projectScriptsFingerprint(workspaceRoot),
          vscode.workspace.isTrusted
        );
    const extras = buildRunExtras({ ...cfg, verifyCommands: plan.commands }, runModel, {
      readOnly: generating,
      ...(sharedConfig.aliases ? { aliases: sharedConfig.aliases } : {}),
      ...(verifyAuto ? { verifyAuto } : {}),
    });
    if (cfg.github.enabled && !generating) {
      const github = await this.githubToken();
      if (github) extras.github = github;
      else this.post({ type: 'warning', message: t('GitHub tools are on, but you are not signed in to GitHub: sign in from the Accounts menu or set GITHUB_TOKEN.') });
    }
    if (cfg.webSearch.provider !== 'off' && !extras.webSearch) {
      this.post({
        type: 'warning',
        message: t('Web search is on but has no backend: set TAVILY_API_KEY or BRAVE_API_KEY, or forge.webSearch.searxngUrl.'),
      });
    }

    // MCP tools (connected once, shared across runs) and skills. Spec generation stays read-only and plain.
    let mcpTools: ToolDefinition[] = [];
    let mcpInstructions = '';
    if (!generating && cfg.mcp.enabled && this.mcp) {
      await this.mcp.ensureConnected();
      mcpTools = this.mcp.tools();
      const mcp = this.mcp;
      if (mcp.servers().length > 0) {
        mcpTools = [...mcpTools, ...createMcpResourceTools(() => mcp.servers())];
        mcpInstructions = mcpInstructionsBlock(mcp.servers());
      }
      for (const st of this.mcp.status()) {
        const key = `${st.name}:${st.error ?? ''}`;
        if (st.state === 'failed' && !this.mcpWarned.has(key)) {
          this.mcpWarned.add(key);
          this.post({ type: 'warning', message: t('MCP server "{0}" is not connected: {1}', st.name, st.error ?? 'unknown error') });
        }
      }
    }
    const skillsRegistry = generating ? undefined : await loadSkillsRegistryAsync(workspaceRoot, sharedConfig.skillPaths ?? [], { onWarning: (w) => this.warnRemoteSkillOnce(w) }).catch(() => undefined);
    const agentConfig: AgentConfig = {
      model: runModel,
      cwd: workspaceRoot,
      auto,
      abortSignal: controller.signal,
      ...(runSandbox ? { toolSandbox: runSandbox } : {}),
      ...(generating ? { specMode: true } : {}),
      ...(overrides.systemPrompt ? { systemPrompt: overrides.systemPrompt } : {}),
      ...(overrides.maxIterations ? { maxIterations: overrides.maxIterations } : {}),
      ...extras,
      ...(mcpInstructions ? { mcpInstructions } : {}),
      ...(mcpTools.length + (options.kind === 'chat' ? options.extraTools?.length ?? 0 : 0) > 0
        ? { extraTools: [...mcpTools, ...(options.kind === 'chat' ? options.extraTools ?? [] : [])] }
        : {}),
      ...(options.kind === 'chat' && options.disableAskUser ? { disableAskUser: true } : {}),
      ...(skillsRegistry ? { skills: { registry: skillsRegistry } } : {}),
      ...(!generating && cfg.terminal.integrated ? { commandRunner: this.commandRunner } : {}),
      ...(sharedConfig.compactionModel
        ? { compactionModel: { provider: runModel.provider, model: sharedConfig.compactionModel } }
        : {}),
      ...(cfg.checkpoints.enabled && !generating
        ? {
            checkpoints: {
              store: this.checkpointStore(session),
              // Per-file pre-edit checkpoints only. The whole-workspace session_start
              // snapshot stalls big repos and is never pruned.
              captureInitial: false,
              captureBeforeTools: cfg.checkpoints.captureCommands
                ? ['write_file', 'edit_file', 'edit_notebook', 'apply_patch', 'run_command']
                : ['write_file', 'edit_file', 'edit_notebook', 'apply_patch'],
            },
          }
        : {}),
      autoApproveTools: resolveAutoApprove(sharedConfig.autoApproveTools),
      ...permissionExtras(sharedConfig),
      ...(sharedConfig.instructions?.length ? { extraInstructions: sharedConfig.instructions } : {}),
      ...(sharedConfig.subagentModel ? { subAgentModel: applyResolved(runModel, resolveModelAlias(sharedConfig.subagentModel, sharedConfig.aliases, runModel.provider)) } : {}),
      ...(this.todos.length > 0 && !generating ? { initialTodos: this.todos } : {}),
      ...(!generating ? { backgroundAgents: this.background } : {}),
      ...(!generating
        ? {
            askUser: (q: { question: string; options?: string[]; allowCustom?: boolean }, signal?: AbortSignal) =>
              new Promise<string>((resolve) => {
                const id = `q${++this.questionSeq}`;
                this.pendingQuestions.set(id, resolve);
                signal?.addEventListener('abort', () => this.closeQuestion(id, ''), { once: true });
                this.post({ type: 'question_request', id, question: q.question, options: q.options ?? [], allowCustom: q.allowCustom !== false });
              }),
          }
        : {}),
      ...(allowedCommands.length > 0 ? { autoApproveCommands: allowedCommands } : {}),
      approve: (req: ApprovalRequest) =>
        new Promise<ApprovalDecision>((resolve) => {
          this.pendingApprovals.set(req.id, resolve);
          this.pendingApprovalArgs.set(req.id, { name: req.name, args: req.args });
          this.post({
            type: 'approval_request',
            id: req.id,
            name: req.name,
            args: req.args,
            destructive: req.destructive,
            previewable: isPreviewable(req.name),
            reviewable: isHunkReviewable(req.name),
            allowable: this.canAlwaysAllow(req.name, req.args),
            ...(req.preview ? { preview: req.preview } : {}),
          });
        }),
      ...(this.hooksBus ? { hooks: this.hooksBus } : {}),
      ...(steering.docs.length > 0 ? { steering: { docs: steering.docs, ...(activeFile ? { activeFile } : {}) } } : {}),
      ...(formatProjectCommandsBlock(detected) ? { projectCommands: formatProjectCommandsBlock(detected) } : {}),
    };

    this.post({ type: 'task_started' });
    this.latestRun = undefined;
    const runStartedAtIso = new Date().toISOString();
    this.post({ type: 'model', provider: runModel.provider, model: runModel.model });

    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let contextTokens: number | undefined;
    let contextWindow: number | undefined;
    let iteration = 0;
    let maxIter = agentConfig.maxIterations ?? 50;
    let lastReason = '';
    let result: AgentRunResult | undefined;
    const changedFiles = new Set<string>();
    const toolCalls = new Map<string, { name: string; args: unknown }>();
    let denied = false;

    // Architect/editor runs are two Agent runs whose counters each start at zero;
    // when the editor phase begins, what the architect used becomes the offset.
    let iterationBase = 0;
    let inputBase = 0;
    let outputBase = 0;
    let costBase = 0;
    let runCost = 0;

    const onEvent = (event: AgentEvent): void => {
        // A stopped run unwinds a moment after New chat or Resume swapped the conversation: its late status line,
        // text and tool rows belong to the old chat and must not land in the one on screen.
        if (session !== this.session) return;
        switch (event.type) {
          case 'phase':
            if (event.phase === 'editor') {
              iterationBase = iteration;
              inputBase = inputTokens;
              outputBase = outputTokens;
              costBase = runCost;
            }
            this.post({ type: 'model', provider: event.provider, model: event.model });
            return;
          case 'iteration':
            iteration = iterationBase + event.iteration;
            maxIter = iterationBase + event.maxIterations;
            this.post({
              type: 'status',
              iteration,
              maxIter,
              inputTokens,
              outputTokens,
              durationMs: Date.now() - startedAt,
              ...(contextWindow ? { contextTokens, contextWindow } : {}),
            });
            return;
          case 'text_delta':
            this.post({ type: 'text_delta', text: event.text });
            return;
          case 'text_done':
            this.post({ type: 'text_done', text: event.text });
            return;
          case 'reasoning_delta':
            this.post({ type: 'reasoning_delta', text: event.text });
            return;
          case 'steering':
            this.post({ type: 'steering_applied', trigger: event.trigger, applied: event.applied, skipped: event.skipped, path: event.path });
            return;
          case 'reasoning_done':
            this.post({ type: 'reasoning_done', text: event.text });
            return;
          case 'tool_call':
            toolCalls.set(event.id, { name: event.name, args: event.args });
            this.post({ type: 'tool_call', id: event.id, name: event.name, args: event.args });
            return;
          case 'tool_result': {
            const call = toolCalls.get(event.id);
            for (const file of call ? changedFilesFromToolResult(workspaceRoot, event.name, call.args, event.isError) : []) changedFiles.add(file);
            if (typeof event.result === 'string' && event.result.startsWith('Denied by user')) denied = true;
            this.post({ type: 'tool_result', id: event.id, name: event.name, result: event.result, isError: event.isError });
            return;
          }
          case 'todo_updated':
            this.todos = event.todos;
            this.post({ type: 'todo_updated', todos: event.todos });
            return;
          case 'cost':
            runCost = costBase + event.runningCostUsd;
            this.post({ type: 'cost', known: event.known, chatCostUsd: session.totalCostUsd + runCost });
            return;
          case 'compaction':
            this.post({ type: 'compaction', droppedCount: event.droppedCount, savedTokens: event.savedTokens });
            return;
          case 'context_masked':
            this.post({ type: 'context_masked', maskedCount: event.maskedCount, savedTokens: event.savedTokens });
            return;
          case 'verify':
            this.post({
              type: 'verify',
              attempt: event.attempt,
              passed: event.passed,
              failedCommands: event.failedCommands,
              ...(event.slowCommands ? { slowCommands: event.slowCommands } : {}),
            });
            return;
          case 'model_route':
            this.post({ type: 'model', provider: event.provider, model: event.model });
            return;
          case 'usage':
            inputTokens = inputBase + event.inputTokens;
            outputTokens = outputBase + event.outputTokens;
            contextTokens = event.contextTokens;
            contextWindow = event.contextWindow;
            this.post({
              type: 'status',
              iteration,
              maxIter,
              inputTokens,
              outputTokens,
              durationMs: Date.now() - startedAt,
              ...(contextWindow ? { contextTokens, contextWindow } : {}),
            });
            return;
          case 'error':
            this.post(errorPost(event.error));
            return;
          case 'done':
            lastReason = event.reason;
            if (event.reason === 'loop_detected') {
              this.post({ type: 'warning', message: t('Stopped: the run repeated the same tool call {0} times in a row (forge.loopGuardThreshold).', cfg.loopGuardThreshold) });
            }
            const channels = notifyChannels({ ...cfg.notifications, durationMs: Date.now() - startedAt, windowFocused: vscode.window.state.focused, reason: event.reason });
            if (channels) {
              const text = notifyKind(event.reason) === 'finished' ? t('Forge finished your request.') : t('Forge stopped before finishing.');
              if (channels.message) void vscode.window.showInformationMessage(text);
              if (channels.sound) runOs(soundCommand(process.platform));
              if (channels.toast) runOs(toastCommand(process.platform, 'Ikarmic Forge', text));
            }
            if (event.reason === 'budget_exceeded') {
              this.post({ type: 'warning', message: t('Stopped: this run reached the {0}cost cap (forge.maxCostUsd).', cfg.maxCostUsd > 0 ? '$' + cfg.maxCostUsd + ' ' : '') });
            }
            this.post({
              type: 'status',
              iteration,
              maxIter,
              inputTokens,
              outputTokens,
              durationMs: Date.now() - startedAt,
              reason: event.reason,
              ...(contextWindow ? { contextTokens, contextWindow } : {}),
            });
            return;
        }
    };

    // Auto-commit: save the user's own uncommitted work first, then commit the agent's changes after a completed run.
    const cheap = cfg.cheapModel.trim();
    const commitModel = cheap ? applyResolved(runModel, resolveModelAlias(cheap, sharedConfig.aliases, runModel.provider)) : runModel;
    const autoCommit = generating ? null : await startAutoCommit(workspaceRoot, cfg.autoCommit, commitModel);
    if (autoCommit?.saved) this.post({ type: 'notice', message: t('Saved your uncommitted changes: {0}', describeCommit(autoCommit.saved)) });

    const releaseAwake = cfg.keepAwake ? this.keepAwake.acquire() : undefined;
    try {
      // A mode switched since the last turn: swap its system prompt into the conversation.
      const history = !generating && session.history ? retargetSystemPrompt(session.history, overrides.systemPrompt, listSpecialists()) : undefined;
      if (!generating && cfg.architect.enabled && cfg.architect.editorModel) {
        const editorModel = resolveModelAlias(cfg.architect.editorModel, sharedConfig.aliases, runModel.provider);

        result = await runArchitect({
          task,
          ...(attachments.length > 0 ? { attachments } : {}),
          baseConfig: agentConfig,
          editorModel,
          ...(history ? { history } : {}),
          abortSignal: controller.signal,
          onEvent,
          ...(auto
            ? {}
            : {
                approvePlan: async () => {
                  const choice = await vscode.window.showInformationMessage(
                    t('Apply the architect plan with {0}/{1}?', editorModel.provider, editorModel.model),
                    { modal: true },
                    'Apply'
                  );
                  return { approved: choice === 'Apply' };
                },
              }),
        });
      } else {
        const agent = new Agent(agentConfig);
        result = await agent.run({
          task,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(history ? { history } : {}),
          abortSignal: controller.signal,
          onEvent,
        });
      }
      if (autoCommit && result?.reason === 'completed') {
        const commit = await autoCommit.finish(task);
        if (commit) this.post({ type: 'notice', message: t('Committed {0}', describeCommit(commit)) });
      }
    } catch (err) {
      this.post(errorPost((err as Error).message));
    } finally {
      releaseAwake?.();
      if (result && !generating) {
        const saved = await session.recordTurn(result, runModel, workspaceRoot);
        if (!saved.ok) this.post({ type: 'warning', message: t('Session not saved: {0}', saved.error) });
      }
      // Keep the newest checkpoints only (core default: 20) so sessions don't grow without bound.
      if (cfg.checkpoints.enabled && !generating) await this.checkpointStore(session).prune().catch(() => undefined);
      // cancel() clears this.controller before the aborted run unwinds, so a new run can
      // already be active by now. Only the run that still owns the controller may reset
      // shared state; otherwise the new run becomes uncancellable and its approvals vanish.
      const superseded = this.controller !== undefined && this.controller !== controller;
      if (!superseded) {
        // Same reason as in onEvent: nothing of an old chat's run (its Retry/Edit row, its changes) goes to this one.
        if (session === this.session) {
          this.post({ type: 'model', provider: runModel.provider, model: runModel.model });
          this.post({ type: 'task_finished' });
          if (!generating && cfg.checkpoints.enabled && changedFiles.size > 0) {
            this.latestRun = { startedAtIso: runStartedAtIso, count: changedFiles.size };
            this.post({ type: 'run_changes', count: changedFiles.size });
          }
        }
        this.controller = undefined;
        denyAllPending(this.pendingApprovals);
        this.closeAllQuestions();
        this.pendingApprovalArgs.clear();
        this.proposed?.clear();
      }
      this.announceModes();
    }
    void lastReason;
    return result
      ? {
          reason: result.reason,
          sessionId: session.id,
          finalText: result.finalText,
          files: [...changedFiles].sort(),
          ...(result.verification ? { verified: result.verification.passed } : {}),
          toolCalls: toolCalls.size,
          ...(denied ? { denied: true } : {}),
        }
      : null;
  }

  /** Whether the approval card for this call may offer "Always allow this command". */
  private canAlwaysAllow(name: string, args: unknown): boolean {
    if (name !== 'run_command' || !vscode.workspace.isTrusted || typeof args !== 'object' || args === null) return false;
    const a = args as { command?: unknown; cwd?: unknown };
    return typeof a.command === 'string' && isAlwaysAllowable(a.command, a.cwd !== undefined && a.cwd !== null && a.cwd !== '');
  }

  /** Remember the command behind a pending approval. The host looks it up by id; the webview never names it. */
  private async rememberCommand(id: string): Promise<void> {
    const pending = this.pendingApprovalArgs.get(id);
    if (!pending || !this.canAlwaysAllow(pending.name, pending.args)) return;
    const command = (pending.args as { command: string }).command;
    const root = this.workspaceRoot();
    try {
      const { config } = await loadForgeConfigFile();
      const table = withEntry(config.autoApproveCommands, root, command, await projectScriptsFingerprint(root));
      await saveForgeConfigFile({ autoApproveCommands: table });
    } catch (err) {
      this.post({ type: 'warning', message: t('Could not save the allowed command: {0}', (err as Error).message) });
    }
  }

  /** Undo everything the latest run changed, by restoring its checkpoints newest first. */
  private async revertLatestRun(): Promise<void> {
    const run = this.latestRun;
    if (!run || this.controller || this.starting) return;
    const sessionCwd = this.session.cwd;
    if (sessionCwd && !sameDir(sessionCwd, this.workspaceRoot())) {
      this.post({ type: 'warning', message: t('This session started in {0}, not the open workspace. Open that folder to revert its changes.', sessionCwd) });
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      t('Revert {0} file(s) to how they were before this run? Edits you made yourself since then in those files will be lost.', run.count),
      { modal: true },
      t('Revert')
    );
    if (choice !== t('Revert')) return;
    try {
      const results = await this.checkpointStore().restoreSince(run.startedAtIso);
      const touched = new Set(results.flatMap((r) => [...r.modified, ...r.restored, ...r.removed])).size;
      this.latestRun = undefined;
      this.post({ type: 'run_reverted', count: touched });
    } catch (err) {
      this.post({ type: 'warning', message: t('Could not revert: {0}', (err as Error).message) });
    }
  }

  /**
   * Ask once before running checks detected from the project, through the normal approval card. Approving
   * remembers this exact command list for the workspace; denying remembers it for the session only.
   */
  private askToRunChecks(commands: string[], hash: string, runSignal: AbortSignal): Promise<boolean> {
    const id = `verify-${Date.now()}`;
    const command = commands.join(' && ');
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(id, (decision) => {
        const approved = typeof decision === 'boolean' ? decision : decision.approved;
        if (approved) void this.context.workspaceState.update(VERIFY_APPROVED_KEY, hash);
        else if (!runSignal.aborted) this.declinedVerifyHash = hash; // Stop is not a "no"
        resolve(approved);
      });
      this.pendingApprovalArgs.set(id, { name: 'run_command', args: { command } });
      this.post({ type: 'approval_request', id, name: 'run_command', args: { command }, destructive: false, previewable: false });
    });
  }

  private resolveApproval(id: string, approved: ApprovalDecision): void {
    const resolver = this.pendingApprovals.get(id);
    if (resolver) {
      resolver(approved);
      this.pendingApprovals.delete(id);
      this.pendingApprovalArgs.delete(id);
      this.proposed?.delete(id);
    }
  }

  /** Show or update a parallel-run card in the chat transcript. */
  showRun(view: RunCardView): void {
    this.post({ type: 'run_update', run: view });
  }

  private runsProvider: (() => RunCardView[]) | undefined;

  /** Cards to show again whenever the transcript is replaced (new chat, resume) or the view reloads. */
  setRunsProvider(fn: () => RunCardView[]): void {
    this.runsProvider = fn;
  }

  private repostRuns(): void {
    for (const view of this.runsProvider?.() ?? []) this.showRun(view);
  }

  private post(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }
}

/** Failures a settings change can fix get an "Open Settings" action in the chat. */
const SETTINGS_FIXABLE = /api[ _-]?key|unauthori[sz]ed|\b40[13]\b|authentication|invalid.*(key|token)|incorrect.*key|missing.*(key|credential)|no (model|provider)|not configured/i;

function errorPost(message: string, forceSettings = false) {
  return { type: 'error' as const, message: friendlyError(message), ...(forceSettings || SETTINGS_FIXABLE.test(message) ? { action: 'openSettings' as const } : {}) };
}

/** What the chat panel needs from the spec and steering modules. */
export interface WorkSource<V, A> {
  load(): Promise<V>;
  act(action: A): Promise<void>;
}

type ChatMessage =
  | { type: 'ready' }
  | { type: 'user_input'; text: string; auto: boolean }
  | { type: 'approval_response'; id: string; approved: boolean; note?: string }
  | { type: 'cancel' }
  | { type: 'suggest_choice'; choice: 'spec' | 'plan' | 'go' | 'never' }
  | { type: 'revert_run' }
  | { type: 'allow_command'; id: string }
  | { type: 'work_load'; panel: string }
  | { type: 'work_act'; panel: string; action: unknown }
  | { type: 'list_models'; refresh?: boolean }
  | { type: 'select_model'; provider: string; model: string }
  | { type: 'toggle_favourite_model'; provider: string; model: string }
  | { type: 'bg_stop'; id: string }
  | { type: 'bg_stop_all' }
  | { type: 'bg_dismiss'; id: string }
  | { type: 'new_chat' }
  | { type: 'set_mode'; id: string }
  | { type: 'open_diff'; id: string }
  | { type: 'review_hunks'; id: string }
  | { type: 'condense' }
  | { type: 'copy_resume'; id: string }
  | { type: 'open_settings' }
  | { type: 'mention_query'; q: string }
  | { type: 'retry_last'; text?: string; auto?: boolean }
  | { type: 'attach_file'; name: string; dataUrl: string }
  | { type: 'attach_uris'; uris: string[] }
  | { type: 'pick_attachments' }
  | { type: 'enhance_prompt'; text: string }
  | { type: 'remove_attachment'; id: string }
  | { type: 'voice_started' }
  | { type: 'voice_stopped'; reason: 'user' | 'silence' | 'error' }
  | { type: 'voice_error'; code: string; message: string }
  | { type: 'voice_unsupported' }
  | { type: 'run_action'; runId: string; index: number; action: 'review' | 'merge' | 'discard' | 'clear' }
  | { type: 'goal_command'; args: string }
  | { type: 'question_answer'; id: string; answer: string }
  | { type: 'slash_list' }
  | { type: 'slash_run'; name: string; args: string };

const CHAT_TYPES = new Set([
  'ready', 'user_input', 'approval_response', 'cancel', 'suggest_choice', 'revert_run', 'allow_command', 'new_chat', 'set_mode', 'open_diff',
  'review_hunks', 'condense', 'mention_query', 'retry_last', 'attach_file', 'attach_uris', 'pick_attachments', 'enhance_prompt', 'remove_attachment', 'copy_resume', 'open_settings', 'list_models', 'select_model', 'toggle_favourite_model', 'bg_stop', 'bg_stop_all', 'bg_dismiss', 'work_load', 'work_act',
  'voice_started', 'voice_stopped', 'voice_error', 'voice_unsupported', 'run_action', 'goal_command', 'question_answer', 'slash_list', 'slash_run',
]);

function isChatMessage(msg: unknown): msg is ChatMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (!CHAT_TYPES.has(m.type as string)) return false;
  if ((m.type === 'set_mode' || m.type === 'open_diff' || m.type === 'review_hunks' || m.type === 'copy_resume' || m.type === 'allow_command') && typeof m.id !== 'string') return false;
  if (m.type === 'suggest_choice' && !['spec', 'plan', 'go', 'never'].includes(m.choice as string)) return false;
  if (m.type === 'mention_query' && typeof m.q !== 'string') return false;
  if (m.type === 'retry_last' && m.text !== undefined && typeof m.text !== 'string') return false;
  if ((m.type === 'user_input' || m.type === 'enhance_prompt') && typeof m.text !== 'string') return false;
  if (m.type === 'attach_file' && typeof m.dataUrl !== 'string') return false;
  if (m.type === 'attach_uris' && !(Array.isArray(m.uris) && m.uris.every((u) => typeof u === 'string'))) return false;
  if (m.type === 'remove_attachment' && typeof m.id !== 'string') return false;
  if (m.type === 'goal_command' && typeof m.args !== 'string') return false;
  if (m.type === 'slash_run' && (typeof m.name !== 'string' || typeof m.args !== 'string')) return false;
  if (m.type === 'question_answer' && (typeof m.id !== 'string' || typeof m.answer !== 'string')) return false;
  if (m.type === 'run_action' && (typeof m.runId !== 'string' || typeof m.index !== 'number' || !['review', 'merge', 'discard', 'clear'].includes(m.action as string))) return false;
  return true;
}

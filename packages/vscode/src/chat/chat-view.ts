import * as vscode from 'vscode';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  Agent,
  githubFromEnv,
  loadAttachment,
  type Attachment,
  autoRunCommands,
  autoRunFingerprint,
  BUILTIN_SPECIALISTS,
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
  generateSessionId,
  listSessions,
  expandCustomCommand,
  loadCustomCommands,
  searchSessions,
  listSpecialists,
  enhancePrompt,
  loadForgeConfigFile,
  resolveAutoApprove,
  saveForgeConfigFile,
  loadSession,
  loadSkillsRegistryAsync,
  loadSpecialistsFromConfig,
  loadSteering,
  loadToolSandboxConfig,
  projectScriptsFingerprint,
  resolveModelAlias,
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
  type HooksBus,
  type McpManager,
  type ModelConfig,
  type ProviderName,
  type ToolDefinition,
} from '@ikarmic/forge-core';

import { readConfig, resolveModel } from '../config.js';
import { loadRuntimeConfig } from '../runtime-config.js';

import type { RunCardView } from '../agents/agents-model.js';
import type { ModelLister } from '../model-lister.js';
import { syncModelPin } from '../model-setting.js';
import { PROVIDER_LABELS } from '../provider-labels.js';
import type { SpecAction, SpecsView, SteeringAction, SteeringView } from '../work/work-model.js';
import { parseSpecAction, parseSteeringAction } from '../work/work-model.js';

import { denyAllPending, toApprovalDecision } from './approval-protocol.js';
import { friendlyError } from './error-text.js';
import { ChatSession, type ChatHistory, type ChatSessionDeps } from './chat-session.js';
import { SessionFollower } from './session-follow.js';
import { webviewDictionary } from './webview-i18n.js';
import { isPreviewable, proposedContent, resolveInsideWorkspace } from './edit-preview.js';
import { handleHistoryMessage, isHistoryMessage, sameDir, transcriptFromMessages, type HistoryDeps, type HistoryMessage } from './history-protocol.js';
import { chatHtml } from './html.js';
import { decisionFromSelection, hunksFor } from './hunk-review.js';
import { hunkExcerpt, hunkLabel } from './hunks.js';
import { cleanName, decodeDataUrl, PendingAttachments } from './pending-attachments.js';
import { createMentionResolvers, findMentionFiles } from './mention-resolvers.js';
import { mentionSuggestions, resolveMentions, stripContextBlocks } from './mentions.js';
import { startAutoCommit, describeCommit } from './auto-commit.js';
import { aliasProblem, buildRunExtras } from './run-extras.js';
import { notifyKind, shouldNotify } from './notify.js';
import { resolveCheapModel } from '../cheap-model.js';
import { activeCommands, withEntry } from './command-allow-store.js';
import { looksLarge } from './large-request.js';
import { planVerify } from './verify-checks.js';
import { createVsCodeCommandRunner } from './terminal-runner.js';
import { parseSpecCommand } from '../specs/spec-command.js';
import type { RunMode, RunOutcome } from '../specs/spec-controller.js';
import { changedFileFromToolResult } from '../specs/spec-paths.js';

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
export type RunOptions = { kind: 'chat'; modeId?: string; attachments?: Attachment[] } | { kind: 'spec-generate' };

const MODE_STATE_KEY = 'forge.chat.mode';
/** workspaceState: hash of the detected check commands the user approved to run after edits. */
const VERIFY_APPROVED_KEY = 'forge.verify.approved';

/**
 * Sidebar chat view for Forge. One provider per VS Code window: the view
 * persists across sidebar hide/show cycles but its conversation resets when
 * the extension reloads.
 */
export class ForgeChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'forge.chatView';

  private view: vscode.WebviewView | undefined;
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
  }

  dispose(): void {
    this.follower?.stop();
    this.terminal.dispose();
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

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
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
    this.view?.webview.postMessage({
      type: 'model_menu',
      groups: groups.filter((g): g is NonNullable<typeof g> => g !== null),
      current: this.model ? { provider: this.model.provider, model: this.model.model } : null,
    });
  }

  /** Picking a model in the chat changes it everywhere it is stored, so no other copy overrides it. */
  private async selectModel(provider: ProviderName, model: string): Promise<void> {
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
      const { config: sharedConfig } = await loadForgeConfigFile();
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

  /** Re-read custom specialists (Settings → Agents may have changed them) and push the mode list. */
  private announceModes(): void {
    // The registry only ever grows: drop previously loaded custom agents first so one
    // deleted in Settings stops being selectable (and a removed override reverts to the built-in).
    for (const id of customSpecialistIds(listSpecialists(), BUILTIN_SPECIALISTS)) unregisterSpecialist(id);
    const loaded = loadSpecialistsFromConfig(undefined, { override: true });
    for (const e of loaded.errors) this.post({ type: 'warning', message: t('Custom agents: {0}', e) });
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
      removeDir: (dir) => rm(dir, { recursive: true, force: true }),
      checkpoints: () => this.checkpointStore(),
      activeCwd: () => this.session.cwd,
      workspaceRoot: () => this.workspaceRoot(),
      stripSteering: (text: string) => stripContextBlocks(stripSteering(text)),
      confirm: async (message, action) =>
        (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action,
    };
  }

  private newChat(): void {
    this.cancel();
    // A fresh object, not reset(): the aborted run still holds the old session and will
    // record its final turn there, not into the new conversation.
    this.session = new ChatSession(this.sessionDeps);
    this.lastTurn = undefined;
    this.proposed?.clear();
    this.post({ type: 'session', id: this.session.id });
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
      this.lastTurn = undefined;
      this.post({ type: 'session', id: this.session.id });
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
      const { config: sharedConfig } = await loadForgeConfigFile();
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

  private async handleMessage(msg: ChatMessage | HistoryMessage): Promise<void> {
    if (isHistoryMessage(msg)) {
      await this.handleHistory(msg);
      return;
    }
    switch (msg.type) {
      case 'ready':
        this.webviewReady = true;
        await this.announceModel();
        this.announceModes();
        this.post({ type: 'session', id: this.session.id });
        this.repostRuns();
        this.postAttachments();
        return;
      case 'user_input': {
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
        const typed = await this.expandCustomCommand(msg.text);
        const text = typed.trim() || (attachments.length > 0 ? t('Take a look at the attached files.') : typed);
        if (this.shouldSuggestSpec(text)) {
          this.pendingLarge = { text, auto: msg.auto ?? false, attachments };
          this.post({ type: 'suggest_spec' });
          return;
        }
        await this.runChat(text, msg.auto ?? false, attachments);
        return;
      }
      case 'retry_last': {
        const last = this.lastTurn;
        if (!last) return;
        if (this.controller || this.starting) {
          this.post({ type: 'warning', message: t('A task is already running. Cancel it first.') });
          return;
        }
        const text = msg.text?.trim() ? await this.expandCustomCommand(msg.text) : last.text;
        // Drop the last turn: the conversation goes back to before it, on screen too.
        this.session.rewindTo(last.historyBefore);
        this.post({ type: 'transcript', items: transcriptFromMessages(last.historyBefore ?? [], (x) => stripContextBlocks(stripSteering(x))) });
        this.post({ type: 'user_message', text: msg.text?.trim() || last.text, retry: true });
        this.post({ type: 'notice', message: t('Retrying. Files the earlier attempt changed stay changed; use Revert this run or a checkpoint to undo them.') });
        // The files that went with the message go again.
        await this.runChat(text, msg.auto ?? false, last.attachments, undefined, last.historyBefore);
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
        this.controller?.abort();
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
        // Never throws: a missing key or a model error hands the draft back unchanged.
        this.post({ type: 'enhanced', text: await enhancePrompt(msg.text, await this.enhanceModel()) });
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
  private shouldSuggestSpec(text: string): boolean {
    return (
      !!this.specHandler &&
      this.modeId === DEFAULT_MODE_ID &&
      vscode.workspace.isTrusted &&
      vscode.workspace.getConfiguration('forge').get<boolean>('suggestSpec', true) &&
      looksLarge(text)
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
  private async expandCustomCommand(text: string): Promise<string> {
    const m = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!m) return text;
    const command = (await loadCustomCommands(this.workspaceRoot()).catch(() => new Map())).get(m[1]!.toLowerCase());
    return command ? expandCustomCommand(command, m[2] ?? '') : text;
  }

  /** A chat message: resolve its @mentions, then run it with its attachments; remembered for Retry and Edit. */
  private async runChat(text: string, auto: boolean, attachments: Attachment[], modeId?: string, historyBefore = this.session.history): Promise<void> {
    this.lastTurn = { text, attachments, historyBefore };
    // @mentions: attach the referenced files / diagnostics / git diff as context for this turn.
    const resolved = await resolveMentions(text, createMentionResolvers(this.workspaceRoot(), () => this.terminalLog, readConfig().docs));
    if (resolved.attached.length > 0 || resolved.unresolved.length > 0) {
      this.post({ type: 'mentions_attached', attached: resolved.attached, unresolved: resolved.unresolved });
    }
    const outcome = await this.runTask(resolved.prompt, auto, { kind: 'chat', ...(modeId ? { modeId } : {}), attachments });
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
    const { config: sharedConfig } = await loadForgeConfigFile();
    // Model aliases (and provider:model) apply to forge.model, the cheap model and
    // the editor model. Report a broken alias before claiming the run slot.
    const aliasError = aliasProblem([model.model, cfg.cheapModel.trim(), cfg.architect.editorModel], sharedConfig.aliases);
    if (aliasError) {
      this.post(errorPost(aliasError, true));
      return null;
    }
    model = { ...model, ...resolveModelAlias(model.model, sharedConfig.aliases, model.provider) };
    this.model = model;

    const session = this.session; // pinned: new_chat / resume swap this.session mid-run
    const controller = new AbortController();
    this.controller = controller;
    denyAllPending(this.pendingApprovals);
    this.pendingApprovalArgs.clear();

    if (!model.reasoningEffort && sharedConfig.reasoningEffort) {
      model.reasoningEffort = sharedConfig.reasoningEffort;
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
    if (!generating && cfg.mcp.enabled && this.mcp) {
      await this.mcp.ensureConnected();
      mcpTools = this.mcp.tools();
      for (const st of this.mcp.status()) {
        const key = `${st.name}:${st.error ?? ''}`;
        if (st.state === 'failed' && !this.mcpWarned.has(key)) {
          this.mcpWarned.add(key);
          this.post({ type: 'warning', message: t('MCP server "{0}" is not connected: {1}', st.name, st.error ?? 'unknown error') });
        }
      }
    }
    const skillsRegistry = generating ? undefined : await loadSkillsRegistryAsync(workspaceRoot).catch(() => undefined);
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
      ...(mcpTools.length > 0 ? { extraTools: mcpTools } : {}),
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
                ? ['write_file', 'edit_file', 'edit_notebook', 'run_command']
                : ['write_file', 'edit_file', 'edit_notebook'],
            },
          }
        : {}),
      autoApproveTools: resolveAutoApprove(sharedConfig.autoApproveTools),
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

    // Architect/editor runs are two Agent runs whose counters each start at zero;
    // when the editor phase begins, what the architect used becomes the offset.
    let iterationBase = 0;
    let inputBase = 0;
    let outputBase = 0;
    let costBase = 0;
    let runCost = 0;

    const onEvent = (event: AgentEvent): void => {
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
            const file = call ? changedFileFromToolResult(workspaceRoot, event.name, call.args, event.isError) : null;
            if (file) changedFiles.add(file);
            this.post({ type: 'tool_result', id: event.id, name: event.name, result: event.result, isError: event.isError });
            return;
          }
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
            if (shouldNotify({ ...cfg.notifications, durationMs: Date.now() - startedAt, windowFocused: vscode.window.state.focused, reason: event.reason })) {
              void vscode.window.showInformationMessage(notifyKind(event.reason) === 'finished' ? t('Forge finished your request.') : t('Forge stopped before finishing.'));
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
    const commitModel = cheap ? { ...runModel, ...resolveModelAlias(cheap, sharedConfig.aliases, runModel.provider) } : runModel;
    const autoCommit = generating ? null : await startAutoCommit(workspaceRoot, cfg.autoCommit, commitModel);
    if (autoCommit?.saved) this.post({ type: 'notice', message: t('Saved your uncommitted changes: {0}', describeCommit(autoCommit.saved)) });

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
        this.post({ type: 'model', provider: runModel.provider, model: runModel.model });
        this.post({ type: 'task_finished' });
        if (!generating && cfg.checkpoints.enabled && changedFiles.size > 0) {
          this.latestRun = { startedAtIso: runStartedAtIso, count: changedFiles.size };
          this.post({ type: 'run_changes', count: changedFiles.size });
        }
        this.controller = undefined;
        denyAllPending(this.pendingApprovals);
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
  | { type: 'run_action'; runId: string; index: number; action: 'review' | 'merge' | 'discard' | 'clear' };

const CHAT_TYPES = new Set([
  'ready', 'user_input', 'approval_response', 'cancel', 'suggest_choice', 'revert_run', 'allow_command', 'new_chat', 'set_mode', 'open_diff',
  'review_hunks', 'condense', 'mention_query', 'retry_last', 'attach_file', 'attach_uris', 'pick_attachments', 'enhance_prompt', 'remove_attachment', 'copy_resume', 'open_settings', 'list_models', 'select_model', 'work_load', 'work_act',
  'voice_started', 'voice_stopped', 'voice_error', 'voice_unsupported', 'run_action',
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
  if (m.type === 'run_action' && (typeof m.runId !== 'string' || typeof m.index !== 'number' || !['review', 'merge', 'discard', 'clear'].includes(m.action as string))) return false;
  return true;
}

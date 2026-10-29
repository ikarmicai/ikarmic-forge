import * as vscode from 'vscode';

import { McpManager, defaultSessionDir, getOrgPolicy, installProxy, loadForgeConfigFile, loadModelCatalog, proxyFromEnv, pruneByRetention, readCaCertificates } from '@ikarmic/forge-core';

import { readConfig, resolveModel } from './config.js';
import { ModelLister } from './model-lister.js';
import { createSecretStorageCredentialStore } from './credential-store.js';
import { createMcpSecretStore } from './mcp/mcp-secrets.js';
import { ForgeChatViewProvider } from './chat/chat-view.js';
import { PROPOSED_SCHEME, ProposedContentProvider } from './chat/proposed-content-provider.js';
import { registerAgents } from './agents/agents-commands.js';
import { registerMcp } from './mcp/mcp-commands.js';
import { AgentManagerPanel } from './agent-manager/manager-panel.js';
import { DELETE_INDEX_COMMAND, SemanticUi } from './semantic-ui.js';
import { openChatInTab } from './chat/chat-tab.js';
import { registerImportClaude } from './import-claude.js';
import { registerOnboarding } from './onboarding.js';
import { registerSkills } from './skills/skills-commands.js';
import { registerSpecs } from './specs/spec-commands.js';
import { recordCleanup } from './settings/cleanup-record.js';
import { createCloudCredentialStore } from './settings/cloud-credentials.js';
import { setCloudCredentialStore } from './runtime-config.js';
import { registerSteering } from './steering/steering-commands.js';
import { CommandRegistry } from './commands.js';
import { ForgeInlineCompletionProvider } from './completion.js';
import { CompletionState } from './completion-controls.js';
import { CompletionStatus } from './completion-status.js';
import { activateHooks } from './hooks-integration.js';
import { StatusBar } from './status.js';
import {
  CompletionTelemetry,
  TELEMETRY_ACCEPT_COMMAND,
  TELEMETRY_PARTIAL_COMMAND,
  TELEMETRY_REJECT_COMMAND,
} from './telemetry.js';
import { ignoredInWorkspaceFile, ignoredWorkspaceNotice, ignoredWorkspaceSettings } from './ignored-workspace-settings.js';
import { setLanguage, t } from './l10n.js';
import { parseSwitchLink } from './switch-link.js';

/**
 * Extension entry point. Called once when the extension activates.
 *
 * Activation is wired to `onStartupFinished` in package.json so inline
 * completions are available immediately. We register:
 *  - the sidebar chat view
 *  - the inline completion provider (all languages)
 *  - all commands
 *  - a status bar item
 *  - a config change listener that updates the status bar / re-announces the model
 */
/**
 * Corporate network + organization policy. Precedence for the proxy: managed policy, then
 * VS Code's own `http.proxy` setting, then the standard environment variables.
 */
async function setupNetworkAndPolicy(): Promise<void> {
  try {
    const policy = getOrgPolicy()?.policy;
    const vsProxy = vscode.workspace.getConfiguration('http').get<string>('proxy')?.trim();
    const env = proxyFromEnv();
    // Extra certificate authorities: the user's config file plus the machine-scoped setting. A project file cannot add one.
    const fromFile = (await loadForgeConfigFile().catch(() => undefined))?.config.caCertificates ?? [];
    const fromSetting = vscode.workspace.getConfiguration('forge').get<string[]>('caCertificates') ?? [];
    const ca = readCaCertificates([...fromFile, ...fromSetting]);
    if (ca.warnings.length > 0) void vscode.window.showWarningMessage(t('Forge: {0}', ca.warnings.join(' ')));
    await installProxy(
      {
        ...env,
        ...(vsProxy ? { https: vsProxy, http: vsProxy } : {}),
        ...(policy?.proxy ?? {}),
      },
      ca.pems
    );
    // Model limits and prices (models.dev, cached a day, bundled snapshot offline); after the proxy so it applies.
    void loadModelCatalog();
  } catch (err) {
    // A present-but-broken policy file must be visible: every agent run will refuse until it is fixed.
    void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
  }
}

/** Housekeeping from `sessionRetentionDays` in ~/.forge/config.json; unset keeps every session. Never blocks activation. */
async function pruneOldSessions(state: vscode.Memento): Promise<void> {
  try {
    const { config } = await loadForgeConfigFile();
    const result = await pruneByRetention(defaultSessionDir(), config.sessionRetentionDays);
    if (result) await recordCleanup(state, result.deleted.length);
  } catch {
    // Pruning is best effort.
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  setLanguage(context.extensionUri.fsPath);
  await setupNetworkAndPolicy();
  void pruneOldSessions(context.globalState);
  const statusBar = new StatusBar();
  const telemetry = new CompletionTelemetry();
  const credentialStore = createSecretStorageCredentialStore(context.secrets);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const hooks = await activateHooks(workspaceRoot, credentialStore);
  const proposed = new ProposedContentProvider();
  const mcpSecrets = createMcpSecretStore(context.secrets);
  const cloudCredentials = createCloudCredentialStore(context.secrets);
  setCloudCredentialStore(cloudCredentials);
  // A server's tools or prompts changed: every chat view shows its slash menu again.
  const mcpChanged = new vscode.EventEmitter<void>();
  context.subscriptions.push(mcpChanged);
  const mcp = workspaceRoot
    ? new McpManager({
        cwd: workspaceRoot,
        includeProject: vscode.workspace.isTrusted,
        onChange: () => mcpChanged.fire(),
        // Secrets entered on a server card fill the input placeholders of a server the person defined (never a project file).
        secrets: (server, id) => mcpSecrets.get(server, id),
        // Servers the person keeps duplicates of Forge's own tools on for (user config only).
        showDuplicates: async () => new Set((await loadForgeConfigFile()).config.mcpShowDuplicates ?? []),
        // OAuth sign-in for MCP servers that need it: always asked for by the user, and the page is shown only after they agree.
        oauth: {
          openUrl: async (url: string) => {
            const host = new URL(url).host;
            const go = t('Open {0}', host);
            if ((await vscode.window.showWarningMessage(t('Forge wants to open {0} in your browser so you can sign in to an MCP server.', host), { modal: true }, go)) !== go) {
              throw new Error('sign-in cancelled');
            }
            await vscode.env.openExternal(vscode.Uri.parse(url));
          },
        },
      })
    : undefined;
  const models = new ModelLister({
    store: credentialStore,
    baseUrls: () => {
      const p = readConfig().providerEnv;
      return { ollama: p.ollamaBaseUrl, lmstudio: p.lmstudioBaseUrl, 'openai-compatible': p.openaiCompatibleBaseUrl };
    },
  });
  // Output > Forge: why a completion request or a /cmd ended (completion logs at debug level: set the channel to Debug to see them).
  const forgeLog = vscode.window.createOutputChannel('Forge', { log: true });
  context.subscriptions.push(forgeLog);
  // A project's own value for a machine-scoped setting is ignored by VS Code: say so once, so it does not look like a bug (RB-12).
  // The file is read directly: inspect() hides a machine-scoped key that sits in the workspace.
  void (async () => {
    const labels = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, '.vscode', 'settings.json'));
        for (const label of ignoredWorkspaceSettings(Buffer.from(bytes).toString('utf8'))) labels.add(label);
      } catch {
        // No settings file in this folder: nothing to say.
      }
    }
    // A multi-root workspace keeps its own settings in the .code-workspace file.
    const workspaceFile = vscode.workspace.workspaceFile;
    if (workspaceFile?.scheme === 'file') {
      try {
        const bytes = await vscode.workspace.fs.readFile(workspaceFile);
        for (const label of ignoredInWorkspaceFile(Buffer.from(bytes).toString('utf8'))) labels.add(label);
      } catch {
        // Unreadable: nothing to say.
      }
    }
    const ignoredHere = [...labels];
    const ignoredNotice = ignoredWorkspaceNotice(ignoredHere);
    if (!ignoredNotice) return;
    forgeLog.warn(ignoredNotice);
    const shown = context.workspaceState.get<string>('forge.ignoredSettingsShown');
    if (shown === ignoredHere.join('|')) return;
    await context.workspaceState.update('forge.ignoredSettingsShown', ignoredHere.join('|'));
    void vscode.window.showWarningMessage(ignoredNotice);
  })();
  // The code index: the question before code goes to a remote embedder, its status item, and the command that deletes it (F12).
  const semanticUi = new SemanticUi(context, forgeLog);
  context.subscriptions.push(semanticUi, vscode.commands.registerCommand(DELETE_INDEX_COMMAND, () => semanticUi.deleteIndex()));
  const chatProvider = new ForgeChatViewProvider(context, hooks?.bus, credentialStore, proposed, mcp, models, forgeLog, mcpChanged.event);
  const makeChatProvider = (): ForgeChatViewProvider => new ForgeChatViewProvider(context, hooks?.bus, credentialStore, proposed, mcp, models, forgeLog, mcpChanged.event);
  const openTab = (): void => {
    openChatInTab(context, makeChatProvider);
  };
  const completionState = new CompletionState();
  const completionStatus = new CompletionStatus(completionState);
  const completionProvider = new ForgeInlineCompletionProvider(
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return null;
      return { uri: editor.document.uri, languageId: editor.document.languageId };
    },
    () => telemetry,
    () => readConfig().completionTelemetry,
    credentialStore,
    completionState,
    () => completionStatus.refresh(),
    forgeLog
  );

  context.subscriptions.push(
    statusBar,
    completionStatus,
    completionProvider,
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposed),
    vscode.window.registerUriHandler({ handleUri: (uri) => chatProvider.applySwitchLink(parseSwitchLink(uri.path, uri.query)) }),
    vscode.window.registerWebviewViewProvider(ForgeChatViewProvider.viewId, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      completionProvider
    )
  );

  if (hooks) {
    context.subscriptions.push({ dispose: hooks.dispose });
  }

  // Telemetry wiring. The accept command is fired by VS Code when the user
  // accepts an InlineCompletionItem that has it set on its `command` field.
  // Off when `forge.completionTelemetry` is false; we re-evaluate on every
  // config change so toggling takes effect immediately.
  //
  // The reject command is fired by ForgeInlineCompletionProvider itself
  // (completion.ts) when a shown suggestion is superseded by a new request
  // without having been accepted: VS Code's stable inline-completion API
  // has no direct "dismissed" callback, so that's the best available signal.
  //
  // The partial command has no wiring point: VS Code's stable
  // InlineCompletionItemProvider (as pinned via @types/vscode ^1.85.0) does
  // not expose a partial-accept (per-word Tab-accept) lifecycle hook, so
  // nothing currently fires this command. It's registered here for parity
  // and so it's ready to wire up if/when that API surface is adopted.
  context.subscriptions.push(
    vscode.commands.registerCommand(TELEMETRY_ACCEPT_COMMAND, () => {
      telemetry.recordAccepted();
      completionProvider.markAccepted();
    }),
    vscode.commands.registerCommand(TELEMETRY_PARTIAL_COMMAND, () => {
      telemetry.recordPartial();
    }),
    vscode.commands.registerCommand(TELEMETRY_REJECT_COMMAND, () => {
      telemetry.recordRejected();
    }),
    vscode.commands.registerCommand('forge.openChatInTab', openTab),
    vscode.commands.registerCommand('forge.openAgentManager', () => AgentManagerPanel.show(context, makeChatProvider)),
    vscode.commands.registerCommand('forge.openAgentManagerInWindow', () => AgentManagerPanel.showInNewWindow(context, makeChatProvider)),
    vscode.commands.registerCommand('forge.completion.menu', () => completionStatus.menu()),
    vscode.commands.registerCommand('forge.completion.trigger', () => vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')),
    vscode.commands.registerCommand('forge.completionTelemetry.reset', () => {
      telemetry.reset();
    })
  );

  const commands = new CommandRegistry(chatProvider, credentialStore, {
    extensionUri: context.extensionUri,
    models,
    ...(mcp ? { mcp } : {}),
    mcpSecrets,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    cleanupState: context.globalState,
    cloudCredentials,
    about: {
      version: String(context.extension.packageJSON.version),
      showLog: () => forgeLog.show(true),
      docsUrl: String(context.extension.packageJSON.homepage ?? ''),
      issuesUrl: String(context.extension.packageJSON.bugs?.url ?? ''),
    },
  });
  commands.register(context);
  registerSpecs(context, chatProvider);
  registerSteering(context, chatProvider);
  registerOnboarding(context, chatProvider, credentialStore);
  if (!workspaceRoot) registerNeedsFolderStubs(context);
  if (mcp && workspaceRoot) {
    registerMcp(context, mcp);
    registerSkills(context, workspaceRoot);
    registerImportClaude(context, workspaceRoot, mcp, () => chatProvider.reloadExtras());
    registerAgents(context, credentialStore, chatProvider);
    context.subscriptions.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        mcp.setIncludeProject(true);
        void mcp.reload();
      })
    );
  }
  context.subscriptions.push({ dispose: () => chatProvider.dispose() });

  // Update the status bar to reflect the current model. Re-evaluate on config
  // changes so the user sees the new provider/model without a reload.
  const refreshStatusBar = (): void => {
    try {
      const cfg = readConfig();
      statusBar.setModel(resolveModel(cfg));
      completionStatus.refresh();
      if (cfg.completionTelemetry) {
        statusBar.setCompletionTooltip(telemetry.formatForTooltip());
      } else {
        statusBar.clearCompletionTooltip();
      }
    } catch {
      statusBar.setModel(null);
    }
  };
  refreshStatusBar();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Check the more specific `forge.voice` section first: any change
      // under `forge.voice.*` also satisfies `affectsConfiguration('forge')`
      // (parent-section match), which would otherwise always take the
      // general branch and could surface an unrelated "no provider
      // configured" error via announceModel() for a voice-only change.
      if (e.affectsConfiguration('forge.language')) {
        setLanguage(context.extensionUri.fsPath);
        void vscode.window
          .showInformationMessage(t('Reload the window to change the language of the chat and Settings pages.'), t('Reload'))
          .then((pick) => (pick ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined));
      } else if (e.affectsConfiguration('forge.voice')) {
        // Push voice-config changes into the webview's controller without
        // a full announceModel round-trip (no need to re-resolve the model).
        void chatProvider.announceVoiceConfig();
      } else if (e.affectsConfiguration('forge')) {
        refreshStatusBar();
        void chatProvider.announceModel();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      // Could be used to refresh per-file context; currently a no-op.
    })
  );
}

/**
 * Commands that act on a workspace are contributed unconditionally; without an open
 * folder they would fail with "command not found". Answer with a hint instead.
 */
const WORKSPACE_COMMANDS = [
  'forge.spec.generate', 'forge.spec.approve', 'forge.spec.discard', 'forge.spec.runTask', 'forge.spec.runTaskCurrent',
  'forge.spec.convert', 'forge.spec.openFile', 'forge.spec.refresh',
  'forge.steering.new', 'forge.steering.toggle', 'forge.steering.open', 'forge.steering.refresh',
  'forge.mcp.browse', 'forge.mcp.reload', 'forge.mcp.signIn', 'forge.mcp.openConfig', 'forge.mcp.toggle', 'forge.mcp.remove',
  'forge.skills.browse', 'forge.skills.open', 'forge.importClaudeCode',
  'forge.agents.run', 'forge.agents.review', 'forge.agents.merge', 'forge.agents.discard', 'forge.agents.clear',
];

function registerNeedsFolderStubs(context: vscode.ExtensionContext): void {
  for (const id of WORKSPACE_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        void vscode.window.showInformationMessage(t('Forge: open a folder first. This feature works on a workspace.'));
      })
    );
  }
}

export function deactivate(): void {
  // All disposables are pushed to context.subscriptions and disposed automatically.
}

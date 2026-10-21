import * as vscode from 'vscode';

import { McpManager, defaultSessionDir, getOrgPolicy, installProxy, loadForgeConfigFile, proxyFromEnv, pruneByRetention } from '@ikarmic/forge-core';

import { readConfig, resolveModel } from './config.js';
import { ModelLister } from './model-lister.js';
import { createSecretStorageCredentialStore } from './credential-store.js';
import { ForgeChatViewProvider } from './chat/chat-view.js';
import { PROPOSED_SCHEME, ProposedContentProvider } from './chat/proposed-content-provider.js';
import { registerAgents } from './agents/agents-commands.js';
import { registerMcp } from './mcp/mcp-commands.js';
import { registerOnboarding } from './onboarding.js';
import { registerSkills } from './skills/skills-commands.js';
import { registerSpecs } from './specs/spec-commands.js';
import { registerSteering } from './steering/steering-commands.js';
import { CommandRegistry } from './commands.js';
import { ForgeInlineCompletionProvider } from './completion.js';
import { activateHooks } from './hooks-integration.js';
import { StatusBar } from './status.js';
import {
  CompletionTelemetry,
  TELEMETRY_ACCEPT_COMMAND,
  TELEMETRY_PARTIAL_COMMAND,
  TELEMETRY_REJECT_COMMAND,
} from './telemetry.js';
import { t } from './l10n.js';

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
    await installProxy({
      ...env,
      ...(vsProxy ? { https: vsProxy, http: vsProxy } : {}),
      ...(policy?.proxy ?? {}),
    });
  } catch (err) {
    // A present-but-broken policy file must be visible: every agent run will refuse until it is fixed.
    void vscode.window.showErrorMessage(t('Forge: {0}', (err as Error).message));
  }
}

/** Housekeeping from `sessionRetentionDays` in ~/.forge/config.json; unset keeps every session. Never blocks activation. */
async function pruneOldSessions(): Promise<void> {
  try {
    const { config } = await loadForgeConfigFile();
    await pruneByRetention(defaultSessionDir(), config.sessionRetentionDays);
  } catch {
    // Pruning is best effort.
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await setupNetworkAndPolicy();
  void pruneOldSessions();
  const statusBar = new StatusBar();
  const telemetry = new CompletionTelemetry();
  const credentialStore = createSecretStorageCredentialStore(context.secrets);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const hooks = await activateHooks(workspaceRoot, credentialStore);
  const proposed = new ProposedContentProvider();
  const mcp = workspaceRoot ? new McpManager({ cwd: workspaceRoot, includeProject: vscode.workspace.isTrusted }) : undefined;
  const models = new ModelLister({
    store: credentialStore,
    baseUrls: () => {
      const p = readConfig().providerEnv;
      return { ollama: p.ollamaBaseUrl, lmstudio: p.lmstudioBaseUrl, 'openai-compatible': p.openaiCompatibleBaseUrl };
    },
  });
  const chatProvider = new ForgeChatViewProvider(context, hooks?.bus, credentialStore, proposed, mcp, models);
  const completionProvider = new ForgeInlineCompletionProvider(
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return null;
      return { uri: editor.document.uri, languageId: editor.document.languageId };
    },
    () => telemetry,
    () => readConfig().completionTelemetry,
    credentialStore
  );

  context.subscriptions.push(
    statusBar,
    completionProvider,
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposed),
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
    vscode.commands.registerCommand('forge.completionTelemetry.reset', () => {
      telemetry.reset();
    })
  );

  const commands = new CommandRegistry(chatProvider, credentialStore, {
    extensionUri: context.extensionUri,
    models,
    ...(mcp ? { mcp } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
  });
  commands.register(context);
  registerSpecs(context, chatProvider);
  registerSteering(context, chatProvider);
  registerOnboarding(context, chatProvider, credentialStore);
  if (!workspaceRoot) registerNeedsFolderStubs(context);
  if (mcp && workspaceRoot) {
    registerMcp(context, mcp);
    registerSkills(context, workspaceRoot);
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
      if (e.affectsConfiguration('forge.voice')) {
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
  'forge.mcp.browse', 'forge.mcp.reload', 'forge.mcp.openConfig', 'forge.mcp.toggle', 'forge.mcp.remove',
  'forge.skills.browse', 'forge.skills.open',
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

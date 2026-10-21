/**
 * Wires the shared hooks system into the extension host for the first
 * time. One HooksBus per extension activation, used both for (a) every
 * agent run's AgentConfig.hooks and (b) a native FileSystemWatcher that
 * dispatches FileChanged independent of any active agent run.
 *
 * Trust gate: vscode.workspace.isTrusted, VS Code's own Workspace Trust
 * mechanism, rather than a bespoke opt-in flag: the CLI's own default
 * (trustedProjectHooks always false, no opt-in yet) is intentionally
 * more conservative and is NOT changed by this file.
 *
 * Known v1 limitation: trust is read once here, at activation. A later
 * trust grant via VS Code's own prompt needs a window reload to take
 * effect (not wiring onDidGrantWorkspaceTrust for live updates).
 */

import path from 'node:path';

import * as vscode from 'vscode';

import {
  createAgentHookRunner,
  FileChangeCoalescer,
  HooksBus,
  loadHooksConfig,
  shouldIgnoreWatchPath,
  type AgentHookRunner,
  type CredentialStore,
  type FileChangeType,
} from '@ikarmic/forge-core';

import { resolveModel } from './config.js';
import { loadRuntimeConfig } from './runtime-config.js';

export interface HooksIntegration {
  bus: HooksBus;
  dispose(): void;
}

/** Normalize a relative path to forward slashes regardless of OS. */
function toPosix(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/**
 * Build the HooksBus and start the native filesystem watcher for
 * `workspaceRoot`. Returns null when there is no workspace folder open
 * (matches the existing single-root assumption already in chat-view.ts
 *: `workspaceFolders?.[0]`).
 */
export async function activateHooks(
  workspaceRoot: string | undefined,
  credentialStore?: CredentialStore
): Promise<HooksIntegration | null> {
  if (!workspaceRoot) return null;

  const { config } = await loadHooksConfig(workspaceRoot);
  const shutdown = new AbortController();
  // `type: 'agent'` hooks: resolve provider + keys at run time, so a key added after
  // activation (or rotated) is picked up without a reload.
  const agentRunner: AgentHookRunner = async (req) => {
    const cfg = await loadRuntimeConfig(credentialStore);
    return createAgentHookRunner({ model: resolveModel(cfg), cwd: workspaceRoot, abortSignal: shutdown.signal })(req);
  };
  const bus = new HooksBus(config, { trustedProjectHooks: vscode.workspace.isTrusted, agentRunner });

  const coalescer = new FileChangeCoalescer((relPath, changeType) => {
    void bus.dispatch({ type: 'FileChanged', path: relPath, changeType, cwd: workspaceRoot });
  });

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, '**/*')
  );

  const onEvent = (uri: vscode.Uri, changeType: FileChangeType): void => {
    const relPath = toPosix(path.relative(workspaceRoot, uri.fsPath));
    if (relPath.length === 0 || shouldIgnoreWatchPath(relPath)) return;
    coalescer.notify(relPath, changeType);
  };

  const disposables = [
    watcher.onDidCreate((uri) => onEvent(uri, 'created')),
    watcher.onDidChange((uri) => onEvent(uri, 'modified')),
    watcher.onDidDelete((uri) => onEvent(uri, 'deleted')),
    watcher,
  ];

  return {
    bus,
    dispose(): void {
      shutdown.abort();
      coalescer.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

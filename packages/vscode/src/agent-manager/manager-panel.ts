/**
 * Agent Manager editor tab (after Kilo's): starts a prompt as up to four sessions, each a chat tab of its own
 * working in its own git worktree, and offers merge or discard when they finish. Sessions are kept in workspace
 * state; a run cannot outlive the window, so a reload shows a running session as stopped.
 */
import { randomUUID } from 'node:crypto';

import * as vscode from 'vscode';

import { openChatInTab } from '../chat/chat-tab.js';
import type { ForgeChatViewProvider } from '../chat/chat-view.js';
import { t } from '../l10n.js';
import { collectChanges, discardWorktree, mergeWorktree, prepareWorktree } from './manager-flow.js';
import { agentManagerHtml } from './manager-html.js';
import { finishSession, managerRows, newSessions, restoreSessions, type AgentSession, type SessionAction } from './manager-model.js';

const STATE_KEY = 'forge.agentManager.sessions';

export class AgentManagerPanel {
  private static current: AgentManagerPanel | undefined;

  static show(context: vscode.ExtensionContext, makeProvider: () => ForgeChatViewProvider): void {
    if (AgentManagerPanel.current) {
      AgentManagerPanel.current.panel.reveal();
      return;
    }
    AgentManagerPanel.current = new AgentManagerPanel(context, makeProvider);
  }

  private readonly panel: vscode.WebviewPanel;
  private sessions: AgentSession[];
  /** Chat tabs of sessions started in this window. */
  private readonly live = new Map<string, { panel: vscode.WebviewPanel; provider: ForgeChatViewProvider }>();
  private ticker: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly makeProvider: () => ForgeChatViewProvider
  ) {
    this.sessions = restoreSessions(context.workspaceState.get(STATE_KEY));
    this.panel = vscode.window.createWebviewPanel('forge.agentManager', t('Forge Agent Manager'), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.webview.html = agentManagerHtml({ cspSource: this.panel.webview.cspSource });
    this.panel.webview.onDidReceiveMessage((msg: { type: string; prompt?: string; count?: number; useWorktree?: boolean; auto?: boolean; id?: string; action?: SessionAction }) => {
      if (msg.type === 'ready') this.render();
      if (msg.type === 'start' && typeof msg.prompt === 'string') void this.start(msg.prompt, msg.count ?? 1, msg.useWorktree !== false, msg.auto === true);
      if (msg.type === 'action' && msg.id && msg.action) void this.act(msg.id, msg.action);
    });
    this.panel.onDidDispose(() => {
      if (this.ticker) clearInterval(this.ticker);
      AgentManagerPanel.current = undefined;
    });
  }

  private repoRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private update(id: string, change: (s: AgentSession) => AgentSession): void {
    this.sessions = this.sessions.map((s) => (s.id === id ? change(s) : s));
    void this.context.workspaceState.update(STATE_KEY, this.sessions);
    this.render();
  }

  private render(): void {
    void this.panel.webview.postMessage({ type: 'sessions', rows: managerRows(this.sessions, Date.now()) });
    const running = this.sessions.some((s) => s.status === 'running' || s.status === 'starting');
    if (running && !this.ticker) this.ticker = setInterval(() => this.render(), 1000);
    if (!running && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private async start(prompt: string, count: number, useWorktree: boolean, auto: boolean): Promise<void> {
    const root = this.repoRoot();
    if (!root) {
      void this.panel.webview.postMessage({ type: 'error', message: t('Open a folder first: sessions work in the workspace.') });
      return;
    }
    const created = newSessions({ prompt, count, useWorktree, auto }, Date.now(), randomUUID);
    this.sessions = [...created, ...this.sessions];
    this.render();
    // Each session runs on its own; the first to fail does not stop the others.
    await Promise.all(created.map((s) => this.runOne(s, root)));
  }

  private async runOne(session: AgentSession, root: string): Promise<void> {
    let cwd = root;
    if (session.useWorktree) {
      try {
        const worktree = await prepareWorktree(root, session.label);
        cwd = worktree.path;
        this.update(session.id, (s) => ({ ...s, worktree }));
      } catch (err) {
        this.update(session.id, (s) => finishSession(s, { reason: 'error', error: t('Could not create a worktree: {0}', (err as Error).message) }, Date.now()));
        return;
      }
    }
    const tab = openChatInTab(this.context, this.makeProvider, { title: session.label, column: vscode.ViewColumn.Beside, root: cwd });
    this.live.set(session.id, tab);
    tab.panel.onDidDispose(() => this.live.delete(session.id));
    this.update(session.id, (s) => ({ ...s, status: 'running' }));
    const outcome = await tab.provider.runSession(session.prompt, session.auto ? 'auto' : 'ask').catch((err: unknown) => {
      this.update(session.id, (s) => finishSession(s, { reason: 'error', error: (err as Error).message }, Date.now()));
      return undefined;
    });
    if (outcome === undefined) return;
    if (outcome === null) {
      this.update(session.id, (s) => finishSession(s, { reason: 'error', error: t('The session could not start: check the model settings in its chat tab.') }, Date.now()));
      return;
    }
    const current = this.sessions.find((s) => s.id === session.id);
    let changedFiles = outcome.files;
    if (current?.worktree) changedFiles = await collectChanges(root, current.worktree, session.prompt).catch(() => outcome.files);
    this.update(session.id, (s) => finishSession(s, { reason: outcome.reason, changedFiles }, Date.now()));
  }

  private async act(id: string, action: SessionAction): Promise<void> {
    const session = this.sessions.find((s) => s.id === id);
    const root = this.repoRoot();
    if (!session) return;
    const tab = this.live.get(id);
    switch (action) {
      case 'open':
        if (tab) tab.panel.reveal();
        else this.live.set(id, openChatInTab(this.context, this.makeProvider, { title: session.label, column: vscode.ViewColumn.Beside, ...(session.worktree ? { root: session.worktree.path } : {}) }));
        return;
      case 'stop':
        tab?.provider.cancel();
        return;
      case 'merge': {
        if (!root || !session.worktree) return;
        const merged = await mergeWorktree(root, session.worktree, session.prompt).catch((err: unknown) => ({ ok: false as const, message: (err as Error).message }));
        if (!merged.ok) {
          void this.panel.webview.postMessage({ type: 'error', message: t('Could not merge "{0}": {1}', session.label, merged.message) });
          return;
        }
        tab?.panel.dispose();
        this.update(id, (s) => ({ ...s, status: 'merged' }));
        return;
      }
      case 'discard': {
        if (!root || !session.worktree) return;
        const pick = await vscode.window.showWarningMessage(t('Delete the worktree and branch of "{0}"? Its changes are lost.', session.label), { modal: true }, t('Discard'));
        if (pick !== t('Discard')) return;
        tab?.panel.dispose();
        await discardWorktree(root, session.worktree).catch((err: unknown) => {
          void this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
        });
        this.update(id, (s) => ({ ...s, status: 'discarded' }));
        return;
      }
      case 'remove':
        this.sessions = this.sessions.filter((s) => s.id !== id);
        void this.context.workspaceState.update(STATE_KEY, this.sessions);
        this.render();
        return;
    }
  }
}

/**
 * Agent Manager editor tab (after Kilo's): starts a prompt as up to four sessions, each a chat tab of its own
 * working in its own git worktree, and offers merge or discard when they finish. Sessions are kept in workspace
 * state; a run cannot outlive the window, so a reload shows a running session as stopped.
 */
import { randomUUID } from 'node:crypto';

import { defaultBranch, doctorWorktrees, findPullRequest, githubFromEnv, openPullRequest, pruneMissingWorktrees, removeStrayFolder, repoFor, worktreeStats, type GitHubConfig, type HealthFinding } from '@ikarmic/forge-core';
import * as vscode from 'vscode';

import { openChatInTab } from '../chat/chat-tab.js';
import type { ForgeChatViewProvider } from '../chat/chat-view.js';
import { t } from '../l10n.js';
import { collectChanges, discardWorktree, mergeWorktree, prepareSetup, prepareWorktree, pushBranch, setupSettingsFrom } from './manager-flow.js';
import { agentManagerHtml } from './manager-html.js';
import { nextPollDelay, PR_POLL_MS, prDraftFor, validatePrForm } from './manager-pr.js';
import { finishSession, managerView, newSessions, pollableSessions, restoreSessions, terminalName, type AgentSession, type SessionAction } from './manager-model.js';

/** How often git is asked for ahead/behind/changed, while the panel is visible (F9). */
const STATS_INTERVAL_MS = 30_000;

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

  /** Opens the manager and moves it into a window of its own. One already moved by this command is only brought forward. */
  static showInNewWindow(context: vscode.ExtensionContext, makeProvider: () => ForgeChatViewProvider): void {
    if (!AgentManagerPanel.current) AgentManagerPanel.current = new AgentManagerPanel(context, makeProvider);
    void AgentManagerPanel.current.moveToNewWindow();
  }

  private readonly panel: vscode.WebviewPanel;
  /** Set once this panel was moved by Forge itself; a second request then only reveals it instead of making a new window. */
  private inOwnWindow = false;
  private sessions: AgentSession[];
  /** Chat tabs of sessions started in this window. */
  private readonly live = new Map<string, { panel: vscode.WebviewPanel; provider: ForgeChatViewProvider }>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private prTimer: ReturnType<typeof setTimeout> | undefined;
  private prDelay = PR_POLL_MS;
  /** One terminal per session, opened in its worktree and closed with it (F10). */
  private readonly terminals = new Map<string, vscode.Terminal>();

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
    this.panel.webview.onDidReceiveMessage((msg: { type: string; prompt?: string; count?: number; useWorktree?: boolean; auto?: boolean; id?: string; action?: SessionAction; fix?: string; path?: string; form?: unknown; taskId?: string; keepId?: string }) => {
      if (msg.type === 'ready') {
        this.render();
        this.startStats();
      }
      if (msg.type === 'health') void this.health();
      if (msg.type === 'open_window') void this.moveToNewWindow();
      if (msg.type === 'pr_create' && typeof msg.id === 'string') void this.createPr(msg.id, msg.form);
      if (msg.type === 'health_fix' && (msg.fix === 'prune' || msg.fix === 'delete-folder') && typeof msg.path === 'string') void this.fix(msg.fix, msg.path);
      if (msg.type === 'start' && typeof msg.prompt === 'string') void this.start(msg.prompt, msg.count ?? 1, msg.useWorktree !== false, msg.auto === true);
      if (msg.type === 'action' && msg.id && msg.action) void this.act(msg.id, msg.action);
      if (msg.type === 'discard_others' && typeof msg.taskId === 'string' && typeof msg.keepId === 'string') void this.discardOthers(msg.taskId, msg.keepId);
    });
    // The numbers are read only while the panel can be seen.
    this.panel.onDidChangeViewState(() => (this.panel.visible ? this.startStats() : this.stopStats()));
    const closed = vscode.window.onDidCloseTerminal((closedTerminal) => {
      for (const [id, term] of this.terminals) if (term === closedTerminal) this.terminals.delete(id);
    });
    this.panel.onDidDispose(() => {
      closed.dispose();
      this.stopStats();
      if (this.ticker) clearInterval(this.ticker);
      AgentManagerPanel.current = undefined;
    });
  }

  private async moveToNewWindow(): Promise<void> {
    this.panel.reveal(undefined, false);
    if (this.inOwnWindow) return;
    this.inOwnWindow = true;
    // The command moves the active editor, so the manager must be it: reveal first.
    await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
  }

  private repoRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /** A session's terminal goes with its worktree: a shell left in a deleted folder only confuses. */
  private async closeTerminal(id: string): Promise<void> {
    const term = this.terminals.get(id);
    if (!term) return;
    this.terminals.delete(id);
    term.dispose();
    // Windows keeps a folder locked until the shell that was in it has really gone.
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  private startStats(): void {
    this.schedulePrPoll();
    if (this.statsTimer || !this.panel.visible) return;
    void this.pollStats();
    this.statsTimer = setInterval(() => void this.pollStats(), STATS_INTERVAL_MS);
  }

  private stopStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = undefined;
    if (this.prTimer) clearTimeout(this.prTimer);
    this.prTimer = undefined;
  }

  /** A GitHub token: GITHUB_TOKEN / GH_TOKEN, else VS Code's GitHub sign-in. It is only ever handed to core's GitHub calls, never shown or logged. */
  private async githubConfig(prompt: boolean): Promise<GitHubConfig | undefined> {
    const fromEnv = githubFromEnv();
    if (fromEnv) return fromEnv;
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], prompt ? { createIfNone: true } : { createIfNone: false, silent: true });
      return session ? { token: session.accessToken } : undefined;
    } catch {
      return undefined;
    }
  }

  /** Read the status of open pull requests; a failure doubles the wait (up to ten minutes) and a success resets it. */
  private schedulePrPoll(): void {
    if (this.prTimer || !this.panel.visible) return;
    if (!this.sessions.some((s) => s.pr && s.pr.state === 'open')) return;
    this.prTimer = setTimeout(() => {
      this.prTimer = undefined;
      void this.pollPrs().then((failed) => {
        this.prDelay = nextPollDelay(this.prDelay, failed);
        this.schedulePrPoll();
      });
    }, this.prDelay);
  }

  /** Returns true when a read failed. */
  private async pollPrs(): Promise<boolean> {
    const root = this.repoRoot();
    if (!root) return false;
    const gh = await this.githubConfig(false);
    if (!gh) return false;
    let failed = false;
    try {
      const repo = await repoFor(root);
      for (const s of this.sessions) {
        if (!s.pr || s.pr.state !== 'open' || !s.worktree) continue;
        const next = await findPullRequest(gh, repo, s.worktree.branch);
        if (next && JSON.stringify(next) !== JSON.stringify(s.pr)) this.update(s.id, (cur) => ({ ...cur, pr: next }));
      }
    } catch {
      failed = true;
    }
    return failed;
  }

  /** The card's "Push and open": checked again here, then push, then open. Nothing leaves the machine before this message. */
  private async createPr(id: string, rawForm: unknown): Promise<void> {
    const session = this.sessions.find((s) => s.id === id);
    const root = this.repoRoot();
    if (!session?.worktree || !root) return;
    const form = validatePrForm(rawForm);
    if (!form.ok) {
      void this.panel.webview.postMessage({ type: 'error', message: form.message });
      return;
    }
    const gh = await this.githubConfig(false);
    if (!gh) {
      void this.panel.webview.postMessage({ type: 'error', message: t('Sign in to GitHub first, or set GITHUB_TOKEN.') });
      return;
    }
    try {
      await pushBranch(session.worktree.path, session.worktree.branch);
      const repo = await repoFor(root);
      const opened = await openPullRequest(gh, repo, { title: form.title, body: form.body, head: session.worktree.branch, base: form.base, draft: form.draft });
      const summary = (await findPullRequest(gh, repo, session.worktree.branch).catch(() => null)) ?? {
        number: opened.number, url: opened.url, state: 'open' as const, draft: opened.draft, checks: 'none' as const, review: 'none' as const,
      };
      this.update(id, (s) => ({ ...s, pr: summary }));
      this.prDelay = PR_POLL_MS;
      this.schedulePrPoll();
    } catch (err) {
      void this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
    }
  }

  /** Ahead, behind and changed-file numbers for every session that still has a worktree; read-only git. */
  private async pollStats(): Promise<void> {
    const root = this.repoRoot();
    if (!root) return;
    for (const s of pollableSessions(this.sessions)) {
      if (!s.worktree) continue;
      const stats = await worktreeStats(root, s.worktree.path, s.worktree.branch, 'HEAD');
      const same = s.stats && s.stats.ahead === stats.ahead && s.stats.behind === stats.behind && s.stats.changed === stats.changed && s.stats.added === stats.added && s.stats.removed === stats.removed;
      if (!same) this.update(s.id, (cur) => ({ ...cur, stats }));
    }
  }

  private async health(): Promise<void> {
    const root = this.repoRoot();
    if (!root) return;
    const findings = await doctorWorktrees(root).catch((): HealthFinding[] => []);
    void this.panel.webview.postMessage({ type: 'health', findings });
  }

  /** Forget listings of missing folders, or delete a stray folder: confirmed first, with the target shown, and only for a finding the doctor still reports. */
  private async fix(fix: 'prune' | 'delete-folder', target: string): Promise<void> {
    const root = this.repoRoot();
    if (!root) return;
    const current = await doctorWorktrees(root).catch((): HealthFinding[] => []);
    if (!current.some((f) => f.fix === fix && f.path === target)) {
      await this.health();
      return;
    }
    try {
      if (fix === 'prune') {
        const pick = await vscode.window.showWarningMessage(t('Forget the listings of worktrees whose folders are gone? Nothing on disk is deleted.'), { modal: true }, t('Forget'));
        if (pick !== t('Forget')) return;
        await pruneMissingWorktrees(root);
      } else {
        const pick = await vscode.window.showWarningMessage(t('Delete this folder and everything in it?'), { modal: true, detail: target }, t('Delete'));
        if (pick !== t('Delete')) return;
        await removeStrayFolder(root, target);
      }
    } catch (err) {
      void this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
    }
    await this.health();
  }

  private update(id: string, change: (s: AgentSession) => AgentSession): void {
    this.sessions = this.sessions.map((s) => (s.id === id ? change(s) : s));
    void this.context.workspaceState.update(STATE_KEY, this.sessions);
    this.render();
  }

  private render(): void {
    void this.panel.webview.postMessage({ type: 'sessions', view: managerView(this.sessions, Date.now()) });
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
        // Files the worktree needs and a setup command (F7). A failure ends the session: the agent never runs in a half-made tree.
        const cfg = vscode.workspace.getConfiguration('forge');
        const setup = await prepareSetup(root, worktree, setupSettingsFrom(cfg.inspect<string>('agentManager.setupScript'), cfg.inspect<string[]>('agentManager.copyFiles')));
        if (!setup.ok) {
          this.update(session.id, (s) => finishSession(s, { reason: 'error', error: t('Setting up the worktree failed: {0}', setup.message ?? '') }, Date.now()));
          return;
        }
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

  /** Delete one session's worktree and branch. The caller has already asked the person. */
  private async discardOne(session: AgentSession, root: string): Promise<void> {
    if (!session.worktree) return;
    this.live.get(session.id)?.panel.dispose();
    await this.closeTerminal(session.id);
    await discardWorktree(root, session.worktree).catch((err: unknown) => {
      void this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
    });
    this.update(session.id, (s) => ({ ...s, status: 'discarded' }));
  }

  /** After one version is chosen: the other versions of its task, deleted after one question that names how many. A running version is never touched. */
  private async discardOthers(taskId: string, keepId: string): Promise<void> {
    const root = this.repoRoot();
    if (!root) return;
    const others = this.sessions.filter(
      (s) => (s.taskId ?? s.id) === taskId && s.id !== keepId && s.worktree && (s.status === 'done' || s.status === 'failed' || s.status === 'stopped'),
    );
    if (others.length === 0) return;
    const message = others.length === 1 ? t('Delete the worktree and branch of the other version? Its changes are lost.') : t('Delete the worktrees and branches of the other {0} versions? Their changes are lost.', String(others.length));
    const pick = await vscode.window.showWarningMessage(message, { modal: true }, t('Discard'));
    if (pick !== t('Discard')) return;
    for (const s of others) await this.discardOne(s, root);
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
      case 'terminal': {
        if (!session.worktree) return;
        let term = this.terminals.get(id);
        if (!term || term.exitStatus !== undefined) {
          // The terminal starts in the worktree, so a command the person types lands there. Nothing is typed for them (RB-52).
          term = vscode.window.createTerminal({
            name: terminalName(session),
            cwd: session.worktree.path,
            ...(process.platform === 'win32' ? { env: { NoDefaultCurrentDirectoryInExePath: '1' } } : {}),
          });
          this.terminals.set(id, term);
        }
        term.show();
        return;
      }
      case 'pr': {
        if (!root || !session.worktree) return;
        // Reading the default branch needs the token; asking to sign in is fine here, the person pressed the button.
        const gh = await this.githubConfig(true);
        if (!gh) {
          void this.panel.webview.postMessage({ type: 'error', message: t('Sign in to GitHub first, or set GITHUB_TOKEN.') });
          return;
        }
        try {
          const repo = await repoFor(root);
          const base = await defaultBranch(gh, repo);
          void this.panel.webview.postMessage({ type: 'pr_draft', id, ...prDraftFor(session), files: session.changedFiles ?? [], base, head: session.worktree.branch, remote: `${repo.owner}/${repo.repo}` });
        } catch (err) {
          void this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
        }
        return;
      }
      case 'open-pr':
        if (session.pr?.url.startsWith('https://')) void vscode.env.openExternal(vscode.Uri.parse(session.pr.url));
        return;
      case 'stop':
        tab?.provider.cancel();
        return;
      case 'merge': {
        if (!root || !session.worktree) return;
        await this.closeTerminal(id); // a shell inside the folder would keep it from being removed
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
        await this.discardOne(session, root);
        return;
      }
      case 'remove':
        void this.closeTerminal(id);
        this.sessions = this.sessions.filter((s) => s.id !== id);
        void this.context.workspaceState.update(STATE_KEY, this.sessions);
        this.render();
        return;
    }
  }
}

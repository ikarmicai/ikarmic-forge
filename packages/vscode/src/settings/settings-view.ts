import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  BUILTIN_SPECIALISTS,
  DEFAULT_SKILL_CATALOG_URL,
  SUPPORTED_PROVIDERS,
  defaultUserMcpPath,
  discoverSkills,
  exportSettings,
  fetchSkillsCatalog,
  importSettings,
  installMcpServer,
  installSkillFromCatalog,
  listInstalledServers,
  listSpecialists,
  loadForgeConfigFile,
  loadMcpCatalog,
  loadToolSandboxConfig,
  registerMcpServer,
  saveForgeConfigFile,
  saveSpecialistsToConfig,
  saveToolSandboxConfig,
  setMcpServerDisabled,
  uninstallMcpServer,
  type CredentialStore,
  type McpManager,
} from '@ikarmic/forge-core';

import { readConfig, resolveModel } from '../config.js';
import type { ModelLister } from '../model-lister.js';
import { getModelPin, syncModelPin } from '../model-setting.js';
import { loadRuntimeConfig } from '../runtime-config.js';

import { handleSettingsMessage, markBuiltin, type SettingsDeps, type SettingsMessage } from './settings-protocol.js';
import { getSettingsHtml } from './settings-html.js';

export interface SettingsViewOptions {
  extensionUri: vscode.Uri;
  models?: ModelLister;
  mcp?: McpManager;
  workspaceRoot?: string;
}

/** Webview panel wiring: a thin VS Code adapter over handleSettingsMessage. */
export class SettingsViewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly store: CredentialStore,
    private readonly opts?: SettingsViewOptions
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const roots = this.opts ? [vscode.Uri.joinPath(this.opts.extensionUri, 'dist', 'webview')] : [];
    this.panel = vscode.window.createWebviewPanel('forge.settings', 'Forge Settings', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: roots,
    });
    if (this.opts) {
      // The tab shows the black mark on light themes and the white one on dark themes.
      this.panel.iconPath = {
        light: vscode.Uri.joinPath(this.opts.extensionUri, 'resources', 'tab-light.svg'),
        dark: vscode.Uri.joinPath(this.opts.extensionUri, 'resources', 'tab-dark.svg'),
      };
    }
    const scriptUri = this.opts
      ? this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.opts.extensionUri, 'dist', 'webview', 'settings-ui.js')).toString()
      : '';
    this.panel.webview.html = getSettingsHtml({ scriptUri, cspSource: this.panel.webview.cspSource });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    const deps = this.deps();
    this.panel.webview.onDidReceiveMessage(async (msg: SettingsMessage) => {
      const response = await handleSettingsMessage(msg, deps);
      if (response.type === 'settingsExported') {
        // A webview cannot download a file; save it through VS Code instead.
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(os.homedir(), 'forge-settings.json')), filters: { JSON: ['json'] } });
        if (target) {
          await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(JSON.stringify(response.data, null, 2)));
          void this.panel?.webview.postMessage({ type: 'notice', message: `Exported settings and custom agents to ${target.fsPath}.` });
        }
        return;
      }
      if (response.type !== 'none') void this.panel?.webview.postMessage(response);
    });
  }

  private deps(): SettingsDeps {
    const mcp = this.opts?.mcp;
    const root = this.opts?.workspaceRoot;
    const reload = async (): Promise<void> => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Reloading MCP servers' }, () => mcp!.reload());
    };
    const confirm = async (message: string, detail: string | undefined, action: string): Promise<boolean> =>
      (await vscode.window.showWarningMessage(message, { modal: true, ...(detail ? { detail } : {}) }, action)) === action;
    return {
      store: this.store,
      loadForgeConfigFile,
      saveForgeConfigFile,
      saveSpecialistsToConfig,
      listSpecialists: () => markBuiltin(listSpecialists(), BUILTIN_SPECIALISTS),
      exportSettings,
      importSettings,
      loadToolSandboxConfig,
      saveToolSandboxConfig,
      isWorkspaceTrusted: vscode.workspace.isTrusted,
      providers: SUPPORTED_PROVIDERS,
      modelPin: { get: getModelPin, sync: syncModelPin },
      ...(this.opts?.models ? { listModels: (p, refresh) => this.opts!.models!.list(p, refresh) } : {}),
      effective: async () => {
        const m = resolveModel(await loadRuntimeConfig(this.store));
        return `${m.provider}/${m.model}`;
      },
      ...(mcp
        ? {
            mcp: {
              enabled: () => readConfig().mcp.enabled,
              projectSkipped: () => !vscode.workspace.isTrusted,
              status: async () => {
                await mcp.ensureConnected();
                return mcp.status();
              },
              // MCP tools are named mcp__<server>__<tool> (core mcp-client.ts).
              tools: (name: string) => {
                const prefix = `mcp__${name}__`;
                return mcp.tools().map((t) => t.name).filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
              },
              actions: { setMcpServerDisabled, uninstallMcpServer, registerMcpServer, installMcpServer, reload },
              catalog: async () => {
                const [{ servers, warning }, installed] = await Promise.all([loadMcpCatalog(), listInstalledServers().catch(() => [])]);
                return { entries: servers, installed: installed.map((s) => s.name), ...(warning ? { warning } : {}) };
              },
              confirm,
              openConfig: async (scope: 'user' | 'workspace') => {
                const file = scope === 'workspace' && root ? path.join(root, '.forge', 'mcp.json') : defaultUserMcpPath();
                if (!existsSync(file)) {
                  await mkdir(path.dirname(file), { recursive: true });
                  await writeFile(file, '{\n  "mcpServers": {}\n}\n', 'utf8');
                }
                await vscode.window.showTextDocument(vscode.Uri.file(file));
              },
            },
          }
        : {}),
      ...(root
        ? {
            skills: {
              list: () => discoverSkills(root).catch(() => []),
              open: async (p: string) => {
                await vscode.window.showTextDocument(vscode.Uri.file(p));
              },
              catalog: async () => {
                const c = await fetchSkillsCatalog(process.env.FORGE_SKILL_CATALOG_URL ?? DEFAULT_SKILL_CATALOG_URL);
                return c ? { entries: c.skills } : null;
              },
              install: async (name: string) => {
                const c = await fetchSkillsCatalog(process.env.FORGE_SKILL_CATALOG_URL ?? DEFAULT_SKILL_CATALOG_URL);
                return c ? Boolean(await installSkillFromCatalog({ name, catalog: c })) : false;
              },
            },
          }
        : {}),
    };
  }
}

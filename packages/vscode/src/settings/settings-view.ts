import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  BUILTIN_SPECIALISTS,
  DEFAULT_SKILL_CATALOG_URL,
  loadRemoteSkills,
  SUPPORTED_PROVIDERS,
  defaultUserMcpPath,
  builtinSkills,
  discoverSkills,
  exportSettings,
  fetchSkillsCatalog,
  importSettings,
  installMcpServer,
  defaultForgeConfigPath,
  installSkillFromCatalog,
  listInstalledServers,
  listSpecialists,
  loadForgeConfigFile,
  loadMcpCatalog,
  projectConfigPath,
  loadToolSandboxConfig,
  mcpToolPrefix,
  registerMcpServer,
  saveForgeConfigFile,
  saveSpecialistsToConfig,
  saveToolSandboxConfig,
  setMcpServerDisabled,
  uninstallMcpServer,
  type CredentialStore,
  type McpManager,
  defaultSessionDir,
  envVarForProvider,
  loadSteering,
  pruneSessions,
} from '@ikarmic/forge-core';

import { readConfig, resolveModel } from '../config.js';
import { t } from '../l10n.js';
import { userServerSecretIds, type McpSecretStore } from '../mcp/mcp-secrets.js';
import type { ModelLister } from '../model-lister.js';
import { getModelPin, syncModelPin } from '../model-setting.js';
import { loadRuntimeConfig } from '../runtime-config.js';

import { KEY_PROVIDERS, applyProviderEnv, resolveApiKeysWithStore } from '../api-keys.js';
import { readCleanup, recordCleanup, type CleanupStore } from './cleanup-record.js';
import { SemanticUi } from '../semantic-ui.js';
import { AWS_CREDENTIALS, applyCloudCredentials, saveCloudCredentials, savedCloudCredentials, type CloudCredentialStore } from './cloud-credentials.js';
import { cloudProviderStatus } from './cloud-status.js';
import { createInstructionFile, scanInstructionFiles } from './instructions-scan.js';
import { handleSettingsMessage, markBuiltin, type SettingsDeps, type SettingsMessage } from './settings-protocol.js';
import { readFileSync } from 'node:fs';
import { getSettingsHtml } from './settings-html.js';
import { settingsDictionary } from './settings-i18n.js';

export interface SettingsViewOptions {
  extensionUri: vscode.Uri;
  models?: ModelLister;
  mcp?: McpManager;
  /** Where secrets entered on an MCP server card are kept. */
  mcpSecrets?: McpSecretStore;
  workspaceRoot?: string;
  /** The version, the log and the two pages the About section opens. */
  /** Where the time of the last chat cleanup is kept (the extension's global state). */
  cleanupState?: CleanupStore;
  /** Where AWS access keys entered in Settings are kept. */
  cloudCredentials?: CloudCredentialStore;
  about?: { version: string; showLog: () => void; docsUrl: string; issuesUrl: string };
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
    this.panel.webview.html = getSettingsHtml({ scriptUri, cspSource: this.panel.webview.cspSource, strings: settingsDictionary((s) => t(s)) });
    // The page shows what the code index is doing as it does it.
    const indexWatch = SemanticUi.current?.onDidChangeStatus((status) => {
      void this.panel?.webview.postMessage({ type: 'indexStatusLoaded', enabled: readConfig().semanticSearch, ...(status ? { status } : {}) });
    });
    this.panel.onDidDispose(() => {
      indexWatch?.dispose();
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

  private descriptions: Record<string, string> | undefined;

  /** The setting's help text from package.json, with its package.nls.json wording. Empty when it cannot be read. */
  private describeSetting(key: string): string {
    if (!this.descriptions) {
      this.descriptions = {};
      try {
        const root = this.opts?.extensionUri.fsPath ?? '';
        const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { contributes: { configuration: { properties: Record<string, { description?: string }> } } };
        const nls = JSON.parse(readFileSync(path.join(root, 'package.nls.json'), 'utf8')) as Record<string, string>;
        for (const [k, v] of Object.entries(pkg.contributes.configuration.properties)) {
          const ref = /^%(.+)%$/.exec(v.description ?? '')?.[1];
          this.descriptions[k] = (ref ? nls[ref] : v.description) ?? '';
        }
      } catch {
        // No descriptions is fine: the rows still work.
      }
    }
    return this.descriptions[key] ?? '';
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
      openConfig: async (scope) => {
        const root = this.opts?.workspaceRoot;
        if (scope === 'project' && !root) return;
        const file = scope === 'user' ? defaultForgeConfigPath() : projectConfigPath(root!);
        if (!existsSync(file)) {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, '{}\n', 'utf8');
        }
        await vscode.window.showTextDocument(vscode.Uri.file(file));
      },
      rows: {
        get: (key) => vscode.workspace.getConfiguration('forge').get(key.replace(/^forge\./, '')),
        update: (key, value) => Promise.resolve(vscode.workspace.getConfiguration('forge').update(key.replace(/^forge\./, ''), value, vscode.ConfigurationTarget.Global)),
        describe: (key) => this.describeSetting(key),
        confirm,
        defaultOf: (key) => vscode.workspace.getConfiguration('forge').inspect(key.replace(/^forge\./, ''))?.defaultValue,
      },
      sessions: {
        dir: defaultSessionDir(),
        prune: pruneSessions,
        confirm,
        ...(this.opts?.cleanupState
          ? { record: (n: number) => recordCleanup(this.opts!.cleanupState!, n), last: () => readCleanup(this.opts!.cleanupState!) }
          : {}),
      },
      cloud: {
        // The settings are applied over the environment, as a run applies them, so what is shown is what a run will use.
        status: async () => {
          const env: NodeJS.ProcessEnv = { ...process.env };
          applyProviderEnv(readConfig().providerEnv, env);
          // A key saved on the API keys page is put in the environment when a run starts; count it the same way.
          const saved = await resolveApiKeysWithStore(this.store, {});
          for (const provider of KEY_PROVIDERS) {
            const name = envVarForProvider(provider);
            if (saved[provider] && name) env[name] = saved[provider];
          }
          if (this.opts?.cloudCredentials) await applyCloudCredentials(this.opts.cloudCredentials, env);
          return cloudProviderStatus(env);
        },
        saved: async () => (this.opts?.cloudCredentials ? savedCloudCredentials(this.opts.cloudCredentials) : []),
        save: async (values: Record<string, string>) => {
          const store = this.opts?.cloudCredentials;
          if (!store) throw new Error('This editor cannot keep secrets.');
          await saveCloudCredentials(store, values);
        },
        clear: async () => {
          for (const f of AWS_CREDENTIALS) await this.opts?.cloudCredentials?.set(f.id, '');
        },
      },
      index: {
        status: () => ({ enabled: readConfig().semanticSearch, ...(SemanticUi.current?.status ? { status: SemanticUi.current.status } : {}) }),
        remove: async () => { await SemanticUi.current?.deleteIndex(); },
      },
      instructions: {
        scan: async () => {
          const root = this.opts?.workspaceRoot;
          const trusted = vscode.workspace.isTrusted;
          if (!root) return { folder: false, trusted, files: [], steering: 0 };
          const steering = (await loadSteering(root, { includeProject: trusted }).catch(() => ({ docs: [] }))).docs.length;
          return { folder: true, trusted, files: await scanInstructionFiles(root), steering };
        },
        open: async (name: string) => {
          const root = this.opts?.workspaceRoot;
          if (root) await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, name)));
        },
        create: async (name: string) => {
          const root = this.opts?.workspaceRoot;
          if (!root) throw new Error('Open a folder first.');
          return createInstructionFile(root, name);
        },
        newSteering: async () => { await vscode.commands.executeCommand('forge.steering.new'); },
      },
      ...(this.opts?.about
        ? {
            about: {
              version: this.opts.about.version,
              openLog: () => this.opts!.about!.showLog(),
              openLink: async (which: 'issues' | 'docs') => {
                await vscode.env.openExternal(vscode.Uri.parse(which === 'issues' ? this.opts!.about!.issuesUrl : this.opts!.about!.docsUrl));
              },
            },
          }
        : {}),
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
                const prefix = mcpToolPrefix(name);
                return mcp.tools().map((t) => t.name).filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
              },
              actions: { setMcpServerDisabled, uninstallMcpServer, registerMcpServer, installMcpServer, reload },
              signIn: (name: string) => mcp.signIn(name),
              catalog: async () => {
                const [{ servers, warning }, installed] = await Promise.all([loadMcpCatalog(), listInstalledServers().catch(() => [])]);
                return { entries: servers, installed: installed.map((s) => s.name), ...(warning ? { warning } : {}) };
              },
              confirm,
              showDuplicates: async () => (await loadForgeConfigFile()).config.mcpShowDuplicates ?? [],
              setShowDuplicates: (names: string[]) => saveForgeConfigFile({ mcpShowDuplicates: names }),
              ...(this.opts?.mcpSecrets
                ? {
                    secrets: {
                      idsOf: userServerSecretIds,
                      has: (server: string, id: string) => this.opts!.mcpSecrets!.has(server, id),
                      set: (server: string, id: string, value: string) => this.opts!.mcpSecrets!.set(server, id, value),
                    },
                  }
                : {}),
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
                // A skill built into Forge has no file: show its text in an unsaved Markdown tab.
                const builtin = builtinSkills().find((s) => s.source.path === p);
                if (builtin) {
                  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: builtin.body, language: 'markdown' }));
                  return;
                }
                await vscode.window.showTextDocument(vscode.Uri.file(p));
              },
              catalog: async () => {
                const c = await fetchSkillsCatalog(process.env.FORGE_SKILL_CATALOG_URL ?? DEFAULT_SKILL_CATALOG_URL);
                return c ? { entries: c.skills } : null;
              },
              fetchLink: async (url: string) => {
                const warnings: string[] = [];
                const got = await loadRemoteSkills(url, {});
                warnings.push(...got.warnings);
                return { skills: got.skills, warnings };
              },
              pickFile: async () => {
                const [uri] =
                  (await vscode.window.showOpenDialog({ canSelectMany: false, canSelectFolders: false, filters: { 'Skill files': ['md'] }, openLabel: 'Add skill' })) ?? [];
                if (!uri) return undefined;
                return { fileName: path.basename(uri.fsPath), content: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8') };
              },
              saveOwn: async (fileName: string, content: string) => {
                const dir = path.join(os.homedir(), '.forge', 'skills');
                await mkdir(dir, { recursive: true });
                const stem = fileName.replace(/\.md$/, '');
                for (let n = 1; ; n++) {
                  const target = path.join(dir, n === 1 ? fileName : `${stem}-${n}.md`);
                  try {
                    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
                    return target;
                  } catch (err) {
                    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
                  }
                }
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

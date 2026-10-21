/**
 * Settings webview message protocol + pure handler. Deliberately
 * vscode-free (no `import 'vscode'`, not even for types) so it's
 * testable outside the extension host, matching the pattern
 * `completion-helpers.ts`/`voice-input.ts`/`api-keys.ts` already use.
 * `settings-view.ts` is the thin vscode-dependent adapter over this.
 */
import type {
  CredentialStore,
  CustomSpecialistConfig,
  ForgeConfigFile,
  ForgeSettingsExport,
  MarketplaceEntry,
  McpServerStatus,
  ProviderName,
  SerializedToolSandbox,
  Skill,
  SkillCatalogEntry,
  SpecialistConfig,
} from '@ikarmic/forge-core';
import type {
  exportSettings as coreExportSettings,
  importSettings as coreImportSettings,
  listSpecialists as coreListSpecialists,
  loadForgeConfigFile as coreLoad,
  loadToolSandboxConfig as coreLoadSandbox,
  saveForgeConfigFile as coreSave,
  saveSpecialistsToConfig as coreSaveSpecialists,
  saveToolSandboxConfig as coreSaveSandbox,
} from '@ikarmic/forge-core';

import { envVarForProvider } from '@ikarmic/forge-core';
import { listEntries, withoutEntry } from '../chat/command-allow-store.js';
import type { ModelList } from '../model-lister.js';
import { WORKSPACE_READONLY, installEntry, removeServer, toggleServer, type McpActionDeps } from '../mcp/mcp-actions.js';
import { commandPreview, serverDescription } from '../mcp/mcp-model.js';

export type SettingsMessage =
  | { type: 'load' }
  | { type: 'save'; patch: ForgeConfigFile }
  | { type: 'setKey'; provider: ProviderName; key: string }
  | { type: 'deleteKey'; provider: ProviderName }
  | { type: 'loadAgents' }
  | { type: 'saveAgents'; agents: CustomSpecialistConfig[] }
  | { type: 'exportSettings' }
  | { type: 'importSettings'; data: ForgeSettingsExport }
  | { type: 'loadSandbox'; cwd: string }
  | { type: 'saveSandbox'; sandbox: SerializedToolSandbox }
  | { type: 'loadKeys' }
  | { type: 'loadAllowedCommands' }
  | { type: 'removeAllowedCommand'; workspace: string; command: string }
  | { type: 'loadModels'; provider: ProviderName; refresh?: boolean; test?: boolean }
  | { type: 'mcpList' }
  | { type: 'mcpToggle'; name: string }
  | { type: 'mcpRemove'; name: string }
  | { type: 'mcpReload' }
  | { type: 'mcpCatalog' }
  | { type: 'mcpInstall'; name: string }
  | { type: 'openMcpConfig'; scope: 'user' | 'workspace' }
  | { type: 'skillsList' }
  | { type: 'skillOpen'; path: string }
  | { type: 'skillCatalog' }
  | { type: 'skillInstall'; name: string };

export type SettingsResponse =
  | { type: 'loaded'; config: ForgeConfigFile; /** What the chat will actually use, e.g. "minimax/MiniMax-M3". */ effective?: string }
  | { type: 'saved'; config: ForgeConfigFile; effective?: string }
  | { type: 'keySaved'; provider: ProviderName }
  | { type: 'keyDeleted'; provider: ProviderName }
  | { type: 'agentsLoaded'; agents: readonly SpecialistConfig[] }
  | { type: 'agentsSaved' }
  | { type: 'settingsExported'; data: ForgeSettingsExport }
  | { type: 'settingsImported' }
  | { type: 'sandboxLoaded'; sandbox: SerializedToolSandbox }
  | { type: 'sandboxSaved' }
  | ({ type: 'modelsLoaded'; provider: ProviderName } & ModelList)
  | { type: 'error'; message: string }
  | { type: 'keysLoaded'; set: string[]; /** Providers whose key comes from an environment variable, with its name. */ env: Record<string, string> }
  | { type: 'mcpListed'; enabled: boolean; projectSkipped: boolean; servers: McpServerView[] }
  | { type: 'mcpCatalogListed'; entries: McpCatalogView[]; warning?: string }
  | { type: 'skillsListed'; skills: SkillView[] }
  | { type: 'allowedCommandsListed'; commands: Array<{ workspace: string; command: string }> }
  | { type: 'skillCatalogListed'; entries: SkillCatalogView[]; /** Why the catalog could not be shown. */ error?: string }
  | { type: 'notice'; message: string }
  | { type: 'none' };

export interface McpServerView {
  name: string;
  state: McpServerStatus['state'];
  scope: McpServerStatus['scope'];
  toolCount: number;
  tools: string[];
  description: string;
  error?: string;
}
export interface McpCatalogView { name: string; displayName: string; description: string; command: string; installed: boolean }
export interface SkillView { name: string; description: string; scope: Skill['source']['kind']; path: string }
export interface SkillCatalogView { name: string; displayName: string; description: string; installed: boolean }

export interface SettingsMcpDeps {
  enabled(): boolean;
  projectSkipped(): boolean;
  status(): Promise<McpServerStatus[]>;
  tools(name: string): string[];
  actions: McpActionDeps;
  catalog(): Promise<{ entries: MarketplaceEntry[]; installed: string[]; warning?: string }>;
  confirm(message: string, detail: string | undefined, action: string): Promise<boolean>;
  openConfig(scope: 'user' | 'workspace'): Promise<void>;
}

export interface SettingsSkillsDeps {
  list(): Promise<Skill[]>;
  open(path: string): Promise<void>;
  catalog(): Promise<{ entries: SkillCatalogEntry[] } | null>;
  install(name: string): Promise<boolean>;
}

export interface SettingsDeps {
  store: CredentialStore;
  loadForgeConfigFile: typeof coreLoad;
  saveForgeConfigFile: typeof coreSave;
  saveSpecialistsToConfig: typeof coreSaveSpecialists;
  listSpecialists: typeof coreListSpecialists;
  exportSettings: typeof coreExportSettings;
  importSettings: typeof coreImportSettings;
  loadToolSandboxConfig: typeof coreLoadSandbox;
  saveToolSandboxConfig: typeof coreSaveSandbox;
  isWorkspaceTrusted?: boolean;
  configPath?: string;
  specialistsPath?: string;
  /** Provider/model the user pinned in VS Code settings; shown by the page and kept in step on save. */
  modelPin?: { get: () => { provider?: string; model?: string }; sync: (next: { provider?: string | undefined; model?: string | undefined }) => Promise<void> };
  /** Lists the models a provider offers (live when it can, built-in otherwise). */
  listModels?: (provider: ProviderName, refresh: boolean) => Promise<ModelList>;
  /** Provider names whose key status the page shows. */
  providers?: readonly string[];
  /** The model the chat resolves to right now (settings, shared config and keys combined). */
  effective?: () => Promise<string | undefined>;
  mcp?: SettingsMcpDeps;
  skills?: SettingsSkillsDeps;
}

async function mcpListed(mcp: SettingsMcpDeps | undefined): Promise<SettingsResponse> {
  if (!mcp || !mcp.enabled()) return { type: 'mcpListed', enabled: false, projectSkipped: mcp?.projectSkipped() ?? false, servers: [] };
  const servers = (await mcp.status()).map((s) => ({
    name: s.name,
    state: s.state,
    scope: s.scope,
    toolCount: s.toolCount,
    tools: s.state === 'connected' ? mcp.tools(s.name) : [],
    description: serverDescription(s),
    ...(s.error ? { error: s.error } : {}),
  }));
  return { type: 'mcpListed', enabled: true, projectSkipped: mcp.projectSkipped(), servers };
}

async function findServer(mcp: SettingsMcpDeps, name: string): Promise<McpServerStatus | undefined> {
  return (await mcp.status()).find((s) => s.name === name);
}

const gone = (name: string): SettingsResponse => ({ type: 'notice', message: `MCP server "${name}" is no longer configured.` });

async function skillsListed(skills: SettingsSkillsDeps | undefined): Promise<SettingsResponse> {
  const list = skills ? await skills.list() : [];
  return { type: 'skillsListed', skills: list.map((s) => ({ name: s.name, description: s.description, scope: s.source.kind, path: s.source.path })) };
}

/** Pure message handler: no VS Code API surface, fully unit-testable. */
/**
 * Core's specialists carry no built-in flag, but the page needs one to keep built-ins out of the
 * editable list (saving them would write them back as overrides). Built-ins are told apart by identity.
 */
export function markBuiltin<T extends object>(list: readonly T[], builtins: readonly T[]): Array<T & { builtin?: boolean }> {
  return list.map((s) => (builtins.includes(s) ? { ...s, builtin: true } : s));
}

/** The page shows what the chat really uses: a value pinned in VS Code settings wins over the shared file. */
function withPin(config: ForgeConfigFile, deps: SettingsDeps): ForgeConfigFile {
  const pin = deps.modelPin?.get() ?? {};
  return { ...config, ...(pin.provider ? { provider: pin.provider as ProviderName } : {}), ...(pin.model ? { model: pin.model } : {}) };
}

export async function handleSettingsMessage(msg: SettingsMessage, deps: SettingsDeps): Promise<SettingsResponse> {
  try {
    switch (msg.type) {
      case 'load': {
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        const effective = await deps.effective?.().catch(() => undefined);
        return { type: 'loaded', config: withPin(config, deps), ...(effective ? { effective } : {}) };
      }
      case 'save': {
        // null means "clear this key": spreading undefined over the file's value drops it when written.
        const patch = Object.fromEntries(Object.entries(msg.patch).map(([k, v]) => [k, v === null ? undefined : v])) as ForgeConfigFile;
        await deps.saveForgeConfigFile(patch, deps.configPath);
        // A pinned VS Code value would override what was just saved, so keep it in step.
        const touched: { provider?: string | undefined; model?: string | undefined } = {};
        if ('provider' in msg.patch) touched.provider = patch.provider || undefined;
        if ('model' in msg.patch) touched.model = patch.model || undefined;
        if (Object.keys(touched).length) await deps.modelPin?.sync(touched);
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        const effective = await deps.effective?.().catch(() => undefined);
        return { type: 'saved', config: withPin(config, deps), ...(effective ? { effective } : {}) };
      }
      case 'loadAllowedCommands': {
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        return { type: 'allowedCommandsListed', commands: listEntries(config.autoApproveCommands) };
      }
      case 'removeAllowedCommand': {
        if (typeof msg.workspace !== 'string' || typeof msg.command !== 'string') return { type: 'error', message: 'Invalid request.' };
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        const next = withoutEntry(config.autoApproveCommands, msg.workspace, msg.command);
        await deps.saveForgeConfigFile({ autoApproveCommands: next }, deps.configPath);
        return { type: 'allowedCommandsListed', commands: listEntries(next) };
      }
      case 'setKey': {
        await deps.store.set(msg.provider, msg.key);
        return { type: 'keySaved', provider: msg.provider };
      }
      case 'deleteKey': {
        await deps.store.delete(msg.provider);
        return { type: 'keyDeleted', provider: msg.provider };
      }
      case 'loadAgents': {
        return { type: 'agentsLoaded', agents: deps.listSpecialists() };
      }
      case 'saveAgents': {
        await deps.saveSpecialistsToConfig(msg.agents, deps.specialistsPath);
        return { type: 'agentsSaved' };
      }
      case 'exportSettings': {
        const data = await deps.exportSettings({ configPath: deps.configPath, specialistsPath: deps.specialistsPath });
        return { type: 'settingsExported', data };
      }
      case 'importSettings': {
        await deps.importSettings(msg.data, { configPath: deps.configPath, specialistsPath: deps.specialistsPath });
        return { type: 'settingsImported' };
      }
      case 'loadSandbox': {
        const { sandbox } = await deps.loadToolSandboxConfig(msg.cwd, {
          trustedProjectSettings: deps.isWorkspaceTrusted ?? false,
        });
        // Core compiles command/URL rules to RegExp, which postMessage would turn into {}.
        return { type: 'sandboxLoaded', sandbox: JSON.parse(JSON.stringify(sandbox, (_k, v) => (v instanceof RegExp ? v.source : v))) as SerializedToolSandbox };
      }
      case 'saveSandbox': {
        await deps.saveToolSandboxConfig(msg.sandbox, deps.configPath);
        return { type: 'sandboxSaved' };
      }
      case 'loadModels': {
        if (!deps.listModels) return { type: 'none' };
        return { type: 'modelsLoaded', provider: msg.provider, ...(await deps.listModels(msg.provider, msg.refresh === true)) };
      }
      case 'loadKeys': {
        const set: string[] = [];
        const env: Record<string, string> = {};
        for (const p of deps.providers ?? []) {
          if (await deps.store.get(p as ProviderName)) {
            set.push(p);
            continue;
          }
          const name = envVarForProvider(p as ProviderName);
          if (name && process.env[name]) env[p] = name;
        }
        return { type: 'keysLoaded', set, env };
      }
      case 'mcpList':
        return mcpListed(deps.mcp);
      case 'mcpReload':
        if (deps.mcp) await deps.mcp.actions.reload();
        return mcpListed(deps.mcp);
      case 'mcpToggle': {
        if (!deps.mcp) return mcpListed(deps.mcp);
        const s = await findServer(deps.mcp, msg.name);
        if (!s) return gone(msg.name);
        const r = await toggleServer(s, deps.mcp.actions);
        return r.ok ? mcpListed(deps.mcp) : { type: 'notice', message: r.message };
      }
      case 'mcpRemove': {
        if (!deps.mcp) return mcpListed(deps.mcp);
        const s = await findServer(deps.mcp, msg.name);
        if (!s) return gone(msg.name);
        if (s.scope === 'workspace') return { type: 'notice', message: WORKSPACE_READONLY };
        if (!(await deps.mcp.confirm(`Remove MCP server "${s.name}"?`, undefined, 'Remove'))) return { type: 'none' };
        const r = await removeServer(s, deps.mcp.actions);
        return r.ok ? mcpListed(deps.mcp) : { type: 'notice', message: r.message };
      }
      case 'mcpCatalog': {
        if (!deps.mcp) return { type: 'mcpCatalogListed', entries: [] };
        const { entries, installed, warning } = await deps.mcp.catalog();
        const have = new Set(installed);
        return {
          type: 'mcpCatalogListed',
          entries: entries.map((e) => ({ name: e.name, displayName: e.displayName, description: e.description, command: commandPreview(e), installed: have.has(e.name) })),
          ...(warning ? { warning } : {}),
        };
      }
      case 'mcpInstall': {
        if (!deps.mcp) return mcpListed(deps.mcp);
        const { entries, installed } = await deps.mcp.catalog();
        const entry = entries.find((e) => e.name === msg.name);
        if (!entry) return { type: 'notice', message: `"${msg.name}" is not in the MCP catalog.` };
        if (installed.includes(entry.name)) return { type: 'notice', message: `"${entry.displayName}" is already installed.` };
        const ok = await deps.mcp.confirm(
          `Install MCP server "${entry.displayName}"?`,
          `Forge will run this on your machine whenever the server starts:\n\n${commandPreview(entry)}\n\nOnly install servers you trust.`,
          'Install'
        );
        if (!ok) return { type: 'none' };
        const r = await installEntry(entry, deps.mcp.actions);
        return r.ok ? mcpListed(deps.mcp) : { type: 'notice', message: r.message };
      }
      case 'openMcpConfig':
        if (deps.mcp) await deps.mcp.openConfig(msg.scope);
        return { type: 'none' };
      case 'skillsList':
        return skillsListed(deps.skills);
      case 'skillOpen': {
        if (!deps.skills) return { type: 'none' };
        const known = (await deps.skills.list()).some((s) => s.source.path === msg.path);
        if (known) await deps.skills.open(msg.path);
        return { type: 'none' };
      }
      case 'skillCatalog': {
        const catalog = deps.skills ? await deps.skills.catalog() : null;
        if (!catalog) {
          return {
            type: 'skillCatalogListed',
            entries: [],
            error: 'Could not load the skills catalog. Check your connection, or set FORGE_SKILL_CATALOG_URL to a catalog you host.',
          };
        }
        const have = new Set((await deps.skills!.list()).map((s) => s.name));
        return {
          type: 'skillCatalogListed',
          entries: catalog.entries.map((e) => ({ name: e.name, displayName: e.displayName, description: e.description, installed: have.has(e.name) })),
        };
      }
      case 'skillInstall': {
        if (!deps.skills) return { type: 'none' };
        const ok = await deps.skills.install(msg.name);
        if (!ok) return { type: 'notice', message: `Could not install skill "${msg.name}".` };
        return skillsListed(deps.skills);
      }
    }
  } catch (err) {
    return { type: 'error', message: (err as Error).message };
  }
}

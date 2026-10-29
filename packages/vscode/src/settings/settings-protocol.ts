/**
 * Settings webview message protocol + pure handler. Deliberately
 * vscode-free (no `import 'vscode'`, not even for types) so it's
 * testable outside the extension host, matching the pattern
 * `completion-helpers.ts`/`voice-input.ts`/`api-keys.ts` already use.
 * `settings-view.ts` is the thin vscode-dependent adapter over this.
 */
import type {
  CredentialStore,
  SemanticStatus,
  CustomProviderConfig,
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
  pruneSessions as corePruneSessions,
  importSettings as coreImportSettings,
  listSpecialists as coreListSpecialists,
  loadForgeConfigFile as coreLoad,
  loadToolSandboxConfig as coreLoadSandbox,
  saveForgeConfigFile as coreSave,
  saveSpecialistsToConfig as coreSaveSpecialists,
  saveToolSandboxConfig as coreSaveSandbox,
} from '@ikarmic/forge-core';

import { BUILTIN_MCP_CATALOG, PROVIDER_PRESETS, assertValidServerName, customProviderProblems, envVarForProvider, parseAddInput, parseSkill, placeholdersIn } from '@ikarmic/forge-core';
import { listEntries, withoutEntry } from '../chat/command-allow-store.js';
import type { ModelList } from '../model-lister.js';
import { WORKSPACE_READONLY, installEntry, removeServer, toggleServer, type McpActionDeps } from '../mcp/mcp-actions.js';
import { commandPreview, serverDescription } from '../mcp/mcp-model.js';
import type { CleanupRecord } from './cleanup-record.js';
import { AWS_CREDENTIALS, cloudCredentialProblem } from './cloud-credentials.js';
import type { CloudProviderStatus } from './cloud-status.js';
import { isInstructionName, type InstructionFileView } from './instructions-scan.js';
import { SETTING_ROWS, SHORT_HELP, coerceRow, type SettingRow } from './settings-rows.js';

export type SettingsMessage =
  | { type: 'load' }
  | { type: 'save'; patch: ForgeConfigFile }
  | { type: 'setKey'; provider: ProviderName; key: string }
  | { type: 'deleteKey'; provider: ProviderName }
  | { type: 'loadAgents' }
  | { type: 'saveAgents'; agents: CustomSpecialistConfig[] }
  | { type: 'exportSettings' }
  | { type: 'resetRows' }
  | { type: 'pruneChats' }
  | { type: 'loadIndexStatus' }
  | { type: 'loadCloudStatus' }
  | { type: 'loadCleanup' }
  | { type: 'cloudCredentialSet'; values: Record<string, string> }
  | { type: 'cloudCredentialClear' }
  | { type: 'deleteIndex' }
  | { type: 'loadInstructions' }
  | { type: 'instructionOpen'; name: string }
  | { type: 'instructionCreate'; name: string }
  | { type: 'steeringNew' }
  | { type: 'loadAbout' }
  | { type: 'aboutOpen'; what: 'log' | 'issues' | 'docs' }
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
  | { type: 'mcpSignIn'; name: string }
  /** Read pasted text (a command, a link or JSON) and say what would be added, without adding anything. */
  | { type: 'mcpAddPreview'; text: string }
  /** Add the server the pasted text describes, under `name`, after the person confirms the exact command. */
  | { type: 'mcpAddConfirm'; name: string; text: string }
  /** Show or hide, for one server, the tools that repeat a Forge tool. */
  | { type: 'mcpOverlapToggle'; name: string }
  /** Store (or, with an empty value, remove) a secret a server spec asks for as an input placeholder. */
  | { type: 'mcpSecretSet'; server: string; id: string; value: string }
  | { type: 'mcpCatalog' }
  /** `secretValues` holds what was typed into the card's secret fields, by field id. */
  | { type: 'mcpInstall'; name: string; secretValues?: Record<string, string> }
  | { type: 'openMcpConfig'; scope: 'user' | 'workspace' }
  | { type: 'skillsList' }
  /** Switch a skill off (or back on) by name: the model never sees a switched-off skill. */
  | { type: 'skillToggle'; name: string }
  /** Add the skills at an https address (a skill file or a skill index) to the user's skill paths, after reading them. */
  | { type: 'skillAddLink'; url: string }
  /** Let the person choose a skill file and copy it into their skills folder. */
  | { type: 'skillAddFile' }
  | { type: 'skillOpen'; path: string }
  | { type: 'skillCatalog' }
  | { type: 'skillInstall'; name: string }
  | { type: 'openConfig'; scope: 'user' | 'project' }
  | { type: 'loadProviders' }
  | { type: 'saveProvider'; provider: ProviderInput }
  | { type: 'deleteProvider'; id: string }
  | { type: 'loadRows' }
  | { type: 'setRow'; key: string; value: unknown };

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
  | { type: 'mcpAddPreviewed'; ok: true; name: string; kind: 'command' | 'link' | 'json'; command: string; environment: string[]; secrets: string[]; variables: string[] }
  | { type: 'mcpAddPreviewed'; ok: false; reason: string }
  | { type: 'mcpCatalogListed'; entries: McpCatalogView[]; warning?: string }
  | { type: 'skillsListed'; skills: SkillView[]; /** Something the person should know about what was just added. */ note?: string }
  | { type: 'allowedCommandsListed'; commands: Array<{ workspace: string; command: string }> }
  | { type: 'skillCatalogListed'; entries: SkillCatalogView[]; /** Why the catalog could not be shown. */ error?: string }
  | { type: 'providersLoaded'; providers: ProviderView[]; presets: Array<{ id: string; name: string; baseUrl: string; apiKeyEnv: string }> }
  | { type: 'rowsLoaded'; rows: SettingRowView[] }
  | { type: 'aboutLoaded'; version: string }
  | { type: 'indexStatusLoaded'; enabled: boolean; status?: SemanticStatus }
  | { type: 'cloudStatusLoaded'; providers: CloudProviderStatus[]; /** Ids of the access key fields that have a saved value, never the values. */ saved: string[]; awsFields: Array<{ id: string; label: string; help: string; optional?: boolean }> }
  | { type: 'cleanupLoaded'; last?: CleanupRecord }
  | { type: 'instructionsLoaded'; folder: boolean; trusted: boolean; files: InstructionFileView[]; steering: number }
  | { type: 'rowSaved'; key: string; value: unknown }
  | { type: 'rowError'; key: string; message: string }
  | { type: 'notice'; message: string }
  | { type: 'none' };

/** What the Providers page sends for one provider; a field left out keeps what is stored, an empty string clears it. */
export interface ProviderInput {
  id: string;
  name?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  /** Written as plain text to the config file; never sent back to the page. */
  apiKey?: string;
  api?: 'openai-compatible' | 'anthropic';
  timeoutMs?: number | '';
  chunkTimeoutMs?: number | '';
}

/** A provider as the page shows it: never the key itself, only whether one is stored. */
export interface ProviderView {
  id: string;
  name: string;
  baseUrl: string;
  api: 'openai-compatible' | 'anthropic';
  apiKeyEnv?: string;
  hasInlineKey: boolean;
  timeoutMs?: number | undefined;
  chunkTimeoutMs?: number | undefined;
  models: number;
}

function providerViews(custom: Record<string, CustomProviderConfig> | undefined): ProviderView[] {
  return Object.entries(custom ?? {}).map(([id, c]) => ({
    id,
    name: c.name ?? PROVIDER_PRESETS[id]?.name ?? id,
    baseUrl: c.baseUrl ?? PROVIDER_PRESETS[id]?.baseUrl ?? '',
    api: c.api ?? PROVIDER_PRESETS[id]?.api ?? 'openai-compatible',
    ...(c.apiKeyEnv ?? PROVIDER_PRESETS[id]?.apiKeyEnv ? { apiKeyEnv: (c.apiKeyEnv ?? PROVIDER_PRESETS[id]?.apiKeyEnv)! } : {}),
    hasInlineKey: Boolean(c.apiKey),
    timeoutMs: c.timeoutMs,
    chunkTimeoutMs: c.chunkTimeoutMs,
    models: Object.keys(c.models ?? {}).length,
  }));
}

const presetList = (): Array<{ id: string; name: string; baseUrl: string; apiKeyEnv: string }> =>
  Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({ id, name: p.name, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv }));

/** Merge the page's fields over a stored provider: undefined keeps, an empty string clears, a value sets. */
function mergeProvider(existing: CustomProviderConfig | undefined, input: ProviderInput): CustomProviderConfig {
  const out: Record<string, unknown> = { ...(existing ?? {}) };
  const fields: Array<keyof ProviderInput> = ['name', 'baseUrl', 'apiKeyEnv', 'apiKey', 'api', 'timeoutMs', 'chunkTimeoutMs'];
  for (const f of fields) {
    const v = input[f];
    if (v === undefined) continue;
    if (v === '') delete out[f];
    else out[f] = typeof v === 'string' ? v.trim() : v;
  }
  return out as CustomProviderConfig;
}

/** A `forge.*` setting row with the text and value the page shows. */
export type SettingRowView = SettingRow & { description: string; value: unknown; default?: unknown };

export interface SettingsRowsDeps {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
  describe(key: string): string;
  /** The setting's default from package.json, so a row can offer "Reset". */
  defaultOf?(key: string): unknown;
  /** Ask the person before something that cannot be undone. Absent where there is no way to ask. */
  confirm?(message: string, detail: string | undefined, action: string): Promise<boolean>;
}

export interface McpServerView {
  name: string;
  state: McpServerStatus['state'];
  scope: McpServerStatus['scope'];
  toolCount: number;
  tools: string[];
  description: string;
  /** Secrets the server spec asks for and whether each is stored. Never the value. */
  secrets?: Array<{ id: string; label: string; set: boolean }>;
  /** Tools hidden because Forge already has one that does the same job. */
  hiddenToolCount?: number;
  /** True when the person chose to keep those tools on for this server. */
  overlapShown?: boolean;
  error?: string;
}
export interface McpCatalogView {
  name: string;
  displayName: string;
  description: string;
  command: string;
  installed: boolean;
  /** The group the card is listed under. */
  vertical: string;
  /** A hosted address rather than a program started on this machine. */
  remote: boolean;
  /** Secrets to ask for on the card; the values are sent back with the install request. */
  secrets: Array<{ id: string; label: string; help: string }>;
}
export interface SkillView { name: string; description: string; scope: Skill['source']['kind']; path: string; enabled: boolean }
export interface SkillCatalogView { name: string; displayName: string; description: string; installed: boolean }

export interface SettingsMcpDeps {
  enabled(): boolean;
  projectSkipped(): boolean;
  status(): Promise<McpServerStatus[]>;
  tools(name: string): string[];
  actions: McpActionDeps;
  /** Sign in to a server that needs it (opens the browser). Absent where there is no way to do that. */
  signIn?(name: string): Promise<void>;
  catalog(): Promise<{ entries: MarketplaceEntry[]; installed: string[]; warning?: string }>;
  confirm(message: string, detail: string | undefined, action: string): Promise<boolean>;
  openConfig(scope: 'user' | 'workspace'): Promise<void>;
  /** Servers (by name) the person keeps duplicate tools on for. Read from and written to the user config. */
  showDuplicates?(): Promise<string[]>;
  setShowDuplicates?(names: string[]): Promise<void>;
  /** Secrets entered on a server card. Absent where there is no secret storage. */
  secrets?: {
    /** The ids the server spec asks for as input placeholders. */
    idsOf(server: string): Promise<string[]>;
    has(server: string, id: string): Promise<boolean>;
    /** An empty value removes the secret. */
    set(server: string, id: string, value: string): Promise<void>;
  };
}

export interface SettingsSkillsDeps {
  list(): Promise<Skill[]>;
  open(path: string): Promise<void>;
  catalog(): Promise<{ entries: SkillCatalogEntry[] } | null>;
  install(name: string): Promise<boolean>;
  /** Read the skills at an https address without adding them. */
  fetchLink?(url: string): Promise<{ skills: Skill[]; warnings: string[] }>;
  /** Ask the person to choose a skill file. Undefined when they close the chooser. */
  pickFile?(): Promise<{ fileName: string; content: string } | undefined>;
  /** Copy a skill file into the person's skills folder without overwriting one; returns where it went. */
  saveOwn?(fileName: string, content: string): Promise<string>;
}

/** What the About section shows and opens. The page names a destination; the extension holds the addresses. */
export interface SettingsAboutDeps {
  version: string;
  openLog(): void;
  openLink(which: 'issues' | 'docs'): Promise<void>;
}

/** The instruction files in the workspace root: what is there, and how to open or start one. */
export interface SettingsInstructionsDeps {
  scan(): Promise<{ folder: boolean; trusted: boolean; files: InstructionFileView[]; steering: number }>;
  open(name: string): Promise<void>;
  create(name: string): Promise<'created' | 'exists'>;
  newSteering(): Promise<void>;
}

/** What Forge finds for the cloud-account providers (Bedrock, Vertex, Azure), read the way a run reads it. */
export interface SettingsCloudDeps {
  status(): Promise<CloudProviderStatus[]>;
  /** Which access key fields have a saved value. */
  saved?(): Promise<string[]>;
  /** Keep the AWS access keys in secret storage. */
  save?(values: Record<string, string>): Promise<void>;
  /** Forget the saved AWS access keys. */
  clear?(): Promise<void>;
}

/** The code index: whether search by meaning is on, what the index last said, and a way to delete it (which asks first). */
export interface SettingsIndexDeps {
  status(): { enabled: boolean; status?: SemanticStatus };
  remove(): Promise<void>;
}

/** Where saved chats live, and how to delete the old ones. */
export interface SettingsSessionsDeps {
  dir: string;
  prune: typeof corePruneSessions;
  confirm(message: string, detail: string | undefined, action: string): Promise<boolean>;
  /** Remember that a cleanup ran, and how many chats it deleted. */
  record?(deleted: number): Promise<void>;
  /** The last cleanup, from this window's start or a request. */
  last?(): CleanupRecord | undefined;
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
  /** Reads and writes the `forge.*` VS Code settings behind the Context, Safety, Tools, Git and Advanced pages. */
  rows?: SettingsRowsDeps;
  about?: SettingsAboutDeps;
  sessions?: SettingsSessionsDeps;
  instructions?: SettingsInstructionsDeps;
  index?: SettingsIndexDeps;
  cloud?: SettingsCloudDeps;
  /** Opens `~/.forge/config.json` or the workspace's `.forge/config.json` in the editor, creating it when missing. */
  openConfig?: (scope: 'user' | 'project') => Promise<void>;
}

/** A stored secret named in words: the catalog's label for a built-in server, else the id in sentence case. */
function secretLabel(server: string, id: string): string {
  const fromCatalog = BUILTIN_MCP_CATALOG.find((e) => e.name === server)?.secrets?.find((f) => f.id === id)?.label;
  if (fromCatalog) return fromCatalog;
  const words = id.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function mcpListed(mcp: SettingsMcpDeps | undefined): Promise<SettingsResponse> {
  if (!mcp || !mcp.enabled()) return { type: 'mcpListed', enabled: false, projectSkipped: mcp?.projectSkipped() ?? false, servers: [] };
  const shown = new Set((await mcp.showDuplicates?.()) ?? []);
  const servers: McpServerView[] = await Promise.all(
    (await mcp.status()).map(async (s) => {
      // Only a server the person defined can use stored secrets; a project file never reaches the store.
      const ids = s.scope === 'user' && mcp.secrets ? await mcp.secrets.idsOf(s.name) : [];
      const secrets = await Promise.all(ids.map(async (id) => ({ id, label: secretLabel(s.name, id), set: await mcp.secrets!.has(s.name, id) })));
      return {
        name: s.name,
        state: s.state,
        scope: s.scope,
        toolCount: s.toolCount,
        tools: s.state === 'connected' ? mcp.tools(s.name) : [],
        description: serverDescription(s),
        ...(secrets.length ? { secrets } : {}),
        ...(s.hiddenToolCount ? { hiddenToolCount: s.hiddenToolCount, overlapShown: shown.has(s.name) } : shown.has(s.name) ? { overlapShown: true } : {}),
        ...(s.error ? { error: s.error } : {}),
      };
    })
  );
  return { type: 'mcpListed', enabled: true, projectSkipped: mcp.projectSkipped(), servers };
}

async function findServer(mcp: SettingsMcpDeps, name: string): Promise<McpServerStatus | undefined> {
  return (await mcp.status()).find((s) => s.name === name);
}

/** The command or address a spec runs, exactly as shown before the person agrees. */
function specPreview(spec: { command?: string; args?: string[]; url?: string }): string {
  return spec.command ? [spec.command, ...(spec.args ?? [])].join(' ') : (spec.url ?? '');
}

/** The variables and headers a spec would set, one per line, shown next to the command: they change what runs. */
function specEnvironment(spec: { env?: Record<string, string>; headers?: Record<string, string> }): string[] {
  return [...Object.entries(spec.env ?? {}).map(([k, v]) => `${k}=${v}`), ...Object.entries(spec.headers ?? {}).map(([k, v]) => `${k}: ${v}`)];
}

const gone = (name: string): SettingsResponse => ({ type: 'notice', message: `MCP server "${name}" is no longer configured.` });

async function skillsListed(deps: SettingsDeps, note?: string): Promise<SettingsResponse> {
  if (!deps.skills) return { type: 'skillsListed', skills: [] };
  const list = await deps.skills.list();
  const off = new Set((await deps.loadForgeConfigFile(deps.configPath)).config.disabledSkills ?? []);
  return { type: 'skillsListed', skills: list.map((s) => ({ name: s.name, description: s.description, scope: s.source.kind, path: s.source.path, enabled: !off.has(s.name) })), ...(note ? { note } : {}) };
}

/** Pure message handler: no VS Code API surface, fully unit-testable. */
/**
 * Core's specialists carry no built-in flag, but the page needs one to keep built-ins out of the
 * editable list (saving them would write them back as overrides). Built-ins are told apart by identity.
 */
export function markBuiltin<T extends object>(list: readonly T[], builtins: readonly T[]): Array<T & { builtin?: boolean }> {
  return list.map((s) => (isBuiltinOrCopy(s, builtins) ? withoutPrompt(s) : s));
}

/** A built-in, or a saved word-for-word copy of one (same id and prompt): it is Forge's agent, not the person's. */
function isBuiltinOrCopy(s: object, builtins: readonly object[]): boolean {
  if (builtins.includes(s)) return true;
  const { id, systemPrompt } = s as { id?: unknown; systemPrompt?: unknown };
  return builtins.some((b) => (b as { id?: unknown }).id === id && (b as { systemPrompt?: unknown }).systemPrompt === systemPrompt);
}

/** The prompts of the built-in agents are Forge's own work (RB-54): the page gets the name and description only. */
function withoutPrompt<T extends object>(s: T): T & { builtin: true } {
  const { systemPrompt: _prompt, ...rest } = s as T & { systemPrompt?: unknown };
  return { ...rest, builtin: true } as unknown as T & { builtin: true };
}

/** The page shows what the chat really uses: a value pinned in VS Code settings wins over the shared file. */
function withPin(config: ForgeConfigFile, deps: SettingsDeps): ForgeConfigFile {
  const pin = deps.modelPin?.get() ?? {};
  return { ...config, ...(pin.provider ? { provider: pin.provider as ProviderName } : {}), ...(pin.model ? { model: pin.model } : {}) };
}

async function cloudListed(cloud: SettingsCloudDeps): Promise<SettingsResponse> {
  return {
    type: 'cloudStatusLoaded',
    providers: await cloud.status(),
    saved: (await cloud.saved?.()) ?? [],
    awsFields: AWS_CREDENTIALS.map(({ id, label, help, optional }) => ({ id, label, help, ...(optional ? { optional } : {}) })),
  };
}

function rowsListed(rows: SettingsRowsDeps | undefined): SettingsResponse {
  if (!rows) return { type: 'rowsLoaded', rows: [] };
  return { type: 'rowsLoaded', rows: SETTING_ROWS.map((r) => ({ ...r, description: SHORT_HELP[r.key] ?? rows.describe(r.key), value: rows.get(r.key), default: rows.defaultOf?.(r.key) })) };
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
      case 'mcpSignIn': {
        if (!deps.mcp?.signIn) return mcpListed(deps.mcp);
        if (!(await findServer(deps.mcp, msg.name))) return gone(msg.name);
        try {
          await deps.mcp.signIn(msg.name);
        } catch (err) {
          return { type: 'notice', message: `Sign-in to "${msg.name}" did not finish: ${(err as Error).message}` };
        }
        return mcpListed(deps.mcp);
      }
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
        // removeServer forgets the server's stored secrets itself (RB-106), so the Command Palette gets the same.
        const r = await removeServer(s, { ...deps.mcp.actions, ...(deps.mcp.secrets ? { secrets: deps.mcp.secrets } : {}) });
        return r.ok ? mcpListed(deps.mcp) : { type: 'notice', message: r.message };
      }
      case 'mcpAddPreview': {
        const r = parseAddInput(msg.text);
        if (!r.ok) return { type: 'mcpAddPreviewed', ok: false, reason: r.reason };
        const { secrets, variables } = placeholdersIn(r.spec);
        return { type: 'mcpAddPreviewed', ok: true, name: r.name, kind: r.kind, command: specPreview(r.spec), environment: specEnvironment(r.spec), secrets, variables };
      }
      case 'mcpAddConfirm': {
        if (!deps.mcp) return mcpListed(deps.mcp);
        const r = parseAddInput(msg.text);
        if (!r.ok) return { type: 'notice', message: r.reason };
        try {
          assertValidServerName(msg.name);
        } catch (err) {
          return { type: 'notice', message: (err as Error).message };
        }
        const { installed } = await deps.mcp.catalog();
        if (installed.includes(msg.name)) return { type: 'notice', message: `You already have a server named "${msg.name}". Pick another name.` };
        const ok = await deps.mcp.confirm(
          `Add MCP server "${msg.name}"?`,
          `Forge will run this on your machine whenever the server starts:\n\n${[specPreview(r.spec), ...specEnvironment(r.spec)].join('\n')}\n\nOnly add servers you trust.`,
          'Add'
        );
        if (!ok) return { type: 'none' };
        try {
          await deps.mcp.actions.registerMcpServer({ name: msg.name, spec: r.spec });
        } catch (err) {
          return { type: 'notice', message: `Could not add "${msg.name}": ${(err as Error).message}` };
        }
        await deps.mcp.actions.reload();
        return mcpListed(deps.mcp);
      }
      case 'mcpOverlapToggle': {
        if (!deps.mcp?.showDuplicates || !deps.mcp.setShowDuplicates) return { type: 'none' };
        const s = await findServer(deps.mcp, msg.name);
        if (!s) return gone(msg.name);
        if (s.scope === 'workspace') return { type: 'notice', message: WORKSPACE_READONLY };
        const current = await deps.mcp.showDuplicates();
        const next = current.includes(s.name) ? current.filter((n) => n !== s.name) : [...current, s.name];
        await deps.mcp.setShowDuplicates(next);
        await deps.mcp.actions.reload();
        return mcpListed(deps.mcp);
      }
      case 'mcpSecretSet': {
        if (!deps.mcp?.secrets) return { type: 'notice', message: 'Stored secrets are not available here.' };
        const s = await findServer(deps.mcp, msg.server);
        if (!s) return gone(msg.server);
        if (s.scope === 'workspace') return { type: 'notice', message: 'This server is defined in the workspace .forge/mcp.json, which cannot use stored secrets. Use an environment variable instead.' };
        if (!(await deps.mcp.secrets.idsOf(s.name)).includes(msg.id)) return { type: 'notice', message: `"${s.name}" does not ask for "${msg.id}".` };
        await deps.mcp.secrets.set(s.name, msg.id, msg.value);
        await deps.mcp.actions.reload();
        return mcpListed(deps.mcp);
      }
      case 'mcpCatalog': {
        if (!deps.mcp) return { type: 'mcpCatalogListed', entries: [] };
        const { entries, installed, warning } = await deps.mcp.catalog();
        const have = new Set(installed);
        return {
          type: 'mcpCatalogListed',
          entries: entries.map((e) => ({
            name: e.name,
            displayName: e.displayName,
            description: e.description,
            command: commandPreview(e),
            installed: have.has(e.name),
            vertical: e.vertical ?? 'Other',
            remote: e.remote === true || (Boolean(e.serverConfig?.url) && !e.serverConfig?.command),
            secrets: (e.secrets ?? []).map(({ id, label, help }) => ({ id, label, help })),
          })),
          ...(warning ? { warning } : {}),
        };
      }
      case 'mcpInstall': {
        if (!deps.mcp) return mcpListed(deps.mcp);
        const { entries, installed } = await deps.mcp.catalog();
        const entry = entries.find((e) => e.name === msg.name);
        if (!entry) return { type: 'notice', message: `"${msg.name}" is not in the MCP catalog.` };
        if (installed.includes(entry.name)) return { type: 'notice', message: `"${entry.displayName}" is already installed.` };
        const needed = entry.secrets ?? [];
        const values = msg.secretValues ?? {};
        if (needed.length && !deps.mcp.secrets) {
          return { type: 'notice', message: `"${entry.displayName}" needs a secret, and this editor cannot keep one. Set it as an environment variable and edit mcp.json instead.` };
        }
        const missing = needed.filter((f) => !values[f.id]?.trim());
        if (missing.length) return { type: 'notice', message: `Enter ${missing.map((f) => f.label).join(' and ')} before installing "${entry.displayName}".` };
        const ok = await deps.mcp.confirm(
          `Install MCP server "${entry.displayName}"?`,
          `Forge will run this on your machine whenever the server starts:\n\n${commandPreview(entry)}\n\nOnly install servers you trust.` +
            (needed.length ? `\n\nWhat you entered is kept in your editor's secret storage, not in a file.` : ''),
          'Install'
        );
        if (!ok) return { type: 'none' };
        for (const f of needed) await deps.mcp.secrets!.set(entry.name, f.id, values[f.id]!.trim());
        const r = await installEntry(entry, deps.mcp.actions);
        if (!r.ok) for (const f of needed) await deps.mcp.secrets!.set(entry.name, f.id, '');
        return r.ok ? mcpListed(deps.mcp) : { type: 'notice', message: r.message };
      }
      case 'openMcpConfig':
        if (deps.mcp) await deps.mcp.openConfig(msg.scope);
        return { type: 'none' };
      case 'skillsList':
        return skillsListed(deps);
      case 'skillAddLink': {
        if (!deps.skills?.fetchLink) return { type: 'none' };
        const url = msg.url.trim();
        if (!/^https:\/\//i.test(url)) return { type: 'notice', message: 'Use an https address.' };
        const current = (await deps.loadForgeConfigFile(deps.configPath)).config.skillPaths ?? [];
        if (current.includes(url)) return { type: 'notice', message: 'That address is already in your skill paths.' };
        const got = await deps.skills.fetchLink(url);
        if (!got.skills.length) return { type: 'notice', message: got.warnings[0] ?? 'There are no skills at that address.' };
        const bundled = new Set((await deps.skills.list()).filter((s) => s.source.kind === 'builtin').map((s) => s.name));
        const shadowed = got.skills.filter((s) => bundled.has(s.name)).map((s) => s.name);
        await deps.saveForgeConfigFile({ skillPaths: [...current, url] }, deps.configPath);
        return skillsListed(deps, shadowed.length ? `${shadowed.join(', ')} now takes the place of the skill built into Forge with that name.` : `Added ${got.skills.length} skill${got.skills.length === 1 ? '' : 's'}.`);
      }
      case 'skillAddFile': {
        if (!deps.skills?.pickFile || !deps.skills.saveOwn) return { type: 'none' };
        const picked = await deps.skills.pickFile();
        if (!picked) return { type: 'none' };
        if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*\.md$/.test(picked.fileName)) return { type: 'notice', message: 'A skill file must be a plain .md file name.' };
        const parsed = parseSkill(picked.content, { kind: 'global', path: picked.fileName }, picked.fileName.replace(/\.md$/, ''));
        if (!picked.content.trimStart().startsWith('---') || !parsed.description) {
          return { type: 'notice', message: 'That file is not a skill. A skill starts with a header holding its name and description.' };
        }
        await deps.skills.saveOwn(picked.fileName, picked.content);
        const bundled = (await deps.skills.list()).some((s) => s.source.kind === 'builtin' && s.name === parsed.name);
        return skillsListed(deps, bundled ? `${parsed.name} now takes the place of the skill built into Forge with that name.` : `Added ${parsed.name}.`);
      }
      case 'skillToggle': {
        if (!deps.skills) return { type: 'none' };
        if (!(await deps.skills.list()).some((s) => s.name === msg.name)) return { type: 'notice', message: `There is no skill named "${msg.name}".` };
        const current = (await deps.loadForgeConfigFile(deps.configPath)).config.disabledSkills ?? [];
        const next = current.includes(msg.name) ? current.filter((n) => n !== msg.name) : [...current, msg.name];
        await deps.saveForgeConfigFile({ disabledSkills: next }, deps.configPath);
        return skillsListed(deps);
      }
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
      case 'openConfig':
        await deps.openConfig?.(msg.scope);
        return { type: 'none' };
      case 'loadProviders': {
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        return { type: 'providersLoaded', providers: providerViews(config.customProviders), presets: presetList() };
      }
      case 'saveProvider': {
        const id = typeof msg.provider?.id === 'string' ? msg.provider.id.trim() : '';
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        const entry = mergeProvider(config.customProviders?.[id], { ...msg.provider, id });
        const problem = customProviderProblems({ [id]: entry })[0];
        if (!id || problem) return { type: 'error', message: problem?.message ?? 'A provider needs an id.' };
        const next = { ...(config.customProviders ?? {}), [id]: entry };
        await deps.saveForgeConfigFile({ customProviders: next }, deps.configPath);
        return { type: 'providersLoaded', providers: providerViews(next), presets: presetList() };
      }
      case 'deleteProvider': {
        const { config } = await deps.loadForgeConfigFile(deps.configPath);
        const next = { ...(config.customProviders ?? {}) };
        delete next[msg.id];
        await deps.saveForgeConfigFile({ customProviders: Object.keys(next).length ? next : undefined }, deps.configPath);
        return { type: 'providersLoaded', providers: providerViews(next), presets: presetList() };
      }
      case 'loadCleanup': {
        const last = deps.sessions?.last?.();
        return { type: 'cleanupLoaded', ...(last ? { last } : {}) };
      }
      case 'loadCloudStatus':
        return deps.cloud ? cloudListed(deps.cloud) : { type: 'none' };
      case 'cloudCredentialSet': {
        if (!deps.cloud?.save) return { type: 'none' };
        // Only the fields Forge knows, and only text: an unknown id from the page is dropped, not stored.
        const values: Record<string, string> = {};
        for (const f of AWS_CREDENTIALS) if (typeof msg.values?.[f.id] === 'string') values[f.id] = msg.values[f.id]!.trim();
        const problem = cloudCredentialProblem(values);
        if (problem) return { type: 'notice', message: problem };
        await deps.cloud.save(values);
        return cloudListed(deps.cloud);
      }
      case 'cloudCredentialClear':
        if (!deps.cloud?.clear) return { type: 'none' };
        await deps.cloud.clear();
        return cloudListed(deps.cloud);
      case 'loadIndexStatus':
        return deps.index ? { type: 'indexStatusLoaded', ...deps.index.status() } : { type: 'none' };
      case 'deleteIndex':
        if (!deps.index) return { type: 'none' };
        await deps.index.remove();
        return { type: 'indexStatusLoaded', ...deps.index.status() };
      case 'loadInstructions':
        return deps.instructions ? { type: 'instructionsLoaded', ...(await deps.instructions.scan()) } : { type: 'none' };
      case 'instructionOpen':
        if (!deps.instructions) return { type: 'none' };
        if (!isInstructionName(msg.name)) return { type: 'error', message: 'That is not a file Forge reads.' };
        await deps.instructions.open(msg.name);
        return { type: 'none' };
      case 'instructionCreate': {
        if (!deps.instructions) return { type: 'none' };
        if (!isInstructionName(msg.name)) return { type: 'error', message: 'That is not a file Forge reads.' };
        if ((await deps.instructions.create(msg.name)) === 'exists') return { type: 'notice', message: `${msg.name} already exists, so it was left as it is.` };
        await deps.instructions.open(msg.name);
        return { type: 'instructionsLoaded', ...(await deps.instructions.scan()) };
      }
      case 'steeringNew':
        await deps.instructions?.newSteering();
        return { type: 'none' };
      case 'pruneChats': {
        const sessions = deps.sessions;
        if (!sessions) return { type: 'none' };
        const days = (await deps.loadForgeConfigFile(deps.configPath)).config.sessionRetentionDays;
        if (!days || !Number.isFinite(days) || days <= 0) return { type: 'notice', message: 'Set Days to keep chats, and save it, before deleting old chats.' };
        const found = await sessions.prune(sessions.dir, { olderThanDays: days, dryRun: true });
        const n = found.deleted.length;
        if (!n) return { type: 'notice', message: `No chats are older than ${days} day${days === 1 ? '' : 's'}.` };
        const ok = await sessions.confirm(
          `Delete ${n} chat${n === 1 ? '' : 's'} not used for ${days} day${days === 1 ? '' : 's'}?`,
          'This cannot be undone. Chats used more recently are kept.',
          'Delete'
        );
        if (!ok) return { type: 'none' };
        const gone = await sessions.prune(sessions.dir, { olderThanDays: days });
        await sessions.record?.(gone.deleted.length);
        return { type: 'notice', message: `Deleted ${gone.deleted.length} chat${gone.deleted.length === 1 ? '' : 's'}.` };
      }
      case 'loadAbout':
        return deps.about ? { type: 'aboutLoaded', version: deps.about.version } : { type: 'none' };
      case 'aboutOpen': {
        if (!deps.about) return { type: 'none' };
        if (msg.what === 'log') deps.about.openLog();
        else if (msg.what === 'issues' || msg.what === 'docs') await deps.about.openLink(msg.what);
        else return { type: 'error', message: 'That cannot be opened from here.' };
        return { type: 'none' };
      }
      case 'loadRows':
        return rowsListed(deps.rows);
      case 'resetRows': {
        const rows = deps.rows;
        if (!rows?.confirm) return { type: 'error', message: 'This editor cannot ask first, so no settings were reset.' };
        const changed = SETTING_ROWS.filter((r) => JSON.stringify(rows.get(r.key)) !== JSON.stringify(rows.defaultOf?.(r.key)));
        if (!changed.length) return { type: 'notice', message: 'Every setting on these pages already has its default value.' };
        const ok = await rows.confirm(
          `Reset ${changed.length} setting${changed.length === 1 ? '' : 's'} to ${changed.length === 1 ? 'its' : 'their'} default?`,
          'This changes the settings on the Context and memory, Safety and cost, Tools and web, Git and quality, and Advanced pages in your user settings. API keys, MCP servers, agents, permissions and settings saved in a workspace are not changed.',
          'Reset'
        );
        if (!ok) return { type: 'none' };
        for (const r of changed) await rows.update(r.key, undefined);
        return rowsListed(rows);
      }
      case 'setRow': {
        const row = SETTING_ROWS.find((r) => r.key === msg.key);
        if (!row || !deps.rows) return { type: 'error', message: 'That setting cannot be changed here.' };
        const checked = coerceRow(row, msg.value);
        if (!checked.ok) return { type: 'rowError', key: row.key, message: checked.message };
        await deps.rows.update(row.key, checked.value);
        return { type: 'rowSaved', key: row.key, value: checked.value };
      }
      case 'skillInstall': {
        if (!deps.skills) return { type: 'none' };
        const ok = await deps.skills.install(msg.name);
        if (!ok) return { type: 'notice', message: `Could not install skill "${msg.name}".` };
        return skillsListed(deps);
      }
    }
  } catch (err) {
    return { type: 'error', message: (err as Error).message };
  }
}

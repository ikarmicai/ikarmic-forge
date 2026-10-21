import { BUILTIN_TOOLS, MODEL_CATALOG, SUPPORTED_PROVIDERS } from '@ikarmic/forge-core';

import { PROVIDER_LABELS } from '../provider-labels.js';

/**
 * Forge Settings page: section nav with search, one Save/Discard bar for
 * draft edits, and immediate actions for API keys, MCP servers and skills.
 * Pure helpers come from dist/webview/settings-ui.js (`window.ForgeSettings`).
 *
 */
export function getSettingsHtml(opts: { scriptUri?: string; cspSource?: string } = {}): string {
  const scriptSrc = opts.cspSource ? `'unsafe-inline' ${opts.cspSource}` : `'unsafe-inline'`;
  const tools = BUILTIN_TOOLS.map((t) => t.name);
  const askOnly = BUILTIN_TOOLS.filter((t) => t.destructive).map((t) => t.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc};">
<style>
  :root { --fs-xs: 11px; --fs-s: 12px; --fs-m: 13px; --fs-l: 15px; --fs-xl: 20px; --r-s: 4px; --r-m: 6px; --fg: var(--vscode-foreground); --muted: var(--vscode-descriptionForeground); --border: var(--vscode-panel-border); --line: var(--vscode-widget-border, var(--border)); --ok: var(--vscode-charts-green, #388a34); --err: var(--vscode-charts-red, #e51400); --warn: var(--vscode-editorWarning-foreground, #cca700); }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: var(--vscode-font-family); font-size: var(--fs-m); color: var(--fg); background: var(--vscode-editor-background); display: flex; flex-direction: column; }
  .layout { flex: 1; min-height: 0; display: flex; }
  nav { flex: none; width: 200px; border-right: 1px solid var(--border); padding: 10px 6px; display: flex; flex-direction: column; gap: 1px; overflow-y: auto; }
  nav input[type="search"] { margin: 0 4px 8px; width: auto; }
  /* Small tracked caps for group labels, matching VS Code's own settings page. */
  nav .sep { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 10px 8px 4px; }
  nav button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; color: var(--fg); padding: 5px 8px; border-radius: var(--r-s); cursor: pointer; text-align: left; font: inherit; }
  nav button:hover { background: var(--vscode-list-hoverBackground); }
  nav button[aria-current="true"] { background: var(--vscode-list-inactiveSelectionBackground); }
  .badge { margin-left: auto; padding: 0 7px; border-radius: 9px; font-size: var(--fs-xs); line-height: 18px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .badge:empty { display: none; }
  .badge.err { background: var(--err); color: var(--vscode-editor-background); }
  main { flex: 1; min-width: 0; overflow-y: auto; padding: 18px 24px 32px; }
  section[hidden], #search-results[hidden], #unsaved[hidden], .row[hidden], .hidden { display: none !important; }
  h2 { font-size: var(--fs-xl); font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
  h2 .sp { flex: 1; }
  h2 button.btn, h2 button.link { font-size: var(--fs-m); font-weight: 400; }
  .lead { color: var(--muted); margin: 0 0 18px; max-width: 70ch; }
  /* minmax(0, 1fr): a single column that may shrink, so a long no-wrap row (a workspace path) cannot widen the page. */
  .setting { padding: 10px 12px; margin: 0 -12px; border-left: 2px solid transparent; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .setting:hover { background: var(--vscode-list-hoverBackground); }
  .setting.modified { border-left-color: var(--vscode-settings-modifiedItemIndicator, var(--warn)); }
  .setting.flash { outline: 1px solid var(--vscode-focusBorder); }
  .setting .t { font-weight: 600; }
  .setting.modified .t::after { content: " (modified)"; font-weight: 400; color: var(--muted); }
  .setting .d { color: var(--muted); font-size: var(--fs-s); max-width: 70ch; }
  /* Wide windows: the name and its description sit beside the control, so the page is not a tall single column. */
  @media (min-width: 1000px) {
    .setting { grid-template-columns: minmax(180px, 260px) minmax(0, 1fr); column-gap: 28px; align-items: start; }
    .setting > .t { grid-column: 1; }
    .setting > .t + .d { grid-column: 1; }
    .setting > :not(.t):not(.t + .d) { grid-column: 2; }
    .setting > .d { max-width: none; }
  }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .allowed-row { flex-wrap: nowrap; }
  .allowed-row code { flex: none; }
  .allowed-row .d { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  input, select, textarea { font: inherit; color: var(--vscode-input-foreground, var(--fg)); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--line)); border-radius: var(--r-s); padding: 3px 6px; }
  select, input[type="text"], input[type="password"], input[type="search"] { width: min(320px, 100%); }
  select option { background: var(--vscode-dropdown-background, var(--vscode-input-background)); color: var(--vscode-dropdown-foreground, var(--fg)); }
  textarea { width: 100%; min-height: 60px; resize: vertical; }
  input:focus, select:focus, textarea:focus { border-color: var(--vscode-focusBorder); }
  input[type="checkbox"] { width: auto; accent-color: var(--vscode-button-background); }
  button.btn { border: 0; border-radius: var(--r-s); padding: 4px 11px; cursor: pointer; font: inherit; background: var(--vscode-button-background); color: var(--vscode-button-foreground); white-space: nowrap; }
  button.btn:hover { background: var(--vscode-button-hoverBackground); }
  button.btn.sec, label.btn.sec { background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, .18)); color: var(--vscode-button-secondaryForeground, var(--fg)); box-shadow: inset 0 0 0 1px var(--vscode-button-border, var(--line)); }
  button.btn.sec:hover, label.btn.sec:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, .28)); }
  .keyrow .btn:disabled { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); opacity: .7; }
  button.link { border: 0; background: none; padding: 3px 4px; min-height: 24px; color: var(--vscode-textLink-foreground); cursor: pointer; font: inherit; font-size: var(--fs-s); }
  button.link:hover { text-decoration: underline; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .list { border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; }
  .item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; min-width: 0; }
  .item + .item, .item + .item-body, .item-body + .item { border-top: 1px solid var(--line); }
  .item .main { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .item .name { font-weight: 600; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .item .sub { font-size: var(--fs-s); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .sub.err { color: var(--err); }
  #builtin-agents .item .sub { white-space: normal; }
  .item-body { padding: 8px 10px 10px 28px; display: flex; flex-wrap: wrap; gap: 4px; background: var(--vscode-sideBar-background); }
  .pill { padding: 0 7px; border-radius: 9px; font-size: var(--fs-xs); line-height: 18px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-weight: 400; }
  .chip { font-family: var(--vscode-editor-font-family); font-size: var(--fs-xs); border: 1px solid var(--line); border-radius: var(--r-s); padding: 0 5px; line-height: 18px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--muted); }
  .dot.connected { background: var(--ok); } .dot.failed { background: var(--err); } .dot.disabled { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
  .group-label .path { text-transform: none; letter-spacing: 0; font-family: var(--vscode-editor-font-family); margin-left: 6px; }
  .group-label { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 14px 0 6px; }
  .tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--line); margin-bottom: 10px; }
  .tabs button { border: 0; background: none; color: var(--muted); padding: 6px 0; font: inherit; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs button[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--vscode-focusBorder); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .card { border: 1px solid var(--line); border-radius: var(--r-s); padding: 10px; display: grid; gap: 4px; }
  .card .row { justify-content: space-between; margin-top: 4px; }
  .mono { font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); }
  .rule-head { display: flex; gap: 8px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 4px; }
  #model-custom { min-height: 24px; }
  .muted { color: var(--muted); }
  .ok { color: var(--fg); }
  .checks { display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .checks { gap: 2px 14px; }
  /* Provider names are product names, not code; only tool names read as monospace. */
  #hidden-providers label { font-family: inherit; }
  #hidden-providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 2px 14px; }
  .tool-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-height: 28px; padding: 2px 0; border-bottom: 1px solid var(--border); }
  .tool-row .name { flex: 0 0 150px; min-width: 0; font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); overflow-wrap: anywhere; }
  .tool-row .hint { flex: 1 1 140px; min-width: 0; font-size: var(--fs-xs); color: var(--vscode-descriptionForeground, var(--muted)); overflow-wrap: anywhere; }
  .tool-row select { flex: none; width: 96px; min-height: 24px; }
  .checks label { display: flex; gap: 6px; align-items: center; min-height: 24px; font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); }
  .setting .row label { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; }
  details.adv { margin: 10px 0; }
  details.adv > summary { cursor: pointer; min-height: 24px; color: var(--muted); }
  .rule { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(130px, 1fr) minmax(140px, 2fr) auto; gap: 6px; align-items: center; margin-top: 6px; }
  .rule select, .rule input { width: 100%; }
  .agent { border: 1px solid var(--line); border-radius: var(--r-s); padding: 10px; display: grid; gap: 6px; margin-top: 8px; }
  .agent input[type="text"] { width: 100%; }
  .keyrow { display: grid; grid-template-columns: 120px minmax(100px, 150px) minmax(110px, 1fr) auto; gap: 8px; align-items: center; padding: 6px 0; }
  .keyrow > span:nth-child(2) { overflow-wrap: anywhere; font-size: var(--fs-s); }
  button.btn:disabled { opacity: .45; cursor: default; }
  .keyrow + .keyrow { border-top: 1px solid var(--line); }
  .keyrow .kstatus { overflow-wrap: normal; }
  .keyrow .row { flex-wrap: nowrap; gap: 4px; }
  .keyrow .btn { padding: 4px 9px; }
  .keyrow .kstatus.bad { color: var(--err); }
  #banner { margin: 0 0 12px; padding: 6px 10px; border-left: 2px solid var(--warn); background: var(--vscode-inputValidation-warningBackground, transparent); }
  #banner:empty { display: none; }
  #banner.ok { border-left-color: var(--vscode-charts-green, #388a34); background: transparent; }
  #unsaved { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-top: 1px solid var(--border); background: var(--vscode-sideBar-background); }
  #unsaved .sp { flex: 1; }
  #search-results button { display: block; width: 100%; text-align: left; border: 0; background: none; color: var(--fg); font: inherit; padding: 8px 10px; border-bottom: 1px solid var(--line); cursor: pointer; }
  #search-results button:hover { background: var(--vscode-list-hoverBackground); }
  #search-results mark { background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, .33)); color: inherit; border-radius: 2px; }
  #search-results .count { color: var(--muted); font-size: var(--fs-s); margin: 0 0 8px; }
  #search-results .crumb { color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .05em; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 560px) {
    .layout { flex-direction: column; }
    nav { width: auto; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--border); }
    nav .sep { display: none; }
    /* Search stays available in a split editor: a full-width row above the section buttons. */
    nav input[type="search"] { order: -1; flex: 1 0 100%; width: 100%; margin-bottom: 4px; }
    nav button { width: auto; white-space: nowrap; }
    .keyrow, .rule { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  @media (forced-colors: active) { button, select, input, textarea, .list, .card { border: 1px solid ButtonText; } }
</style>
</head>
<body>
<script src="${opts.scriptUri ?? ''}" onerror="window.__forgeSettingsLoadFailed=true"></script>
<div class="layout">
  <nav id="settings-nav" aria-label="Settings sections">
    <input type="search" id="search" placeholder="Search settings" aria-label="Search settings" />
    <button type="button" data-section="model">Model</button>
    <button type="button" data-section="keys">API keys</button>
    <div class="sep">Agent behaviour</div>
    <button type="button" data-section="agents">Agents<span class="badge" id="badge-agents"></span></button>
    <button type="button" data-section="mcp">MCP servers<span class="badge" id="badge-mcp"></span></button>
    <button type="button" data-section="skills">Skills<span class="badge" id="badge-skills"></span></button>
    <button type="button" data-section="perm">Permissions</button>
    <div class="sep">Editor</div>
    <button type="button" data-section="display">Display</button>
    <button type="button" data-section="backup">Backup</button>
  </nav>
  <main id="pane">
    <div id="banner" role="status" aria-live="polite"></div>
    <div id="search-results" hidden></div>

    <section id="sec-model">
      <h2>Model</h2>
      <p class="lead">The provider and model Forge uses for chat, specs and agents. Agents can override this.</p>
      <div class="setting" id="row-provider"><div class="t">Provider</div><div class="d">API keys are stored in VS Code's secret storage.</div>
        <div class="row"><select id="provider" aria-label="Provider"></select><span id="provider-key" class="muted"></span></div>
        <div class="d" id="provider-effective" aria-live="polite"></div></div>
      <div class="setting" id="row-model"><div class="t">Model</div>
        <div class="d">Models come from the provider itself, so the list is current for your key.</div>
        <div class="row"><select id="model" aria-label="Model"></select></div>
        <div class="row" id="model-custom-row" hidden><input type="text" id="model-custom" class="mono" aria-label="Custom model id" placeholder="model id, e.g. my-model-v2" /></div>
        <div class="d"><span id="model-status" aria-live="polite"></span> <button type="button" class="link" id="model-refresh">Refresh</button></div></div>
      <div class="setting" id="row-effort"><div class="t">Reasoning effort</div><div class="d">Only used by models that support it.</div>
        <div class="row"><select id="reasoning-effort" aria-label="Reasoning effort">
          <option value="">Provider default</option><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option>
        </select></div></div>
      <div class="setting" id="row-hidden"><div class="t">Providers</div><div class="d">Turn a provider off to skip it in auto-detect and leave it out of the model pickers.</div>
        <div class="checks" id="hidden-providers"></div></div>
      <div class="setting" id="row-mode-models"><div class="t">Model per mode</div><div class="d">Give a built-in mode its own model, as provider:model, a bare model id or one of your aliases. Leave blank to use the main model. Agent mode always uses the main model.</div>
        <div id="mode-model-list"></div></div>
    </section>

    <section id="sec-keys" hidden>
      <h2>API keys</h2>
      <p class="lead">Stored in VS Code's secret storage, never in settings files. Saving or removing a key takes effect at once. A key can also come from an environment variable such as OPENAI_API_KEY; the row then says so.</p>
      <div id="row-keys"><div id="key-rows"></div></div>
    </section>

    <section id="sec-agents" hidden>
      <h2>Agents<span class="sp"></span><button type="button" class="btn" id="add-agent">New agent</button></h2>
      <p class="lead">Agents show up in the chat's mode menu and can be used in parallel runs. Built-in agents can't be edited; duplicate one to start from it.</p>
      <div id="row-agents"><div class="group-label">Your agents</div><div id="agent-list"></div><div class="group-label">Built in</div><div class="list" id="builtin-agents"></div></div>
    </section>

    <section id="sec-mcp" hidden>
      <h2>MCP servers<span class="sp"></span><button type="button" class="btn sec" id="mcp-reload">Reload</button><button type="button" class="btn sec" id="mcp-open-config">Open mcp.json</button></h2>
      <p class="lead">Servers give Forge extra tools. Turned-off servers don't start, and their tools are hidden from the agent.</p>
      <div id="row-mcp">
        <div class="tabs" role="tablist"><button type="button" role="tab" id="mcp-tab-installed" aria-selected="true">Installed</button><button type="button" role="tab" id="mcp-tab-browse" aria-selected="false">Browse</button></div>
        <div id="mcp-installed"><p class="muted">Loading MCP servers…</p></div>
        <div id="mcp-browse" class="hidden"><p class="muted">Loading the catalog…</p></div>
      </div>
    </section>

    <section id="sec-skills" hidden>
      <h2>Skills<span class="sp"></span><button type="button" class="btn sec" id="skills-rescan">Rescan</button><button type="button" class="btn" id="skills-browse">Browse catalog</button></h2>
      <p class="lead">Skills are Markdown instructions Forge loads when a task matches them, read from three folders. Browse the catalog to install one.</p>
      <div id="row-skills"><div id="skills-list"><p class="muted">Loading skills…</p></div><div id="skills-catalog"></div></div>
    </section>

    <section id="sec-perm" hidden>
      <h2>Permissions</h2>
      <p class="lead">For each tool, whether Forge asks first, runs it without asking, or never sees it. Rules below narrow a tool to certain paths, commands or URLs.</p>
      <div class="setting" id="row-tools"><div class="t">Tools</div><div class="d">Ask: confirm each call in the chat. Allow: run without asking. Block: Forge never sees the tool. Tools that run commands or drive a browser always ask unless Autonomous is on.</div><div id="tool-table"></div></div>
      <div class="setting" id="row-allowed"><div class="t">Commands you always allow</div><div class="d">Commands you chose "Always allow this command" for in the chat. Each applies only to the workspace shown, and only to that exact command. Remove one to be asked again.</div><div id="allowed-list"></div></div>
      <details class="adv"><summary>Advanced: allow only specific tools</summary>
        <div class="setting" id="row-allow"><div class="t">Allowed tools</div><div class="d">When any are ticked, only those tools are offered to the agent and all others are hidden. Leave empty to offer every tool that is not blocked.</div><div class="checks" id="allow-tools"></div></div>
      </details>
      <div class="setting" id="row-rules"><div class="t">Rules</div><div class="d">Limit a tool to, or keep it away from, certain paths, commands or URLs. Paths use globs; commands and URLs use regular expressions.</div>
        <div id="rules"></div><div class="row"><button type="button" class="link" id="add-rule">+ Add rule</button></div></div>
    </section>

    <section id="sec-display" hidden>
      <h2>Display</h2>
      <div class="setting" id="row-blocks"><div class="t">Tool rows</div><div class="d">Whether tool calls in the chat start open or closed. Edits always open.</div>
        <div class="row"><select id="block-default" aria-label="Tool rows"><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div></div>
      <div class="setting" id="row-show-reasoning"><div class="t">Show reasoning</div><div class="d">Show the model's reasoning above each reply, when the model provides it.</div>
        <div class="row"><label><input type="checkbox" id="show-reasoning" /> Show reasoning in the chat</label></div></div>
      <div class="setting"><div class="t">Presets</div><div class="d"><strong>Review first</strong> opens tool rows and shows reasoning. <strong>High autonomy</strong> closes tool rows and hides reasoning. Presets only change those two display settings, not permissions; they apply as unsaved changes.</div><div class="row"><button type="button" class="btn sec" id="preset-review" title="Open tool rows and show reasoning">Review first</button><button type="button" class="btn sec" id="preset-autonomy" title="Close tool rows and hide reasoning">High autonomy</button></div></div>
    </section>

    <section id="sec-backup" hidden>
      <h2>Backup</h2>
      <p class="lead">Export your Forge settings and custom agents to a JSON file, or import one. API keys, MCP servers and tool permissions are not included.</p>
      <div id="row-backup" class="row"><button type="button" class="btn" id="export-btn">Export…</button><label class="btn sec">Import…<input type="file" id="import-file" accept="application/json" class="sr-only" /></label></div>
    </section>
  </main>
</div>
<div id="unsaved" hidden><span class="ok" aria-hidden="true">●</span><span id="unsaved-count">1 unsaved change</span><span class="sp"></span><button type="button" class="btn sec" id="discard-all">Discard</button><button type="button" class="btn" id="save-all">Save</button></div>
<script>
  const vscode = acquireVsCodeApi();
  const FS = window.ForgeSettings;
  const catalog = ${JSON.stringify(MODEL_CATALOG)};
  const providers = ${JSON.stringify(SUPPORTED_PROVIDERS)};
  const toolNames = ${JSON.stringify(tools)};
  const askOnlyTools = ${JSON.stringify(askOnly)};
  const DIMENSIONS = [['allowedPaths', 'Allowed paths'], ['deniedPaths', 'Denied paths'], ['allowedCommands', 'Allowed commands'], ['deniedCommands', 'Denied commands'], ['allowedUrls', 'Allowed URLs'], ['deniedUrls', 'Denied URLs']];
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  if (!FS) { $('banner').textContent = 'The settings helper script did not load. Reload the window to edit settings.'; }

  let saved = FS ? FS.emptyDraft() : null;
  let draft = FS ? FS.emptyDraft() : null;
  /** Keys sent in the current save, so each response can mark exactly those as saved. */
  let pending = { config: [], sandbox: false, agents: false };
  let currentSection = 'model';
  let builtins = [];
  let keysSet = new Set();
  /** provider -> result of the last Test click, shown in place of the key status. */
  const keyNotes = {};
  /** provider -> environment variable that supplies its key, when no key is saved. */
  let envKeys = {};

  // sections and search
  const navButtons = Array.prototype.slice.call(document.querySelectorAll('nav button[data-section]'));
  function showSection(name) {
    currentSection = name;
    $('search-results').hidden = true;
    document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== 'sec-' + name; });
    navButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.section === name)));
    if (name === 'mcp' && !mcpLoaded) { mcpLoaded = true; vscode.postMessage({ type: 'mcpList' }); }
    if (name === 'skills' && !skillsLoaded) { skillsLoaded = true; vscode.postMessage({ type: 'skillsList' }); }
  }
  navButtons.forEach((b) => b.addEventListener('click', () => { $('search').value = ''; showSection(b.dataset.section); }));

  function renderSearch(q) {
    const box = $('search-results');
    if (!q.trim() || !FS) { box.hidden = true; showSection(currentSection); return; }
    const hits = FS.filterSettings(FS.SETTINGS_INDEX, q);
    const terms = q.trim().toLowerCase().split(' ').filter(Boolean);
    document.querySelectorAll('main > section').forEach((s) => { s.hidden = true; });
    navButtons.forEach((b) => b.setAttribute('aria-current', 'false'));
    box.hidden = false;
    box.textContent = '';
    if (!hits.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No settings match "' + q.trim() + '". Try a provider, a tool or a word from the description.'; box.appendChild(p); return; }
    const count = document.createElement('div'); count.className = 'count'; count.textContent = hits.length + (hits.length === 1 ? ' setting' : ' settings') + ' match "' + q.trim() + '"'; box.appendChild(count);
    // Wraps each search term in <mark>, building nodes (never markup) from the setting's own text.
    const marked = (parent, text) => {
      const lower = text.toLowerCase();
      let i = 0;
      while (i < text.length) {
        let at = -1; let len = 0;
        terms.forEach((t) => { const k = lower.indexOf(t, i); if (k >= 0 && (at < 0 || k < at)) { at = k; len = t.length; } });
        if (at < 0) { parent.appendChild(document.createTextNode(text.slice(i))); break; }
        if (at > i) parent.appendChild(document.createTextNode(text.slice(i, at)));
        const m = document.createElement('mark'); m.textContent = text.slice(at, at + len); parent.appendChild(m);
        i = at + len;
      }
    };
    hits.forEach((h) => {
      const b = document.createElement('button');
      b.type = 'button';
      const crumb = document.createElement('div'); crumb.className = 'crumb'; crumb.textContent = h.sectionLabel;
      const name = document.createElement('div'); marked(name, h.label);
      const desc = document.createElement('div'); desc.className = 'muted'; desc.style.fontSize = '12px'; marked(desc, h.description);
      b.appendChild(crumb); b.appendChild(name); b.appendChild(desc);
      b.addEventListener('click', () => {
        $('search').value = '';
        showSection(h.section);
        const row = $(h.rowId);
        if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1200); }
      });
      box.appendChild(b);
    });
  }
  $('search').addEventListener('input', () => renderSearch($('search').value));

  // draft bar
  const ROW_FOR = { provider: 'row-provider', model: 'row-model', reasoningEffort: 'row-effort', disabledProviders: 'row-hidden', modeModels: 'row-mode-models', blockDefault: 'row-blocks', showReasoning: 'row-show-reasoning', autoApprove: 'row-tools', agents: 'row-agents' };
  function refreshDirty() {
    if (!FS) return;
    const dirty = FS.dirtyKeys(saved, draft);
    $('unsaved').hidden = dirty.length === 0;
    $('unsaved-count').textContent = dirty.length + ' unsaved change' + (dirty.length === 1 ? '' : 's');
    // A row that is not on the page must not stop the rest of the update (it used to throw here).
    const mark = (id, on) => { const row = $(id); if (row) row.classList.toggle('modified', on); };
    Object.keys(ROW_FOR).forEach((k) => mark(ROW_FOR[k], dirty.indexOf(k) >= 0));
    ['row-allow', 'row-rules'].forEach((id) => mark(id, dirty.indexOf('sandbox') >= 0));
  }
  $('save-all').addEventListener('click', () => {
    try {
      const dirty = FS.dirtyKeys(saved, draft);
      const messages = FS.saveMessages(draft, dirty);
      pending = { config: dirty.filter((k) => FS.CONFIG_KEYS.indexOf(k) >= 0), sandbox: dirty.indexOf('sandbox') >= 0, agents: dirty.indexOf('agents') >= 0, snapshot: clone(draft) };
      messages.forEach((m) => vscode.postMessage(m));
    } catch (err) {
      $('banner').textContent = 'Could not save: ' + (err && err.message ? err.message : String(err));
    }
  });
  $('discard-all').addEventListener('click', () => { draft = clone(saved); renderAll(); });

  // model
  const PROVIDER_LABELS = ${JSON.stringify(PROVIDER_LABELS)};
  const labelOf = (p) => PROVIDER_LABELS[p] || p;
  { const o = document.createElement('option'); o.value = ''; o.textContent = 'Auto-detect from API keys'; $('provider').appendChild(o); }
  providers.forEach((p) => { const o = document.createElement('option'); o.value = p; o.textContent = labelOf(p); $('provider').appendChild(o); });
  providers.forEach((p) => {
    const l = document.createElement('label');
    const c = document.createElement('input'); c.type = 'checkbox'; c.dataset.provider = p;
    c.addEventListener('change', () => { draft.disabledProviders = Array.prototype.slice.call($('hidden-providers').querySelectorAll('input:not(:checked)')).map((x) => x.dataset.provider); refreshDirty(); });
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + labelOf(p))); $('hidden-providers').appendChild(l);
  });
  // Models are listed for the chosen provider, or for the one the chat resolved when the provider is on Auto.
  const CUSTOM = '__custom__';
  let effectiveProvider = '';
  let customMode = false;
  const modelLists = {};
  const modelLoading = {};
  function listProvider() { return draft.provider || effectiveProvider; }
  function requestModels(refresh) {
    const p = listProvider();
    if (!p) return;
    modelLoading[p] = true;
    vscode.postMessage({ type: 'loadModels', provider: p, refresh: !!refresh });
    renderModelStatus();
  }
  function renderModelStatus() {
    const p = listProvider();
    const el = $('model-status');
    if (!p) { el.textContent = 'Choose a provider to see its models.'; return; }
    if (modelLoading[p]) { el.textContent = 'Loading models from ' + labelOf(p) + '…'; return; }
    const list = modelLists[p];
    if (!list) { el.textContent = ''; return; }
    el.textContent = list.source === 'live'
      ? list.models.length + ' models from ' + labelOf(p) + '.'
      : 'Showing a short built-in list. ' + (list.error || '') + ' Use Custom… for any other model id.';
  }
  function renderModelOptions() {
    const sel = $('model');
    sel.textContent = '';
    const p = listProvider();
    const list = modelLists[p];
    const entries = ((list && list.models) || catalog[p] || []).slice();
    const inList = entries.some((e) => e.id === draft.model);
    sel.appendChild(new Option('Provider default', ''));
    if (draft.model && !inList && !customMode) entries.unshift({ id: draft.model, label: draft.model + ' (current)' });
    entries.forEach((e) => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.label; o.title = e.id; sel.appendChild(o); });
    sel.appendChild(new Option('Custom…', CUSTOM));
    sel.value = customMode ? CUSTOM : draft.model;
    $('model-custom-row').hidden = !customMode;
    if (customMode && document.activeElement !== $('model-custom')) $('model-custom').value = draft.model;
    renderModelStatus();
    $('provider-key').textContent = draft.provider ? (keysSet.has(draft.provider) ? '✓ Key set' : envKeys[draft.provider] ? '✓ Key from ' + envKeys[draft.provider] : 'No key saved') : '';
  }
  $('provider').addEventListener('change', () => { draft.provider = $('provider').value; draft.model = ''; customMode = false; renderModelOptions(); draft.model = $('model').value; refreshDirty(); requestModels(false); });
  $('model').addEventListener('change', () => {
    const v = $('model').value;
    customMode = v === CUSTOM;
    if (customMode) { draft.model = ''; renderModelOptions(); $('model-custom').focus(); }
    else {
      draft.model = v;
      // A model belongs to a provider: choosing one while the provider is on Auto pins that provider.
      if (v && !draft.provider && effectiveProvider) { draft.provider = effectiveProvider; $('provider').value = effectiveProvider; }
      renderModelOptions();
    }
    refreshDirty();
  });
  $('model-custom').addEventListener('input', () => {
    draft.model = $('model-custom').value.trim();
    if (draft.model && !draft.provider && effectiveProvider) { draft.provider = effectiveProvider; $('provider').value = effectiveProvider; }
    refreshDirty();
  });
  $('model-refresh').addEventListener('click', () => requestModels(true));
  $('reasoning-effort').addEventListener('change', () => { draft.reasoningEffort = $('reasoning-effort').value; refreshDirty(); });

  // keys (immediate)
  function renderKeys() {
    const box = $('key-rows');
    // Rebuilding must not wipe a key somebody is in the middle of pasting.
    const typed = {};
    box.querySelectorAll('input').forEach((i) => { if (i.value) typed[i.dataset.provider] = i.value; });
    box.textContent = '';
    providers.forEach((p) => {
      const row = document.createElement('div'); row.className = 'keyrow';
      const fromEnv = !keysSet.has(p) && envKeys[p];
      const note = keyNotes[p];
      const base = keysSet.has(p) ? '✓ Key set' : fromEnv ? '✓ From ' + envKeys[p] : 'No key';
      // Environment names may only wrap after an underscore, never in the middle of a word.
      const shown = esc(note ? note.text : base).split('_').join('_<wbr>');
      row.innerHTML = '<span>' + esc(labelOf(p)) + '</span><span class="kstatus ' + (note && !note.ok ? 'bad' : keysSet.has(p) || fromEnv ? 'ok' : 'muted') + '" title="' + esc(note ? note.text : base) + '">' + shown + '</span>';
      const input = document.createElement('input'); input.type = 'password'; input.placeholder = keysSet.has(p) || fromEnv ? 'Paste new key' : 'Paste key'; input.setAttribute('aria-label', labelOf(p) + ' API key');
      const acts = document.createElement('span'); acts.className = 'row';
      const save = document.createElement('button'); save.type = 'button'; save.className = 'btn'; save.textContent = 'Save'; save.disabled = true;
      input.dataset.provider = p;
      if (typed[p]) { input.value = typed[p]; save.disabled = false; }
      input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !save.disabled) { e.preventDefault(); save.click(); } });
      save.addEventListener('click', () => { if (input.value.trim()) vscode.postMessage({ type: 'setKey', provider: p, key: input.value.trim() }); input.value = ''; save.disabled = true; });
      acts.appendChild(save);
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'link'; eye.textContent = 'Show';
      eye.addEventListener('click', () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; eye.textContent = show ? 'Hide' : 'Show'; });
      acts.appendChild(eye);
      if (keysSet.has(p) || fromEnv) {
        const test = document.createElement('button'); test.type = 'button'; test.className = 'link'; test.textContent = 'Test';
        test.addEventListener('click', () => { keyNotes[p] = { ok: true, text: 'Testing…' }; renderKeys(); vscode.postMessage({ type: 'loadModels', provider: p, refresh: true, test: true }); });
        acts.appendChild(test);
      }
      if (keysSet.has(p)) {
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn sec'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => vscode.postMessage({ type: 'deleteKey', provider: p }));
        acts.appendChild(rm);
      }
      row.appendChild(input); row.appendChild(acts); box.appendChild(row);
    });
  }

  // model per mode (draft): one input per built-in mode
  function renderModeModels() {
    const box = $('mode-model-list');
    box.textContent = '';
    builtins.filter((b) => b.id !== 'orchestrator').forEach((b) => {
      const row = document.createElement('div'); row.className = 'row';
      const label = document.createElement('label'); label.textContent = b.id; label.style.minWidth = '9em';
      const input = document.createElement('input'); input.type = 'text'; input.className = 'mono'; input.placeholder = 'Main model';
      input.setAttribute('aria-label', 'Model for ' + b.id + ' mode');
      input.value = draft.modeModels[b.id] || '';
      input.addEventListener('input', () => { draft.modeModels[b.id] = input.value; refreshDirty(); });
      row.appendChild(label); row.appendChild(input); box.appendChild(row);
    });
  }

  // agents (draft)
  function renderAgents() {
    const list = $('agent-list');
    list.textContent = '';
    if (!draft.agents.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No custom agents yet. Select New agent to add one.'; list.appendChild(p); }
    draft.agents.forEach((a, i) => {
      const card = document.createElement('div'); card.className = 'agent';
      card.innerHTML = '<div class="row"><strong>Custom agent</strong><span class="sp" style="flex:1"></span><button type="button" class="link rm">Remove</button></div>' +
        '<input type="text" class="f-id" placeholder="id, e.g. migrator" aria-label="Agent id" />' +
        '<input type="text" class="f-desc" placeholder="What it does" aria-label="Agent description" />' +
        '<textarea class="f-prompt" placeholder="System prompt" aria-label="System prompt"></textarea>';
      card.querySelector('.f-id').value = a.id;
      card.querySelector('.f-desc').value = a.description;
      card.querySelector('.f-prompt').value = a.systemPrompt;
      card.querySelector('.f-id').addEventListener('input', (e) => { draft.agents[i].id = e.target.value; refreshDirty(); });
      card.querySelector('.f-desc').addEventListener('input', (e) => { draft.agents[i].description = e.target.value; refreshDirty(); });
      card.querySelector('.f-prompt').addEventListener('input', (e) => { draft.agents[i].systemPrompt = e.target.value; refreshDirty(); });
      card.querySelector('.rm').addEventListener('click', () => { draft.agents.splice(i, 1); renderAgents(); refreshDirty(); });
      list.appendChild(card);
    });
    const bl = $('builtin-agents');
    bl.textContent = '';
    builtins.forEach((b) => {
      const row = document.createElement('div'); row.className = 'item';
      row.innerHTML = '<div class="main"><div class="name">' + esc(b.id) + '</div><div class="sub">' + esc(b.description) + '</div></div>';
      const dup = document.createElement('button'); dup.type = 'button'; dup.className = 'link'; dup.textContent = 'Duplicate';
      dup.addEventListener('click', () => { const copy = FS.agentsToDraft([b])[0]; copy.id = b.id + '-copy'; draft.agents.push(copy); renderAgents(); refreshDirty(); focusAgent(draft.agents.length - 1); });
      row.appendChild(dup); bl.appendChild(row);
    });
    $('badge-agents').textContent = String(draft.agents.length + builtins.length || '');
  }
  // A new card lands at the end of the list: bring it into view with its id field ready to type in.
  function focusAgent(i) {
    const card = $('agent-list').querySelectorAll('.agent')[i];
    if (!card) return;
    card.scrollIntoView({ block: 'nearest' });
    card.querySelector('.f-id').focus();
  }
  $('add-agent').addEventListener('click', () => { draft.agents.push({ id: '', description: '', systemPrompt: '', allowedTools: [], extra: {} }); renderAgents(); refreshDirty(); focusAgent(draft.agents.length - 1); });

  // permissions (draft)
  const TOOL_HELP = { read_file: 'read a file', read_image: 'look at an image (sent to the model)', list_files: 'list a folder', search_files: 'search file contents', find_symbol: 'find a definition', list_symbols: 'outline a file', find_references: 'find usages', write_file: 'create or overwrite a file', edit_file: 'change part of a file', edit_notebook: 'change a notebook cell', run_command: 'run a shell command', fetch_url: 'download a web page', memory_read: 'read project notes', memory_write: 'save project notes', sub_agent: 'start a helper agent', codebase_search: 'search by meaning' };
  function renderToolChecks(boxId, field) {
    const box = $(boxId);
    box.textContent = '';
    toolNames.forEach((t) => {
      const l = document.createElement('label');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = draft.sandbox[field].indexOf(t) >= 0;
      c.addEventListener('change', () => {
        const set = draft.sandbox[field].filter((x) => x !== t);
        if (c.checked) set.push(t);
        draft.sandbox[field] = set;
        refreshDirty();
      });
      l.title = TOOL_HELP[t] || t;
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + t));
      if (TOOL_HELP[t]) { const hint = document.createElement('span'); hint.className = 'muted'; hint.textContent = ' · ' + TOOL_HELP[t]; l.appendChild(hint); }
      box.appendChild(l);
    });
  }
  // One row per tool: Ask / Allow / Block. Allow = run without a prompt; Block = hidden from the agent.
  function toolMode(t) {
    if (draft.sandbox.denyTools.indexOf(t) >= 0) return 'block';
    return draft.autoApprove.indexOf(t) >= 0 ? 'allow' : 'ask';
  }
  function renderAllowedCommands(list) {
    const box = document.getElementById('allowed-list');
    box.textContent = '';
    if (!list.length) { const none = document.createElement('div'); none.className = 'd'; none.textContent = 'None yet.'; box.appendChild(none); return; }
    list.forEach((e) => {
      const row = document.createElement('div'); row.className = 'row allowed-row';
      const cmd = document.createElement('code'); cmd.textContent = e.command;
      const ws = document.createElement('span'); ws.className = 'd'; ws.textContent = ' in ' + e.workspace; ws.title = e.workspace;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'link'; rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Remove ' + e.command + ' in ' + e.workspace);
      rm.addEventListener('click', () => vscode.postMessage({ type: 'removeAllowedCommand', workspace: e.workspace, command: e.command }));
      row.appendChild(cmd); row.appendChild(ws); row.appendChild(rm);
      box.appendChild(row);
    });
  }

  function renderToolTable() {
    const box = $('tool-table');
    box.textContent = '';
    toolNames.forEach((t) => {
      const row = document.createElement('div'); row.className = 'tool-row';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = t;
      const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = TOOL_HELP[t] || ''; hint.title = TOOL_HELP[t] || '';
      const sel = document.createElement('select'); sel.setAttribute('aria-label', t + ': ask, allow or block');
      [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']].forEach((o) => {
        const opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1];
        if (o[0] === 'allow' && askOnlyTools.indexOf(t) >= 0) opt.disabled = true;
        sel.appendChild(opt);
      });
      sel.value = toolMode(t);
      sel.addEventListener('change', () => {
        draft.sandbox.denyTools = draft.sandbox.denyTools.filter((x) => x !== t);
        draft.autoApprove = draft.autoApprove.filter((x) => x !== t);
        if (sel.value === 'block') draft.sandbox.denyTools.push(t);
        if (sel.value === 'allow') draft.autoApprove = FS.sortedTools(draft.autoApprove.concat([t]));
        refreshDirty();
      });
      row.appendChild(name); row.appendChild(hint); row.appendChild(sel); box.appendChild(row);
    });
  }
  function renderRules() {
    const box = $('rules');
    box.textContent = '';
    if (draft.sandbox.rules.length) {
      const head = document.createElement('div'); head.className = 'rule-head';
      ['Tool', 'Applies to', 'Pattern'].forEach((t) => { const c = document.createElement('span'); c.textContent = t; head.appendChild(c); });
      box.appendChild(head);
    }
    draft.sandbox.rules.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'rule';
      const tool = document.createElement('select'); tool.setAttribute('aria-label', 'Tool');
      toolNames.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; tool.appendChild(o); });
      tool.value = r.tool;
      const dim = document.createElement('select'); dim.setAttribute('aria-label', 'Kind');
      DIMENSIONS.forEach((d) => { const o = document.createElement('option'); o.value = d[0]; o.textContent = d[1]; dim.appendChild(o); });
      dim.value = r.dimension;
      const pat = document.createElement('input'); pat.type = 'text'; pat.className = 'mono'; pat.placeholder = 'glob or regex'; pat.setAttribute('aria-label', 'Pattern'); pat.value = r.pattern;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'link'; rm.textContent = 'Remove';
      tool.addEventListener('change', () => { draft.sandbox.rules[i].tool = tool.value; refreshDirty(); });
      dim.addEventListener('change', () => { draft.sandbox.rules[i].dimension = dim.value; refreshDirty(); });
      pat.addEventListener('input', () => { draft.sandbox.rules[i].pattern = pat.value; refreshDirty(); });
      rm.addEventListener('click', () => { draft.sandbox.rules.splice(i, 1); renderRules(); refreshDirty(); });
      row.appendChild(tool); row.appendChild(dim); row.appendChild(pat); row.appendChild(rm); box.appendChild(row);
    });
  }
  $('add-rule').addEventListener('click', () => { draft.sandbox.rules.push({ tool: toolNames[0], dimension: 'deniedPaths', pattern: '' }); renderRules(); refreshDirty(); });

  // display (draft)
  $('block-default').addEventListener('change', () => { draft.blockDefault = $('block-default').value; refreshDirty(); });
  $('show-reasoning').addEventListener('change', () => { draft.showReasoning = $('show-reasoning').checked; refreshDirty(); });
  $('preset-review').addEventListener('click', () => { draft.blockDefault = 'expanded'; draft.showReasoning = true; renderAll(); });
  $('preset-autonomy').addEventListener('click', () => { draft.blockDefault = 'collapsed'; draft.showReasoning = false; renderAll(); });

  function renderAll() {
    if (!FS) return;
    $('provider').value = draft.provider;
    renderModelOptions();
    $('reasoning-effort').value = draft.reasoningEffort;
    $('hidden-providers').querySelectorAll('input').forEach((c) => { c.checked = draft.disabledProviders.indexOf(c.dataset.provider) < 0; });
    $('block-default').value = draft.blockDefault;
    $('show-reasoning').checked = draft.showReasoning;
    renderAgents();
    renderModeModels();
    renderToolChecks('allow-tools', 'allowTools');
    renderToolTable();
    renderRules();
    refreshDirty();
  }

  // MCP (immediate)
  let mcpLoaded = false;
  let mcpCatalogLoaded = false;
  function mcpTab(which) {
    $('mcp-tab-installed').setAttribute('aria-selected', String(which === 'installed'));
    $('mcp-tab-browse').setAttribute('aria-selected', String(which === 'browse'));
    $('mcp-installed').classList.toggle('hidden', which !== 'installed');
    $('mcp-browse').classList.toggle('hidden', which !== 'browse');
    if (which === 'browse' && !mcpCatalogLoaded) { mcpCatalogLoaded = true; vscode.postMessage({ type: 'mcpCatalog' }); }
  }
  $('mcp-tab-installed').addEventListener('click', () => mcpTab('installed'));
  $('mcp-tab-browse').addEventListener('click', () => mcpTab('browse'));
  $('mcp-reload').addEventListener('click', () => vscode.postMessage({ type: 'mcpReload' }));
  $('mcp-open-config').addEventListener('click', () => vscode.postMessage({ type: 'openMcpConfig', scope: 'user' }));
  function renderMcp(msg) {
    const box = $('mcp-installed');
    box.textContent = '';
    const failing = msg.servers.filter((s) => s.state === 'failed').length;
    const badge = $('badge-mcp');
    badge.textContent = failing ? String(failing) : (msg.servers.length ? String(msg.servers.length) : '');
    badge.classList.toggle('err', failing > 0);
    if (!msg.enabled) { box.innerHTML = '<p class="muted">MCP is turned off (forge.mcp.enabled).</p>'; return; }
    if (!msg.servers.length) { box.innerHTML = '<p class="muted">No MCP servers yet. Open the Browse tab to install one.</p>'; }
    else {
      const list = document.createElement('div'); list.className = 'list';
      msg.servers.forEach((s) => {
        const item = document.createElement('div'); item.className = 'item';
        const ws = s.scope === 'workspace';
        const stateLabel = { connected: 'Connected', failed: 'Failed', disabled: 'Off' }[s.state] || s.state;
        item.innerHTML = '<span class="dot ' + esc(s.state) + '" aria-hidden="true"></span>' +
          '<div class="main"><div class="name">' + esc(s.name) + ' <span class="pill">' + esc(s.scope) + '</span> <span class="pill">' + esc(stateLabel) + '</span></div>' +
          '<div class="sub' + (s.error ? ' err' : '') + '" title="' + esc(s.error || '') + '">' + esc(s.error ? "Can't connect: " + s.error : (ws ? 'Defined in .forge/mcp.json · ' : '') + s.description) + '</div></div>';
        const acts = document.createElement('span'); acts.className = 'row';
        if (s.tools.length) {
          const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'link'; tb.textContent = 'Tools';
          tb.addEventListener('click', () => { const body = item.nextElementSibling; body.hidden = !body.hidden; tb.textContent = body.hidden ? 'Tools' : 'Hide tools'; });
          acts.appendChild(tb);
        }
        if (s.state === 'failed') {
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn sec'; retry.textContent = 'Retry';
          retry.addEventListener('click', () => vscode.postMessage({ type: 'mcpReload' }));
          acts.appendChild(retry);
        }
        if (ws) {
          const open = document.createElement('button'); open.type = 'button'; open.className = 'link'; open.textContent = 'Open workspace mcp.json';
          open.addEventListener('click', () => vscode.postMessage({ type: 'openMcpConfig', scope: 'workspace' }));
          acts.appendChild(open);
        } else {
          const t = document.createElement('input'); t.type = 'checkbox'; t.checked = s.state !== 'disabled'; t.setAttribute('aria-label', 'Turn ' + s.name + ' on or off');
          t.addEventListener('change', () => vscode.postMessage({ type: 'mcpToggle', name: s.name }));
          const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'link'; rm.textContent = 'Remove';
          rm.addEventListener('click', () => vscode.postMessage({ type: 'mcpRemove', name: s.name }));
          acts.appendChild(t); acts.appendChild(rm);
        }
        item.appendChild(acts);
        list.appendChild(item);
        const body = document.createElement('div'); body.className = 'item-body'; body.hidden = true;
        s.tools.forEach((n) => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = n; body.appendChild(c); });
        list.appendChild(body);
      });
      box.appendChild(list);
    }
    if (msg.projectSkipped) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Workspace MCP config skipped: this workspace is not trusted.'; box.appendChild(p); }
  }
  function renderMcpCatalog(msg) {
    const box = $('mcp-browse');
    box.textContent = '';
    if (msg.warning) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = msg.warning; box.appendChild(p); }
    const grid = document.createElement('div'); grid.className = 'cards';
    msg.entries.forEach((e) => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = '<strong>' + esc(e.displayName) + '</strong><span class="muted" style="font-size:12px">' + esc(e.description) + '</span>' +
        '<div class="row"><span class="mono muted" title="' + esc(e.command) + '">' + esc(e.command.length > 34 ? e.command.slice(0, 33) + '…' : e.command) + '</span></div>';
      const row = card.querySelector('.row');
      if (e.installed) { const s = document.createElement('span'); s.className = 'ok'; s.textContent = 'Installed'; row.appendChild(s); }
      else { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Install'; b.addEventListener('click', () => vscode.postMessage({ type: 'mcpInstall', name: e.name })); row.appendChild(b); }
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  // skills (immediate)
  let skillsLoaded = false;
  const SCOPES = [['local', 'This workspace', 'skills/'], ['project', 'This project', '.forge/skills/'], ['global', 'Your account', '~/.forge/skills/']];
  $('skills-rescan').addEventListener('click', () => vscode.postMessage({ type: 'skillsList' }));
  $('skills-browse').addEventListener('click', () => vscode.postMessage({ type: 'skillCatalog' }));
  function renderSkills(skills) {
    const box = $('skills-list');
    box.textContent = '';
    $('badge-skills').textContent = skills.length ? String(skills.length) : '';
    SCOPES.forEach((sc) => {
      const label = document.createElement('div'); label.className = 'group-label'; label.textContent = sc[1];
      const where = document.createElement('span'); where.className = 'path'; where.textContent = sc[2]; label.appendChild(where); box.appendChild(label);
      const inScope = skills.filter((s) => s.scope === sc[0]);
      if (!inScope.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'None yet.'; box.appendChild(p); return; }
      const list = document.createElement('div'); list.className = 'list';
      inScope.forEach((s) => {
        const item = document.createElement('div'); item.className = 'item';
        item.innerHTML = '<div class="main"><div class="name">' + esc(s.name) + '</div><div class="sub">' + esc(s.description) + '</div></div>';
        const open = document.createElement('button'); open.type = 'button'; open.className = 'link'; open.textContent = 'Open';
        open.addEventListener('click', () => vscode.postMessage({ type: 'skillOpen', path: s.path }));
        item.appendChild(open); list.appendChild(item);
      });
      box.appendChild(list);
    });
  }
  /** Success notes use the green style; everything else keeps the warning style. */
  function say(text, ok) { const b = $('banner'); b.textContent = text; b.classList.toggle('ok', !!ok); }

  function showEffective(effective) {
    $('provider-effective').textContent = effective
      ? 'The chat is using ' + effective + '.'
      : 'No provider is configured yet: add an API key (API keys section) or set one in the environment.';
  }

  function renderSkillCatalog(entries, error) {
    const box = $('skills-catalog');
    box.textContent = '';
    const label = document.createElement('div'); label.className = 'group-label'; label.textContent = 'Catalog'; box.appendChild(label);
    if (error || !entries.length) {
      const p = document.createElement('p'); p.className = error ? 'err' : 'muted'; p.textContent = error || 'The catalog has no skills yet.';
      box.appendChild(p);
      return;
    }
    const grid = document.createElement('div'); grid.className = 'cards';
    entries.forEach((e) => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = '<strong>' + esc(e.displayName) + '</strong><span class="muted" style="font-size:12px">' + esc(e.description) + '</span><div class="row"></div>';
      const row = card.querySelector('.row');
      if (e.installed) { const s = document.createElement('span'); s.className = 'ok'; s.textContent = 'Installed'; row.appendChild(s); }
      else { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Install'; b.addEventListener('click', () => vscode.postMessage({ type: 'skillInstall', name: e.name })); row.appendChild(b); }
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  // backup
  $('export-btn').addEventListener('click', () => vscode.postMessage({ type: 'exportSettings' }));
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    // Forget the pick, or choosing the same file again (after fixing it) fires no change event.
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { vscode.postMessage({ type: 'importSettings', data: JSON.parse(reader.result) }); }
      catch (err) { $('banner').textContent = 'That file is not valid JSON: ' + err.message; }
    };
    reader.readAsText(file);
  });

  // host messages
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!FS) return;
    switch (msg.type) {
      case 'allowedCommandsListed':
        renderAllowedCommands(msg.commands);
        break;
      case 'loaded':
        vscode.postMessage({ type: 'loadAllowedCommands' });
        saved = FS.applyConfig(saved, msg.config);
        draft = FS.applyConfig(draft, msg.config);
        showEffective(msg.effective);
        effectiveProvider = msg.effective ? msg.effective.split('/')[0] : '';
        renderAll();
        requestModels(false);
        break;
      case 'modelsLoaded':
        if (keyNotes[msg.provider] && keyNotes[msg.provider].text === 'Testing…') {
          keyNotes[msg.provider] = msg.source === 'live'
            ? { ok: true, text: '✓ Works: ' + msg.models.length + ' models available' }
            : { ok: false, text: msg.error || 'Could not check this key.' };
          renderKeys();
        }
        modelLists[msg.provider] = { models: msg.models, source: msg.source, error: msg.error };
        modelLoading[msg.provider] = false;
        renderModelOptions();
        break;
      case 'saved':
        saved = FS.applyConfig(saved, msg.config);
        if (pending.snapshot) saved = FS.markSaved(saved, pending.snapshot, pending.config);
        showEffective(msg.effective);
        say('Saved. Changes apply to your next message.', true);
        refreshDirty();
        break;
      case 'sandboxLoaded':
        saved.sandbox = FS.sandboxToDraft(msg.sandbox);
        draft.sandbox = FS.sandboxToDraft(msg.sandbox);
        renderAll();
        break;
      case 'sandboxSaved':
        say('Saved. Changes apply to your next message.', true);
        if (pending.snapshot) saved = FS.markSaved(saved, pending.snapshot, ['sandbox']);
        refreshDirty();
        break;
      case 'agentsLoaded':
        builtins = msg.agents.filter((a) => a.builtin);
        saved.agents = FS.agentsToDraft(msg.agents.filter((a) => !a.builtin));
        draft.agents = clone(saved.agents);
        renderAll();
        break;
      case 'agentsSaved':
        say('Saved. Changes apply to your next message.', true);
        if (pending.snapshot) saved = FS.markSaved(saved, pending.snapshot, ['agents']);
        refreshDirty();
        break;
      case 'keysLoaded':
        keysSet = new Set(msg.set);
        envKeys = msg.env || {};
        renderKeys();
        renderModelOptions();
        requestModels(false);
        break;
      case 'keySaved':
      case 'keyDeleted':
        vscode.postMessage({ type: 'loadKeys' });
        break;
      case 'mcpListed':
        renderMcp(msg);
        break;
      case 'mcpCatalogListed':
        renderMcpCatalog(msg);
        break;
      case 'skillsListed':
        renderSkills(msg.skills);
        break;
      case 'skillCatalogListed':
        renderSkillCatalog(msg.entries, msg.error);
        break;
      case 'settingsExported': {
        const blob = new Blob([JSON.stringify(msg.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'forge-settings.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        break;
      }
      case 'settingsImported':
        say('Settings imported.', true);
        vscode.postMessage({ type: 'load' });
        vscode.postMessage({ type: 'loadAgents' });
        vscode.postMessage({ type: 'loadSandbox', cwd: '' });
        break;
      case 'notice':
        say(msg.message, /^(Exported|Saved|Settings imported)/.test(msg.message));
        break;
      case 'error':
        $('banner').textContent = 'Could not save: ' + msg.message;
        break;
    }
  });

  showSection('model');
  vscode.postMessage({ type: 'load' });
  vscode.postMessage({ type: 'loadAgents' });
  vscode.postMessage({ type: 'loadSandbox', cwd: '' });
  vscode.postMessage({ type: 'loadKeys' });
</script>
</body>
</html>`;
}

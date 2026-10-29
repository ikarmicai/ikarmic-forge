import { BUILTIN_TOOLS, MODEL_CATALOG, SUPPORTED_PROVIDERS } from '@ikarmic/forge-core';

import { PROVIDER_LABELS } from '../provider-labels.js';
import { i18nScript } from '../chat/webview-i18n.js';
import { DESIGN_CSS } from '../design/index.js';

/**
 * Forge Settings page: section nav with search, one Save/Discard bar for
 * draft edits, and immediate actions for API keys, MCP servers and skills.
 * Pure helpers come from dist/webview/settings-ui.js (`window.ForgeSettings`).
 *
 */
/** Layout for this page, in tokens. A colour or a size under 12px here fails the design-system test. */
export const SETTINGS_CSS = `
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; }
  .layout { flex: 1; min-height: 0; display: flex; }
  nav { flex: none; width: 220px; border-right: var(--border-hairline) solid var(--line-subtle); background: var(--bg-surface); padding: var(--space-sm) var(--space-xs); display: flex; flex-direction: column; gap: var(--space-2xs); overflow-y: auto; }
  nav input[type="search"] { margin-bottom: var(--space-xs); }
  .navlist { display: flex; flex-direction: column; gap: 2px; }
  #section-picker { display: none; margin-bottom: var(--space-xs); }
  nav .sep { font: var(--text-overline); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-muted); padding: var(--space-sm) var(--space-xs) var(--space-2xs); }
  nav .ik-badge { margin-left: auto; }
  .ik-badge:empty { display: none; }
  /* The page is measured by its own column, not the window: beside the sidebar and the chat the column is about 450px in a window twice that. */
  main { container: pane / inline-size; flex: 1; min-width: 0; overflow-y: auto; padding: var(--space-md) var(--space-lg) var(--space-xl); }
  section[hidden], #search-results[hidden], #unsaved[hidden], .row[hidden], .hidden { display: none !important; }
  h2 { font: var(--text-page); color: var(--ink-strong); margin: 0 0 var(--space-2xs); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
  h2 .sp { flex: 1; }
  h2 .ik-badge, h2 .ik-btn { font-weight: 400; }
  .lead { color: var(--ink-muted); margin: 0 0 var(--space-md); max-width: 70ch; }
  #banner { margin: 0 0 var(--space-sm); }
  #banner:empty { display: none; }
  /* minmax(0, 1fr): a single column that may shrink, so a long no-wrap row (a workspace path) cannot widen the page. */
  /* The row bleeds 12px each side so the hover colour has room, but its text and its separator sit on the page gutter, like the heading above it. */
  .setting { position: relative; padding: var(--space-sm); margin: 0 calc(-1 * var(--space-sm)); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2xs); }
  .setting::after { content: ""; position: absolute; left: var(--space-sm); right: var(--space-sm); bottom: 0; height: var(--border-hairline); background: var(--line-subtle); }
  .setting:hover { background: var(--bg-overlay); }
  .setting.modified { box-shadow: inset var(--border-strong) 0 0 var(--warning); }
  .setting.flash { outline: var(--border-strong) solid var(--focus-ring); outline-offset: calc(-1 * var(--border-strong)); }
  .setting .t { font: var(--text-title-sm); color: var(--ink-strong); }
  .setting.modified .t::after { content: " (modified)"; font-weight: 400; color: var(--ink-muted); }
  .setting .d { color: var(--ink-muted); font: var(--text-caption); max-width: 70ch; }
  .err, .kstatus.bad { color: var(--danger); }
  .kstatus.ok { color: var(--success); }
  /* Wide windows: the name and its description sit beside the control, so the page is not a tall single column. */
  @media (min-width: 1000px) {
    .setting { grid-template-columns: minmax(200px, 320px) minmax(0, 1fr); column-gap: var(--space-xl); align-items: start; }
    .setting > .t { grid-column: 1; }
    .setting > .t + .d { grid-column: 1; }
    .setting > :not(.t):not(.t + .d) { grid-column: 2; }
    .setting > .d { max-width: none; }
  }
  .row { display: flex; align-items: center; gap: var(--space-xs); flex-wrap: wrap; }
  .allowed-row { flex-wrap: nowrap; }
  .allowed-row code { flex: none; font: var(--text-code); }
  .allowed-row .d { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .ik-input, .row .ik-select, nav .ik-input { width: min(320px, 100%); }
  .row .ik-combo { width: min(320px, 100%); }
  .row input[type="number"].ik-input { width: min(140px, 100%); }
  .row .ik-combo .ik-input { width: 100%; }
  nav .ik-input, #section-picker { width: 100%; }
  .rule .ik-input, .rule .ik-select, .agent .ik-input, .agent .ik-textarea, .setting .ik-textarea { width: 100%; }
  input[type="checkbox"] { accent-color: var(--ion); margin: 0; }
  .setting .row label { display: inline-flex; align-items: center; gap: var(--space-xs); min-height: var(--control); }
  .list { overflow: hidden; }
  .item { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) var(--space-sm); min-width: 0; }
  .item + .item, .item + .item-body, .item-body + .item { border-top: var(--border-hairline) solid var(--line-subtle); }
  .item .main { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .item .name { font-weight: 600; color: var(--ink-strong); display: flex; gap: var(--space-xs); align-items: center; flex-wrap: wrap; }
  .item .sub { font: var(--text-caption); color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .sub.err { color: var(--danger); }
  #builtin-agents .item .sub { white-space: normal; }
  .item-body { padding: var(--space-xs) var(--space-sm) var(--space-sm) var(--space-xl); display: flex; flex-wrap: wrap; gap: var(--space-2xs); background: var(--bg-sunken); }
  .dot { width: 8px; height: 8px; border-radius: var(--radius-pill); flex: none; background: var(--ink-muted); }
  .dot.connected { background: var(--success); } .dot.failed { background: var(--danger); } .dot.needs-auth { background: var(--warning); } .dot.disabled { background: transparent; box-shadow: inset 0 0 0 2px var(--ink-muted); }
  .group-label { font: var(--text-overline); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-body); margin: var(--space-lg) 0 var(--space-xs); padding-bottom: var(--space-2xs); border-bottom: var(--border-hairline) solid var(--line-subtle); }
  .group-label .path { text-transform: none; letter-spacing: 0; font: var(--text-code); margin-left: var(--space-xs); }
  .ik-tabs { margin-bottom: var(--space-sm); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-xs); }
  /* minmax(0, 1fr): an input has an intrinsic width, and a plain grid column grows to fit it instead of the card. */
  .card, .agent { padding: var(--pad-card); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-xs); }
  .agent { margin-top: var(--space-xs); }
  .card .row { justify-content: space-between; margin-top: var(--space-2xs); }
  .listed { display: grid; gap: var(--space-xs); width: min(560px, 100%); }
  .listed-items { display: grid; gap: var(--space-xs); }
  .listed-row { display: flex; flex-wrap: wrap; gap: var(--space-xs); align-items: center; }
  .listed-row .ik-input { flex: 1 1 12rem; min-width: 0; width: auto; }
  .pagebar { display: flex; flex-wrap: wrap; gap: var(--space-xs) var(--space-md); justify-content: flex-end; margin-bottom: var(--space-2xs); }
  .card.keyed { padding: 0; gap: 0; }
  .card.keyed .ik-card__head { display: grid; gap: var(--space-2xs); }
  .card.keyed .ik-card__head .row { margin-top: 0; }
  .card.keyed .ik-card__foot .cmd { min-width: 0; overflow-wrap: anywhere; }
  .grow { flex: 1 1 0; }
  /* The key dialog: a fixed layer over the page. The scrim and the dialog are the design system's; only the placement is here. */
  .dlg-layer { position: fixed; inset: 0; z-index: 20; }
  .dlg-layer .ik-dialog { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(28rem, calc(100% - 2 * var(--space-md))); max-height: calc(100% - 2 * var(--space-md)); overflow-y: auto; display: grid; gap: var(--space-sm); }
  .dlg-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .dlg-head h2 { margin: 0; font: var(--text-title-sm); color: var(--ink-strong); }
  .dlg-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-xs); }
  .key-row { display: flex; gap: var(--space-xs); }
  .key-row .ik-input { flex: 1 1 0; min-width: 0; }
  .rule-head { display: flex; gap: var(--space-xs); font: var(--text-overline); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-muted); margin-bottom: var(--space-2xs); }
  .checks { display: flex; flex-wrap: wrap; gap: 2px var(--space-md); }
  .checks label { display: flex; gap: var(--space-xs); align-items: center; min-height: var(--control); font: var(--text-code); }
  /* Provider names are product names, not code; only tool names read as monospace. */
  #hidden-providers label { font-family: inherit; }
  #hidden-providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 2px var(--space-md); }
  /* One row per tool: the name over its description on the left, the Ask / Allow / Block control centred on the right. */
  .tool-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-md); align-items: center; padding: var(--space-xs) 0; border-bottom: var(--border-hairline) solid var(--line-subtle); }
  /* A long list gets the whole width, not the right-hand column. */
  .setting.stack { grid-template-columns: minmax(0, 1fr) !important; }
  .setting.stack > * { grid-column: 1 !important; }
  .setting.stack > .d { max-width: 70ch !important; }
  .tool-row .name { grid-column: 1; grid-row: 1; min-width: 0; font: var(--text-label); color: var(--ink-strong); overflow-wrap: anywhere; }
  .tool-row .hint { grid-column: 1; grid-row: 2; min-width: 0; font: var(--text-caption); color: var(--ink-muted); overflow-wrap: anywhere; }
  .tool-row > .ik-seg { grid-column: 2; grid-row: 1 / span 2; }
  .kind { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2xs); }
  .kind + .kind { margin-top: var(--space-xs); }
  .setting .row.kind label { min-height: 0; color: var(--ink-muted); font: var(--text-caption); }
  /* A form of labelled fields: two columns when there is room, one when there is not. */
  .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); max-width: 720px; margin-top: var(--space-sm); }
  .form .full { grid-column: 1 / -1; }
  .form .ik-label { color: var(--ink-strong); }
  /* Controls sit at the bottom of their cell, so a label that wraps never pushes its input out of line with its neighbour. */
  .form .ik-field { justify-content: flex-end; }
  @media (max-width: 900px) { .form { grid-template-columns: minmax(0, 1fr); } }
  details.adv { margin: var(--space-sm) 0; }
  details.adv > summary { cursor: pointer; min-height: var(--control); color: var(--ink-muted); }
  .rule { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(130px, 1fr) minmax(140px, 2fr) auto; gap: var(--space-xs); align-items: center; margin-top: var(--space-xs); }
  .pattern-rule { grid-template-columns: minmax(110px, 1fr) minmax(140px, 2fr) auto auto auto auto auto; }
  .keyrow { display: grid; grid-template-columns: 120px minmax(110px, 160px) minmax(110px, 1fr) auto; gap: var(--space-xs); align-items: center; padding: var(--space-xs) 0; }
  .keyrow > .kcell { display: grid; gap: var(--space-2xs); overflow-wrap: anywhere; font: var(--text-caption); }
  .kmore { display: flex; gap: var(--space-sm); }
  .kmore .ik-btn { min-height: 24px; }
  .agent .ik-field { gap: var(--space-2xs); }
  .agent-title { font: var(--text-title-sm); color: var(--ink-strong); }
  @container pane (max-width: 500px) { .keyrow { grid-template-columns: minmax(0, 1fr) 9.5rem; } .keyrow > .kcell { justify-items: end; text-align: right; } }
  .keyrow + .keyrow { border-top: var(--border-hairline) solid var(--line-subtle); }
  .keyrow .kstatus { overflow-wrap: normal; }
  .keyrow .row { flex-wrap: nowrap; gap: var(--space-2xs); }
  #unsaved { flex: none; display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-md); border-top: var(--border-hairline) solid var(--line-subtle); background: var(--bg-surface); }
  #unsaved .sp { flex: 1; }
  #unsaved .dotmark { color: var(--warning); }
  #search-results button { display: block; width: 100%; text-align: left; border: 0; border-bottom: var(--border-hairline) solid var(--line-subtle); border-radius: 0; background: none; color: var(--ink-body); font: inherit; padding: var(--space-xs) var(--space-sm); cursor: pointer; }
  #search-results button:hover { background: var(--bg-overlay); }
  #search-results mark { background: var(--warning-tint); color: inherit; border-radius: var(--radius-xs); }
  #search-results .count { color: var(--ink-muted); font: var(--text-caption); margin: 0 0 var(--space-xs); }
  #search-results .crumb { color: var(--ink-muted); font: var(--text-overline); text-transform: uppercase; letter-spacing: .05em; }
  @media (max-width: 560px) {
    .layout { flex-direction: column; }
    nav { width: auto; border-right: 0; border-bottom: var(--border-hairline) solid var(--line-subtle); overflow-y: visible; padding: var(--space-xs); }
    /* Search stays available in a split editor, above a section picker (a strip of 14 buttons clipped its labels). */
    .navlist { display: none; }
    #section-picker { display: block; }
    .keyrow, .rule { grid-template-columns: 1fr; }
  }
`;

export function getSettingsHtml(opts: { scriptUri?: string; cspSource?: string; strings?: Record<string, string> } = {}): string {
  const i18n = i18nScript(opts.strings ?? {});
  const i18nBlock = i18n ? `<script>${i18n}</script>\n` : '';
  const scriptSrc = opts.cspSource ? `'unsafe-inline' ${opts.cspSource}` : `'unsafe-inline'`;
  const tools = BUILTIN_TOOLS.map((t) => t.name);
  const askOnly = BUILTIN_TOOLS.filter((t) => t.destructive).map((t) => t.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc};">
<style>${DESIGN_CSS}</style>
<style>${SETTINGS_CSS}</style>
</head>
<body class="ik-root" data-density="roomy">
<script src="${opts.scriptUri ?? ''}" onerror="window.__forgeSettingsLoadFailed=true"></script>
<div class="layout">
  <nav id="settings-nav" aria-label="Settings sections">
    <input class="ik-input" type="search" id="search" placeholder="Search settings" aria-label="Search settings" />
    <select class="ik-select" id="section-picker" aria-label="Settings section">
      <option value="model">Model</option>
      <option value="keys">API keys</option>
      <option value="providers">Providers</option>
      <option value="agents">Agents</option>
      <option value="mcp">MCP servers</option>
      <option value="skills">Skills</option>
      <option value="instructions">Instructions</option>
      <option value="perm">Permissions</option>
      <option value="context">Context and memory</option>
      <option value="safety">Safety and cost</option>
      <option value="notifications">Notifications</option>
      <option value="tools">Tools and web</option>
      <option value="git">Git and quality</option>
      <option value="advanced">Advanced</option>
      <option value="display">Display</option>
      <option value="backup">Backup</option>
      <option value="about">About</option>
    </select>
    <div class="navlist">
    <button type="button" class="ik-navitem" data-section="model"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z"/></svg>Model</button>
    <button type="button" class="ik-navitem" data-section="keys"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 4.5a2.5 2.5 0 1 0-1 2L13 13M11 9l2 2"/></svg>API keys</button>
    <button type="button" class="ik-navitem" data-section="providers"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 11.5a3 3 0 0 1 .3-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.4 5z"/></svg>Providers</button>
    <div class="sep">Agent behaviour</div>
    <button type="button" class="ik-navitem" data-section="agents"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4"/></svg>Agents<span class="ik-badge" id="badge-agents"></span></button>
    <button type="button" class="ik-navitem" data-section="mcp"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0zM8 11.5v2"/></svg>MCP servers<span class="ik-badge" id="badge-mcp"></span></button>
    <button type="button" class="ik-navitem" data-section="skills"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2L4 9h4l-1 5 5-7H8z"/></svg>Skills<span class="ik-badge" id="badge-skills"></span></button>
    <button type="button" class="ik-navitem" data-section="instructions"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4"/></svg>Instructions</button>
    <button type="button" class="ik-navitem" data-section="perm"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4z"/></svg>Permissions</button>
    <div class="sep">Behaviour</div>
    <button type="button" class="ik-navitem" data-section="context"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l6 3-6 3-6-3zM2 8.5l6 3 6-3M2 11l6 3 6-3"/></svg>Context and memory</button>
    <button type="button" class="ik-navitem" data-section="safety"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 7h9v6.5h-9zM5.5 7V5.5a2.5 2.5 0 0 1 5 0V7"/></svg>Safety and cost</button>
    <button type="button" class="ik-navitem" data-section="notifications"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5v2.5L3 11h10l-1.5-2.5V6A3.5 3.5 0 0 0 8 2.5zM6.5 13a1.5 1.5 0 0 0 3 0"/></svg>Notifications</button>
    <button type="button" class="ik-navitem" data-section="tools"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5a3 3 0 0 0-2.8 4L2.5 11.7a1.4 1.4 0 0 0 2 2l5.2-5.2a3 3 0 0 0 4-2.8l-2 2-1.7-.5-.5-1.7z"/></svg>Tools and web</button>
    <button type="button" class="ik-navitem" data-section="git"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5v8M11 5.5v1c0 2-6 1-6 4M5 13.5a1 1 0 1 0 0-.01M11 3.5a1 1 0 1 0 0-.01"/></svg>Git and quality</button>
    <button type="button" class="ik-navitem" data-section="advanced"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h6M11 5h2M3 11h2M7 11h6M9 3.5v3M5 9.5v3"/></svg>Advanced</button>
    <div class="sep">Editor</div>
    <button type="button" class="ik-navitem" data-section="display"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/></svg>Display</button>
    <button type="button" class="ik-navitem" data-section="backup"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10"/></svg>Backup</button>
    <button type="button" class="ik-navitem" data-section="about"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 7v4M8 4.8v.01M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"/></svg>About</button>
    </div>
  </nav>
  <main id="pane">
    <div class="pagebar">
      <button type="button" class="ik-btn ik-btn--link" id="bar-user-config">Open user config</button>
      <button type="button" class="ik-btn ik-btn--link" id="bar-project-config">Open project config</button>
      <button type="button" class="ik-btn ik-btn--link" id="bar-reload">Reload settings</button>
    </div>
    <div id="banner" class="ik-note ik-note--warning" role="status" aria-live="polite"></div>
    <div id="search-results" hidden></div>

    <section id="sec-model">
      <h2>Model</h2>
      <p class="lead">The provider and model Forge uses for chat, specs and agents. Agents can override this.</p>
      <div class="setting" id="row-provider"><div class="t">Provider</div><div class="d">API keys are stored in VS Code's secret storage.</div>
        <div class="row"><select class="ik-select" id="provider" aria-label="Provider"></select><span id="provider-key" class="ik-muted"></span></div>
        <div class="d" id="provider-effective" aria-live="polite"></div></div>
      <div class="setting" id="row-model"><div class="t">Model</div>
        <div class="d">Models come from the provider itself, so the list is current for your key.</div>
        <div class="row"><select class="ik-select" id="model" aria-label="Model"></select></div>
        <div class="row" id="model-custom-row" hidden><input type="text" id="model-custom" class="ik-input ik-input--mono" aria-label="Custom model id" placeholder="model id, e.g. my-model-v2" /></div>
        <div class="d"><span id="model-status" aria-live="polite"></span> <button type="button" class="ik-btn ik-btn--link" id="model-refresh">Refresh</button></div></div>
      <div class="setting" id="row-effort"><div class="t">Reasoning effort</div><div class="d">Only used by models that support it.</div>
        <div class="row"><select class="ik-select" id="reasoning-effort" aria-label="Reasoning effort">
          <option value="">Provider default</option><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option>
        </select></div></div>
      <div class="setting" id="row-hidden"><div class="t">Providers</div><div class="d">Turn a provider off to skip it in auto-detect and leave it out of the model pickers.</div>
        <div class="checks" id="hidden-providers"></div></div>
      <div class="setting" id="row-mode-models"><div class="t">Model per mode</div><div class="d">Give a built-in mode its own model (provider:model, a model id or an alias). Blank uses the main model; Agent mode always does.</div>
        <div id="mode-model-list"></div></div>
      <div class="setting" id="row-compaction-model"><div class="t">Compaction model</div><div class="d">The model that summarises long chats. Blank uses the main model.</div>
        <div class="row"><div class="ik-combo" data-combo="models"><input type="text" id="compaction-model" class="ik-input ik-input--mono" role="combobox" aria-expanded="false" autocomplete="off" aria-label="Compaction model" placeholder="model id or alias" /><button type="button" class="ik-combo__toggle" tabindex="-1" aria-label="Show models"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></button><div class="ik-combo__list" role="listbox" hidden></div></div></div></div>
      <div class="setting" id="row-subagent-model"><div class="t">Sub-agent model</div><div class="d">The model helper agents use. Blank uses the chat model.</div>
        <div class="row"><div class="ik-combo" data-combo="models"><input type="text" id="subagent-model" class="ik-input ik-input--mono" role="combobox" aria-expanded="false" autocomplete="off" aria-label="Sub-agent model" placeholder="model id, alias or id:model" /><button type="button" class="ik-combo__toggle" tabindex="-1" aria-label="Show models"><svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></button><div class="ik-combo__list" role="listbox" hidden></div></div></div></div>
      <div class="setting" id="row-retention"><div class="t">Delete old chats</div><div class="d">Delete saved chats not used for this many days when Forge starts. Blank keeps everything.</div>
        <div class="row"><input type="text" id="retention-days" inputmode="numeric" class="ik-input ik-input--mono" aria-label="Days to keep chats" placeholder="blank keeps all" /></div>
        <div class="row"><button type="button" class="ik-btn ik-btn--secondary" id="prune-chats">Delete old chats now</button></div>
        <div class="d" id="cleanup-last" aria-live="polite"></div>
        <div class="err" id="retention-error" aria-live="polite"></div></div>
    </section>

    <section id="sec-keys" hidden>
      <h2>API keys<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Stored in VS Code's secret storage, never in settings files. A key can also come from an environment variable such as OPENAI_API_KEY; the row says so.</p>
      <div id="row-keys"><div id="key-rows"></div></div>
      <div class="group-label">Cloud accounts</div>
      <p class="ik-muted">AWS Bedrock, Google Vertex AI and Azure OpenAI use your cloud account, not a key stored here. This is what Forge finds for each; no value is shown.</p>
      <div class="ik-card list" id="cloud-status"></div>
    </section>

    <section id="sec-providers" hidden>
      <h2>Providers<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Add any OpenAI-compatible service, or start from a preset. A model on it is written id:model, such as groq:llama-3.3-70b-versatile.</p>
      <div id="row-providers">
        <div id="provider-list"></div>
        <div class="group-label">Add or edit a provider</div>
        <div class="form">
          <div class="ik-field full"><label class="ik-label" for="prov-preset">Start from a preset</label><select class="ik-select" id="prov-preset" aria-label="Start from a preset"></select></div>
          <div class="ik-field"><label class="ik-label" for="prov-id">Provider id</label><input type="text" id="prov-id" class="ik-input ik-input--mono" aria-label="Provider id" placeholder="id, e.g. groq or my-gateway" /></div>
          <div class="ik-field"><label class="ik-label" for="prov-name">Display name</label><input class="ik-input" type="text" id="prov-name" aria-label="Display name" placeholder="display name" /></div>
          <div class="ik-field full"><label class="ik-label" for="prov-url">Base URL</label><input type="text" id="prov-url" class="ik-input ik-input--mono" aria-label="Base URL" placeholder="https://api.example.com/v1" /></div>
          <div class="ik-field"><label class="ik-label" for="prov-env">Environment variable for the key</label><input type="text" id="prov-env" class="ik-input ik-input--mono" aria-label="Environment variable for the key" placeholder="key from this environment variable" /></div>
          <div class="ik-field"><label class="ik-label" for="prov-key">API key</label><input class="ik-input" type="password" id="prov-key" autocomplete="off" aria-label="API key" placeholder="or paste a key (kept as plain text in the config file)" /></div>
          <div class="ik-field"><label class="ik-label" for="prov-api">API style</label><select class="ik-select" id="prov-api" aria-label="API style"><option value="openai-compatible">OpenAI compatible</option><option value="anthropic">Anthropic messages</option></select></div>
          <div class="ik-field"><label class="ik-label" for="prov-timeout">Request timeout in milliseconds</label><input type="number" id="prov-timeout" min="1" class="ik-input ik-input--mono" aria-label="Request timeout in milliseconds" placeholder="timeout ms" /></div>
          <div class="ik-field"><label class="ik-label" for="prov-chunk">Stream idle timeout in milliseconds</label><input type="number" id="prov-chunk" min="1" class="ik-input ik-input--mono" aria-label="Stream idle timeout in milliseconds" placeholder="idle ms" /></div>
          <div class="row full"><button type="button" class="ik-btn ik-btn--primary" id="prov-save">Save provider</button><button type="button" class="ik-btn ik-btn--secondary" id="prov-clear">Clear form</button></div>
        </div>
      </div>
    </section>

    <section id="sec-agents" hidden>
      <h2>Agents<span class="sp"></span><button type="button" class="ik-btn ik-btn--primary" id="add-agent">New agent</button></h2>
      <p class="lead">Agents show up in the chat's mode menu and can be used in parallel runs. Built-in agents can't be edited; add your own agent to change how one behaves.</p>
      <div id="row-agents"><div class="group-label">Your agents</div><div id="agent-list"></div><div class="group-label">Built in</div><div class="ik-card list" id="builtin-agents"></div></div>
    </section>

    <section id="sec-mcp" hidden>
      <h2>MCP servers<span class="ik-badge ik-badge--outline">Saves instantly</span><span class="sp"></span><button type="button" class="ik-btn ik-btn--secondary" id="mcp-reload">Reload</button><button type="button" class="ik-btn ik-btn--secondary" id="mcp-open-config">Open mcp.json</button></h2>
      <p class="lead">Servers give Forge extra tools. Turned-off servers don't start, and their tools are hidden from the agent.</p>
      <div id="row-mcp">
        <div class="ik-tabs" role="tablist"><button type="button" role="tab" id="mcp-tab-installed" aria-selected="true" aria-controls="mcp-installed" tabindex="0">Installed</button><button type="button" role="tab" id="mcp-tab-browse" aria-selected="false" aria-controls="mcp-browse" tabindex="-1">Browse</button></div>
        <div id="mcp-installed" role="tabpanel" aria-labelledby="mcp-tab-installed"><p class="ik-muted">Loading MCP servers…</p></div>
        <div id="mcp-browse" class="hidden" role="tabpanel" aria-labelledby="mcp-tab-browse"><p class="ik-muted">Loading the catalog…</p></div>
      </div>
    </section>

    <section id="sec-skills" hidden>
      <h2>Skills<span class="ik-badge ik-badge--outline">Saves instantly</span><span class="sp"></span><button type="button" class="ik-btn ik-btn--secondary" id="skills-rescan">Rescan</button><button type="button" class="ik-btn ik-btn--primary" id="skills-browse">Browse catalog</button></h2>
      <p class="lead">Skills are Markdown instructions Forge loads when a task matches them, read from three folders. Browse the catalog to install one.</p>
      <div id="row-skills"><div id="skills-list"><p class="ik-muted">Loading skills…</p></div><div id="skills-catalog"></div></div>
    </section>

    <section id="sec-perm" hidden>
      <h2>Permissions</h2>
      <p class="lead">For each tool, whether Forge asks first, runs it without asking, or never sees it. Rules below narrow a tool to certain paths, commands or URLs.</p>
      <div class="setting stack" id="row-tools"><div class="t">Tools</div><div class="d">Ask confirms each call, Allow runs it, Block hides it. Command and browser tools always ask unless Autonomous is on.</div><div id="tool-table"></div></div>
      <div class="setting" id="row-allowed"><div class="t">Commands you always allow <span class="ik-badge ik-badge--outline">Saves instantly</span></div><div class="d">Commands you chose "Always allow" in chat, each for one workspace and that exact command. Remove one to be asked again.</div><div id="allowed-list"></div></div>
      <details class="adv"><summary>Advanced: allow only specific tools</summary>
        <div class="setting" id="row-allow"><div class="t">Allowed tools</div><div class="d">When any are ticked, only those tools are offered to the agent and all others are hidden. Leave empty to offer every tool that is not blocked.</div><div class="checks" id="allow-tools"></div></div>
      </details>
      <div class="setting" id="row-pattern-rules"><div class="t">Pattern rules</div><div class="d">Ordered rules; the last match wins. A .env read or a command that leaves the workspace asks unless a rule names it.</div>
        <div id="pattern-rules"></div><div class="row"><button type="button" class="ik-btn ik-btn--link" id="add-pattern-rule">+ Add rule</button></div></div>
      <div class="setting" id="row-rules"><div class="t">Rules</div><div class="d">Limit a tool to, or keep it away from, certain paths, commands or URLs. Paths use globs; commands and URLs use regular expressions.</div>
        <div id="rules"></div><div class="row"><button type="button" class="ik-btn ik-btn--link" id="add-rule">+ Add rule</button></div></div>
    </section>

    <section id="sec-context" hidden>
      <h2>Context and memory<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">How much of a chat Forge keeps, and what it remembers between chats.</p>
      <div id="rows-context"></div>
    </section>
    <section id="sec-safety" hidden>
      <h2>Safety and cost<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Limits that stop a run early.</p>
      <div id="rows-safety"></div>
    </section>
    <section id="sec-notifications" hidden>
      <h2>Notifications<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">When and how Forge tells you a run has finished.</p>
      <div id="rows-notifications"></div>
    </section>
    <section id="sec-tools" hidden>
      <h2>Tools and web<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Optional tools, and where Forge runs commands.</p>
      <div class="setting" id="row-index-status"><div class="t">Code index</div><div class="d" id="index-status-text"></div>
        <div class="row"><button type="button" class="ik-btn ik-btn--secondary" id="index-delete" hidden>Delete the index</button></div></div>
      <div id="rows-tools"></div>
    </section>
    <section id="sec-git" hidden>
      <h2>Git and quality<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">What Forge does with git, and which checks it runs after it edits.</p>
      <div id="rows-git"></div>
    </section>
    <section id="sec-advanced" hidden>
      <h2>Advanced<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Inline completion, voice input and provider endpoints.</p>
      <div id="rows-advanced"></div>
    </section>

    <section id="sec-display" hidden>
      <h2>Display</h2>
      <p class="lead">How the chat shows tool calls, reasoning and results.</p>
      <div class="setting" id="row-blocks"><div class="t">Tool rows</div><div class="d">Whether tool calls in the chat start open or closed. Edits always open.</div>
        <div class="row"><select class="ik-select" id="block-default" aria-label="Tool rows"><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div></div>
      <div class="setting" id="row-show-reasoning"><div class="t">Show reasoning</div><div class="d">Show the model's reasoning above each reply, when the model provides it.</div>
        <div class="row"><label class="ik-check"><input type="checkbox" id="show-reasoning" /> Show reasoning in the chat</label></div></div>
      <div class="setting" id="row-block-modes"><div class="t">Blocks by kind</div><div class="d">Override the two settings above for one kind of block. Default follows them.</div>
        <div class="row kind"><label for="mode-reasoning">Reasoning</label><select class="ik-select" id="mode-reasoning"><option value="">Default</option><option value="hidden">Hidden</option><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div>
        <div class="row kind"><label for="mode-terminal">Command output</label><select class="ik-select" id="mode-terminal"><option value="">Default</option><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div>
        <div class="row kind"><label for="mode-edit">File edits</label><select class="ik-select" id="mode-edit"><option value="">Default</option><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div>
        <div class="row kind"><label for="mode-mcp">MCP tool results</label><select class="ik-select" id="mode-mcp"><option value="">Default</option><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></div></div>
      <div class="setting"><div class="t">Presets</div><div class="d"><strong>Review first</strong> opens tool rows and shows reasoning; <strong>High autonomy</strong> does the reverse. Presets change only these two settings and apply as unsaved changes.</div><div class="row"><button type="button" class="ik-btn ik-btn--secondary" id="preset-review" title="Open tool rows and show reasoning">Review first</button><button type="button" class="ik-btn ik-btn--secondary" id="preset-autonomy" title="Close tool rows and hide reasoning">High autonomy</button></div></div>
    </section>

    <section id="sec-about" hidden>
      <h2>About</h2>
      <p class="lead">What you are running, and where to go when something is wrong.</p>
      <div class="setting" id="row-about"><div class="t">IKarmic AI Forge</div><div class="d" id="about-version">Version not available.</div>
        <div class="row"><button type="button" class="ik-btn ik-btn--secondary" id="about-log">Open the log</button><button type="button" class="ik-btn ik-btn--secondary" id="about-issues">Report an issue</button><button type="button" class="ik-btn ik-btn--secondary" id="about-docs">Read the documentation</button></div></div>
    </section>
    <section id="sec-instructions" hidden>
      <h2>Instructions</h2>
      <p class="lead">Files Forge reads at the start of every chat so it knows how your project works.</p>
      <div id="row-instructions"></div>
    </section>
    <section id="sec-backup" hidden>
      <h2>Backup<span class="ik-badge ik-badge--outline">Saves instantly</span></h2>
      <p class="lead">Export your Forge settings and custom agents to a JSON file, or import one. API keys, MCP servers and tool permissions are not included.</p>
      <div id="row-backup" class="row"><button type="button" class="ik-btn ik-btn--primary" id="export-btn">Export…</button><label class="ik-btn ik-btn--secondary">Import…<input type="file" id="import-file" accept="application/json" class="ik-sr-only" /></label></div>
      <div class="setting" id="row-reset"><div class="t">Reset settings</div><div class="d">Put every setting on the Context and memory, Safety and cost, Tools and web, Git and quality, and Advanced pages back to its default. API keys, MCP servers, agents and permissions are not changed.</div><div class="row"><button type="button" class="ik-btn ik-btn--danger" id="reset-rows">Reset all settings</button></div></div>
      <div class="setting" id="row-config-files"><div class="t">Config files</div><div class="d">Open the files behind these settings. The project file adds to your own and can never loosen what you allowed.</div>
        <div class="row"><button type="button" class="ik-btn ik-btn--secondary" id="open-user-config">Open user config</button><button type="button" class="ik-btn ik-btn--secondary" id="open-project-config">Open project config</button></div></div>
    </section>
  </main>
  <!-- The key dialog lives outside every section, so it opens from any page (MCP cards and the AWS access keys). -->
  <div id="mcp-dialog-layer" class="dlg-layer" hidden></div>
</div>
<div id="unsaved" hidden><span class="dotmark" aria-hidden="true">●</span><span id="unsaved-count">1 unsaved change</span><span class="sp"></span><button type="button" class="ik-btn ik-btn--secondary" id="discard-all">Discard</button><button type="button" class="ik-btn ik-btn--primary" id="save-all">Save</button></div>
<script>
  const vscode = acquireVsCodeApi();
  const FS = window.ForgeSettings;
  function selectEl() { const n = document.createElement('select'); n.className = 'ik-select'; return n; }
  /** A small check mark for a state that is done, drawn inline like the rest of the design system's icons. */
  function tick() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ik-icon'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8.5 12.5l2.5 2.5 4.5-5'); s.appendChild(p);
    return s;
  }
  /** A segmented choice (ik-seg): one radio per segment, so the browser keeps the keyboard and the state. disabled maps a value to why it cannot be picked. */
  function segGroup(name, label, options, current, onPick, disabled) {
    const grp = document.createElement('div'); grp.className = 'ik-seg'; grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', label);
    options.forEach((o) => {
      const l = document.createElement('label');
      const r = document.createElement('input'); r.type = 'radio'; r.name = name; r.value = o[0]; r.dataset.mode = o[0]; r.checked = o[0] === current;
      if (disabled && disabled[o[0]]) { r.disabled = true; l.title = disabled[o[0]]; }
      r.addEventListener('change', () => { if (r.checked) onPick(o[0]); });
      const s = document.createElement('span'); s.textContent = o[1];
      l.appendChild(r); l.appendChild(s); grp.appendChild(l);
    });
    return grp;
  }
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
    $('section-picker').value = name;
    if (name === 'mcp' && !mcpLoaded) { mcpLoaded = true; vscode.postMessage({ type: 'mcpList' }); }
    if (name === 'instructions') vscode.postMessage({ type: 'loadInstructions' });
    if (name === 'tools') vscode.postMessage({ type: 'loadIndexStatus' });
    if (name === 'keys') vscode.postMessage({ type: 'loadCloudStatus' });
    if (name === 'context') vscode.postMessage({ type: 'loadCleanup' });
    if (name === 'skills' && !skillsLoaded) { skillsLoaded = true; vscode.postMessage({ type: 'skillsList' }); }
  }
  navButtons.forEach((b) => b.addEventListener('click', () => { $('search').value = ''; showSection(b.dataset.section); }));
  $('section-picker').addEventListener('change', (e) => { $('search').value = ''; showSection(e.target.value); });

  function renderSearch(q) {
    const box = $('search-results');
    if (!q.trim() || !FS) { box.hidden = true; showSection(currentSection); return; }
    const hits = FS.filterSettings(FS.SETTINGS_INDEX, q);
    const terms = q.trim().toLowerCase().split(' ').filter(Boolean);
    document.querySelectorAll('main > section').forEach((s) => { s.hidden = true; });
    navButtons.forEach((b) => b.setAttribute('aria-current', 'false'));
    box.hidden = false;
    box.textContent = '';
    if (!hits.length) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'No settings match "' + q.trim() + '". Try a provider, a tool or a word from the description.'; box.appendChild(p); return; }
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
      const desc = document.createElement('div'); desc.className = 'ik-muted'; desc.style.fontSize = '12px'; marked(desc, h.description);
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
  const ROW_FOR = { provider: 'row-provider', model: 'row-model', reasoningEffort: 'row-effort', disabledProviders: 'row-hidden', modeModels: 'row-mode-models', blockDefault: 'row-blocks', showReasoning: 'row-show-reasoning', blockModes: 'row-block-modes', autoApprove: 'row-tools', permissionRules: 'row-pattern-rules', compactionModel: 'row-compaction-model', subagentModel: 'row-subagent-model', sessionRetentionDays: 'row-retention', agents: 'row-agents' };
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
      const retention = dirty.indexOf('sessionRetentionDays') >= 0 ? FS.retentionProblem(draft.sessionRetentionDays) : undefined;
      if (retention) { $('retention-error').textContent = retention; return; }
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

  // Combo boxes: a text input with a list of suggestions. The list only suggests; any typed text stays valid.
  let aliases = {};
  let comboSeq = 0;
  let openCombo = null;
  let comboApis = [];
  function isConfigured(p) { return p === listProvider() || keysSet.has(p) || !!envKeys[p]; }
  function comboGroups(kind) {
    if (kind === 'awsRegions') return FS.AWS_REGIONS;
    if (kind === 'vertexLocations') return FS.VERTEX_LOCATIONS;
    if (kind === 'voiceLanguages') return FS.VOICE_LANGUAGES;
    return FS.modelGroups({ aliases: aliases, mainProvider: listProvider(), lists: modelLists, catalog: catalog, providers: providers.filter(isConfigured), labelOf: labelOf, bareOnly: kind === 'modelIds' });
  }
  // Other providers' lists load the first time a model combo opens, once each, and only for providers with a key.
  function ensureModelLists() {
    providers.forEach((p) => {
      if (modelLists[p] || modelLoading[p] || !isConfigured(p)) return;
      modelLoading[p] = true;
      vscode.postMessage({ type: 'loadModels', provider: p, refresh: false });
    });
  }
  function buildCombo(label, placeholder, value) {
    const root = document.createElement('div'); root.className = 'ik-combo';
    const input = document.createElement('input'); input.type = 'text'; input.className = 'ik-input ik-input--mono';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', label); if (placeholder) input.placeholder = placeholder; input.value = value || '';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ik-combo__toggle'; toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', 'Show models');
    toggle.innerHTML = '<svg class="ik-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
    const list = document.createElement('div'); list.className = 'ik-combo__list'; list.setAttribute('role', 'listbox'); list.hidden = true;
    root.appendChild(input); root.appendChild(toggle); root.appendChild(list);
    return root;
  }
  // opts.live: report every keystroke (a draft field); otherwise only a pick or a finished edit (a saved row).
  function makeCombo(root, kind, opts) {
    const input = root.querySelector('input');
    const toggle = root.querySelector('.ik-combo__toggle');
    const list = root.querySelector('.ik-combo__list');
    let active = -1;
    let rows = [];
    list.id = 'combo-list-' + (++comboSeq);
    input.setAttribute('aria-controls', list.id);
    function render(filter) {
      list.textContent = ''; rows = []; active = -1;
      const all = comboGroups(kind);
      FS.filterGroups(all, filter).forEach((g) => {
        const h = document.createElement('div'); h.className = 'ik-combo__group'; h.textContent = g.label; list.appendChild(h);
        g.options.forEach((o) => {
          const el = document.createElement('div'); el.className = 'ik-combo__option'; el.setAttribute('role', 'option'); el.dataset.value = o.value;
          el.id = list.id + '-' + rows.length;
          el.setAttribute('aria-selected', String(input.value.trim() === o.value));
          const a = document.createElement('span'); a.textContent = o.label;
          const b = document.createElement('span'); b.className = 'ik-combo__id'; b.textContent = o.value;
          el.appendChild(a); el.appendChild(b); list.appendChild(el); rows.push(el);
        });
      });
      const typed = (filter || '').trim();
      if (typed && !FS.isKnownValue(all, typed)) {
        const c = document.createElement('div'); c.className = 'ik-combo__option ik-combo__custom'; c.setAttribute('role', 'option'); c.dataset.value = typed;
        c.id = list.id + '-' + rows.length;
        const a = document.createElement('span'); a.textContent = 'Use what I typed';
        const t = document.createElement('span'); t.className = 'ik-combo__id'; t.textContent = typed;
        c.appendChild(a); c.appendChild(t); list.appendChild(c); rows.push(c);
      }
    }
    function open(filter) {
      if (openCombo && openCombo !== api) openCombo.close();
      if (kind === 'models' || kind === 'modelIds') ensureModelLists();
      render(filter); list.hidden = false; input.setAttribute('aria-expanded', 'true'); openCombo = api; place();
    }
    // Open upward when there is no room below the field inside the scrolling page, and more room above.
    function place() {
      list.classList.remove('ik-combo__list--up');
      const area = root.closest('main');
      const bounds = area ? area.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const rect = root.getBoundingClientRect();
      const below = bounds.bottom - rect.bottom;
      const above = rect.top - bounds.top;
      if (below < Math.min(list.scrollHeight, 280) + 8 && above > below) list.classList.add('ik-combo__list--up');
    }
    function close() {
      list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
      if (openCombo === api) openCombo = null;
    }
    function pick(value) { input.value = value; close(); opts.set(value); }
    function mark() {
      rows.forEach((r, i) => { r.classList.toggle('ik-combo__option--active', i === active); });
      if (rows[active]) { rows[active].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', rows[active].id); }
    }
    const api = { close: close, alive: () => root.isConnected, refresh: () => { if (!list.hidden) { render(input.value); place(); } } };
    toggle.addEventListener('click', () => { if (list.hidden) open(''); else close(); input.focus(); });
    input.addEventListener('input', () => { open(input.value); if (opts.live) opts.set(input.value); });
    input.addEventListener('change', () => { if (!opts.live) opts.set(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(FS.isKnownValue(comboGroups(kind), input.value.trim()) ? '' : input.value); active = Math.min(active + 1, rows.length - 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); mark(); }
      else if (e.key === 'Enter' && !list.hidden) { e.preventDefault(); if (rows[active]) pick(rows[active].dataset.value); else { close(); if (!opts.live) opts.set(input.value); } }
      else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    // Keep focus in the input for any press inside the list, so a heading or the scrollbar does not close it.
    list.addEventListener('mousedown', (e) => { e.preventDefault(); const o = e.target.closest('.ik-combo__option'); if (o) pick(o.dataset.value); });
    root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) close(); });
    return api;
  }

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
      row.innerHTML = '<span>' + esc(labelOf(p)) + '</span><span class="kcell"><span class="kstatus ' + (note && !note.ok ? 'bad' : keysSet.has(p) || fromEnv ? 'ok' : 'ik-muted') + '" title="' + esc(note ? note.text : base) + '">' + shown + '</span><span class="kmore"></span></span>';
      const kmore = row.querySelector('.kmore');
      const input = document.createElement('input'); input.type = 'password'; input.className = 'ik-input'; input.placeholder = keysSet.has(p) || fromEnv ? 'Paste new key' : 'Paste key'; input.setAttribute('aria-label', labelOf(p) + ' API key');
      const acts = document.createElement('span'); acts.className = 'row';
      const save = document.createElement('button'); save.type = 'button'; save.className = 'ik-btn ik-btn--secondary'; save.textContent = 'Save'; save.disabled = true;
      input.dataset.provider = p;
      if (typed[p]) { input.value = typed[p]; save.disabled = false; }
      input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !save.disabled) { e.preventDefault(); save.click(); } });
      save.addEventListener('click', () => { if (input.value.trim()) vscode.postMessage({ type: 'setKey', provider: p, key: input.value.trim() }); input.value = ''; save.disabled = true; });
      acts.appendChild(save);
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'ik-btn ik-btn--link'; eye.textContent = 'Show';
      eye.addEventListener('click', () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; eye.textContent = show ? 'Hide' : 'Show'; });
      acts.appendChild(eye);
      if (keysSet.has(p) || fromEnv) {
        const test = document.createElement('button'); test.type = 'button'; test.className = 'ik-btn ik-btn--link'; test.textContent = 'Test';
        test.addEventListener('click', () => { keyNotes[p] = { ok: true, text: 'Testing…' }; renderKeys(); vscode.postMessage({ type: 'loadModels', provider: p, refresh: true, test: true }); });
        kmore.appendChild(test);
      }
      if (keysSet.has(p)) {
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => vscode.postMessage({ type: 'deleteKey', provider: p }));
        kmore.appendChild(rm);
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
      const root = buildCombo('Model for ' + b.id + ' mode', 'Main model', draft.modeModels[b.id] || '');
      comboApis.push(makeCombo(root, 'models', { live: true, set: (v) => { draft.modeModels[b.id] = v; refreshDirty(); } }));
      row.appendChild(label); row.appendChild(root); box.appendChild(row);
    });
  }

  // agents (draft)
  function renderAgents() {
    const list = $('agent-list');
    list.textContent = '';
    if (!draft.agents.length) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'No custom agents yet. Select New agent to add one.'; list.appendChild(p); }
    draft.agents.forEach((a, i) => {
      const card = document.createElement('div'); card.className = 'ik-card agent';
      card.innerHTML = '<div class="row"><strong class="agent-title"></strong><span class="sp" style="flex:1"></span><button type="button" class="ik-btn ik-btn--link rm">Remove</button></div>' +
        '<label class="ik-field"><span class="ik-label">Agent id</span><input type="text" class="ik-input f-id" placeholder="id, e.g. migrator" aria-label="Agent id" /></label>' +
        '<label class="ik-field"><span class="ik-label">Agent description</span><input type="text" class="ik-input f-desc" placeholder="What it does" aria-label="Agent description" /></label>' +
        '<label class="ik-field"><span class="ik-label">System prompt</span><textarea class="ik-textarea f-prompt" placeholder="System prompt" aria-label="System prompt"></textarea></label>';
      card.querySelector('.agent-title').textContent = a.id || 'New agent';
      card.querySelector('.f-id').value = a.id;
      card.querySelector('.f-desc').value = a.description;
      card.querySelector('.f-prompt').value = a.systemPrompt;
      card.querySelector('.f-id').addEventListener('input', (e) => { draft.agents[i].id = e.target.value; card.querySelector('.agent-title').textContent = e.target.value || 'New agent'; refreshDirty(); });
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
      bl.appendChild(row);
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
  const TOOL_HELP = { read_file: 'read a file', read_image: 'look at an image (sent to the model)', list_files: 'list a folder', search_files: 'search file contents', find_symbol: 'find a definition', list_symbols: 'outline a file', find_references: 'find usages', git_diff: 'read the uncommitted changes', dependency_audit: 'check dependencies for known vulnerabilities (runs the project package manager; contacts the registry)', skill: 'load the instructions of an installed skill', suggest_plan: 'suggest planning first for a big request (you are asked)', repo_clone: 'download a public git repository to read it (reaches the network, runs git)', get_diagnostics: 'check files for compiler and linter problems (starts the language server for them)', bg_start: 'start a command that keeps running, such as a dev server (runs a program)', bg_read: 'read the output of a background command', bg_stop: 'stop a background command', write_file: 'create or overwrite a file', edit_file: 'change part of a file', edit_notebook: 'change a notebook cell', apply_patch: 'change several files at once', memory_forget: 'remove a project note', run_command: 'run a shell command', fetch_url: 'download a web page', memory_read: 'read project notes', memory_write: 'save project notes', sub_agent: 'start a helper agent', codebase_search: 'search by meaning', todo_write: 'keep a task checklist', todo_read: 'read the task checklist', ask_user: 'ask you a question' };
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
      l.title = TOOL_HELP[t] || FS.toolLabel(t);
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + FS.toolLabel(t)));
      if (TOOL_HELP[t]) { const hint = document.createElement('span'); hint.className = 'ik-muted'; hint.textContent = ' · ' + TOOL_HELP[t]; l.appendChild(hint); }
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
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove';
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
      const name = document.createElement('div'); name.className = 'name'; name.textContent = FS.toolLabel(t); name.title = t;
      const hint = document.createElement('span'); hint.className = 'hint'; const helpText = (TOOL_HELP[t] || '') + (askOnlyTools.indexOf(t) >= 0 ? '. Always asks first.' : ''); hint.textContent = helpText.trim(); hint.title = helpText.trim();
      const grp = segGroup('tool-' + t, FS.toolLabel(t) + ': ask, allow or block', [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']], toolMode(t), (mode) => {
        draft.sandbox.denyTools = draft.sandbox.denyTools.filter((x) => x !== t);
        draft.autoApprove = draft.autoApprove.filter((x) => x !== t);
        if (mode === 'block') draft.sandbox.denyTools.push(t);
        if (mode === 'allow') draft.autoApprove = FS.sortedTools(draft.autoApprove.concat([t]));
        refreshDirty();
      }, askOnlyTools.indexOf(t) >= 0 ? { allow: 'This tool always asks' } : null);
      row.appendChild(name); row.appendChild(hint); row.appendChild(grp); box.appendChild(row);
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
      const tool = selectEl(); tool.setAttribute('aria-label', 'Tool');
      toolNames.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; tool.appendChild(o); });
      tool.value = r.tool;
      const dim = selectEl(); dim.setAttribute('aria-label', 'Kind');
      DIMENSIONS.forEach((d) => { const o = document.createElement('option'); o.value = d[0]; o.textContent = d[1]; dim.appendChild(o); });
      dim.value = r.dimension;
      const pat = document.createElement('input'); pat.type = 'text'; pat.className = 'ik-input ik-input--mono'; pat.placeholder = 'glob or regex'; pat.setAttribute('aria-label', 'Pattern'); pat.value = r.pattern;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove';
      tool.addEventListener('change', () => { draft.sandbox.rules[i].tool = tool.value; refreshDirty(); });
      dim.addEventListener('change', () => { draft.sandbox.rules[i].dimension = dim.value; refreshDirty(); });
      pat.addEventListener('input', () => { draft.sandbox.rules[i].pattern = pat.value; refreshDirty(); });
      rm.addEventListener('click', () => { draft.sandbox.rules.splice(i, 1); renderRules(); refreshDirty(); });
      row.appendChild(tool); row.appendChild(dim); row.appendChild(pat); row.appendChild(rm); box.appendChild(row);
    });
  }
  const PERMISSIONS = ['read', 'edit', 'bash', 'webfetch', 'websearch', 'task', 'external_directory', '*'];
  function renderPatternRules() {
    const box = $('pattern-rules');
    box.textContent = '';
    draft.permissionRules.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'rule pattern-rule';
      const perm = selectEl(); perm.setAttribute('aria-label', 'Permission');
      PERMISSIONS.forEach((p) => { const o = document.createElement('option'); o.value = p; o.textContent = p; perm.appendChild(o); });
      perm.value = r.permission;
      const pat = document.createElement('input'); pat.type = 'text'; pat.className = 'ik-input ik-input--mono'; pat.placeholder = 'pattern, e.g. git status *'; pat.setAttribute('aria-label', 'Pattern'); pat.value = r.pattern;
      const grp = segGroup('rule-' + i, 'Action', [['ask', 'Ask'], ['allow', 'Allow'], ['deny', 'Block']], r.action, (mode) => { draft.permissionRules[i].action = mode; refreshDirty(); }, null);
      const up = document.createElement('button'); up.type = 'button'; up.className = 'ik-btn ik-btn--link'; up.textContent = 'Up'; up.setAttribute('aria-label', 'Move rule up'); up.disabled = i === 0;
      const down = document.createElement('button'); down.type = 'button'; down.className = 'ik-btn ik-btn--link'; down.textContent = 'Down'; down.setAttribute('aria-label', 'Move rule down'); down.disabled = i === draft.permissionRules.length - 1;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove';
      perm.addEventListener('change', () => { draft.permissionRules[i].permission = perm.value; refreshDirty(); });
      pat.addEventListener('input', () => { draft.permissionRules[i].pattern = pat.value; refreshDirty(); });
      up.addEventListener('click', () => { const l = draft.permissionRules; l.splice(i - 1, 0, l.splice(i, 1)[0]); renderPatternRules(); refreshDirty(); });
      down.addEventListener('click', () => { const l = draft.permissionRules; l.splice(i + 1, 0, l.splice(i, 1)[0]); renderPatternRules(); refreshDirty(); });
      rm.addEventListener('click', () => { draft.permissionRules.splice(i, 1); renderPatternRules(); refreshDirty(); });
      [perm, pat, grp, up, down, rm].forEach((el) => row.appendChild(el));
      box.appendChild(row);
    });
  }
  $('add-pattern-rule').addEventListener('click', () => { draft.permissionRules.push({ permission: 'bash', pattern: '', action: 'ask' }); renderPatternRules(); refreshDirty(); });
  $('add-rule').addEventListener('click', () => { draft.sandbox.rules.push({ tool: toolNames[0], dimension: 'deniedPaths', pattern: '' }); renderRules(); refreshDirty(); });

  // compaction model and chat retention (draft)
  comboApis.push(makeCombo($('compaction-model').parentNode, 'models', { live: true, set: (v) => { draft.compactionModel = v; refreshDirty(); } }));
  comboApis.push(makeCombo($('subagent-model').parentNode, 'models', { live: true, set: (v) => { draft.subagentModel = v; refreshDirty(); } }));
  $('retention-days').addEventListener('input', () => {
    draft.sessionRetentionDays = $('retention-days').value;
    $('retention-error').textContent = FS.retentionProblem(draft.sessionRetentionDays) || '';
    refreshDirty();
  });
  $('bar-user-config').addEventListener('click', () => vscode.postMessage({ type: 'openConfig', scope: 'user' }));
  $('bar-project-config').addEventListener('click', () => vscode.postMessage({ type: 'openConfig', scope: 'project' }));
  $('bar-reload').addEventListener('click', () => {
    if (FS.dirtyKeys(saved, draft).length) { say('You have unsaved changes. Save or discard them before reloading.', false); return; }
    ['load', 'loadRows', 'loadProviders', 'loadKeys', 'loadAgents'].forEach((t) => vscode.postMessage({ type: t }));
    vscode.postMessage({ type: 'loadSandbox', cwd: '' });
    say('Settings reloaded from their files.', true);
  });
  $('open-user-config').addEventListener('click', () => vscode.postMessage({ type: 'openConfig', scope: 'user' }));
  $('open-project-config').addEventListener('click', () => vscode.postMessage({ type: 'openConfig', scope: 'project' }));

  // display (draft)
  $('block-default').addEventListener('change', () => { draft.blockDefault = $('block-default').value; refreshDirty(); });
  $('show-reasoning').addEventListener('change', () => { draft.showReasoning = $('show-reasoning').checked; refreshDirty(); });
  ['reasoning', 'terminal', 'edit', 'mcp'].forEach((k) => {
    $('mode-' + k).addEventListener('change', () => { draft.blockModes[k] = $('mode-' + k).value; refreshDirty(); });
  });
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
    ['reasoning', 'terminal', 'edit', 'mcp'].forEach((k) => { $('mode-' + k).value = draft.blockModes[k]; });
    renderAgents();
    renderModeModels();
    $('compaction-model').value = draft.compactionModel;
    $('subagent-model').value = draft.subagentModel;
    $('retention-days').value = draft.sessionRetentionDays;
    renderToolChecks('allow-tools', 'allowTools');
    renderToolTable();
    renderRules();
    renderPatternRules();
    refreshDirty();
  }

  // MCP (immediate)
  let mcpLoaded = false;
  let mcpCatalogLoaded = false;
  function mcpTab(which) {
    $('mcp-tab-installed').setAttribute('aria-selected', String(which === 'installed'));
    $('mcp-tab-browse').setAttribute('aria-selected', String(which === 'browse'));
    $('mcp-tab-installed').setAttribute('tabindex', which === 'installed' ? '0' : '-1');
    $('mcp-tab-browse').setAttribute('tabindex', which === 'installed' ? '-1' : '0');
    $('mcp-installed').classList.toggle('hidden', which !== 'installed');
    $('mcp-browse').classList.toggle('hidden', which !== 'browse');
    if (which === 'browse' && !mcpCatalogLoaded) { mcpCatalogLoaded = true; vscode.postMessage({ type: 'mcpCatalog' }); }
  }
  $('mcp-tab-installed').addEventListener('click', () => mcpTab('installed'));
  $('mcp-tab-browse').addEventListener('click', () => mcpTab('browse'));
  // Tabs follow the ARIA pattern: arrows, Home and End move and select; only the selected tab is in the tab order.
  const mcpTabs = ['installed', 'browse'];
  mcpTabs.forEach((name, i) => $('mcp-tab-' + name).addEventListener('keydown', (e) => {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? (i + 1) % 2 : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    mcpTab(mcpTabs[to]);
    $('mcp-tab-' + mcpTabs[to]).focus();
  }));
  $('mcp-reload').addEventListener('click', () => vscode.postMessage({ type: 'mcpReload' }));
  $('mcp-open-config').addEventListener('click', () => vscode.postMessage({ type: 'openMcpConfig', scope: 'user' }));
  function renderMcp(msg) {
    const box = $('mcp-installed');
    box.textContent = '';
    const failing = msg.servers.filter((s) => s.state === 'failed' || s.state === 'needs-auth').length;
    const badge = $('badge-mcp');
    badge.textContent = failing ? String(failing) : (msg.servers.length ? String(msg.servers.length) : '');
    badge.classList.toggle('ik-badge--danger', failing > 0);
    if (!msg.enabled) { box.innerHTML = '<p class="ik-muted">MCP is turned off (forge.mcp.enabled).</p>'; return; }
    if (!msg.servers.length) { box.innerHTML = '<p class="ik-muted">No MCP servers yet. Open the Browse tab to install one or to add your own.</p>'; }
    else {
      const list = document.createElement('div'); list.className = 'ik-card list';
      msg.servers.forEach((s) => {
        const item = document.createElement('div'); item.className = 'item';
        const ws = s.scope === 'workspace';
        const stateLabel = { connected: 'Connected', failed: 'Failed', disabled: 'Off', 'needs-auth': 'Sign-in needed' }[s.state] || s.state;
        const stateTone = { connected: 'ik-badge--success', failed: 'ik-badge--danger', 'needs-auth': 'ik-badge--warning' }[s.state] || 'ik-badge--outline';
        item.innerHTML = '<span class="dot ' + esc(s.state) + '" aria-hidden="true"></span>' +
          '<div class="main"><div class="name">' + esc(s.name) + ' <span class="ik-muted">' + esc(s.scope) + '</span> <span class="ik-badge ' + stateTone + '">' + esc(stateLabel) + '</span></div>' +
          '<div class="sub' + (s.error && s.state !== 'needs-auth' ? ' err' : '') + '" title="' + esc(s.error || '') + '">' + esc(s.error && s.state !== 'needs-auth' ? "Can't connect: " + s.error : (ws ? 'Defined in .forge/mcp.json · ' : '') + s.description) + '</div>' +
          ((s.hiddenToolCount || s.overlapShown) ? '<div class="sub">' + esc(s.overlapShown ? 'Tools that Forge already has are switched on for this server.' : s.hiddenToolCount + ' tool' + (s.hiddenToolCount === 1 ? '' : 's') + ' hidden because Forge already has ' + (s.hiddenToolCount === 1 ? 'one' : 'them') + '.') + '</div>' : '') + '</div>';
        const acts = document.createElement('span'); acts.className = 'row';
        if (s.tools.length) {
          const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'ik-btn ik-btn--link'; tb.textContent = 'Tools';
          tb.addEventListener('click', () => { const body = item.nextElementSibling; body.hidden = !body.hidden; tb.textContent = body.hidden ? 'Tools' : 'Hide tools'; });
          acts.appendChild(tb);
        }
        if ((s.hiddenToolCount || s.overlapShown) && !ws) {
          const dup = document.createElement('button'); dup.type = 'button'; dup.className = 'ik-btn ik-btn--link';
          dup.textContent = s.overlapShown ? 'Hide duplicate tools' : 'Show duplicate tools';
          dup.title = 'Forge already has these tools, with its own approval and path rules. Showing them gives the model a second way to do the same job.';
          dup.addEventListener('click', () => vscode.postMessage({ type: 'mcpOverlapToggle', name: s.name }));
          acts.appendChild(dup);
        }
        if (s.state === 'needs-auth') {
          const signIn = document.createElement('button'); signIn.type = 'button'; signIn.className = 'ik-btn ik-btn--primary'; signIn.textContent = 'Sign in';
          signIn.title = 'Opens your browser so you can sign in to ' + s.name;
          signIn.addEventListener('click', () => { signIn.disabled = true; signIn.textContent = 'Waiting for the browser…'; vscode.postMessage({ type: 'mcpSignIn', name: s.name }); });
          acts.appendChild(signIn);
        }
        if (s.state === 'failed') {
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'ik-btn ik-btn--secondary'; retry.textContent = 'Retry';
          retry.addEventListener('click', () => vscode.postMessage({ type: 'mcpReload' }));
          acts.appendChild(retry);
        }
        if (ws) {
          const open = document.createElement('button'); open.type = 'button'; open.className = 'ik-btn ik-btn--link'; open.textContent = 'Open workspace mcp.json';
          open.addEventListener('click', () => vscode.postMessage({ type: 'openMcpConfig', scope: 'workspace' }));
          acts.appendChild(open);
        } else {
          const t = document.createElement('input'); t.type = 'checkbox'; t.checked = s.state !== 'disabled'; t.setAttribute('aria-label', 'Turn ' + s.name + ' on or off');
          t.addEventListener('change', () => vscode.postMessage({ type: 'mcpToggle', name: s.name }));
          const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove';
          rm.addEventListener('click', () => vscode.postMessage({ type: 'mcpRemove', name: s.name }));
          const tl = document.createElement('label'); tl.className = 'ik-check';
          const tt = document.createElement('span'); const showOn = () => { tt.textContent = t.checked ? 'On' : 'Off'; }; showOn();
          t.addEventListener('change', showOn);
          tl.appendChild(t); tl.appendChild(tt);
          acts.appendChild(tl); acts.appendChild(rm);
        }
        item.appendChild(acts);
        list.appendChild(item);
        if (s.secrets && s.secrets.length) {
          const box2 = document.createElement('div'); box2.className = 'item-body';
          box2.hidden = s.secrets.every((x) => x.set);
          s.secrets.forEach((x) => {
            const field = document.createElement('div'); field.className = 'ik-field';
            const fid = 'mcp-secret-row-' + s.name + '-' + x.id;
            const lab = document.createElement('label'); lab.className = 'ik-label'; lab.htmlFor = fid; lab.textContent = x.label + (x.set ? ' (saved)' : '');
            const inp = document.createElement('input'); inp.type = 'password'; inp.className = 'ik-input'; inp.id = fid; inp.autocomplete = 'off'; inp.spellcheck = false;
            inp.placeholder = x.set ? 'Type a new value to replace it' : '';
            const save = document.createElement('button'); save.type = 'button'; save.className = 'ik-btn ik-btn--secondary'; save.textContent = x.set ? 'Replace' : 'Save';
            save.addEventListener('click', () => { if (inp.value.trim()) vscode.postMessage({ type: 'mcpSecretSet', server: s.name, id: x.id, value: inp.value.trim() }); });
            const r = document.createElement('div'); r.className = 'row'; r.appendChild(inp); r.appendChild(save);
            field.appendChild(lab); field.appendChild(r);
            box2.appendChild(field);
          });
          const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'ik-btn ik-btn--link'; sb.textContent = 'Secrets';
          sb.addEventListener('click', () => { box2.hidden = !box2.hidden; });
          acts.insertBefore(sb, acts.firstChild);
          list.appendChild(box2);
        }
        const body = document.createElement('div'); body.className = 'item-body'; body.hidden = true;
        s.tools.forEach((n) => { const c = document.createElement('span'); c.className = 'ik-badge ik-badge--outline'; c.textContent = n; body.appendChild(c); });
        list.appendChild(body);
      });
      box.appendChild(list);
    }
    if (msg.projectSkipped) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'Workspace MCP config skipped: this workspace is not trusted.'; box.appendChild(p); }
  }
  let mcpCatalogEntries = [];
  let mcpQuery = '';
  let mcpFilter = 'all';
  function renderMcpCatalog(msg) {
    const box = $('mcp-browse');
    box.textContent = '';
    mcpCatalogEntries = msg.entries;
    if (msg.warning) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = msg.warning; box.appendChild(p); }
    const search = document.createElement('input'); search.type = 'search'; search.className = 'ik-input';
    search.placeholder = 'Search servers'; search.setAttribute('aria-label', 'Search servers'); search.value = mcpQuery;
    const results = document.createElement('div');
    search.addEventListener('input', () => { mcpQuery = search.value; drawMcpCards(results); });
    // "Add your own" sits below every catalog card, so the top of the tab points to it.
    const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'ik-btn ik-btn--secondary'; jump.id = 'mcp-jump-add';
    jump.textContent = 'Add your own';
    jump.addEventListener('click', () => { const text = $('mcp-add-text'); text.scrollIntoView({ block: 'center' }); text.focus(); });
    const bar = document.createElement('div'); bar.style.display = 'flex'; bar.style.flexWrap = 'wrap'; bar.style.alignItems = 'center'; bar.style.gap = 'var(--space-sm)';
    search.style.flex = '1 1 12rem'; search.style.minWidth = '0';
    bar.appendChild(search); bar.appendChild(jump);
    const need = msg.entries.filter((e) => e.secrets.length > 0).length;
    const filter = segGroup('mcp-filter', 'Show servers by key', [['all', 'All ' + msg.entries.length], ['key', 'Needs a key ' + need], ['none', 'No key needed ' + (msg.entries.length - need)]], mcpFilter, (v) => { mcpFilter = v; drawMcpCards(results); });
    filter.style.margin = 'var(--space-sm) 0';
    box.appendChild(bar); box.appendChild(filter); box.appendChild(results);
    drawMcpCards(results);
    box.appendChild(addYourOwnCard());
  }
  function drawMcpCards(results) {
    results.textContent = '';
    const q = mcpQuery.trim().toLowerCase();
    const shown = mcpCatalogEntries.filter((e) => (!q || (e.displayName + ' ' + e.description + ' ' + e.vertical).toLowerCase().includes(q)) && (mcpFilter === 'all' || (mcpFilter === 'key') === (e.secrets.length > 0)));
    if (!shown.length) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'No server matches that search.'; results.appendChild(p); return; }
    const groups = new Map();
    shown.forEach((e) => { if (!groups.has(e.vertical)) groups.set(e.vertical, []); groups.get(e.vertical).push(e); });
    groups.forEach((entries, vertical) => {
      const label = document.createElement('div'); label.className = 'group-label'; label.textContent = vertical; results.appendChild(label);
      const grid = document.createElement('div'); grid.className = 'cards';
      entries.forEach((e) => grid.appendChild(mcpCard(e)));
      results.appendChild(grid);
    });
  }
  /** "Add your own": paste a command, a link or JSON; Forge reads it, shows what would run, and adds it only on confirm. */
  function addYourOwnCard() {
    const card = document.createElement('div'); card.className = 'ik-card card';
    card.style.marginTop = 'var(--space-sm)';
    const title = document.createElement('strong'); title.textContent = 'Add your own';
    const sub = document.createElement('span'); sub.className = 'ik-muted'; sub.style.fontSize = '12px';
    sub.textContent = 'Paste a command that starts with npx, uvx or docker, an https address, or JSON for one server.';
    const field = document.createElement('div'); field.className = 'ik-field';
    const lab = document.createElement('label'); lab.className = 'ik-label'; lab.htmlFor = 'mcp-add-text'; lab.textContent = 'Command, link or JSON';
    const text = document.createElement('textarea'); text.id = 'mcp-add-text'; text.className = 'ik-textarea ik-input--mono'; text.rows = 3; text.spellcheck = false;
    field.appendChild(lab); field.appendChild(text);
    const preview = document.createElement('div'); preview.setAttribute('aria-live', 'polite');
    const row = document.createElement('div'); row.className = 'row';
    const check = document.createElement('button'); check.type = 'button'; check.className = 'ik-btn ik-btn--secondary'; check.textContent = 'Check';
    row.appendChild(check);
    check.addEventListener('click', () => { addPreviewTarget = preview; addTextBox = text; vscode.postMessage({ type: 'mcpAddPreview', text: text.value }); });
    card.appendChild(title); card.appendChild(sub); card.appendChild(field); card.appendChild(row); card.appendChild(preview);
    return card;
  }
  let addPreviewTarget = null;
  let addTextBox = null;
  function showAddPreview(msg) {
    const box = addPreviewTarget; if (!box) return;
    box.textContent = '';
    if (!msg.ok) { const p = document.createElement('p'); p.className = 'err'; p.textContent = msg.reason; box.appendChild(p); return; }
    const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'Forge would run this on your machine whenever the server starts:'; box.appendChild(p);
    const code = document.createElement('code'); code.className = 'ik-code'; code.textContent = msg.command; box.appendChild(code);
    if (msg.environment.length) { const e = document.createElement('code'); e.className = 'ik-code'; e.style.display = 'block'; e.textContent = msg.environment.join('\\n'); box.appendChild(e); }
    if (msg.secrets.length) { const n = document.createElement('p'); n.className = 'ik-muted'; n.textContent = 'You will be asked for ' + msg.secrets.join(', ') + ' once the server is added.'; box.appendChild(n); }
    if (msg.variables.length) { const n = document.createElement('p'); n.className = 'ik-muted'; n.textContent = 'It reads ' + msg.variables.join(', ') + ' from your environment.'; box.appendChild(n); }
    const field = document.createElement('div'); field.className = 'ik-field';
    const lab = document.createElement('label'); lab.className = 'ik-label'; lab.htmlFor = 'mcp-add-name'; lab.textContent = 'Name';
    const name = document.createElement('input'); name.type = 'text'; name.id = 'mcp-add-name'; name.className = 'ik-input'; name.value = msg.name; name.spellcheck = false;
    field.appendChild(lab); field.appendChild(name); box.appendChild(field);
    const add = document.createElement('button'); add.type = 'button'; add.className = 'ik-btn ik-btn--primary'; add.textContent = 'Add server';
    add.addEventListener('click', () => vscode.postMessage({ type: 'mcpAddConfirm', name: name.value.trim(), text: addTextBox ? addTextBox.value : '' }));
    box.appendChild(add);
  }
  /** A 16px line icon for a card or dialog (DS-13: inline SVG, currentColor). */
  function mcpIcon(path) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'ik-icon'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.appendChild(p);
    return s;
  }
  const MCP_ICON_KEY = 'M8 4.5a2.5 2.5 0 1 0-1 2L13 13M11 9l2 2';
  const MCP_ICON_OK = 'M3.5 8.5l3 3 6-6.5';
  const MCP_ICON_EYE = 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0';
  const MCP_ICON_ALERT = 'M8 2.5l6 10.5H2L8 2.5zM8 7v3M8 11.5v.5';
  const MCP_ICON_LOCK = 'M3.5 7h9v6.5h-9zM5.5 7V5.5a2.5 2.5 0 0 1 5 0V7';
  const MCP_ICON_CLOSE = 'M4 4l8 8M12 4l-8 8';
  /** The key dialog: every field a server needs, in one place, whatever the number. Escape and the scrim close it; focus comes back to the button that opened it. */
  function openKeyDialog(cfg, opener) {
    const layer = $('mcp-dialog-layer');
    layer.textContent = ''; layer.hidden = false;
    const close = () => { layer.hidden = true; layer.textContent = ''; if (opener && opener.focus) opener.focus(); };
    const scrim = document.createElement('div'); scrim.className = 'ik-scrim';
    scrim.addEventListener('click', close);
    const dlg = document.createElement('form'); dlg.className = 'ik-dialog key-dialog'; dlg.noValidate = true;
    dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'mcp-dlg-title');
    const head = document.createElement('div'); head.className = 'dlg-head';
    const title = document.createElement('h2'); title.id = 'mcp-dlg-title'; title.textContent = cfg.title;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ik-btn ik-btn--ghost ik-btn--icon'; x.setAttribute('aria-label', 'Close'); x.title = 'Close';
    x.appendChild(mcpIcon(MCP_ICON_CLOSE)); x.addEventListener('click', close);
    head.appendChild(title); head.appendChild(x); dlg.appendChild(head);
    const fields = [];
    cfg.fields.forEach((sf) => {
      const id = 'mcp-key-' + cfg.prefix + '-' + sf.id;
      const field = document.createElement('div'); field.className = 'ik-field';
      const lab = document.createElement('label'); lab.className = 'ik-label'; lab.htmlFor = id; lab.textContent = sf.label;
      const input = document.createElement('input'); input.type = 'password'; input.className = 'ik-input'; input.id = id; input.autocomplete = 'off'; input.spellcheck = false;
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'ik-btn ik-btn--secondary ik-btn--icon'; eye.setAttribute('aria-label', 'Show ' + sf.label); eye.title = 'Show ' + sf.label;
      eye.appendChild(mcpIcon(MCP_ICON_EYE));
      eye.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        const word = (show ? 'Hide ' : 'Show ') + sf.label;
        eye.setAttribute('aria-label', word); eye.title = word;
      });
      const row = document.createElement('div'); row.className = 'key-row'; row.appendChild(input); row.appendChild(eye);
      const err = document.createElement('span'); err.className = 'ik-status ik-status--bad'; err.id = id + '-error'; err.hidden = true;
      err.appendChild(mcpIcon(MCP_ICON_ALERT)); err.appendChild(document.createTextNode('Enter the ' + sf.label + '.'));
      const help = document.createElement('span'); help.className = 'ik-help'; help.textContent = sf.help;
      input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); err.hidden = true; });
      field.appendChild(lab); field.appendChild(row); field.appendChild(err); field.appendChild(help); dlg.appendChild(field);
      fields.push({ sf, input, err });
    });
    const note = document.createElement('p'); note.className = 'ik-note';
    note.appendChild(mcpIcon(MCP_ICON_LOCK));
    const noteText = document.createElement('span'); noteText.textContent = cfg.note || "Saved in your editor's secret storage. It is never written to mcp.json."; note.appendChild(noteText);
    dlg.appendChild(note);
    const foot = document.createElement('div'); foot.className = 'dlg-foot';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ik-btn ik-btn--ghost'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', close);
    const go = document.createElement('button'); go.type = 'submit'; go.className = 'ik-btn ik-btn--primary'; go.textContent = cfg.submitLabel || 'Add server';
    foot.appendChild(cancel); foot.appendChild(go); dlg.appendChild(foot);
    dlg.addEventListener('submit', (ev) => {
      ev.preventDefault();
      let firstEmpty = null;
      fields.forEach((f) => {
        if (f.sf.optional || f.input.value.trim()) return;
        f.input.setAttribute('aria-invalid', 'true'); f.input.setAttribute('aria-describedby', f.err.id); f.err.hidden = false;
        if (!firstEmpty) firstEmpty = f.input;
      });
      if (firstEmpty) { firstEmpty.focus(); return; }
      const values = {};
      fields.forEach((f) => { values[f.sf.id] = f.input.value; });
      cfg.submit(values);
      close();
    });
    dlg.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); return; }
      if (ev.key !== 'Tab') return;
      const stops = dlg.querySelectorAll('button, input');
      const first = stops[0]; const last = stops[stops.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    layer.appendChild(scrim); layer.appendChild(dlg);
    if (fields.length) fields[0].input.focus();
  }
  function openMcpKeyDialog(e, opener) {
    openKeyDialog({ title: 'Add ' + e.displayName, prefix: e.name, fields: e.secrets, submit: (secretValues) => vscode.postMessage({ type: 'mcpInstall', name: e.name, secretValues }) }, opener);
  }
  function mcpCard(e) {
    const needs = e.secrets.length > 0;
    const card = document.createElement('div'); card.className = 'ik-card card keyed';
    card.innerHTML = '<div class="ik-card__head"><div class="row"><strong>' + esc(e.displayName) + '</strong><span class="ik-badge ik-badge--outline">' + (e.remote ? 'Hosted' : 'On your machine') + '</span></div>' +
      '<span class="ik-help">' + esc(e.description) + '</span></div>';
    const foot = document.createElement('div'); foot.className = 'ik-card__foot';
    const cmd = document.createElement('span'); cmd.className = 'ik-mono ik-muted cmd'; cmd.title = e.command; cmd.textContent = e.command.length > 34 ? e.command.slice(0, 33) + '…' : e.command;
    const gap = document.createElement('span'); gap.className = 'grow';
    if (e.installed) {
      const s = document.createElement('span'); s.className = 'ik-badge ik-badge--success'; s.appendChild(tick()); s.appendChild(document.createTextNode('Installed'));
      foot.appendChild(s); foot.appendChild(cmd); card.appendChild(foot); return card;
    }
    const status = document.createElement('span'); status.className = 'ik-status ' + (needs ? 'ik-status--warn' : 'ik-status--ok');
    status.appendChild(mcpIcon(needs ? MCP_ICON_KEY : MCP_ICON_OK));
    status.appendChild(document.createTextNode(needs ? (e.secrets.length > 1 ? 'Needs details' : 'Needs a key') : 'No key needed'));
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ik-btn ik-btn--secondary';
    b.textContent = needs ? (e.secrets.length > 1 ? 'Enter details' : 'Enter key') : 'Add server';
    b.addEventListener('click', () => {
      if (needs) openMcpKeyDialog(e, b);
      else vscode.postMessage({ type: 'mcpInstall', name: e.name, secretValues: {} });
    });
    foot.appendChild(status); foot.appendChild(cmd); foot.appendChild(gap); foot.appendChild(b); card.appendChild(foot);
    return card;
  }

  // skills (immediate)
  let skillsLoaded = false;
  const SCOPES = [['local', 'This workspace', 'skills/'], ['project', 'This project', '.forge/skills/'], ['global', 'Your account', '~/.forge/skills/'], ['remote', 'From a link', ''], ['builtin', 'Built into Forge', '']];
  $('skills-rescan').addEventListener('click', () => vscode.postMessage({ type: 'skillsList' }));
  $('skills-browse').addEventListener('click', () => vscode.postMessage({ type: 'skillCatalog' }));
  function renderSkills(skills) {
    const box = $('skills-list');
    box.textContent = '';
    $('badge-skills').textContent = skills.length ? String(skills.length) : '';
    const help = document.createElement('p'); help.className = 'ik-muted'; help.textContent = 'Switch a skill off and the model never sees it. The switch applies to every skill with that name, whoever wrote it.'; box.appendChild(help);
    SCOPES.forEach((sc) => {
      const label = document.createElement('div'); label.className = 'group-label'; label.textContent = sc[1];
      const where = document.createElement('span'); where.className = 'path'; where.textContent = sc[2]; label.appendChild(where); box.appendChild(label);
      const inScope = skills.filter((s) => s.scope === sc[0]);
      if (!inScope.length && (sc[0] === 'builtin' || sc[0] === 'remote')) { label.remove(); return; }
      if (!inScope.length) { const p = document.createElement('p'); p.className = 'ik-muted'; p.textContent = 'None yet.'; box.appendChild(p); return; }
      const list = document.createElement('div'); list.className = 'ik-card list';
      inScope.forEach((s) => {
        const item = document.createElement('div'); item.className = 'item';
        item.innerHTML = '<div class="main"><div class="name">' + esc(s.name) + '</div><div class="sub">' + esc(s.description) + '</div></div>';
        const open = document.createElement('button'); open.type = 'button'; open.className = 'ik-btn ik-btn--link'; open.textContent = 'Open';
        open.addEventListener('click', () => vscode.postMessage({ type: 'skillOpen', path: s.path }));
        const sw = document.createElement('input'); sw.type = 'checkbox'; sw.checked = s.enabled; sw.setAttribute('aria-label', 'Turn ' + s.name + ' on or off for the model');
        sw.addEventListener('change', () => vscode.postMessage({ type: 'skillToggle', name: s.name }));
        const sl = document.createElement('label'); sl.className = 'ik-check';
        const st = document.createElement('span'); const showOn = () => { st.textContent = sw.checked ? 'On' : 'Off'; }; showOn(); sw.addEventListener('change', showOn);
        sl.appendChild(sw); sl.appendChild(st);
        const acts = document.createElement('span'); acts.className = 'row'; acts.appendChild(sl); acts.appendChild(open);
        item.appendChild(acts); list.appendChild(item);
      });
      box.appendChild(list);
    });
    box.appendChild(addYourOwnSkill());
  }
  function addYourOwnSkill() {
    const card = document.createElement('div'); card.className = 'ik-card card'; card.style.marginTop = 'var(--space-sm)';
    const title = document.createElement('strong'); title.textContent = 'Add your own';
    const sub = document.createElement('span'); sub.className = 'ik-muted'; sub.style.fontSize = '12px';
    sub.textContent = 'Paste the https address of a skill file or a list of skills, or choose a skill file on this computer.';
    const field = document.createElement('div'); field.className = 'ik-field';
    const lab = document.createElement('label'); lab.className = 'ik-label'; lab.htmlFor = 'skill-add-url'; lab.textContent = 'Address';
    const url = document.createElement('input'); url.type = 'url'; url.id = 'skill-add-url'; url.className = 'ik-input'; url.placeholder = 'https://example.com/skills.json'; url.spellcheck = false;
    field.appendChild(lab); field.appendChild(url);
    const row = document.createElement('div'); row.className = 'row';
    const addLink = document.createElement('button'); addLink.type = 'button'; addLink.className = 'ik-btn ik-btn--primary'; addLink.textContent = 'Add address';
    addLink.addEventListener('click', () => { if (url.value.trim()) vscode.postMessage({ type: 'skillAddLink', url: url.value.trim() }); });
    const file = document.createElement('button'); file.type = 'button'; file.className = 'ik-btn ik-btn--secondary'; file.textContent = 'Choose a file…';
    file.addEventListener('click', () => vscode.postMessage({ type: 'skillAddFile' }));
    row.appendChild(addLink); row.appendChild(file);
    card.appendChild(title); card.appendChild(sub); card.appendChild(field); card.appendChild(row);
    return card;
  }
  /** Success notes use the green style; everything else keeps the warning style. */
  function say(text, ok) { const b = $('banner'); b.textContent = text; b.classList.toggle('ik-note--success', !!ok); b.classList.toggle('ik-note--warning', !ok); }

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
      const p = document.createElement('p'); p.className = error ? 'err' : 'ik-muted'; p.textContent = error || 'The catalog has no skills yet.';
      box.appendChild(p);
      return;
    }
    const grid = document.createElement('div'); grid.className = 'cards';
    entries.forEach((e) => {
      const card = document.createElement('div'); card.className = 'ik-card card';
      card.innerHTML = '<strong>' + esc(e.displayName) + '</strong><span class="ik-muted" style="font-size:12px">' + esc(e.description) + '</span><div class="row"></div>';
      const row = card.querySelector('.row');
      if (e.installed) { const s = document.createElement('span'); s.className = 'ik-badge ik-badge--success'; s.appendChild(tick()); s.appendChild(document.createTextNode('Installed')); row.appendChild(s); }
      else { const b = document.createElement('button'); b.type = 'button'; b.className = 'ik-btn ik-btn--primary'; b.textContent = 'Install'; b.addEventListener('click', () => vscode.postMessage({ type: 'skillInstall', name: e.name })); row.appendChild(b); }
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  $('prune-chats').addEventListener('click', () => { vscode.postMessage({ type: 'pruneChats' }); setTimeout(() => vscode.postMessage({ type: 'loadCleanup' }), 1500); });

  /** What Forge finds for each cloud-account provider: a word first (never colour alone), then what is set or missing. */
  function renderCloudStatus(providers, saved, awsFields) {
    const box = $('cloud-status'); box.textContent = '';
    providers.forEach((p) => {
      const item = document.createElement('div'); item.className = 'item';
      const main = document.createElement('div'); main.className = 'main';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = p.provider + ' ';
      const tone = p.tone === 'ok' ? 'ik-badge--success' : p.tone === 'bad' ? 'ik-badge--danger' : 'ik-badge--outline';
      const badge = document.createElement('span'); badge.className = 'ik-badge ' + tone; badge.textContent = p.tone === 'ok' ? 'Ready' : p.tone === 'bad' ? 'Problem' : 'Note';
      name.appendChild(badge);
      const sub = document.createElement('div'); sub.className = 'sub'; sub.style.whiteSpace = 'normal'; sub.textContent = p.text;
      main.appendChild(name); main.appendChild(sub); item.appendChild(main);
      if (p.provider === 'AWS Bedrock' && awsFields && awsFields.length) {
        const acts = document.createElement('span'); acts.className = 'row';
        const enter = document.createElement('button'); enter.type = 'button'; enter.className = 'ik-btn ik-btn--secondary'; enter.textContent = 'Enter access keys';
        enter.addEventListener('click', () => openKeyDialog({ title: 'AWS access keys', prefix: 'aws', fields: awsFields, submitLabel: 'Save keys', note: "Saved in your editor's secret storage and used only when a run starts. It is never written to a settings file.", submit: (values) => vscode.postMessage({ type: 'cloudCredentialSet', values }) }, enter));
        acts.appendChild(enter);
        if (saved && saved.length) {
          const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--ghost'; rm.textContent = 'Remove saved access keys';
          rm.addEventListener('click', () => vscode.postMessage({ type: 'cloudCredentialClear' }));
          acts.appendChild(rm);
        }
        item.appendChild(acts);
      }
      box.appendChild(item);
    });
  }

  /** What the code index is doing, in the same words as the status bar item. */
  function renderIndexStatus(msg) {
    const line = FS.indexStatusLine(msg.enabled, msg.status);
    $('index-status-text').textContent = line.text;
    $('index-delete').hidden = !(msg.status && (msg.status.phase === 'ready' || msg.status.phase === 'error'));
  }
  $('index-delete').addEventListener('click', () => vscode.postMessage({ type: 'deleteIndex' }));

  /** The instruction files Forge reads from the workspace root: what each is doing, and a way to open or start it. */
  function renderInstructions(msg) {
    const box = $('row-instructions'); box.textContent = '';
    const note = (text, tone) => { const p = document.createElement('p'); p.className = 'ik-note' + (tone ? ' ik-note--' + tone : ''); p.textContent = text; box.appendChild(p); };
    if (!msg.folder) { note('Open a folder to use instruction files.', 'warning'); return; }
    if (!msg.trusted) note('This workspace is not trusted, so Forge does not read these files. Trust the workspace to use them.', 'warning');
    const list = document.createElement('div'); list.className = 'ik-card list';
    msg.files.forEach((f) => {
      const item = document.createElement('div'); item.className = 'item';
      const main = document.createElement('div'); main.className = 'main';
      const name = document.createElement('div'); name.className = 'name ik-mono'; name.textContent = f.name;
      const tone = f.cut ? 'ik-badge--warning' : f.state === 'used' ? 'ik-badge--success' : 'ik-badge--outline';
      const badge = document.createElement('span'); badge.className = 'ik-badge ' + tone;
      badge.textContent = f.cut ? 'Cut off' : f.state === 'used' ? 'Used' : f.state === 'empty' ? 'Empty' : 'Not created';
      name.appendChild(document.createTextNode(' ')); name.appendChild(badge);
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = f.cut ? 'Only the start of this file is read.' : f.state === 'used' ? f.chars + ' characters.' : f.state === 'empty' ? 'There is nothing in it yet.' : 'Forge has no file of this name to read.';
      main.appendChild(name); main.appendChild(sub); item.appendChild(main);
      const acts = document.createElement('span'); acts.className = 'row';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ik-btn ik-btn--secondary';
      b.textContent = f.state === 'missing' ? 'Create' : 'Open';
      b.setAttribute('aria-label', (f.state === 'missing' ? 'Create ' : 'Open ') + f.name);
      b.addEventListener('click', () => vscode.postMessage({ type: f.state === 'missing' ? 'instructionCreate' : 'instructionOpen', name: f.name }));
      acts.appendChild(b); item.appendChild(acts); list.appendChild(item);
    });
    box.appendChild(list);
    const steer = document.createElement('div'); steer.className = 'setting';
    const t = document.createElement('div'); t.className = 't'; t.textContent = 'Steering notes';
    const d = document.createElement('div'); d.className = 'd'; d.textContent = (msg.steering ? msg.steering + (msg.steering === 1 ? ' note' : ' notes') + ' in this project. ' : 'None yet. ') + 'A steering note is a short Markdown file that Forge reads when it matches the files you are working on.';
    const r = document.createElement('div'); r.className = 'row';
    const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'ik-btn ik-btn--secondary'; nb.textContent = 'New steering note';
    nb.addEventListener('click', () => vscode.postMessage({ type: 'steeringNew' }));
    r.appendChild(nb); steer.appendChild(t); steer.appendChild(d); steer.appendChild(r); box.appendChild(steer);
    const more = document.createElement('p'); more.className = 'ik-muted'; more.textContent = 'An AGENTS.md in a folder is also read the first time Forge reads a file there.'; box.appendChild(more);
  }

  // about
  [['about-log', 'log'], ['about-issues', 'issues'], ['about-docs', 'docs']].forEach((p) => $(p[0]).addEventListener('click', () => vscode.postMessage({ type: 'aboutOpen', what: p[1] })));

  // backup
  $('export-btn').addEventListener('click', () => vscode.postMessage({ type: 'exportSettings' }));
  $('reset-rows').addEventListener('click', () => vscode.postMessage({ type: 'resetRows' }));
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    // Forget the pick, or choosing the same file again (after fixing it) fires no change event.
    e.target.value = '';
    if (!file) return;
    if (file.size > 1048576) { $('banner').textContent = 'That file is too large to be a settings export (over 1 MB).'; return; }
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
      case 'cleanupLoaded':
        $('cleanup-last').textContent = FS.cleanupLine(msg.last);
        break;
      case 'cloudStatusLoaded':
        renderCloudStatus(msg.providers, msg.saved, msg.awsFields);
        break;
      case 'indexStatusLoaded':
        renderIndexStatus(msg);
        break;
      case 'instructionsLoaded':
        renderInstructions(msg);
        break;
      case 'aboutLoaded':
        $('about-version').textContent = 'Version ' + msg.version;
        break;
      case 'allowedCommandsListed':
        renderAllowedCommands(msg.commands);
        break;
      case 'rowsLoaded':
        renderRows(msg.rows);
        break;
      case 'providersLoaded':
        renderProviders(msg);
        break;
      case 'rowSaved': {
        if (msg.key === 'forge.semanticSearch') vscode.postMessage({ type: 'loadIndexStatus' });
        if (msg.key.indexOf('forge.providers.') === 0) vscode.postMessage({ type: 'loadCloudStatus' });
        const status = document.getElementById('status-' + FS.rowId(msg.key));
        if (status) { status.textContent = 'Saved'; status.className = 'ik-muted'; }
        break;
      }
      case 'rowError': {
        const status = document.getElementById('status-' + FS.rowId(msg.key));
        if (status) { status.textContent = msg.message; status.className = 'err'; }
        break;
      }
      case 'loaded':
        vscode.postMessage({ type: 'loadAllowedCommands' });
        saved = FS.applyConfig(saved, msg.config);
        draft = FS.applyConfig(draft, msg.config);
        aliases = msg.config.aliases || {};
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
        comboApis = comboApis.filter((c) => c.alive());
        comboApis.forEach((c) => c.refresh());
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
      case 'mcpAddPreviewed':
        showAddPreview(msg);
        break;
      case 'mcpListed':
        renderMcp(msg);
        if (addPreviewTarget && addPreviewTarget.isConnected) { addPreviewTarget.textContent = ''; if (addTextBox) addTextBox.value = ''; vscode.postMessage({ type: 'mcpCatalog' }); }
        break;
      case 'mcpCatalogListed':
        renderMcpCatalog(msg);
        break;
      case 'skillsListed':
        renderSkills(msg.skills);
        if (msg.note) say(msg.note, true);
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
        say(msg.message, /^(Exported|Saved|Settings imported|Deleted)/.test(msg.message));
        break;
      case 'error':
        $('banner').textContent = 'Could not save: ' + msg.message;
        break;
    }
  });

  // Providers (immediate): the list, the form, and presets to start from.
  let providerPresets = [];
  function renderProviders(msg) {
    providerPresets = msg.presets || [];
    const sel = $('prov-preset');
    if (!sel.options.length) {
      const none = document.createElement('option'); none.value = ''; none.textContent = 'Start from a preset…'; sel.appendChild(none);
      providerPresets.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
    }
    const box = $('provider-list');
    box.textContent = '';
    if (!msg.providers.length) { const none = document.createElement('p'); none.className = 'ik-muted'; none.textContent = 'No custom providers yet. Presets with a key in the environment already appear in the model picker.'; box.appendChild(none); return; }
    msg.providers.forEach((p) => {
      const row = document.createElement('div'); row.className = 'row allowed-row';
      const name = document.createElement('code'); name.textContent = p.id;
      const info = document.createElement('span'); info.className = 'd';
      info.textContent = ' ' + p.name + ' · ' + p.baseUrl + ' · ' + (p.hasInlineKey ? 'key stored' : p.apiKeyEnv ? 'key from ' + p.apiKeyEnv : 'no key') + (p.models ? ' · ' + p.models + ' model' + (p.models === 1 ? '' : 's') : '');
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ik-btn ik-btn--link'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', 'Edit ' + p.id);
      edit.addEventListener('click', () => fillProviderForm(p));
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--link'; rm.textContent = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + p.id);
      rm.addEventListener('click', () => vscode.postMessage({ type: 'deleteProvider', id: p.id }));
      row.appendChild(name); row.appendChild(info); row.appendChild(edit); row.appendChild(rm); box.appendChild(row);
    });
  }
  function fillProviderForm(p) {
    $('prov-id').value = p.id; $('prov-name').value = p.name || ''; $('prov-url').value = p.baseUrl || ''; $('prov-env').value = p.apiKeyEnv || ''; $('prov-key').value = '';
    $('prov-api').value = p.api || 'openai-compatible'; $('prov-timeout').value = p.timeoutMs || ''; $('prov-chunk').value = p.chunkTimeoutMs || '';
  }
  $('prov-preset').addEventListener('change', () => {
    const p = providerPresets.find((x) => x.id === $('prov-preset').value);
    if (p) fillProviderForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKeyEnv: p.apiKeyEnv, api: 'openai-compatible' });
  });
  $('prov-clear').addEventListener('click', () => { fillProviderForm({ id: '' }); $('prov-preset').value = ''; });
  $('prov-save').addEventListener('click', () => {
    const num = (id) => { const v = $(id).value.trim(); return v === '' ? '' : Number(v); };
    const provider = { id: $('prov-id').value.trim(), name: $('prov-name').value, baseUrl: $('prov-url').value, apiKeyEnv: $('prov-env').value, api: $('prov-api').value, timeoutMs: num('prov-timeout'), chunkTimeoutMs: num('prov-chunk') };
    if ($('prov-key').value) provider.apiKey = $('prov-key').value;
    vscode.postMessage({ type: 'saveProvider', provider: provider });
    $('prov-key').value = '';
  });

  // forge.* settings: one row each, saved the moment a value changes.
  function renderRows(rows) {
    ['context', 'safety', 'notifications', 'tools', 'git', 'advanced'].forEach((s) => { const box = $('rows-' + s); if (box) box.textContent = ''; });
    const bySection = {};
    rows.forEach((r) => { (bySection[r.section] = bySection[r.section] || []).push(r); });
    Object.keys(bySection).forEach((section) => {
      const box = $('rows-' + section);
      if (!box) return;
      const groups = FS.groupRows(bySection[section]);
      groups.forEach((g) => {
        if (groups.length > 1) { const h = document.createElement('div'); h.className = 'group-label'; h.textContent = g.label; box.appendChild(h); }
        g.rows.forEach((r) => renderRow(box, r));
      });
    });
  }

  function sameValue(a, b) { return a === b || JSON.stringify(a) === JSON.stringify(b); }

  /**
   * A list (one text per line) or a map (a name and what it points to) as rows you can add to and remove from.
   * It saves the whole value after every change, through send, like every other row. Buttons name the item: "Add host".
   */
  function listEditor(r, send) {
    const isMap = r.kind === 'map';
    const item = r.item || 'item';
    const valueItem = r.valueItem || 'value';
    let entries = isMap
      ? Object.keys(r.value && typeof r.value === "object" ? r.value : {}).map((k) => [k, r.value[k]])
      : (Array.isArray(r.value) ? r.value : []).map((v) => [v, '']);
    const box = document.createElement('div'); box.className = 'listed'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', r.label);
    const list = document.createElement('div'); list.className = 'listed-items';
    const value = () => {
      if (!isMap) return entries.map((e) => e[0]);
      const out = {};
      entries.forEach((e) => { out[e[0]] = e[1]; });
      return out;
    };
    const field = (text, label, mono) => {
      const input = document.createElement('input'); input.type = 'text'; input.className = 'ik-input' + (mono ? ' ik-input--mono' : ''); input.value = text; input.spellcheck = false; input.autocomplete = 'off';
      input.setAttribute("aria-label", label);
      return input;
    };
    const draw = () => {
      list.textContent = '';
      entries.forEach((e, i) => {
        const line = document.createElement('div'); line.className = 'listed-row';
        const first = field(e[0], (isMap ? 'Name of ' : '') + item + ' ' + (i + 1), !isMap);
        line.appendChild(first);
        let second = null;
        if (isMap) { second = field(e[1], 'Value of ' + item + ' ' + e[0], true); line.appendChild(second); }
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ik-btn ik-btn--ghost'; rm.textContent = 'Remove';
        rm.setAttribute('aria-label', 'Remove ' + item + ' ' + (e[0] || (i + 1)));
        rm.addEventListener("click", () => { entries.splice(i, 1); draw(); send(value()); });
        const change = () => {
          const name = first.value.trim();
          if (name === "") { entries.splice(i, 1); draw(); send(value()); return; }
          entries[i] = [name, second ? second.value : ""]; send(value());
        };
        first.addEventListener('change', change);
        if (second) second.addEventListener('change', change);
        line.appendChild(rm);
        list.appendChild(line);
      });
    };
    const addRow = document.createElement('div'); addRow.className = 'listed-row listed-add';
    const newName = field('', (isMap ? 'Name of new ' : 'New ') + item, !isMap);
    newName.placeholder = isMap ? item : '';
    const newValue = isMap ? field('', 'Value of new ' + item, true) : null;
    if (newValue) newValue.placeholder = valueItem;
    const add = document.createElement('button'); add.type = 'button'; add.className = 'ik-btn ik-btn--secondary'; add.textContent = 'Add ' + item;
    const addNow = () => {
      const name = newName.value.trim();
      if (name === "") { newName.focus(); return; }
      const at = entries.findIndex((e) => e[0] === name);
      const val = newValue ? newValue.value : "";
      if (at >= 0) { if (isMap) entries[at][1] = val; } else entries.push([name, val]);
      newName.value = ""; if (newValue) newValue.value = "";
      draw(); send(value()); newName.focus();
    };
    add.addEventListener('click', addNow);
    [newName, newValue].forEach((inp) => { if (inp) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addNow(); } }); });
    addRow.appendChild(newName); if (newValue) addRow.appendChild(newValue); addRow.appendChild(add);
    box.appendChild(list); box.appendChild(addRow);
    draw();
    return {
      el: box,
      set: (v) => {
        entries = isMap ? Object.keys(v && typeof v === 'object' ? v : {}).map((k) => [k, v[k]]) : (Array.isArray(v) ? v : []).map((x) => [x, '']);
        draw();
      },
    };
  }
  function renderRow(box, r) {
    const id = FS.rowId(r.key);
    const wrap = document.createElement('div'); wrap.className = 'setting'; wrap.id = id;
    const parts = FS.splitHint(r.label);
    const title = document.createElement('div'); title.className = 't'; title.textContent = parts.label;
    const help = document.createElement('div'); help.className = 'd'; help.textContent = r.description || r.key;
    const row = document.createElement('div'); row.className = 'row';
    const status = document.createElement('span'); status.id = 'status-' + id; status.setAttribute('aria-live', 'polite');
    let current = r.value;
    let reset = null;
    const refreshReset = () => { if (reset) reset.hidden = sameValue(current, r.default); };
    const send = (value) => { current = value; refreshReset(); status.textContent = ''; vscode.postMessage({ type: 'setRow', key: r.key, value: value }); };
    let control;
    let mount = null;
    let stateRefresh = null;
    let unknownNote = null;
    let noteRefresh = null;
    let editor = null;
    if (r.kind === 'list' || r.kind === 'map') {
      editor = listEditor(r, send);
      mount = editor.el; control = editor.el;
    } else if (r.kind === 'boolean') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = r.value === true;
      const stateText = document.createElement('span');
      stateRefresh = () => { stateText.textContent = control.checked ? 'On' : 'Off'; };
      mount = document.createElement('label'); mount.className = 'ik-check'; mount.appendChild(control); mount.appendChild(stateText); stateRefresh();
      control.addEventListener('change', () => { stateRefresh(); send(control.checked); });
    } else if (r.kind === 'enum') {
      control = selectEl();
      (r.enum || []).forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = FS.enumLabel(r.key, v); control.appendChild(o); });
      control.value = String(r.value);
      control.addEventListener('change', () => send(control.value));
    } else if (r.kind === 'number') {
      control = document.createElement('input'); control.type = 'number'; control.className = 'ik-input ik-input--mono'; control.step = r.integer ? '1' : 'any';
      if (r.min !== undefined) control.min = String(r.min);
      if (r.max !== undefined) control.max = String(r.max);
      control.value = r.value === undefined || r.value === null ? '' : String(r.value);
      control.addEventListener('change', () => { if (control.value.trim() !== '') send(Number(control.value)); });
    } else if (r.choices === 'voiceLanguages') {
      control = selectEl();
      control.appendChild(new Option('Browser default', ''));
      FS.VOICE_LANGUAGES.forEach((g) => {
        const og = document.createElement('optgroup'); og.label = g.label;
        g.options.forEach((o) => { const opt = new Option(o.label, o.value); opt.title = o.value; og.appendChild(opt); });
        control.appendChild(og);
      });
      const savedValue = typeof r.value === 'string' ? r.value : '';
      if (savedValue && !FS.isKnownValue(FS.VOICE_LANGUAGES, savedValue)) control.appendChild(new Option(savedValue + ' (not in the list)', savedValue));
      control.value = savedValue;
      control.addEventListener('change', () => send(control.value));
    } else if (r.choices) {
      mount = buildCombo(r.label, '', typeof r.value === 'string' ? r.value : '');
      control = mount.querySelector('input');
      if (r.choices === 'awsRegions' || r.choices === 'vertexLocations') {
        unknownNote = document.createElement('div'); unknownNote.className = 'ik-note ik-note--warning'; unknownNote.setAttribute('role', 'status');
        unknownNote.textContent = 'Not in the list. Forge keeps it as typed.';
        noteRefresh = () => { unknownNote.hidden = !control.value.trim() || FS.isKnownValue(comboGroups(r.choices), control.value.trim()); };
        control.addEventListener('input', noteRefresh); noteRefresh();
      }
      comboApis.push(makeCombo(mount, r.choices, { live: false, set: (v) => { control.value = v; if (noteRefresh) noteRefresh(); send(v); } }));
    } else {
      control = document.createElement('input'); control.type = 'text'; control.className = 'ik-input ik-input--mono'; control.value = typeof r.value === 'string' ? r.value : '';
      control.addEventListener('change', () => send(control.value));
    }
    control.setAttribute('aria-label', r.label);
    row.appendChild(mount || control);
    if (parts.hint) { const hint = document.createElement('span'); hint.className = 'ik-muted'; hint.textContent = parts.hint; row.appendChild(hint); }
    if (r.default !== undefined) {
      reset = document.createElement('button'); reset.type = 'button'; reset.className = 'ik-btn ik-btn--link'; reset.textContent = 'Reset';
      reset.title = 'Back to the default';
      reset.addEventListener('click', () => {
        if (editor) editor.set(r.default);
        else if (r.kind === 'boolean') control.checked = r.default === true;
        else control.value = r.default === undefined || r.default === null ? '' : String(r.default);
        if (noteRefresh) noteRefresh();
        if (stateRefresh) stateRefresh();
        send(r.default);
      });
      refreshReset();
      row.appendChild(reset);
    }
    row.appendChild(status);
    wrap.appendChild(title); wrap.appendChild(help); wrap.appendChild(row);
    if (unknownNote) wrap.appendChild(unknownNote);
    box.appendChild(wrap);
  }

  showSection('model');
  vscode.postMessage({ type: 'loadRows' });
  vscode.postMessage({ type: 'loadAbout' });
  vscode.postMessage({ type: 'loadProviders' });
  vscode.postMessage({ type: 'load' });
  vscode.postMessage({ type: 'loadAgents' });
  vscode.postMessage({ type: 'loadSandbox', cwd: '' });
  vscode.postMessage({ type: 'loadKeys' });
</script>
${i18nBlock}</body>
</html>`;
}

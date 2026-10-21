import { MANDALA_MASK } from './brand.js';
import { i18nScript } from './webview-i18n.js';

/**
 * Generates the HTML for the Forge chat webview. The webview is fully
 * client-side: all rendering and input handling happens in vanilla JS that
 * communicates with the extension host via vscode.postMessage.
 *
 * @param options.voiceScriptUri - vscode-resource URI of the bundled
 *   `voice-input.js` script. The chat page `<script src>`s it so the inline
 *   code can construct a `VoiceController`. When omitted (e.g. unit tests
 *   or first-run race), the mic button silently no-ops.
 * @param options.forgeUiScriptUri - vscode-resource URI of the bundled
 *   `forge-ui.js` (markdown rendering, tool summaries; `window.ForgeUI`).
 *   When omitted or failing to load, the chat falls back to plain text.
 * @param options.cspSource - `webview.cspSource` from the resolving
 *   `WebviewView`. Needed in `script-src` so the CSP actually allows the
 *   `voiceScriptUri` `<script src>` load below (`'unsafe-inline'` alone only
 *   covers inline script bodies, not external script loads). When omitted
 *   (e.g. unit tests), the external script load is blocked same as before.
 */
export function chatHtml(
  options: { voiceScriptUri?: string; forgeUiScriptUri?: string; mermaidScriptUri?: string; cspSource?: string; strings?: Record<string, string> } = {}
): string {
  const voiceScriptUri = options.voiceScriptUri ?? '';
  const mermaidScriptUri = options.mermaidScriptUri ?? '';
  const forgeUiScriptUri = options.forgeUiScriptUri ?? '';
  const i18n = i18nScript(options.strings ?? {});
  const i18nBlock = i18n ? `<script>${i18n}</script>` : '';
  const scriptSrc = options.cspSource ? `'unsafe-inline' ${options.cspSource}` : `'unsafe-inline'`;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src ${scriptSrc};">
<style>
  :root {
    /* Type and corner scale shared with the Settings page. */
    /* The one accent for "working" and "needs you". list.warningForeground is the text-safe amber in every theme (the editor warning colour is too pale on white, the chart colours too dark on black). */
    /* The Forge mandala as an alpha mask (docs/brand), painted with --ember by the empty state. */
    --mandala: url("${MANDALA_MASK}");
    --ember: var(--vscode-list-warningForeground, var(--vscode-editorWarning-foreground, #cca700));
    --fs-xs: 11px; --fs-s: 12px; --fs-m: 13px; --fs-l: 15px; --fs-xl: 20px; --r-s: 4px; --r-m: 6px;
    --fg: var(--vscode-foreground);
    --bg: var(--vscode-editor-background);
    --muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border);
    --accent: var(--vscode-textLink-foreground);
    /* charts.* stay at 3:1 or better on the default light and dark editor backgrounds; testing.iconPassed is 2:1 on white. */
    --ok: var(--vscode-charts-green, #388a34);
    --err: var(--vscode-charts-red, #e51400);
    --warn: var(--vscode-editorWarning-foreground, #cca700);
    --tool: var(--vscode-textBlockQuote-background, #2a2a2a);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: var(--vscode-font-family); font-size: var(--fs-m); color: var(--fg); background: var(--bg); }
  body { display: flex; flex-direction: column; }
  #toolbar { display: flex; align-items: center; gap: 4px; padding: 5px 8px 5px 10px; border-bottom: 1px solid var(--border); position: relative; flex-wrap: wrap; row-gap: 4px; min-width: 0; }
  #toolbar select { background: transparent; color: var(--fg); border: 1px solid transparent; border-radius: var(--r-s); font-size: var(--fs-s); padding: 2px 4px; flex: none; min-height: 24px; cursor: pointer; }
  #toolbar select:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, .31)); }
  /* The select itself is transparent, so its popup needs an explicit themed background or it renders white with pale text. */
  #toolbar select option { background: var(--vscode-dropdown-background, var(--bg)); color: var(--vscode-dropdown-foreground, var(--fg)); }
  #toolbar .model { background: none; border: 0; border-radius: var(--r-s); padding: 2px 6px; min-height: 24px; color: var(--fg); font-size: var(--fs-s); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; cursor: pointer; text-align: left; }
  #toolbar .model::after { content: ''; display: inline-block; width: 5px; height: 5px; margin: 0 1px 2px 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
  #toolbar .model:hover, #toolbar .model[aria-expanded="true"] { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, .31)); color: var(--fg); }
  #model-menu { position: absolute; left: 8px; right: 8px; top: calc(100% + 2px); z-index: 7; display: flex; flex-direction: column; max-height: min(70vh, 420px); background: var(--vscode-menu-background, var(--bg)); color: var(--vscode-menu-foreground, var(--fg)); border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, var(--border))); border-radius: var(--r-m); box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .36)); }
  #model-menu[hidden] { display: none; }
  #model-search { margin: 6px; width: auto; flex: none; background: var(--vscode-input-background); color: var(--vscode-input-foreground, var(--fg)); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: var(--r-s); padding: 4px 8px; font: inherit; }
  #model-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 4px 4px; }
  #model-list .mg { padding: 8px 8px 2px; font-size: var(--fs-xs); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  #model-list .mn { padding: 2px 8px 4px; font-size: var(--fs-xs); color: var(--muted); line-height: 1.4; }
  #model-list button.mo { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 4px 8px; border-radius: var(--r-s); font-size: var(--fs-m); min-height: 24px; }
  #model-list button.mo:hover, #model-list button.mo:focus-visible { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-menu-selectionForeground, inherit); }
  #model-list button.mo .id { margin-left: auto; padding-left: 8px; color: var(--muted); font-family: var(--vscode-editor-font-family); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  #model-list button.mo .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #model-list button.mo .ck { width: 12px; flex: none; color: var(--ok); }
  #model-list .empty { padding: 10px 8px; color: var(--muted); }
  #model-menu .foot { flex: none; display: flex; justify-content: space-between; padding: 2px 4px 4px; border-top: 1px solid var(--border); }
  #model-menu .foot button { background: none; border: 0; color: var(--accent); padding: 3px 6px; min-height: 24px; cursor: pointer; font-size: var(--fs-s); }
  #model-menu .foot button:hover { text-decoration: underline; }
  .spacer { flex: 1; }
  button.icon { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--r-s); background: transparent; color: var(--fg); flex: none; }
  button.icon[hidden] { display: none; }
  button.icon:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, .31)); }
  button.icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .meter { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; padding: 0 4px; font-variant-numeric: tabular-nums; flex: none; }
  .meter.empty { display: none; }
  .meter .ring { width: 14px; height: 14px; transform: rotate(-90deg); }
  .meter .ring circle { fill: none; stroke-width: 2.5; }
  .meter .ring-track { stroke: var(--vscode-widget-border, var(--border)); }
  .meter .ring-fill { stroke: var(--muted); }
  .meter.warn { color: var(--fg); }
  .meter.warn .ring-fill { stroke: var(--warn); }
  #more-menu { position: absolute; right: 8px; top: calc(100% + 2px); z-index: 6; min-width: 220px; padding: 4px; background: var(--vscode-menu-background, var(--bg)); color: var(--vscode-menu-foreground, var(--fg)); border: 1px solid var(--vscode-menu-border, var(--border)); border-radius: var(--r-m); box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .36)); }
  #more-menu[hidden] { display: none; }
  #more-menu button { display: block; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 5px 8px; border-radius: var(--r-s); font-size: var(--fs-m); }
  #more-menu button:hover, #more-menu button:focus-visible { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-menu-selectionForeground, inherit); }
  #more-menu .stat { border-top: 1px solid var(--border); margin-top: 4px; padding: 6px 8px 2px; font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }
  #more-menu .stat:empty { display: none; }
  #panel { display: none; position: absolute; inset: 36px 0 0 0; background: var(--bg); z-index: 5; overflow-y: auto; padding: 8px 12px; border-top: 1px solid var(--border); }
  #panel.open { display: block; animation: rise .14s ease-out; }
  @media (prefers-reduced-motion: reduce) { #panel.open { animation: none; } }
  #panel .row { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
  #panel .row .text { flex: 1 1 100%; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  #panel .row .meta { color: var(--muted); font-size: var(--fs-xs); flex: 1 1 auto; display: flex; gap: 6px; align-items: center; }
  #panel .row { position: relative; }
  #panel .row .pill { padding: 0 6px; border-radius: 8px; font-size: var(--fs-xs); line-height: 16px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  #panel .row.current .text { font-weight: 600; }
  #panel .rowmenu { position: absolute; right: 0; top: 100%; z-index: 8; min-width: 150px; padding: 4px; background: var(--vscode-menu-background, var(--bg)); color: var(--vscode-menu-foreground, var(--fg)); border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, var(--border))); border-radius: var(--r-m); box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .36)); }
  #panel .rowmenu button { display: block; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 5px 8px; border-radius: var(--r-s); font-size: var(--fs-m); }
  #panel .rowmenu button:hover, #panel .rowmenu button:focus-visible { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); }
  #panel .rowmenu button.danger { color: var(--err); }
  #panel .wk-note { color: var(--muted); line-height: 1.5; margin: 4px 0 10px; overflow-wrap: anywhere; }
  #panel .wk-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 8px 0; }
  #panel .wk-empty p { margin: 0; color: var(--muted); line-height: 1.5; }
  #panel .wk-label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 12px 0 4px; }
  #panel .wk-card { border-bottom: 1px solid var(--border); padding: 6px 0 8px; }
  #panel .wk-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  #panel .wk-head .tt { font-weight: 600; flex: 1 1 140px; min-width: 0; overflow-wrap: anywhere; }
  #panel .wk-head .meta { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
  #panel .wk-bar { height: 3px; border-radius: 2px; background: var(--vscode-widget-border, var(--border)); margin: 6px 0 4px; overflow: hidden; }
  #panel .wk-bar span { display: block; height: 100%; background: var(--ok); }
  #panel .wk-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 4px; }
  #panel .trow { position: relative; display: flex; align-items: flex-start; gap: 6px; padding: 3px 0; min-height: 26px; }
  #panel .trow .st { width: 14px; flex: none; text-align: center; line-height: 1.5; color: var(--muted); }
  #panel .trow .st.done { color: var(--ok); }
  #panel .trow .st.failed { color: var(--err); }
  #panel .trow .st.running { color: var(--ember); }
  #panel .trow .tt { flex: 1 1 120px; min-width: 0; text-align: left; background: none; border: 0; color: inherit; padding: 0; cursor: pointer; overflow-wrap: anywhere; line-height: 1.5; font-size: var(--fs-m); }
  #panel .trow .tt:hover { text-decoration: underline; }
  #panel .trow .req { color: var(--muted); font-size: var(--fs-xs); line-height: 1.7; flex: 0 1 auto; max-width: 45%; overflow-wrap: anywhere; }
  #panel .trow > button { flex: none; }
  #panel .trow > button.tt { flex: 1 1 120px; }
  #panel .trow .desc { display: block; color: var(--muted); font-size: var(--fs-xs); overflow-wrap: anywhere; }
  #panel .trow input[type="checkbox"] { margin: 4px 0 0; flex: none; }
  #panel .search { width: 100%; margin: 0 0 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground, var(--fg)); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: var(--r-s); padding: 4px 8px; font: inherit; }
  #panel .title { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; }
  .run-footer { font-size: var(--fs-xs); color: var(--muted); padding: 2px 4px 6px 18px; }
  .run-footer .link { font-size: inherit; }
  .warning.notice { border-left-color: var(--vscode-charts-green, var(--ember)); }
  .warning { color: var(--fg); font-size: var(--fs-s); line-height: 1.5; overflow-wrap: anywhere; padding: 6px 10px; border-left: 2px solid var(--ember); border-radius: 0 4px 4px 0; background: var(--vscode-textBlockQuote-background, transparent); }
  .muted { color: var(--muted); }
  body { position: relative; }
  #messages {
    flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 14px;
    /* Lets the empty state compact itself to the room it really has (below the toolbar, above the composer). */
    container: msgs / size;
  }
  /* Steps read as one group, like the mock's .steps: only 2px between consecutive step rows. */
  .tool-row + .tool-row, .tool-row + .approval-log, .approval-log + .tool-row, .approval-log + .approval-log { margin-top: -12px; }
  #input-area { border-top: 1px solid var(--border); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .composer { border: 1px solid var(--vscode-input-border, var(--border)); border-radius: var(--r-m); background: var(--vscode-input-background, var(--bg)); }
  .composer:focus-within { border-color: var(--vscode-focusBorder, var(--accent)); }
  #input { display: block; width: 100%; resize: none; min-height: 32px; max-height: 200px; border: 0; outline: none; background: transparent; color: var(--fg); padding: 8px 10px 2px; font-family: var(--vscode-font-family); font-size: var(--fs-m); }
  #input::placeholder { color: var(--muted); }
  #queue { display: flex; flex-direction: column; gap: 2px; padding: 0 2px 4px; }
  #queue:empty { display: none; }
  #queue .queued { display: flex; align-items: center; gap: 6px; font-size: var(--fs-s); color: var(--muted); }
  #queue .queued .q-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #edit-banner { display: flex; align-items: center; gap: 6px; padding: 4px 8px 0; font-size: var(--fs-s); color: var(--muted); }
  #edit-banner[hidden] { display: none; }
  .turn-actions { display: flex; gap: 8px; margin: -4px 0 8px; font-size: var(--fs-s); }
  .diagram { margin: 6px 0; padding: 8px; overflow: auto; border-radius: var(--r-m); background: var(--vscode-textCodeBlock-background, transparent); }
  .diagram svg { max-width: 100%; height: auto; }
  details.diagram-src > summary { cursor: pointer; font-size: var(--fs-s); color: var(--muted); }
  #attachments { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px 0; }
  #attachments:empty { display: none; }
  .chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 1px 2px 1px 6px; border-radius: var(--r-s); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
  .chip .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; line-height: 1; }
  .msg.user .files { margin-top: 4px; font-size: 11px; opacity: .8; }
  .cfoot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 2px 4px 4px 8px; }
  .cfoot .auto { font-size: var(--fs-s); color: var(--muted); display: flex; gap: 6px; align-items: center; min-height: 24px; padding: 0 6px; border-radius: var(--r-s); cursor: pointer; }
  .cfoot .auto.on { color: var(--ember); font-weight: 600; background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, .2)); }
  #auto-note { padding: 0 10px 6px; font-size: var(--fs-xs); color: var(--ember); }
  #auto-note[hidden] { display: none; }
  #send, #cancel { flex: none; min-height: 24px; }
  #send[hidden], #cancel[hidden] { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; padding: 4px 10px; border-radius: var(--r-s); cursor: pointer; font-size: var(--fs-s);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: transparent; color: var(--fg); border: 1px solid var(--border);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .msg { padding: 0; line-height: 1.5; }
  .msg.user { color: var(--fg); }
  .msg.user .body { background: var(--vscode-input-background, var(--tool)); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: var(--r-m); padding: 7px 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg.assistant .body { overflow-wrap: anywhere; }
  .msg.assistant .body:not(.md) { white-space: pre-wrap; }
  .msg .label { display: none; }
  .md > * { margin: 0; }
  .md > * + * { margin-top: 8px; }
  .md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { font-size: var(--fs-m); font-weight: 600; }
  .md h1, .md h2 { font-size: var(--fs-l); }
  .md ul, .md ol { padding-left: 20px; }
  .md li + li { margin-top: 2px; }
  .md a { color: var(--accent); }
  .md blockquote { margin: 0; padding-left: 10px; border-left: 2px solid var(--border); color: var(--muted); }
  .md hr { border: 0; border-top: 1px solid var(--border); }
  .md code { font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); background: var(--vscode-textCodeBlock-background, var(--tool)); padding: 1px 4px; border-radius: var(--r-s); }
  .md .code { border: 1px solid var(--vscode-widget-border, var(--border)); border-radius: var(--r-s); background: var(--vscode-editor-background, var(--bg)); overflow: hidden; }
  .md .code-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 2px 8px; font-size: var(--fs-xs); color: var(--muted); border-bottom: 1px solid var(--vscode-widget-border, var(--border)); }
  .md .code-head .copy { background: none; color: var(--muted); border: 0; padding: 1px 8px; min-height: 24px; font-size: var(--fs-xs); }
  .md .code-head .copy:hover { color: var(--fg); }
  .md pre { margin: 0; padding: 8px 10px; overflow-x: auto; font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); line-height: 1.5; }
  .md pre code { background: none; padding: 0; }
  .md .table { overflow-x: auto; }
  .md table { border-collapse: collapse; font-size: var(--fs-s); display: block; max-width: 100%; overflow-x: auto; }
  .md th, .md td { border: 1px solid var(--border); padding: 3px 6px; text-align: left; }
  .md .task { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--muted); border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  .md .task.done { background: var(--ok); border-color: var(--ok); }
  .tool-row { font-size: var(--fs-m); color: var(--muted); }
  .tool-row[open], .tool-row > summary:hover { color: var(--fg); }
  .tool-row .target { color: var(--fg); }
  .tool-row > summary { list-style: none; display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: var(--r-s); cursor: pointer; min-width: 0; }
  .tool-row > summary::-webkit-details-marker { display: none; }
  .tool-row > summary:hover { background: var(--vscode-list-hoverBackground); }
  .tool-row .chev { width: 0; height: 0; border-left: 4px solid var(--muted); border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform .12s; flex: none; margin: 0 2px; }
  .tool-row[open] > summary .chev { transform: rotate(90deg); }
  .tool-row .st { width: 14px; text-align: center; flex: none; font-size: var(--fs-s); }
  .tool-row .st.ok { color: var(--ok); }
  .tool-row .st.err { color: var(--err); }
  .tool-row .st.spin { width: 10px; height: 10px; margin: 0 2px; border: 1.5px solid var(--ember); border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tool-row .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-row .target { font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); }
  .tool-row .meta { margin-left: auto; padding-left: 8px; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tool-row .meta.err { color: var(--err); }
  .tool-row .tool-body { padding: 4px 0 6px 24px; }
  .tool-row .result, .tool-row .args { margin: 0; padding: 4px 6px; background: var(--tool); border-radius: var(--r-s); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow-y: auto; font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); }
  .tool-row .result.collapsed { max-height: 120px; }
  .tool-row .show-more { font-size: var(--fs-xs); margin-top: 2px; cursor: pointer; color: var(--accent); background: none; border: none; padding: 0; }
  .tool-row .diff { border: 1px solid var(--vscode-widget-border, var(--border)); border-radius: var(--r-s); overflow-x: auto; font-size: var(--fs-s); }
  .cursor { display: inline-block; width: 6px; height: 13px; background: var(--ember); vertical-align: text-bottom; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .diff-line { white-space: pre; font-family: var(--vscode-editor-font-family); padding: 0 8px; line-height: 1.5; }
  .diff-add { background: var(--vscode-diffEditor-insertedLineBackground, transparent); }
  .diff-del { background: var(--vscode-diffEditor-removedLineBackground, transparent); }
  .reasoning { border-left: 2px solid var(--vscode-widget-border, var(--border)); padding: 0 0 0 10px; margin: 0; font-size: var(--fs-s); line-height: 1.5; color: var(--muted); }
  .reasoning > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 24px; }
  .reasoning > summary::-webkit-details-marker { display: none; }
  .reasoning > summary::before { content: ''; flex: none; width: 0; height: 0; border-left: 4px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform .12s; }
  .reasoning[open] > summary::before { transform: rotate(90deg); }
  .reasoning > summary:hover { color: var(--fg); }
  .reasoning .rbody { white-space: pre-wrap; padding: 0 0 4px;
  }
  .approval { border: 1px solid var(--ember); border-left-width: 3px; border-radius: var(--r-m); background: var(--vscode-editor-background, var(--bg)); animation: rise .14s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .approval { animation: none; } }
  .approval.destructive { border-color: var(--err); }
  .approval .kind { padding: 7px 10px 0; font-size: var(--fs-xs); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ember); }
  .approval.destructive .kind { color: var(--err); }
  .approval .line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 8px 8px 10px; min-width: 0; }
  .approval .q { flex: 1 1 140px; min-width: 0; overflow-wrap: anywhere; }
  .approval.destructive .q { color: var(--err); }
  .approval .target, .approval .file { font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); }
  .approval .meta { font-size: var(--fs-xs); color: var(--fg); font-family: var(--vscode-editor-font-family); }
  .approval button { flex: none; font-size: var(--fs-s); padding: 3px 9px; white-space: nowrap; }
  .approval .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; }
  .approval .link:hover { text-decoration: underline; }
  .approval .fb { display: flex; flex-direction: column; gap: 6px; padding: 0 10px 10px; }
  .approval .fb[hidden] { display: none; }
  .approval .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .approval .chip { border: 1px solid var(--vscode-widget-border, var(--border)); background: transparent; color: var(--muted); border-radius: 10px; padding: 1px 8px; font-size: var(--fs-xs); }
  .approval .chip:hover { color: var(--fg); }
  .approval .note { width: 100%; resize: vertical; min-height: 44px; border: 1px solid var(--vscode-input-border, var(--border)); border-radius: var(--r-s); background: var(--vscode-input-background, var(--bg)); color: var(--fg); font: 12px var(--vscode-font-family); padding: 6px 8px; }
  .approval .note:focus { border-color: var(--vscode-focusBorder, var(--accent)); }
  .approval .fb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
  .approval .acts { display: flex; gap: 6px; margin-left: auto; flex: none; }
  .approval .hold { position: relative; overflow: hidden; background: transparent; color: var(--err); box-shadow: inset 0 0 0 1px var(--err); user-select: none; touch-action: none; }
  .approval .hold::before { content: ""; position: absolute; inset: 0; width: 0; background: var(--err); opacity: .25; }
  .approval .hold.holding::before { width: 100%; transition: width .9s linear; }
  .approval .hold span { position: relative; }
  .approval-log { display: flex; gap: 6px; font-size: var(--fs-s); color: var(--muted); padding: 3px 4px 3px 18px; }
  .approval-log .st { width: 14px; flex: none; text-align: center; }
  .run { border: 1px solid var(--vscode-widget-border, var(--border)); border-radius: var(--r-m); background: var(--vscode-editor-background, var(--bg)); overflow: hidden; }
  .run .rh { display: flex; align-items: center; gap: 6px; padding: 8px 10px 6px; min-width: 0; }
  .run .rh .task { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; flex: 1; }
  .run .rh .sum { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .run .bar { height: 3px; margin: 0 10px 6px; border-radius: 2px; background: var(--vscode-widget-border, var(--border)); overflow: hidden; }
  .run .bar span { display: block; height: 100%; background: var(--vscode-button-background); }
  .run .step { display: flex; flex-direction: column; gap: 4px; padding: 7px 10px; border-top: 1px solid var(--vscode-widget-border, var(--border)); }
  .run .l1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .run .who { font-family: var(--vscode-editor-font-family); font-size: var(--fs-xs); color: var(--muted); border: 1px solid var(--vscode-widget-border, var(--border)); border-radius: var(--r-s); padding: 0 4px; flex: none; }
  .run .stask { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run .meta { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
  .run .l2 { display: flex; align-items: center; gap: 8px; padding-left: 22px; flex-wrap: wrap; font-size: var(--fs-s); }
  .run .l2 .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font-size: var(--fs-s); }
  .run .rerr { padding-left: 22px; overflow-wrap: anywhere; font-size: var(--fs-s); color: var(--err); }
  .run .rf { display: flex; justify-content: flex-end; padding: 6px 10px; border-top: 1px solid var(--vscode-widget-border, var(--border)); }
  .run .rf .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font-size: var(--fs-s); }
  .approval-log.err { color: var(--err); }
  .run .rh .ok, .run .l1 .ok { color: var(--ok); }
  .run .rh .err, .run .l1 .err { color: var(--err); }
  .status-bar {
    font-size: var(--fs-xs); color: var(--muted); padding: 6px 0 0; border-top: 1px solid var(--vscode-widget-border, var(--border)); margin-top: 2px; font-variant-numeric: tabular-nums;
    display: flex; flex-wrap: wrap; gap: 2px 12px; justify-content: space-between;
  }
  .status-bar > span { min-width: 0; overflow-wrap: anywhere; }
  .error-banner { background: rgba(244, 135, 113, 0.1); border-left: 2px solid var(--err); border-radius: 0 4px 4px 0; padding: 8px 10px; line-height: 1.5; overflow-wrap: anywhere; }
  .error-banner .link { background: none; border: 0; padding: 0 0 0 6px; color: var(--accent); cursor: pointer; text-decoration: none; }
  .error-banner .link:hover { text-decoration: underline; }
  .md .code.collapsed pre { max-height: 18em; overflow: hidden; }
  .md .code .code-more { display: block; width: 100%; background: none; color: var(--accent); border: 0; border-top: 1px solid var(--vscode-widget-border, var(--border)); padding: 4px 8px; font-size: var(--fs-xs); text-align: left; cursor: pointer; }
  .empty-state { color: var(--muted); padding: 28px 4px 12px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-state .mark { width: 64px; height: 64px; background: var(--ember); -webkit-mask: var(--mandala) center / contain no-repeat; mask: var(--mandala) center / contain no-repeat; }
  .empty-state h2 { margin: 0; font-size: var(--fs-l); font-weight: 600; color: var(--fg); }
  .empty-state p { margin: 0; line-height: 1.5; max-width: 34ch; }
  .empty-state .examples { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 6px; }
  .empty-state .ex { text-align: left; background: transparent; color: var(--fg); border: 1px solid var(--vscode-widget-border, var(--border)); border-radius: var(--r-m); padding: 6px 10px; font-size: var(--fs-s); min-height: 28px; }
  .empty-state .ex:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder, var(--accent)); }
  .empty-state .hint { font-size: var(--fs-xs); line-height: 1.4; margin-top: 6px; max-width: none; }
  /* Short panes (small windows, the composer's Autonomous note): give up the decoration first, never the hint. */
  @container msgs (max-height: 360px) {
    .empty-state { padding: 6px 4px 2px; gap: 6px; }
    .empty-state .mark { width: 44px; height: 44px; }
    .empty-state .examples { gap: 4px; margin-top: 2px; }
    .empty-state .ex { min-height: 24px; padding: 3px 10px; }
    .empty-state .hint { margin-top: 2px; }
  }
  @container msgs (max-height: 300px) {
    .empty-state .mark, .empty-state p:not(.hint) { display: none; }
  }
  @container msgs (max-height: 185px) {
    .empty-state .ex:nth-child(n + 2) { display: none; }
  }
  @container msgs (max-height: 125px) {
    .empty-state .examples { display: none; }
  }
  .empty-state kbd {
    background: var(--tool); border: 1px solid var(--border); padding: 1px 5px; border-radius: var(--r-s); font-family: var(--vscode-editor-font-family); font-size: var(--fs-xs);
  }
  /* Voice input */
  #mic.recording {
    background: rgba(244, 67, 54, 0.15); color: var(--err); border-color: var(--err);
    animation: mic-pulse 1.2s ease-in-out infinite;
  }
  #mic:disabled { opacity: 0.4; cursor: not-allowed; }
  #mic .dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: currentColor; vertical-align: middle; margin-right: 4px;
  }
  @keyframes mic-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.45); }
    50% { box-shadow: 0 0 0 6px rgba(244, 67, 54, 0); }
  }
  #input.interim {
    color: var(--muted); font-style: italic;
  }
  #voice-status {
    font-size: var(--fs-xs); color: var(--muted); padding: 4px 0; min-height: 14px;
  }
  #voice-status.error { color: var(--err); }
  #mention-list {
    display: none; border: 1px solid var(--border); border-radius: var(--r-s); margin-bottom: 4px;
    background: var(--vscode-editorSuggestWidget-background, var(--bg)); max-height: 140px; overflow: auto; font-size: var(--fs-s);
  }
  #mention-list.open { display: block; }
  #mention-list .mg { padding: 6px 8px 2px; font-size: var(--fs-xs); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
  #mention-list .mi { padding: 3px 8px; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  #mention-list .mi > span:first-child { font-family: var(--vscode-editor-font-family); font-size: var(--fs-s); flex: none; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #mention-list .mi:hover, #mention-list .mi.sel { background: var(--vscode-list-hoverBackground); }
  #mention-list .mi .hint { color: var(--muted); font-size: var(--fs-s); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Keyboard focus must always be visible. */
  button:focus-visible, select:focus-visible, textarea:focus-visible, input:focus-visible, .mi:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, var(--accent)); outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
  @media (forced-colors: active) {
    button, select, textarea, #mention-list, .approval, .error-banner, .warning { border: 1px solid ButtonText; }
  }
</style>
</head>
<body>
<script src="${voiceScriptUri}" onerror="window.__forgeVoiceLoadFailed=true"></script>
<script src="${forgeUiScriptUri}" onerror="window.__forgeUiLoadFailed=true"></script>
<div id="toolbar" role="toolbar" aria-label="Chat actions">
  <select id="mode" title="Mode" aria-label="Mode"></select>
  <button type="button" class="model" id="model-label" title="Model" aria-haspopup="dialog" aria-expanded="false">no model</button>
  <span class="spacer"></span>
  <span class="meter empty" id="meter" role="status" aria-label="Chat cost and context usage" title="Cost of this chat and how full the context window is"><svg class="ring" viewBox="0 0 16 16" aria-hidden="true"><circle class="ring-track" cx="8" cy="8" r="6"/><circle class="ring-fill" id="meter-ring" cx="8" cy="8" r="6" stroke-dasharray="0 37.7"/></svg><span id="meter-text"></span></span>
  <button id="new-chat" class="icon" type="button" title="New chat" aria-label="New chat"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg></button>
  <button id="history-btn" class="icon" type="button" title="History" aria-label="History"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v2.2h2.2"/><path d="M8 5v3.2l2 1.3"/></svg></button>
  <button id="more-btn" class="icon" type="button" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r=".7"/><circle cx="8" cy="8" r=".7"/><circle cx="12.5" cy="8" r=".7"/></svg></button>
  <div id="model-menu" role="dialog" aria-label="Choose a model" hidden>
    <input type="search" id="model-search" placeholder="Search models" aria-label="Search models" autocomplete="off" />
    <div id="model-list"></div>
    <div class="foot"><button type="button" id="model-refresh">Refresh</button><button type="button" id="model-settings">Settings…</button></div>
  </div>
  <div id="more-menu" role="menu" aria-label="More actions" hidden>
    <button id="checkpoints-btn" type="button" role="menuitem">Restore checkpoint…</button>
    <button id="condense-btn" type="button" role="menuitem" title="Summarize older turns to free up context">Condense conversation</button>
    <button id="specs-btn" type="button" role="menuitem" title="Turn a task into requirements, a design and a checklist">Specs…</button>
    <button id="steering-btn" type="button" role="menuitem" title="Guidance Forge reads at the start of every chat">Steering…</button>
    <div class="stat" id="meter-stat"></div>
  </div>
</div>
<div id="panel" role="dialog" aria-label="Panel"></div>
<div id="messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
  <div class="empty-state" id="empty">
    <div class="mark" aria-hidden="true"></div>
    <h2>What should Forge work on?</h2>
    <p>Forge asks before it edits files or runs commands.</p>
    <div class="examples">
      <button type="button" class="ex">Explain how this project is organized</button>
      <button type="button" class="ex">Find why a test is failing and fix it</button>
      <button type="button" class="ex">Add tests for the file I have open</button>
    </div>
    <p class="hint">Enter sends. Shift+Enter adds a line. @ attaches files.</p>
  </div>
</div>
<div id="approval-announcer" class="sr-only" aria-live="assertive"></div>
<div id="input-area" role="region" aria-label="Message input">
  <div id="mention-list" role="listbox" aria-label="Mention suggestions"></div>
  <div id="queue" role="list" aria-label="Queued messages"></div>
  <div id="edit-banner" hidden><span>Editing your last message</span><button id="edit-cancel" class="link" type="button">Cancel</button></div>
  <div class="composer">
    <div id="attachments" role="list" aria-label="Attached files"></div>
    <textarea id="input" rows="1" aria-label="Message to Forge" aria-autocomplete="list" aria-controls="mention-list" placeholder="Ask Forge… (@ to attach context)" title="@ attaches files, @problems or @git context" autofocus></textarea>
    <div class="cfoot">
      <label class="auto" id="auto-label" title="Autonomous: Forge runs tools without asking you first"><input type="checkbox" id="auto-toggle" aria-describedby="auto-note" /> Autonomous</label>
      <span class="spacer"></span>
      <button id="attach" class="icon" type="button" title="Attach context (@)" aria-label="Attach context"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M10.5 8v1a2 2 0 0 0 4 0V8a6.5 6.5 0 1 0-2.6 5.2"/></svg></button>
      <button id="attach-file" class="icon" type="button" title="Attach files (or paste / drop them)" aria-label="Attach files"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 7.5 8 13a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3L6.5 11.1a1.2 1.2 0 0 1-1.7-1.7L10 4.2"/></svg></button>
      <button id="enhance" class="icon" type="button" title="Enhance prompt" aria-label="Enhance prompt"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75 9.2 5.3 12.75 6.5 9.2 7.7 8 11.25 6.8 7.7 3.25 6.5 6.8 5.3zM12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg></button>
      <button id="mic" class="icon" type="button" title="Voice input (Ctrl+Shift+Space)" aria-label="Voice input"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25"/></svg></button>
      <button id="send" type="button" disabled aria-label="Send message">Send</button>
      <button id="cancel" class="secondary" type="button" disabled hidden aria-label="Stop the running task">Stop</button>
    </div>
  </div>
  <div id="voice-status" aria-live="polite"></div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  /** Pure helpers from dist/webview/forge-ui.js; null when the bundle did not load (plain-text fallback). */
  const UI = window.ForgeUI || null;
  if (!UI) console.warn('[forge] chat UI library did not load; replies render as plain text');
  const messagesEl = document.getElementById('messages');
  let emptyEl = document.getElementById('empty');
  const EMPTY_HTML = emptyEl ? emptyEl.outerHTML : '';
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const cancelBtn = document.getElementById('cancel');
  const autoToggle = document.getElementById('auto-toggle');
  const autoLabel = document.getElementById('auto-label');
  const autoNote = document.createElement('div');
  autoNote.id = 'auto-note';
  autoNote.hidden = true;
  autoNote.textContent = 'Approvals are off: Forge runs tools without asking.';
  autoLabel.closest('.composer').appendChild(autoNote);
  autoToggle.addEventListener('change', () => { autoLabel.classList.toggle('on', autoToggle.checked); autoNote.hidden = !autoToggle.checked; });
  const modelLabel = document.getElementById('model-label');
  const micBtn = document.getElementById('mic');
  const voiceStatusEl = document.getElementById('voice-status');
  const modeSelect = document.getElementById('mode');
  const newChatBtn = document.getElementById('new-chat');
  const historyBtn = document.getElementById('history-btn');
  const checkpointsBtn = document.getElementById('checkpoints-btn');
  const panelEl = document.getElementById('panel');
  const condenseBtn = document.getElementById('condense-btn');
  const meterEl = document.getElementById('meter');
  const mentionList = document.getElementById('mention-list');
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  const meterRing = document.getElementById('meter-ring');
  const meterText = document.getElementById('meter-text');
  const meterStat = document.getElementById('meter-stat');
  const attachBtn = document.getElementById('attach');
  const queueEl = document.getElementById('queue');
  const editBanner = document.getElementById('edit-banner');
  const MERMAID_URI = ${JSON.stringify(mermaidScriptUri)};
  /** Messages typed while a run is going; the next one is sent when the run finishes. */
  const queued = [];
  /** The last message you sent, for Retry and Edit; null in a fresh or resumed chat. */
  let lastUserText = null;
  /** True while the input holds an edit of the last message: Send replaces that turn. */
  let editingLast = false;
  const attachFileBtn = document.getElementById('attach-file');
  const attachmentsEl = document.getElementById('attachments');
  /** Chips for files waiting on the next message; the host owns the list and resends it on every change. */
  let pendingFiles = [];
  const announcer = document.getElementById('approval-announcer');

  // Model picker: provider-grouped, searchable; the host answers list_models with model_menu.
  const modelMenu = document.getElementById('model-menu');
  const modelSearch = document.getElementById('model-search');
  const modelList = document.getElementById('model-list');
  let modelGroups = null;
  let modelCurrent = null;
  function closeModelMenu() { modelMenu.hidden = true; modelLabel.setAttribute('aria-expanded', 'false'); }
  function renderModelMenu() {
    modelList.textContent = '';
    if (!modelGroups) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Loading models…'; modelList.appendChild(d); return; }
    const q = modelSearch.value.trim().toLowerCase();
    let shown = 0;
    modelGroups.forEach((g) => {
      const rows = g.models.filter((m) => !q || m.id.toLowerCase().indexOf(q) >= 0 || m.label.toLowerCase().indexOf(q) >= 0 || g.label.toLowerCase().indexOf(q) >= 0);
      if (!rows.length) return;
      const h = document.createElement('div'); h.className = 'mg'; h.textContent = g.label; modelList.appendChild(h);
      if (g.source === 'builtin' && g.error && !q) { const n = document.createElement('div'); n.className = 'mn'; n.textContent = g.error; modelList.appendChild(n); }
      rows.forEach((m) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mo';
        const on = !!modelCurrent && modelCurrent.provider === g.provider && modelCurrent.model === m.id;
        const ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = on ? '✓' : ''; b.appendChild(ck);
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.label; b.appendChild(nm);
        if (m.label !== m.id) { const id = document.createElement('span'); id.className = 'id'; id.textContent = m.id; id.title = m.id; b.appendChild(id); }
        b.addEventListener('click', () => { vscode.postMessage({ type: 'select_model', provider: g.provider, model: m.id }); closeModelMenu(); modelLabel.focus(); });
        modelList.appendChild(b);
        shown++;
      });
    });
    if (!shown) {
      const d = document.createElement('div'); d.className = 'empty';
      d.textContent = modelGroups.length ? 'No models match.' : 'No models yet. Add an API key in Settings.';
      modelList.appendChild(d);
    }
  }
  modelLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!modelMenu.hidden) { closeModelMenu(); return; }
    closeMore();
    closePanel();
    modelMenu.hidden = false;
    modelLabel.setAttribute('aria-expanded', 'true');
    modelSearch.value = '';
    renderModelMenu();
    vscode.postMessage({ type: 'list_models' });
    modelSearch.focus();
  });
  modelSearch.addEventListener('input', renderModelMenu);
  document.getElementById('model-refresh').addEventListener('click', () => { modelGroups = null; renderModelMenu(); vscode.postMessage({ type: 'list_models', refresh: true }); });
  document.getElementById('model-settings').addEventListener('click', () => { closeModelMenu(); vscode.postMessage({ type: 'open_settings' }); });
  document.addEventListener('click', (e) => { if (!modelMenu.hidden && !modelMenu.contains(e.target)) closeModelMenu(); });
  modelMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModelMenu(); modelLabel.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [modelSearch].concat(Array.prototype.slice.call(modelList.querySelectorAll('button.mo')));
    const at = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    items[next].focus();
  });

  function closeMore() { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
  function closeRowMenus() { Array.prototype.forEach.call(panelEl.querySelectorAll('.rowmenu'), (m) => m.remove()); }
  /** Menus are transient: close them all together, e.g. before a panel opens. */
  function closeMenus() { closeMore(); closeModelMenu(); closeRowMenus(); }
  // A click in another part of VS Code never reaches this document, so a blur is the only signal.
  window.addEventListener('blur', closeMenus);
  document.addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('.rowmenu')) closeRowMenus(); });
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModelMenu();
    closePanel();
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    if (open) checkpointsBtn.focus();
  });
  document.addEventListener('click', (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target)) closeMore(); });
  moreMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMore(); moreBtn.focus(); return; }
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const items = Array.prototype.slice.call(moreMenu.querySelectorAll('[role="menuitem"]'));
    const at = items.indexOf(document.activeElement);
    const step = keys[e.key];
    const next = step === 'first' ? 0 : step === 'last' ? items.length - 1 : (at + step + items.length) % items.length;
    items[next].focus();
  });

  /** A 16px stroke icon built from DOM nodes (panel rows never use innerHTML). */
  function svgIcon(shapes) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    shapes.forEach((sh) => {
      const el = document.createElementNS(ns, sh[0]);
      Object.keys(sh[1]).forEach((k) => el.setAttribute(k, sh[1][k]));
      svg.appendChild(el);
    });
    return svg;
  }

  let panelOpener = null;
  function closePanel() {
    const hadFocus = panelEl.contains(document.activeElement);
    panelEl.classList.remove('open');
    panelEl.textContent = '';
    panelEl.removeAttribute('aria-label');
    delete panelEl.dataset.work;
    if (hadFocus) {
      const back = panelOpener && panelOpener !== document.body && panelOpener.isConnected ? panelOpener : inputEl;
      back.focus();
    }
  }
  panelEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePanel(); } });

  /** The host answers after a delay: only fill a panel that is still open and still the one asked for. */
  function panelShows(title) { return panelEl.classList.contains('open') && panelEl.getAttribute('aria-label') === title; }

  /** Shows a one-line state (loading, error) in the panel while the host fetches a list. */
  function renderPanelMessage(title, text, loading) {
    renderPanelRows(title, [], text);
    if (loading) panelEl.dataset.loading = title;
  }

  /**
   * rows: [{ text, meta, actions: [{ label, onClick, secondary }] }]: all text via textContent.
   * opts.remoteSearch { query, onQuery }: the search box asks the host (full text) instead of filtering titles.
   */
  function renderPanelRows(title, rows, emptyText, opts) {
    const remote = opts && opts.remoteSearch;
    if (!panelEl.classList.contains('open')) panelOpener = document.activeElement;
    panelEl.textContent = '';
    panelEl.setAttribute('aria-label', title);
    delete panelEl.dataset.loading;
    delete panelEl.dataset.work;
    const head = document.createElement('div');
    head.className = 'title';
    const t = document.createElement('span');
    t.textContent = title;
    const close = document.createElement('button');
    close.className = 'icon';
    close.setAttribute('aria-label', 'Close');
    close.title = 'Close';
    close.appendChild(svgIcon([['path', { d: 'M4 4l8 8M12 4l-8 8' }]]));
    close.addEventListener('click', closePanel);
    head.appendChild(t);
    head.appendChild(close);
    panelEl.appendChild(head);
    let search = null;
    if (rows.length > 5 || remote) {
      search = document.createElement('input');
      search.type = 'search';
      search.className = 'search';
      search.placeholder = remote ? 'Search all sessions' : 'Search';
      search.setAttribute('aria-label', remote ? 'Search all sessions' : 'Search ' + title);
      if (remote && remote.query) search.value = remote.query;
      panelEl.appendChild(search);
    }
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'meta';
      empty.textContent = emptyText || 'Nothing here yet.';
      panelEl.appendChild(empty);
    }
    const rowEls = [];
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'row' + (r.current ? ' current' : '');
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = r.text;
      text.title = r.text;
      const meta = document.createElement('span');
      meta.className = 'meta';
      const when = document.createElement('span');
      when.textContent = r.meta;
      if (r.metaTitle) when.title = r.metaTitle;
      meta.appendChild(when);
      if (r.current) { const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = 'Open'; meta.appendChild(pill); }
      row.appendChild(text);
      row.appendChild(meta);
      for (const a of r.actions) {
        const b = document.createElement('button');
        if (a.secondary) b.className = 'secondary';
        b.textContent = a.label;
        b.addEventListener('click', a.onClick);
        row.appendChild(b);
      }
      // Rare or risky actions live behind a menu so they do not compete with the main one.
      if (r.menu && r.menu.length) {
        const more = document.createElement('button');
        more.className = 'icon';
        more.setAttribute('aria-label', 'More actions');
        more.setAttribute('aria-haspopup', 'menu');
        more.title = 'More actions';
        more.appendChild(svgIcon([3, 8, 13].map((cx) => ['circle', { cx: String(cx), cy: '8', r: '1.2', fill: 'currentColor', stroke: 'none' }])));
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = row.querySelector('.rowmenu');
          closeRowMenus();
          if (open) return;
          const menu = document.createElement('div');
          menu.className = 'rowmenu';
          menu.setAttribute('role', 'menu');
          r.menu.forEach((m) => {
            const mb = document.createElement('button');
            mb.type = 'button';
            mb.setAttribute('role', 'menuitem');
            if (m.danger) mb.className = 'danger';
            mb.textContent = m.label;
            mb.addEventListener('click', () => { closeRowMenus(); m.onClick(); });
            menu.appendChild(mb);
          });
          menu.addEventListener('keydown', (ev) => {
            const items = Array.prototype.slice.call(menu.querySelectorAll('button'));
            const at = items.indexOf(document.activeElement);
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeRowMenus(); more.focus(); }
            else if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(at + 1) % items.length].focus(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
            else if (ev.key === 'Tab') closeRowMenus();
          });
          row.appendChild(menu);
          menu.querySelector('button').focus();
          // The last row's menu hangs below the list: scroll it into view.
          menu.scrollIntoView({ block: 'nearest' });
        });
        row.appendChild(more);
      }
      rowEls.push({ row, haystack: (r.text + ' ' + (r.meta || '')).toLowerCase() });
      panelEl.appendChild(row);
    }
    if (search && remote) {
      let timer = null;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => remote.onQuery(search.value.trim()), 300);
      });
    } else if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        rowEls.forEach((x) => { x.row.hidden = !!q && x.haystack.indexOf(q) < 0; });
      });
    }
    // The toolbar wraps in narrow sidebars, so open the panel just below wherever it ends.
    panelEl.style.top = document.getElementById('toolbar').getBoundingClientRect().bottom + 'px';
    closeMenus();
    panelEl.classList.add('open');
    // A search re-renders the panel: keep typing where you were.
    if (search && remote && remote.query) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    } else close.focus();
  }

  // ---- Specs and Steering panels (built from DOM nodes, like the other panels)
  function wk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function wkButton(label, cls, onClick) {
    const b = wk('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function workAct(panel, action) { vscode.postMessage({ type: 'work_act', panel: panel, action: action }); }

  /** The panel's frame (title, optional main action, close); returns the body to fill. */
  function workShell(kind, title, mainLabel, onMain) {
    const keep = panelEl.dataset.work === kind ? panelEl.scrollTop : 0;
    if (!panelEl.classList.contains('open')) panelOpener = document.activeElement;
    panelEl.textContent = '';
    panelEl.setAttribute('aria-label', title);
    panelEl.dataset.work = kind;
    const head = wk('div', 'title');
    head.appendChild(wk('span', '', title));
    const right = wk('span', 'wk-actions');
    right.style.marginTop = '0';
    if (mainLabel) right.appendChild(wkButton(mainLabel, '', onMain));
    const close = wk('button', 'icon');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.title = 'Close';
    close.appendChild(svgIcon([['path', { d: 'M4 4l8 8M12 4l-8 8' }]]));
    close.addEventListener('click', closePanel);
    right.appendChild(close);
    head.appendChild(right);
    panelEl.appendChild(head);
    closeMenus();
    panelEl.style.top = document.getElementById('toolbar').getBoundingClientRect().bottom + 'px';
    panelEl.classList.add('open');
    panelEl.scrollTop = keep;
    return panelEl;
  }

  function renderWorkLoading(kind, title) {
    workShell(kind, title);
    panelEl.appendChild(wk('div', 'wk-note', 'Loading…'));
  }

  const STATUS_MARK = { done: '✓', failed: '✗', running: '…', pending: '○' };

  function renderSpecs(view, error) {
    workShell('specs', 'Specs', view && (view.drafts.length || view.specs.length) ? 'New spec' : '', () => workAct('specs', { action: 'generate' }));
    if (!view) { panelEl.appendChild(wk('div', 'wk-note', error || 'Open a folder to use specs.')); return; }
    if (!view.drafts.length && !view.specs.length) {
      const box = wk('div', 'wk-empty');
      box.appendChild(wk('p', '', 'A spec turns a task into requirements, a design and a checklist that Forge works through.'));
      box.appendChild(wkButton('Generate a spec', 'primary', () => workAct('specs', { action: 'generate' })));
      box.appendChild(wk('p', '', 'You can also type /spec followed by the task in the chat.'));
      panelEl.appendChild(box);
      return;
    }
    if (view.drafts.length) {
      panelEl.appendChild(wk('div', 'wk-label', 'Drafts'));
      view.drafts.forEach((d) => {
        const card = wk('div', 'wk-card');
        const head = wk('div', 'wk-head');
        head.appendChild(wk('span', 'tt', d.task));
        card.appendChild(head);
        const acts = wk('div', 'wk-actions');
        [['requirements.md', 'Requirements'], ['design.md', 'Design'], ['tasks.md', 'Tasks']].forEach((f) => {
          acts.appendChild(wkButton(f[1], 'link', () => workAct('specs', { action: 'openDraft', draftId: d.id, file: f[0] })));
        });
        const spacer = wk('span');
        spacer.style.flex = '1';
        acts.appendChild(spacer);
        acts.appendChild(wkButton('Discard', 'secondary', () => workAct('specs', { action: 'discard', draftId: d.id })));
        acts.appendChild(wkButton('Approve', 'primary', () => workAct('specs', { action: 'approve', draftId: d.id })));
        card.appendChild(acts);
        panelEl.appendChild(card);
      });
    }
    if (view.specs.length) {
      // The panel is already titled Specs; the label only helps tell them apart from drafts.
      if (view.drafts.length) panelEl.appendChild(wk('div', 'wk-label', 'Specs'));
      view.specs.forEach((s) => {
        const card = wk('div', 'wk-card');
        const head = wk('div', 'wk-head');
        head.appendChild(wk('span', 'tt', s.task));
        if (s.total) head.appendChild(wk('span', 'meta', s.done + '/' + s.total + ' tasks'));
        card.appendChild(head);
        if (s.total) {
          const bar = wk('div', 'wk-bar');
          const fill = wk('span');
          fill.style.width = Math.round((s.done / s.total) * 100) + '%';
          bar.appendChild(fill);
          card.appendChild(bar);
        }
        const syncRow = wk('div', 'wk-actions');
        const syncBtn = wkButton('Sync with code', 'secondary', () => workAct('specs', { action: 'sync', specId: s.id }));
        syncBtn.title = 'Update this spec to match the code: tick done tasks, fix paths, add missing work';
        syncRow.appendChild(syncBtn);
        card.appendChild(syncRow);
        if (s.needsConvert) {
          const row = wk('div', 'wk-actions');
          row.appendChild(wk('span', 'wk-note', 'No checkbox tasks yet.'));
          row.lastChild.style.margin = '0';
          row.appendChild(wkButton('Convert…', 'secondary', () => workAct('specs', { action: 'convert', specId: s.id })));
          card.appendChild(row);
        }
        s.tasks.forEach((tk) => {
          const row = wk('div', 'trow');
          row.appendChild(wk('span', 'st ' + tk.status, STATUS_MARK[tk.status] || '○'));
          const name = wkButton(tk.title, 'tt', () => workAct('specs', { action: 'open', specId: s.id, line: tk.line }));
          name.title = tk.title;
          row.appendChild(name);
          if (tk.requirements) row.appendChild(wk('span', 'req', tk.requirements));
          if (tk.status === 'pending' || tk.status === 'failed') {
            row.appendChild(wkButton(tk.status === 'failed' ? 'Retry' : 'Run', 'secondary', () => workAct('specs', { action: 'run', specId: s.id, taskId: tk.id, title: tk.title, current: false })));
            const more = wk('button', 'icon');
            more.type = 'button';
            more.setAttribute('aria-label', 'Run in this chat');
            more.title = 'Run in this chat';
            more.appendChild(svgIcon([['path', { d: 'M3 8h10M9 4l4 4-4 4' }]]));
            more.addEventListener('click', () => workAct('specs', { action: 'run', specId: s.id, taskId: tk.id, title: tk.title, current: true }));
            row.appendChild(more);
          }
          card.appendChild(row);
        });
        panelEl.appendChild(card);
      });
    }
  }

  function renderSteering(view, error) {
    workShell('steering', 'Steering', view && view.rows.length ? 'New file' : '', () => workAct('steering', { action: 'new' }));
    if (!view) { panelEl.appendChild(wk('div', 'wk-note', error || 'Open a folder to use steering.')); return; }
    view.notes.forEach((n) => panelEl.appendChild(wk('div', 'wk-note', n)));
    if (!view.rows.length) {
      const box = wk('div', 'wk-empty');
      box.appendChild(wk('p', '', 'No steering files yet. Steering files hold guidance Forge reads at the start of every chat, such as how this project is built and tested.'));
      box.appendChild(wkButton('Create a steering file', 'primary', () => workAct('steering', { action: 'new' })));
      panelEl.appendChild(box);
      return;
    }
    [['project', 'Project'], ['global', 'Global']].forEach((g) => {
      const rows = view.rows.filter((r) => r.source === g[0]);
      if (!rows.length) return;
      panelEl.appendChild(wk('div', 'wk-label', g[1]));
      rows.forEach((r) => {
        const row = wk('div', 'trow');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = r.enabled;
        box.setAttribute('aria-label', r.name + ': on or off');
        if (r.editInFile) box.title = 'Turned off by "enabled: false" in the file. Remove that line to turn it on.';
        box.addEventListener('change', () => workAct('steering', { action: 'toggle', name: r.name, source: r.source }));
        row.appendChild(box);
        const body = wk('div');
        body.style.flex = '1';
        body.style.minWidth = '0';
        const name = wkButton(r.name, 'tt', () => workAct('steering', { action: 'open', name: r.name, source: r.source }));
        body.appendChild(name);
        body.appendChild(wk('span', 'desc', r.description));
        row.appendChild(body);
        panelEl.appendChild(row);
      });
    });
  }

  function openWork(kind) {
    closeMore();
    if (kind === 'specs') renderWorkLoading('specs', 'Specs'); else renderWorkLoading('steering', 'Steering');
    vscode.postMessage({ type: 'work_load', panel: kind });
  }
  document.getElementById('specs-btn').addEventListener('click', () => openWork('specs'));
  document.getElementById('steering-btn').addEventListener('click', () => openWork('steering'));

  function appendWarning(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'warning';
    div.setAttribute('role', 'status');
    div.textContent = text;
    messagesEl.appendChild(div);
    autoscroll();
    setTimeout(() => div.remove(), 8000);
  }

  // A neutral, lasting status line from the host (e.g. a commit that was made); unlike a warning it stays.
  function appendNotice(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'warning notice';
    div.setAttribute('role', 'status');
    div.textContent = text;
    messagesEl.appendChild(div);
    autoscroll();
  }

  // Offered instead of running a request that asks for a whole system; the host holds the message.
  function removeSuggestCard() { const c = messagesEl.querySelector('.approval.suggest'); if (c) c.remove(); }
  function showSuggestSpec() {
    removeSuggestCard();
    const card = document.createElement('div');
    card.className = 'approval suggest';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'This looks like a big build');
    const kind = document.createElement('div'); kind.className = 'kind'; kind.textContent = 'Big request';
    const line = document.createElement('div'); line.className = 'line';
    const q = document.createElement('span'); q.className = 'q';
    q.textContent = 'A spec turns this into requirements, a design and tasks you approve, then runs them one by one.';
    line.appendChild(q);
    const choices = [['Draft a spec', 'spec', false], ['Plan first', 'plan', true], ['Just do it', 'go', true]];
    for (const [label, choice, secondary] of choices) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (secondary) b.className = 'secondary';
      b.addEventListener('click', () => { card.remove(); vscode.postMessage({ type: 'suggest_choice', choice }); });
      line.appendChild(b);
    }
    const never = document.createElement('button'); never.type = 'button'; never.className = 'link';
    never.textContent = "Don't ask again";
    never.addEventListener('click', () => { card.remove(); vscode.postMessage({ type: 'suggest_choice', choice: 'never' }); });
    line.appendChild(never);
    card.appendChild(kind); card.appendChild(line);
    messagesEl.appendChild(card);
    autoscroll();
  }

  // Footer under a run that changed files: one click puts them back (the host decides what "this run" is).
  function removeRunFooter() { const f = messagesEl.querySelector('.run-footer'); if (f) f.remove(); }
  function filesText(n) { return n + (n === 1 ? ' file' : ' files'); }
  function showRunChanges(count) {
    removeRunFooter();
    const div = document.createElement('div');
    div.className = 'run-footer';
    const text = document.createElement('span');
    text.textContent = 'Changed ' + filesText(count) + ' · ';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'link'; btn.textContent = 'Revert this run';
    btn.addEventListener('click', () => vscode.postMessage({ type: 'revert_run' }));
    div.appendChild(text); div.appendChild(btn);
    messagesEl.appendChild(div);
    autoscroll();
  }
  function showRunReverted(count) {
    const footer = messagesEl.querySelector('.run-footer');
    if (!footer) return;
    footer.textContent = 'Reverted ' + filesText(count);
  }

  function appendStatusLine(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.style.color = 'var(--muted)';
    div.style.fontSize = '11px';
    div.style.overflowWrap = 'anywhere';
    div.textContent = text;
    messagesEl.appendChild(div);
    autoscroll();
  }

  function renderTranscript(items) {
    stickToBottom = true; // a loaded chat opens at its end
    messagesEl.textContent = '';
    streamingEl = null;
    streamText = '';
    toolEls.clear();
    toolArgs.clear();
    // New chat: bring the "Ask Forge anything" hint back instead of leaving a blank pane.
    if (!items.length && EMPTY_HTML) {
      messagesEl.innerHTML = EMPTY_HTML;
      emptyEl = document.getElementById('empty');
    }
    for (const it of items) {
      if (it.role === 'user') appendUserMessage(it.text);
      else finalizeAssistant(it.text);
    }
  }

  let currentSessionId = '';
  /** "3 min ago", "yesterday", then the date: the exact time is in the tooltip. */
  function relTime(iso) {
    const t = new Date(iso).getTime();
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 172800) return 'yesterday';
    return new Date(t).toLocaleDateString();
  }
  function fmtCost(e) {
    if (e.costKnown && typeof e.totalCostUsd === 'number') return '$' + e.totalCostUsd.toFixed(2);
    return '';
  }

  let meterCost = null;
  let meterCtx = null;
  function renderMeter() {
    let pct = null;
    if (meterCtx && meterCtx.window > 0) pct = Math.min(100, Math.round((meterCtx.tokens / meterCtx.window) * 100));
    const cost = meterCost !== null ? '$' + meterCost.toFixed(meterCost < 0.1 ? 4 : 2) : '';
    const parts = [];
    if (cost) parts.push('This chat: ' + cost);
    if (pct !== null) parts.push('context ' + pct + '% full (' + meterCtx.tokens + ' / ' + meterCtx.window + ' tokens)');
    const detail = parts.join(' · ');
    meterText.textContent = pct !== null ? pct + '%' : cost;
    meterRing.setAttribute('stroke-dasharray', (((pct || 0) / 100) * 37.7).toFixed(1) + ' 37.7');
    meterEl.title = detail || 'Cost of this chat and how full the context window is';
    meterStat.textContent = detail;
    meterEl.classList.toggle('empty', !detail);
    meterEl.classList.toggle('warn', pct !== null && pct >= 80);
  }
  condenseBtn.addEventListener('click', () => { closeMore(); closePanel(); vscode.postMessage({ type: 'condense' }); });

  // ---- @ mention autocomplete
  let mentionTimer = null;
  let mentionRange = null;
  function isSpace(ch) { return ch === ' ' || ch === '\\n' || ch === '\\t'; }
  function hideMentions() { mentionList.classList.remove('open'); mentionList.textContent = ''; mentionRange = null; }
  function currentMentionToken() {
    const pos = inputEl.selectionStart;
    const upto = inputEl.value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && !isSpace(upto.charAt(at - 1))) return null;
    const query = upto.slice(at + 1);
    for (let i = 0; i < query.length; i++) { if (isSpace(query.charAt(i))) return null; }
    return { start: at, end: pos, query: query };
  }
  function insertMention(value) {
    if (!mentionRange) return;
    const v = inputEl.value;
    const next = v.slice(0, mentionRange.start) + '@' + value + ' ' + v.slice(mentionRange.end);
    const caret = mentionRange.start + value.length + 2;
    inputEl.value = next;
    inputEl.setSelectionRange(caret, caret);
    hideMentions();
    setSendEnabled();
    inputEl.focus();
  }
  function scheduleMentionQuery() {
    if (mentionTimer) clearTimeout(mentionTimer);
    const tok = currentMentionToken();
    if (!tok) { hideMentions(); return; }
    mentionRange = tok;
    mentionTimer = setTimeout(() => vscode.postMessage({ type: 'mention_query', q: tok.query }), 120);
  }
  function renderMentionSuggestions(items) {
    mentionList.textContent = '';
    if (!items.length || !mentionRange) { hideMentions(); return; }
    // Context shortcuts (they carry a hint) come before files; label the two groups when both are present.
    const hasKeywords = items.some((x) => x.hint);
    const hasFiles = items.some((x) => !x.hint);
    let lastGroup = '';
    items.forEach((it, i) => {
      const group = it.hint ? 'Context' : 'Files';
      if (hasKeywords && hasFiles && group !== lastGroup) {
        const g = document.createElement('div');
        g.className = 'mg';
        g.textContent = group;
        g.setAttribute('role', 'presentation');
        mentionList.appendChild(g);
        lastGroup = group;
      }
      const row = document.createElement('div');
      row.className = 'mi' + (i === 0 ? ' sel' : '');
      row.setAttribute('role', 'option');
      row.dataset.value = it.value;
      const label = document.createElement('span');
      label.textContent = it.label;
      row.appendChild(label);
      if (it.hint) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = it.hint;
        row.appendChild(hint);
      }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); insertMention(it.value); });
      mentionList.appendChild(row);
    });
    mentionList.classList.add('open');
  }
  function moveMentionSelection(delta) {
    const rows = Array.prototype.slice.call(mentionList.querySelectorAll('.mi'));
    if (!rows.length) return;
    let idx = rows.findIndex((r) => r.classList.contains('sel'));
    rows.forEach((r) => r.classList.remove('sel'));
    idx = (idx + delta + rows.length) % rows.length;
    rows[idx].classList.add('sel');
    rows.forEach((r) => r.setAttribute('aria-selected', r === rows[idx] ? 'true' : 'false'));
    rows[idx].scrollIntoView({ block: 'nearest' });
  }

  // ---- file paste / drop: any file goes to the host, which keeps it for the next message (never in the workspace)
  function sendFile(file) {
    const reader = new FileReader();
    reader.onload = () => vscode.postMessage({ type: 'attach_file', name: file.name || '', dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }
  inputEl.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== 'file') continue;
      const f = items[i].getAsFile();
      if (f) files.push(f);
    }
    if (files.length === 0) return;
    e.preventDefault();
    files.forEach(sendFile);
  });
  inputEl.addEventListener('dragover', (e) => { e.preventDefault(); });
  inputEl.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files.length > 0) {
      e.preventDefault();
      for (let i = 0; i < dt.files.length; i++) sendFile(dt.files[i]);
      return;
    }
    // From the Explorer or an editor tab: a list of URIs, read by the host.
    const list = dt.getData('text/uri-list');
    if (!list) return;
    const uris = list.split(/\\r?\\n/).map((u) => u.trim()).filter((u) => u && u.charAt(0) !== '#');
    if (uris.length === 0) return;
    e.preventDefault();
    vscode.postMessage({ type: 'attach_uris', uris });
  });
  attachFileBtn.addEventListener('click', () => vscode.postMessage({ type: 'pick_attachments' }));

  // Enhance prompt: the host rewrites the draft with the cheap model; execCommand keeps Ctrl+Z working.
  const enhanceBtn = document.getElementById('enhance');
  let enhancing = false;
  let sentDraft = '';
  enhanceBtn.addEventListener('click', () => {
    if (enhancing || !inputEl.value.trim()) return;
    enhancing = true;
    sentDraft = inputEl.value;
    enhanceBtn.disabled = true;
    vscode.postMessage({ type: 'enhance_prompt', text: sentDraft });
  });
  function applyEnhanced(text) {
    enhancing = false;
    enhanceBtn.disabled = false;
    // Only replace the draft that was sent: the box stayed editable while the request ran.
    if (!UI || !UI.shouldApplyEnhanced(sentDraft, inputEl.value, text)) return;
    inputEl.focus();
    inputEl.select();
    document.execCommand('insertText', false, text);
  }
  function renderAttachments(items) {
    pendingFiles = items;
    attachmentsEl.textContent = '';
    items.forEach((it) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.setAttribute('role', 'listitem');
      chip.title = it.title;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = (it.kind === 'image' ? '🖼 ' : '📎 ') + it.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + it.name);
      remove.addEventListener('click', () => vscode.postMessage({ type: 'remove_attachment', id: it.id }));
      chip.appendChild(name);
      chip.appendChild(remove);
      attachmentsEl.appendChild(chip);
    });
    setSendEnabled();
  }

  modeSelect.addEventListener('change', () => vscode.postMessage({ type: 'set_mode', id: modeSelect.value }));
  newChatBtn.addEventListener('click', () => { closePanel(); vscode.postMessage({ type: 'new_chat' }); });
  historyBtn.addEventListener('click', () => { renderPanelMessage('Sessions', 'Loading…', true); vscode.postMessage({ type: 'listSessions' }); });
  checkpointsBtn.addEventListener('click', () => { closeMore(); renderPanelMessage('Checkpoints', 'Loading…', true); vscode.postMessage({ type: 'listCheckpoints' }); });
  attachBtn.addEventListener('click', () => {
    const pos = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : inputEl.value.length;
    const v = inputEl.value;
    const insert = pos > 0 && !isSpace(v.charAt(pos - 1)) ? ' @' : '@';
    inputEl.value = v.slice(0, pos) + insert + v.slice(pos);
    const caret = pos + insert.length;
    inputEl.focus();
    inputEl.setSelectionRange(caret, caret);
    inputEl.dispatchEvent(new Event('input'));
  });

  /** id -> DOM element for the currently streaming assistant message */
  let streamingEl = null;
  /** id -> DOM element for in-flight tool calls */
  const toolEls = new Map();
  /** id -> { name, args } for in-flight tool calls, needed by appendToolResult for edit_file/write_file diffs */
  const toolArgs = new Map();
  /** id -> { el, copy, resolve } for approvals waiting in the transcript */
  const approvals = new Map();
  let taskRunning = false;

  let displayConfig = { blockDefault: 'collapsed', detail: 'compact', showReasoning: true };
  let reasoningEl = null;

  function hideEmpty() { if (emptyEl) emptyEl.remove(); }
  messagesEl.addEventListener('click', (e) => {
    const ex = e.target && e.target.closest ? e.target.closest('.empty-state .ex') : null;
    if (!ex) return;
    inputEl.value = ex.textContent;
    inputEl.dispatchEvent(new Event('input'));
    inputEl.focus();
  });
  /**
   * Follow new content only while you are at (or near) the bottom: scroll up to read and the chat
   * stays where you are, even as a reply streams in. Sending a message or loading a chat jumps down.
   */
  let stickToBottom = true;
  messagesEl.addEventListener('scroll', () => {
    stickToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  });
  function autoscroll(force) {
    if (force) stickToBottom = true;
    if (stickToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hasDraft() { return !!inputEl.value.trim() || pendingFiles.length > 0; }
  function setSendEnabled() { sendBtn.disabled = !hasDraft() || taskRunning; }
  function setTaskRunning(running) {
    taskRunning = running;
    sendBtn.disabled = !hasDraft() || running;
    cancelBtn.disabled = !running;
    sendBtn.hidden = running;
    cancelBtn.hidden = !running;
    autoToggle.disabled = running;
    modeSelect.disabled = running;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function appendUserMessage(text, files) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = '<div class="label">you</div><div class="body">' + escapeHtml(text) + '</div>';
    if (files && files.length > 0) {
      const line = document.createElement('div');
      line.className = 'files';
      line.textContent = '📎 ' + files.join(', ');
      div.appendChild(line);
    }
    messagesEl.appendChild(div);
    autoscroll(true);
  }

  /** Markdown when ForgeUI loaded, escaped plain text otherwise. renderMarkdown escapes all source text. */
  function renderReply(body, text) {
    if (UI) {
      try { body.innerHTML = UI.renderMarkdown(text); body.classList.add('md'); return; }
      catch (err) { console.warn('[forge] markdown render failed', err); }
    }
    body.classList.remove('md');
    body.textContent = text;
  }

  function makeCursor() { const c = document.createElement('span'); c.className = 'cursor'; return c; }

  let streamText = '';
  let renderPending = false;

  function appendAssistantStart() {
    hideEmpty();
    streamText = '';
    streamingEl = document.createElement('div');
    streamingEl.className = 'msg assistant';
    streamingEl.innerHTML = '<div class="label">forge</div><div class="body"><span class="cursor"></span></div>';
    messagesEl.appendChild(streamingEl);
    autoscroll();
  }

  function appendTextDelta(text) {
    if (!streamingEl) appendAssistantStart();
    streamText += text;
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      if (!streamingEl) return;
      const body = streamingEl.querySelector('.body');
      renderReply(body, streamText);
      const last = body.lastElementChild;
      (last && last.tagName === 'P' ? last : body).appendChild(makeCursor());
      autoscroll();
    });
  }

  function finalizeAssistant(text) {
    let bubble = null;
    if (!text || !text.trim()) {
      // A turn that only called tools has no answer text: no empty "forge" bubble.
      if (streamingEl) streamingEl.remove();
      streamingEl = null;
      streamText = '';
      return;
    }
    if (streamingEl) {
      renderReply(streamingEl.querySelector('.body'), text);
      bubble = streamingEl;
      streamingEl = null;
    } else {
      const div = document.createElement('div');
      div.className = 'msg assistant';
      div.innerHTML = '<div class="label">forge</div><div class="body"></div>';
      renderReply(div.querySelector('.body'), text);
      messagesEl.appendChild(div);
      bubble = div;
    }
    streamText = '';
    collapseLongCode(bubble);
    renderDiagrams(bubble);
    autoscroll();
  }

  /** Long code blocks start collapsed with a "Show all" control. */
  function collapseLongCode(scope) {
    if (!scope) return;
    for (const code of scope.querySelectorAll('.code')) {
      if (code.dataset.collapsible) continue;
      const lines = ((code.querySelector('code') || {}).textContent || '').split('\\n').length;
      code.dataset.collapsible = '1';
      if (lines <= 20) continue;
      code.classList.add('collapsed');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'code-more';
      more.textContent = 'Show all ' + lines + ' lines';
      more.addEventListener('click', () => {
        const collapsed = code.classList.toggle('collapsed');
        more.textContent = collapsed ? 'Show all ' + lines + ' lines' : 'Show fewer lines';
      });
      code.appendChild(more);
    }
  }

  /** The run ended: drop an unused streaming bubble and any cursor left behind (error, Stop). */
  function cleanupStreaming() {
    if (streamingEl && !streamText.trim()) streamingEl.remove();
    streamingEl = null;
    streamText = '';
    for (const c of messagesEl.querySelectorAll('.cursor')) c.remove();
  }

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button.copy') : null;
    if (!btn) return;
    const code = btn.closest('.code') && btn.closest('.code').querySelector('code');
    if (!code) return;
    const show = (label) => { btn.textContent = label; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
    navigator.clipboard.writeText(code.textContent || '').then(() => show('Copied'), () => show('Copy failed'));
  });

  function toolSummary(name, args, outcome) {
    if (UI) {
      try { return UI.summarizeTool(name, args, outcome); }
      catch (err) { console.warn('[forge] summarizeTool failed', err); }
    }
    const a = JSON.stringify(args) || '';
    return { verb: name, target: a.length > 60 ? a.slice(0, 59) + '…' : a, title: a };
  }

  function toolSummaryHtml(state, s) {
    const icon = state === 'run'
      ? '<span class="st spin" role="img" aria-label="running"></span>'
      : state === 'ok'
        ? '<span class="st ok" role="img" aria-label="done">✓</span>'
        : '<span class="st err" role="img" aria-label="failed">✗</span>';
    return '<summary><span class="chev" aria-hidden="true"></span>' + icon +
      '<span class="what" title="' + escapeHtml(s.title || '') + '">' + escapeHtml(s.verb) +
      (s.target ? ' <span class="target">' + escapeHtml(s.target) + '</span>' : '') + '</span>' +
      '<span class="meta' + (s.metaTone === 'err' ? ' err' : '') + '">' + escapeHtml(s.meta || '') + '</span></summary>';
  }

  function appendToolCall(id, name, args) {
    hideEmpty();
    toolArgs.set(id, { name, args });
    const row = document.createElement('details');
    row.className = 'tool-row run';
    row.id = 'tool-' + id;
    row.innerHTML = toolSummaryHtml('run', toolSummary(name, args)) +
      '<div class="tool-body"><pre class="args">' + escapeHtml(JSON.stringify(args, null, 2) || '') + '</pre></div>';
    messagesEl.appendChild(row);
    toolEls.set(id, row);
    autoscroll();
  }

  /**
   * Minimal, non-hunked line diff for display only: a line present in
   * "before" but not "after" (by exact match at the same relative
   * position) renders as removed, vice versa as added. Deliberately
   * simpler than core's computeUnifiedDiff (no LCS, no context lines,
   * no @@ headers): the webview only needs "does this look like the
   * edit I expect", and can't import the core implementation since this
   * inline script has no bundler / Node module graph.
   */
  function simpleDiffLines(before, after) {
    // An empty side has no lines: ''.split() would yield one phantom empty line.
    const beforeLines = before === '' ? [] : before.split('\\n');
    const afterLines = after === '' ? [] : after.split('\\n');
    const out = [];
    let i = 0, j = 0;
    while (i < beforeLines.length || j < afterLines.length) {
      if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
        out.push({ text: beforeLines[i], kind: 'ctx' });
        i++; j++;
      } else if (i < beforeLines.length && (j >= afterLines.length || !afterLines.slice(j).includes(beforeLines[i]))) {
        out.push({ text: beforeLines[i], kind: 'del' });
        i++;
      } else if (j < afterLines.length) {
        out.push({ text: afterLines[j], kind: 'add' });
        j++;
      }
    }
    return out;
  }

  function renderDiffHtml(before, after) {
    const lines = simpleDiffLines(before, after);
    return lines.map((l) => {
      const cls = l.kind === 'add' ? 'diff-add' : l.kind === 'del' ? 'diff-del' : '';
      const prefix = l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  ';
      return '<div class="diff-line ' + cls + '">' + escapeHtml(prefix + l.text) + '</div>';
    }).join('');
  }

  function appendToolResult(id, name, result, isError) {
    const existing = toolEls.get(id);
    // sub_agent streams "[child] <event>" results under one id: update the running row, don't finish it.
    if (UI && !isError && UI.isProgressResult(name, result)) {
      const meta = existing && existing.querySelector('summary .meta');
      if (meta) meta.textContent = String(result).slice(8);
      return;
    }
    const stored = toolArgs.get(id);
    const s = toolSummary(name, stored ? stored.args : {}, { result, isError: !!isError });
    // Core emits no tool_call for a denied call; the approval log's "✗ Denied: …" line already records it.
    if (!existing && s.meta === 'denied') return;
    const row = existing || document.createElement('details');
    if (!existing) {
      row.id = 'tool-' + id;
      messagesEl.appendChild(row);
    }
    const failed = !!isError || s.metaTone === 'err';
    row.className = 'tool-row ' + (failed ? 'err' : 'ok');
    let bodyHtml = '';
    let open = displayConfig.blockDefault === 'expanded';
    if (s.diff) {
      bodyHtml = '<div class="diff">' + renderDiffHtml(s.diff.before, s.diff.after) + '</div>';
      open = true;
    } else if (result !== undefined) {
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const isLong = text.length > 2000;
      const preview = isLong ? text.slice(0, 2000) + '…' : text;
      bodyHtml = '<div class="result" data-full="' + encodeURIComponent(text) + '">' + escapeHtml(preview) + '</div>';
      if (isLong) bodyHtml += '<button class="show-more" data-expanded="false">Show more</button>';
    }
    row.innerHTML = toolSummaryHtml(failed ? 'err' : 'ok', s) + (bodyHtml ? '<div class="tool-body">' + bodyHtml + '</div>' : '');
    row.open = open;
    const btn = row.querySelector('.show-more');
    if (btn) {
      btn.addEventListener('click', () => {
        const resultEl = row.querySelector('.result');
        const full = decodeURIComponent(resultEl.getAttribute('data-full'));
        const isExpanded = btn.getAttribute('data-expanded') === 'true';
        resultEl.textContent = isExpanded ? full.slice(0, 2000) + '…' : full;
        btn.textContent = isExpanded ? 'Show more' : 'Show less';
        btn.setAttribute('data-expanded', String(!isExpanded));
      });
    }
    toolEls.delete(id);
    toolArgs.delete(id);
    autoscroll();
  }

  // Open while the model is thinking so progress is visible, then folded to a single "Thought" row.
  function newReasoning() {
    hideEmpty();
    const el = document.createElement('details');
    el.className = 'reasoning';
    el.open = true;
    const sum = document.createElement('summary');
    sum.textContent = 'Thinking…';
    const body = document.createElement('div');
    body.className = 'rbody';
    el.appendChild(sum);
    el.appendChild(body);
    // Reasoning comes before the answer, so insert ahead of the bubble task_started already created.
    if (streamingEl) messagesEl.insertBefore(el, streamingEl);
    else messagesEl.appendChild(el);
    return el;
  }

  function appendReasoningDelta(text) {
    if (displayConfig.showReasoning === false) return;
    if (!reasoningEl) reasoningEl = newReasoning();
    const body = reasoningEl.querySelector('.rbody');
    body.textContent = (body.textContent + text).trimStart();
    autoscroll();
  }

  function finalizeReasoning(text) {
    if (displayConfig.showReasoning === false) return;
    if (!reasoningEl) reasoningEl = newReasoning();
    reasoningEl.querySelector('.rbody').textContent = text.trim();
    reasoningEl.querySelector('summary').textContent = 'Thought';
    reasoningEl.open = false;
    reasoningEl = null;
    autoscroll();
  }

  /** Parallel-run card: host computes the view (runCardView); everything is escaped here. */
  function renderRunCard(v) {
    hideEmpty();
    let card = document.getElementById('run-' + v.id);
    const isNew = !card;
    if (isNew) { card = document.createElement('div'); card.className = 'run'; card.id = 'run-' + v.id; card.dataset.runId = v.id; }
    const icon = (st) => st === 'done' ? '<span class="ok" role="img" aria-label="done">✓</span>' : st === 'failed' ? '<span class="err" role="img" aria-label="failed">✗</span>' : st === 'running' ? '<span class="st spin" role="img" aria-label="running"></span>' : '<span class="muted" role="img" aria-label="waiting">○</span>';
    let html = '<div class="rh"><span class="task" title="' + escapeHtml(v.task) + '">Parallel run: ' + escapeHtml(v.task) + '</span><span class="sum">' + escapeHtml(v.summary) + '</span></div>' +
      '<div class="bar"><span style="width:' + Math.round(v.progress * 100) + '%"></span></div>';
    v.steps.forEach((s) => {
      html += '<div class="step"><div class="l1">' + icon(s.state) + '<span class="who">' + escapeHtml(s.specialist) + '</span><span class="stask" title="' + escapeHtml(s.task) + '">' + escapeHtml(s.task) + '</span><span class="meta">' + escapeHtml(s.meta) + '</span></div>';
      if (s.actions.length) {
        html += '<div class="l2"><span class="muted">' + escapeHtml(s.branch || '') + '</span>' +
          s.actions.map((a) => '<button type="button" class="' + (a === 'merge' ? 'primary' : 'link') + '" data-action="' + a + '" data-index="' + s.index + '">' + (a === 'review' ? 'Review' : a === 'merge' ? 'Merge' : 'Discard') + '</button>').join('') + '</div>';
      }
      if (s.error) html += '<div class="rerr">' + escapeHtml(s.error) + '</div>';
    });
    if (v.error) html += '<div class="rerr">' + escapeHtml(v.error) + '</div>';
    if (v.canClear) html += '<div class="rf"><button type="button" class="link" data-action="clear" data-index="-1">Clear finished</button></div>';
    // The card is rebuilt on every update: keep keyboard focus on the same button.
    const focused = document.activeElement;
    const keep = focused && card.contains(focused) && focused.dataset ? { action: focused.dataset.action, index: focused.dataset.index } : null;
    card.innerHTML = html;
    if (keep && keep.action) {
      const again = Array.prototype.find.call(card.querySelectorAll('[data-action]'), (b) => b.dataset.action === keep.action && b.dataset.index === keep.index);
      if (again) again.focus();
    }
    if (isNew) messagesEl.appendChild(card);
    autoscroll();
  }

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.run [data-action]') : null;
    if (!btn) return;
    const card = btn.closest('.run');
    const action = btn.dataset.action;
    vscode.postMessage({ type: 'run_action', runId: card.dataset.runId, index: Number(btn.dataset.index), action });
    if (action === 'clear') card.remove();
  });

  function appendApprovalLog(copy, outcome) {
    let text;
    if (UI) {
      try { text = UI.approvalLogText(copy, outcome); } catch (err) { console.warn('[forge] approvalLogText failed', err); }
    }
    if (!text) text = outcome.kind + ': ' + copy.question + ' ' + copy.target;
    const div = document.createElement('div');
    div.className = 'approval-log ' + (outcome.kind === 'approved' || outcome.kind === 'partial' ? 'ok' : outcome.kind === 'denied' ? 'err' : 'muted');
    // The leading ✓ / ✗ sits in the same column as the tool rows' status icons.
    const mark = text.charAt(0) === '✓' || text.charAt(0) === '✗' ? text.charAt(0) : '';
    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = mark;
    const msg = document.createElement('span');
    msg.textContent = mark ? text.slice(1).trim() : text;
    div.appendChild(st);
    div.appendChild(msg);
    messagesEl.appendChild(div);
    autoscroll();
  }

  function wireHold(btn, onDone) {
    let timer = null;
    const start = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      // Only the primary button: a right or middle press must never approve a destructive action.
      if (e.type === 'pointerdown' && e.button !== 0) return;
      if (e.repeat || timer) return;
      e.preventDefault();
      btn.classList.add('holding');
      timer = setTimeout(() => { timer = null; btn.classList.remove('holding'); onDone(); }, 900);
    };
    const label = btn.querySelector('span');
    const idle = label ? label.textContent : '';
    const flash = (text) => { if (!label) return; label.textContent = text; setTimeout(() => { label.textContent = idle; }, 1600); };
    const stop = () => {
      if (timer) { clearTimeout(timer); timer = null; flash('Keep holding…'); }
      btn.classList.remove('holding');
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('keydown', start);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('click', (e) => e.preventDefault());
  }

  function appendApproval(id, name, args, destructive, previewable, allowable, preview) {
    let copy = null;
    if (UI) {
      try { copy = UI.approvalCopy(name, args, !!destructive); } catch (err) { console.warn('[forge] approvalCopy failed', err); }
    }
    if (!copy) copy = { question: name, target: '', title: '', primary: destructive ? 'Hold to run' : 'Approve', destructive: !!destructive };
    const chips = ['Try a different approach', 'Ask me first', name === 'run_command' ? "Don't run commands" : "Don't change this file"];
    const div = document.createElement('div');
    div.className = 'approval' + (destructive ? ' destructive' : '');
    div.id = 'approval-' + id;
    div.setAttribute('role', 'alertdialog');
    div.setAttribute('aria-label', 'Approval needed: ' + copy.question + ' ' + copy.target);
    const kind = destructive ? 'Destructive' : (name === 'write_file' || name === 'edit_file' ? 'File edit' : 'Request');
    div.innerHTML =
      '<div class="kind">' + kind + '</div>' +
      '<div class="line">' +
        '<span class="q" title="' + escapeHtml(copy.title) + '">' + escapeHtml(copy.question) + ' ' +
          (previewable
            ? '<button type="button" class="link file" title="Open diff">' + escapeHtml(copy.target) + '</button>'
            : '<span class="target">' + escapeHtml(copy.target) + '</span>') +
          (copy.meta ? ' <span class="meta">' + escapeHtml(copy.meta) + '</span>' : '') +
          (previewable ? ' <button type="button" class="link hunks">Review changes</button>' : '') +
          (allowable ? ' <button type="button" class="link allow">Always allow this command</button>' : '') +
        '</span>' +
        '<span class="acts">' +
          '<button type="button" class="secondary deny-open" aria-expanded="false">Deny</button>' +
          (destructive
            ? '<button type="button" class="primary hold" title="Press and hold to run"><span>Hold to run</span></button>'
            : '<button type="button" class="primary approve">' + escapeHtml(copy.primary) + '</button>') +
        '</span>' +
      '</div>' +
      (preview ? '<pre class="preview" style="margin:6px 0 0;white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto">' + escapeHtml(preview) + '</pre>' : '') +
      '<div class="fb" hidden>' +
        '<div class="chips">' + chips.map((c) => '<button type="button" class="chip">' + escapeHtml(c) + '</button>').join('') + '</div>' +
        '<textarea class="note" rows="2" maxlength="2000" aria-label="What should Forge do instead?" placeholder="What should Forge do instead?"></textarea>' +
        '<div class="fb-actions"><button type="button" class="deny-note">Deny and tell Forge</button><button type="button" class="link deny">Just deny</button></div>' +
      '</div>';
    const isFirst = approvals.size === 0;
    const settled = new Promise((resolve) => { approvals.set(id, { el: div, copy, resolve }); });
    // Inline at the end of the transcript, right under the tool call it is about; always brought into view.
    hideEmpty();
    messagesEl.appendChild(div);
    div.scrollIntoView({ block: 'nearest' });
    // Focus usually stays in the textarea, so tell screen readers the agent is waiting on the user.
    announcer.textContent = 'Approval needed: ' + copy.question + ' ' + copy.target;

    const fb = div.querySelector('.fb');
    const note = div.querySelector('.note');
    const denyOpen = div.querySelector('.deny-open');
    const primary = div.querySelector('.primary');
    denyOpen.addEventListener('click', () => {
      fb.hidden = !fb.hidden;
      denyOpen.setAttribute('aria-expanded', String(!fb.hidden));
      if (!fb.hidden) { note.focus(); div.scrollIntoView({ block: 'nearest' }); }
    });
    div.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { note.value = c.textContent; note.focus(); }));
    div.querySelector('.deny-note').addEventListener('click', () => resolveApproval(id, false, note.value.trim()));
    div.querySelector('.deny').addEventListener('click', () => resolveApproval(id, false, ''));
    if (destructive) wireHold(primary, () => resolveApproval(id, true, ''));
    else primary.addEventListener('click', () => resolveApproval(id, true, ''));
    const fileBtn = div.querySelector('.file');
    if (fileBtn) fileBtn.addEventListener('click', () => vscode.postMessage({ type: 'open_diff', id }));
    const allowBtn = div.querySelector('.allow');
    if (allowBtn) allowBtn.addEventListener('click', () => { vscode.postMessage({ type: 'allow_command', id }); resolveApproval(id, true, ''); });
    const hunksBtn = div.querySelector('.hunks');
    if (hunksBtn) hunksBtn.addEventListener('click', () => vscode.postMessage({ type: 'review_hunks', id }));

    // Take focus only when nothing else has it: never steal it from the textarea mid-typing.
    const active = document.activeElement;
    if (isFirst && (!active || active === document.body)) (destructive ? denyOpen : primary).focus();

    return settled;
  }

  function settleApproval(id, outcome) {
    const a = approvals.get(id);
    if (!a) return null;
    approvals.delete(id);
    const hadFocus = a.el.contains(document.activeElement);
    a.el.remove();
    if (hadFocus) {
      const next = messagesEl.querySelector('.approval .primary');
      (next || inputEl).focus();
    }
    appendApprovalLog(a.copy, outcome);
    return a;
  }

  function resolveApproval(id, approved, note) {
    const a = settleApproval(id, { kind: approved ? 'approved' : 'denied', note: note || undefined });
    if (a) a.resolve({ approved, note: note || '' });
  }

  /** The host resolved this approval itself (per-hunk review): update the UI, send nothing back. */
  function hostResolvedApproval(id, approved, partial) {
    const a = settleApproval(id, { kind: approved ? (partial ? 'partial' : 'approved') : 'denied' });
    if (a) a.resolve('__host__');
  }

  /** The run ended with approvals still waiting: the host already dropped them. */
  function cancelPendingApprovals() {
    Array.from(approvals.keys()).forEach((id) => {
      const a = settleApproval(id, { kind: 'cancelled' });
      if (a) a.resolve('__host__');
    });
  }

  function appendStatus(iteration, maxIter, inputTokens, outputTokens, durationMs, reason) {
    let bar = document.getElementById('status-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'status-bar';
      bar.className = 'status-bar';
      messagesEl.appendChild(bar);
    }
    const seconds = (durationMs / 1000).toFixed(1);
    const fmt = (n) => Number(n).toLocaleString();
    // The step counter only matters when the run is close to its limit.
    const nearLimit = maxIter > 0 && iteration >= Math.ceil(maxIter * 0.8);
    bar.innerHTML =
      '<span title="Time and tokens used by this step">' + seconds + 's · ' + fmt(inputTokens) + ' in · ' + fmt(outputTokens) + ' out' + (nearLimit ? ' · step ' + iteration + '/' + maxIter : '') + '</span>' +
      (reason ? '<span>' + escapeHtml(reason) + '</span>' : '');
    autoscroll();
  }

  function appendError(text, action) {
    const div = document.createElement('div');
    div.className = 'error-banner';
    div.setAttribute('role', 'alert');
    div.appendChild(document.createTextNode(text));
    if (action === 'openSettings') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link';
      btn.textContent = 'Open Settings';
      btn.addEventListener('click', () => vscode.postMessage({ type: 'open_settings' }));
      div.appendChild(btn);
    }
    messagesEl.appendChild(div);
    autoscroll();
  }

  // window.VoiceInput comes from the bundled voice-input.js; when it is missing the mic stays disabled.
  const VoiceInput = window.VoiceInput;
  let voice = null;
  /** Current interim transcript: replaces the textarea content while recording. */
  let voiceInterim = '';
  /** Stable text accumulated from final results in this utterance. */
  let voiceFinal = '';
  /** Snapshot of the textarea content taken when recording started. */
  let inputBeforeRecording = '';
  /** Whether the most recent transcript should auto-submit. */
  let voiceAutoSubmit = false;

  function setVoiceStatus(text, isError) {
    voiceStatusEl.textContent = text || '';
    voiceStatusEl.className = isError ? 'error' : '';
  }

  function syncMicButton() {
    if (!voice) {
      micBtn.disabled = true;
      micBtn.hidden = true;
      micBtn.classList.remove('recording');
      return;
    }
    const s = voice.getState();
    const listening = s === 'starting' || s === 'listening';
    micBtn.classList.toggle('recording', listening);
    micBtn.disabled = !voice.isSupported();
    // Hide a control that cannot work here rather than show a dead icon with only a tooltip.
    micBtn.hidden = !voice.isSupported();
    micBtn.title = voice.isSupported()
      ? (listening ? 'Stop voice input' : 'Voice input (Ctrl+Shift+Space)')
      : 'Voice input not supported in this environment';
  }

  function buildVoiceController() {
    if (!VoiceInput || !VoiceInput.VoiceController) {
      micBtn.disabled = true;
      micBtn.title = 'Voice input not available';
      return null;
    }
    return new VoiceInput.VoiceController({
      // Defaults; the host replaces them with a 'voice_config' message after 'ready'.
      config: {
        enabled: true,
        language: (navigator.language || 'en-US'),
        autoSubmit: false,
        continuous: false,
        interimResults: true,
      },
      events: {
        started: () => {
          inputBeforeRecording = inputEl.value;
          voiceFinal = '';
          voiceInterim = '';
          syncMicButton();
          setVoiceStatus('Listening…');
        },
        transcript: (final, interim) => {
          voiceFinal = final || '';
          voiceInterim = interim || '';
          // Interim text shows muted and italic until it is final.
          const base = inputBeforeRecording.trimEnd();
          const sep = voiceFinal && base ? ' ' : '';
          const committed = base ? (base + sep + voiceFinal).trimStart() : voiceFinal;
          inputEl.value = committed + (voiceInterim ? ' ' + voiceInterim : '');
          inputEl.classList.toggle('interim', !!voiceInterim);
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
          setSendEnabled();
        },
        stopped: (reason) => {
          inputEl.classList.remove('interim');
          syncMicButton();
          if (reason === 'error') {
            // The errored event already set the message; keep it visible briefly.
            return;
          }
          setVoiceStatus(voiceFinal ? 'Transcript: "' + voiceFinal + '"' : '');
          if (voiceAutoSubmit && voiceFinal.trim() && !sendBtn.disabled) {
            sendBtn.click();
          }
          voiceAutoSubmit = false;
        },
        errored: (msg) => {
          syncMicButton();
          setVoiceStatus(msg.message, true);
        },
      },
      post: (m) => vscode.postMessage(m),
    });
  }

  function toggleVoice() {
    if (!voice) return;
    const s = voice.getState();
    if (s === 'listening' || s === 'starting') {
      voice.stop();
    } else {
      voice.start();
    }
  }

  voice = buildVoiceController();
  syncMicButton();
  micBtn.addEventListener('click', () => toggleVoice());

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
    setSendEnabled();
    scheduleMentionQuery();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (mentionList.classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionSelection(-1); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideMentions(); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = mentionList.querySelector('.mi.sel');
        if (sel && sel.dataset.value) { e.preventDefault(); insertMention(sel.dataset.value); return; }
      }
    }
    if (e.key === 'Escape' && editingLast) {
      e.preventDefault();
      document.getElementById('edit-cancel').click();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (taskRunning) { enqueue(); return; }
      if (!sendBtn.disabled) sendBtn.click();
    }
  });
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!hasDraft() || taskRunning) return;
    removeSuggestCard();
    removeTurnActions();
    hideMentions();
    const fileNames = pendingFiles.map((f) => f.name);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setSendEnabled();
    lastUserText = text;
    if (editingLast) {
      // The host redraws the conversation without the old turn, then shows this message.
      setEditing(false);
      vscode.postMessage({ type: 'retry_last', text, auto: autoToggle.checked });
      return;
    }
    appendUserMessage(text, fileNames);
    vscode.postMessage({ type: 'user_input', text, auto: autoToggle.checked });
  });

  // ---- queue: Enter during a run parks the message; each finished run sends the next one.
  function renderQueue() {
    queueEl.textContent = '';
    queued.forEach((text, i) => {
      const row = document.createElement('div');
      row.className = 'queued';
      row.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.textContent = 'Queued';
      const body = document.createElement('span');
      body.className = 'q-text';
      body.textContent = text;
      body.title = text;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove from queue');
      remove.addEventListener('click', () => { queued.splice(i, 1); renderQueue(); });
      row.appendChild(label); row.appendChild(body); row.appendChild(remove);
      queueEl.appendChild(row);
    });
  }
  function enqueue() {
    const text = inputEl.value.trim();
    if (!text) return;
    queued.push(text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    hideMentions();
    renderQueue();
  }
  function sendNextQueued() {
    if (taskRunning || queued.length === 0) return;
    const text = queued.shift();
    renderQueue();
    removeTurnActions();
    lastUserText = text;
    appendUserMessage(text, pendingFiles.map((f) => f.name));
    vscode.postMessage({ type: 'user_input', text, auto: autoToggle.checked });
  }

  // ---- Retry / Edit for the last message, shown after each run.
  function removeTurnActions() {
    const old = messagesEl.querySelector('.turn-actions');
    if (old) old.remove();
  }
  function showTurnActions() {
    removeTurnActions();
    if (lastUserText === null) return;
    const row = document.createElement('div');
    row.className = 'turn-actions';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'link'; retry.textContent = 'Retry';
    retry.title = 'Run your last message again';
    retry.addEventListener('click', () => {
      if (taskRunning) return;
      removeTurnActions();
      vscode.postMessage({ type: 'retry_last', auto: autoToggle.checked });
    });
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'link'; edit.textContent = 'Edit';
    edit.title = 'Edit your last message and send it again';
    edit.addEventListener('click', () => {
      inputEl.value = lastUserText;
      inputEl.dispatchEvent(new Event('input'));
      setEditing(true);
      inputEl.focus();
    });
    row.appendChild(retry); row.appendChild(edit);
    messagesEl.appendChild(row);
  }
  function setEditing(on) {
    editingLast = on;
    editBanner.hidden = !on;
  }
  document.getElementById('edit-cancel').addEventListener('click', () => {
    setEditing(false);
    inputEl.value = '';
    inputEl.dispatchEvent(new Event('input'));
  });

  // ---- Mermaid: \`\`\`mermaid blocks in replies become diagrams; the 3.5 MB library loads on first use.
  let mermaidLoad = null;
  let mermaidSeq = 0;
  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!MERMAID_URI) return Promise.reject(new Error('mermaid unavailable'));
    if (!mermaidLoad) {
      mermaidLoad = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = MERMAID_URI;
        script.onload = () => {
          const light = document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light');
          window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: light ? 'default' : 'dark' });
          resolve(window.mermaid);
        };
        script.onerror = () => { mermaidLoad = null; reject(new Error('mermaid failed to load')); };
        document.head.appendChild(script);
      });
    }
    return mermaidLoad;
  }
  function renderDiagrams(scope) {
    if (!scope) return;
    scope.querySelectorAll('.code').forEach((code) => {
      const lang = code.querySelector('.lang');
      if (!lang || lang.textContent.trim().toLowerCase() !== 'mermaid' || code.dataset.diagram) return;
      code.dataset.diagram = '1';
      const source = (code.querySelector('code') || {}).textContent || '';
      const diagramId = 'forge-mermaid-' + (++mermaidSeq);
      loadMermaid()
        // Check first: a render that fails leaves Mermaid's "Syntax error" graphic stuck in the page.
        .then((m) => m.parse(source, { suppressErrors: true }).then((ok) => { if (!ok) throw new Error('not valid mermaid'); return m.render(diagramId, source); }))
        .then((out) => {
          if (!code.isConnected) return;
          const view = document.createElement('div');
          view.className = 'diagram';
          view.setAttribute('role', 'img');
          view.setAttribute('aria-label', 'Diagram');
          view.innerHTML = out.svg; // securityLevel 'strict': mermaid sanitizes labels and drops scripts
          // Keep the source one click away.
          const details = document.createElement('details');
          details.className = 'diagram-src';
          const summary = document.createElement('summary');
          summary.textContent = 'Diagram source';
          code.parentNode.insertBefore(view, code);
          code.parentNode.insertBefore(details, code);
          details.appendChild(summary);
          details.appendChild(code);
        })
        .catch(() => {
          // Not valid mermaid, or the library is missing: the code block stays. Mermaid may have left its
          // scratch element (and an error graphic) in the body.
          [diagramId, 'd' + diagramId].forEach((id) => { const stray = document.getElementById(id); if (stray) stray.remove(); });
        });
    });
  }
  cancelBtn.addEventListener('click', () => {
    // Stop means stop: queued messages must not start the moment the run ends. They go back into the
    // input (ahead of whatever is being typed) so nothing is lost and you decide what to send.
    if (queued.length > 0) {
      const parked = queued.splice(0).join('\\n');
      renderQueue();
      inputEl.value = inputEl.value.trim() ? parked + '\\n' + inputEl.value : parked;
      inputEl.dispatchEvent(new Event('input'));
    }
    vscode.postMessage({ type: 'cancel' });
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
      case 'model_menu':
        modelGroups = msg.groups;
        modelCurrent = msg.current;
        if (!modelMenu.hidden) renderModelMenu();
        break;
      case 'model':
        modelCurrent = { provider: msg.provider, model: msg.model };
        // The provider prefix is noise in a 300px sidebar; the full id is the tooltip.
        modelLabel.textContent = msg.model;
        modelLabel.title = msg.provider + '/' + msg.model;
        break;
      case 'voice_config':
        // Latest voice settings from the host, merged into the controller.
        if (voice && msg.config) {
          voice.updateConfig(msg.config);
          syncMicButton();
        }
        break;
      case 'voice_start':
        // The forge.startVoiceInput command toggles, so one shortcut starts and stops.
        toggleVoice();
        break;
      case 'task_started':
        removeRunFooter();
        setTaskRunning(true);
        appendAssistantStart();
        break;
      case 'text_delta':
        appendTextDelta(msg.text);
        break;
      case 'text_done':
        finalizeAssistant(msg.text);
        break;
      case 'reasoning_delta':
        appendReasoningDelta(msg.text);
        break;
      case 'reasoning_done':
        finalizeReasoning(msg.text);
        break;
      case 'display_config':
        displayConfig = { blockDefault: 'collapsed', detail: 'compact', showReasoning: true, ...msg.config };
        break;
      case 'tool_call':
        appendToolCall(msg.id, msg.name, msg.args);
        break;
      case 'tool_result':
        appendToolResult(msg.id, msg.name, msg.result, msg.isError);
        break;
      case 'approval_request':
        appendApproval(msg.id, msg.name, msg.args, msg.destructive, msg.previewable, msg.allowable, msg.preview).then((d) => {
          if (d === '__host__') return;
          vscode.postMessage(d.note
            ? { type: 'approval_response', id: msg.id, approved: d.approved, note: d.note }
            : { type: 'approval_response', id: msg.id, approved: d.approved });
        });
        break;
      case 'status':
        appendStatus(msg.iteration, msg.maxIter, msg.inputTokens, msg.outputTokens, msg.durationMs, msg.reason);
        if (msg.contextWindow) { meterCtx = { tokens: msg.contextTokens || 0, window: msg.contextWindow }; renderMeter(); }
        break;
      case 'cost':
        if (msg.known) { meterCost = msg.chatCostUsd; renderMeter(); }
        break;
      case 'meter_reset':
        meterCost = typeof msg.costUsd === 'number' ? msg.costUsd : null;
        meterCtx = null;
        renderMeter();
        break;
      case 'compaction':
        appendStatusLine('Condensed ' + msg.droppedCount + ' older message(s), saved about ' + msg.savedTokens + ' tokens.');
        break;
      case 'context_masked':
        appendStatusLine('Saved about ' + Number(msg.savedTokens).toLocaleString() + ' tokens by not resending ' + msg.maskedCount + ' old tool result(s).');
        break;
      case 'verify':
        appendStatusLine(
          (msg.passed ? 'Checks passed.' : 'Checks failed (pass ' + msg.attempt + '): ' + (msg.failedCommands || []).join(', ')) +
          (msg.slowCommands && msg.slowCommands.length ? ' Skipped, too slow: ' + msg.slowCommands.join(', ') : '')
        );
        break;
      case 'approval_resolved':
        hostResolvedApproval(msg.id, msg.approved, !!msg.partial);
        break;
      case 'mentions_attached': {
        const parts = (msg.attached || []).map((a) => a.label + (a.truncated ? ' (truncated)' : ''));
        const bad = msg.unresolved || [];
        if (parts.length) appendStatusLine('Attached: ' + parts.join(', '));
        if (bad.length) appendWarning('Could not attach: ' + bad.join(', '));
        break;
      }
      case 'mention_suggestions':
        renderMentionSuggestions(msg.items || []);
        break;
      case 'attachments':
        renderAttachments(msg.items || []);
        break;
      case 'insert_text': {
        const sep = inputEl.value && !isSpace(inputEl.value.charAt(inputEl.value.length - 1)) ? ' ' : '';
        inputEl.value += sep + msg.text + ' ';
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
        break;
      }
      case 'task_finished':
        setTaskRunning(false);
        cancelPendingApprovals();
        cleanupStreaming();
        if (queued.length > 0) setTimeout(sendNextQueued, 0);
        else showTurnActions();
        break;
      case 'error':
        if (panelEl.dataset.loading) renderPanelMessage(panelEl.dataset.loading, 'Could not load: ' + msg.message);
        else appendError(msg.message, msg.action);
        break;
      case 'user_message':
        appendUserMessage(msg.text);
        // A retried message can be retried again; a spec task's label cannot.
        lastUserText = msg.retry ? msg.text : null;
        break;
      case 'steering_applied': {
        const skipped = (msg.skipped || []).map((s) => s.name + ' (' + s.reason + ')').join(', ');
        const where = msg.path ? ' (' + msg.path + ')' : '';
        appendStatusLine('Steering' + where + ': ' + (msg.applied.length ? msg.applied.join(', ') : 'none applied') + (skipped ? ' · skipped: ' + skipped : ''));
        break;
      }
      case 'modes': {
        modeSelect.textContent = '';
        for (const m of msg.modes) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.label;
          opt.title = m.description;
          modeSelect.appendChild(opt);
        }
        modeSelect.value = msg.current;
        modeSelect.disabled = taskRunning;
        break;
      }
      case 'session':
        currentSessionId = msg.id;
        break;
      case 'transcript':
        closePanel();
        // New chat / resume: the host already denied the old run's approvals, so drop their rows first.
        cancelPendingApprovals();
        // Messages queued behind the old chat's run belong to that chat: they must not start in this one.
        queued.length = 0;
        renderQueue();
        renderTranscript(msg.items);
        lastUserText = null;
        setEditing(false);
        break;
      case 'work_data':
        // Files change while the panel is closed or showing something else: only refresh the one on screen.
        if (panelEl.classList.contains('open') && panelEl.dataset.work === msg.panel) {
          if (msg.panel === 'specs') renderSpecs(msg.view, msg.error); else renderSteering(msg.view, msg.error);
        }
        break;
      case 'sessionsListed':
        if (!panelShows('Sessions')) break;
        renderPanelRows('Sessions', msg.sessions.map((s) => ({
          text: s.label || s.preview || s.id,
          meta: relTime(s.updatedAt) + (fmtCost(s) ? ' · ' + fmtCost(s) : ''),
          metaTitle: new Date(s.updatedAt).toLocaleString(),
          current: s.id === currentSessionId,
          actions: s.id === currentSessionId ? [] : [
            { label: 'Resume', onClick: () => vscode.postMessage({ type: 'resumeSession', id: s.id }) },
          ],
          menu: [
            { label: 'Copy resume command', onClick: () => vscode.postMessage({ type: 'copy_resume', id: s.id }) },
            { label: 'Delete…', danger: true, onClick: () => vscode.postMessage({ type: 'deleteSession', id: s.id }) },
          ],
        })), msg.query ? 'No session mentions that.' : 'No sessions yet. Send a message to start one.', {
          remoteSearch: {
            query: msg.query || '',
            onQuery: (q) => vscode.postMessage(q ? { type: 'searchSessions', q: q } : { type: 'listSessions' }),
          },
        });
        break;
      case 'sessionDeleted':
        vscode.postMessage({ type: 'listSessions' });
        break;
      case 'checkpointsListed':
        if (!panelShows('Checkpoints')) break;
        renderPanelRows('Checkpoints', msg.checkpoints.map((c) => ({
          text: c.description,
          meta: new Date(c.createdAt).toLocaleTimeString() + ' · ' + c.fileCount + ' file(s)',
          actions: [
            { label: 'Restore', onClick: () => vscode.postMessage({ type: 'restoreCheckpoint', id: c.id }) },
          ],
        })), 'No checkpoints yet. Forge saves one before it edits files.');
        break;
      case 'checkpointRestored': {
        const r = msg.result;
        closePanel();
        appendStatusLine('Restored ' + r.checkpointId + ': ' + r.modified.length + ' modified, ' + r.restored.length + ' re-created, ' + r.removed.length + ' removed.');
        break;
      }
      case 'cancelled':
        // A dismissed Delete-session / Restore-checkpoint confirm; the run (and its approvals) carry on.
        break;
      case 'run_update':
        renderRunCard(msg.run);
        break;
      case 'warning':
        appendWarning(msg.message);
        break;
      case 'enhanced':
        applyEnhanced(msg.text);
        break;
      case 'notice':
        appendNotice(msg.message);
        break;
      case 'suggest_spec':
        showSuggestSpec();
        break;
      case 'run_changes':
        showRunChanges(msg.count);
        break;
      case 'run_reverted':
        showRunReverted(msg.count);
        break;
    }
  });

  // Ctrl+Shift+Space (Cmd+Shift+Space on Mac) toggles voice input from anywhere in the page.
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toggleVoice();
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
${i18nBlock}
</body>
</html>`;
}

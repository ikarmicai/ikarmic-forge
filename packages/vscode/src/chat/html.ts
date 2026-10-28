import { MANDALA_MASK } from './brand.js';
import { DESIGN_CSS } from '../design/index.js';
import { i18nScript } from './webview-i18n.js';

/** Layout and chat-specific look for this page, in tokens. A colour or a size under 12px here fails the design-system test. */
export const CHAT_CSS = `  :root {
    /* The Forge mandala as an alpha mask (docs/brand), painted with --ion by the empty state. */
    --mandala: url("${MANDALA_MASK}");
    --tool: var(--bg-sunken);
  }
  html, body { margin: 0; padding: 0; height: 100%; font-family: var(--font-sans); font-size: var(--size-body); color: var(--ink-body); background: var(--bg-canvas); }
  body { display: flex; flex-direction: column; }
  #toolbar { display: flex; align-items: center; gap: 4px; padding: 5px 8px 5px 10px; border-bottom: 1px solid var(--line-subtle); position: relative; flex-wrap: wrap; row-gap: 4px; min-width: 0; }
  /* The meter and the three icon buttons wrap together, never one orphan icon on a second row. */
  #toolbar .tb-end { display: flex; align-items: center; gap: 4px; margin-left: auto; flex: none; }
  .cchips select { background: transparent; color: var(--ink-body); border: 1px solid var(--line-control); border-radius: var(--radius-xs); font-size: var(--size-caption); padding: 2px 4px; flex: none; min-height: 24px; cursor: pointer; field-sizing: content; }
  .cchips select:hover { background: var(--bg-overlay); }
  /* The select itself is transparent, so its popup needs an explicit themed background or it renders white with pale text. */
  .cchips select option { background: var(--bg-raised); color: var(--ink-body); }
  .cchips .model { background: none; border: 1px solid var(--line-control); border-radius: var(--radius-xs); padding: 2px 6px; min-height: 24px; color: var(--ink-body); font-size: var(--size-caption); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; cursor: pointer; text-align: left; }
  .cchips .model::after { content: ''; display: inline-block; width: 5px; height: 5px; margin: 0 1px 2px 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
  .cchips .model:hover, .cchips .model[aria-expanded="true"] { background: var(--bg-overlay); color: var(--ink-body); }
  #model-menu { position: absolute; left: 8px; right: 8px; bottom: calc(100% + 2px); z-index: 7; display: flex; flex-direction: column; max-height: min(70vh, 420px); background: var(--bg-raised); color: var(--ink-body); border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); box-shadow: var(--elev-3); }
  #model-menu[hidden] { display: none; }
  #model-search { margin: 6px; width: auto; flex: none; background: var(--bg-raised); color: var(--ink-strong); border: 1px solid var(--line-control); border-radius: var(--radius-xs); padding: 4px 8px; font: inherit; }
  #model-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 4px 4px; }
  #model-list .mg { padding: 8px 8px 2px; font-size: var(--size-caption); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted); }
  #model-list .mn { padding: 2px 8px 4px; font-size: var(--size-caption); color: var(--ink-muted); line-height: 1.4; }
  #model-list button.mo { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 4px 8px; border-radius: var(--radius-xs); font-size: var(--size-body); min-height: 24px; }
  #model-list button.mo:hover, #model-list button.mo:focus-visible { background: var(--ion-tint); color: var(--ion-text); }
  #model-list button.mo .id { margin-left: auto; padding-left: 8px; color: var(--ink-muted); font-family: var(--font-mono); font-size: var(--size-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  #model-list button.mo .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #model-list button.mo .ck { width: 12px; flex: none; color: var(--success); }
  #model-list .mrow { display: flex; align-items: center; }
  #model-list .mrow button.mo { flex: 1; min-width: 0; }
  #model-list button.mo .hint { flex: none; padding-left: 8px; color: var(--ink-muted); font-size: var(--size-caption); white-space: nowrap; }
  #model-list button.star { flex: none; background: none; border: 0; color: var(--ink-muted); min-width: 24px; min-height: 24px; padding: 0 4px; border-radius: var(--radius-xs); font-size: var(--size-body); cursor: pointer; }
  #model-list button.star[aria-pressed="true"] { color: inherit; }
  #model-list button.star:hover, #model-list button.star:focus-visible { background: var(--ion-tint); color: var(--ion-text); }
  #model-list .empty { padding: 10px 8px; color: var(--ink-muted); }
  #model-menu .foot { flex: none; display: flex; justify-content: space-between; padding: 2px 4px 4px; border-top: 1px solid var(--line-subtle); }
  #model-menu .foot button { background: none; border: 0; color: var(--ion-text); padding: 3px 6px; min-height: 24px; cursor: pointer; font-size: var(--size-caption); }
  #model-menu .foot button:hover { text-decoration: underline; }
  .spacer { flex: 1; }
  button.icon { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--radius-xs); background: transparent; color: var(--ink-body); flex: none; }
  button.icon[hidden] { display: none; }
  button.icon:hover { background: var(--bg-overlay); }
  button.icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .meter { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--size-caption); color: var(--ink-muted); white-space: nowrap; padding: 0 4px; font-variant-numeric: tabular-nums; }
  .meter.empty { display: none; }
  .meter.no-ctx .meter-btn { display: none; }
  .meter-btn { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 8px; min-height: 28px; padding: 0 4px 0 0; background: none; color: inherit; border: 0; border-radius: 14px; cursor: pointer; font: inherit; }
  .meter-btn:hover #meter-text { text-decoration: underline; }
  /* The wave is decoration; the numbers beside it carry the meaning. Fill height is context used, the dashed guide is the 80% warning level. */
  .m-cap { --wave: var(--ion); position: relative; flex: 1 1 auto; min-width: 48px; height: 28px; border-radius: 14px; overflow: hidden; border: 1px solid var(--line-control); background: var(--bg-sunken); }
  .m-cap svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
  .wv { animation: wv 5s linear infinite; }
  .wv.b { animation-duration: 7s; animation-direction: reverse; }
  .meter.stream .wv { animation-duration: 1.6s; }
  .meter.stream .wv.b { animation-duration: 2.4s; }
  .wv.a path { fill: color-mix(in srgb, var(--wave) 90%, transparent); }
  .wv.b path { fill: color-mix(in srgb, var(--wave) 45%, transparent); }
  @keyframes wv { from { transform: translateX(0); } to { transform: translateX(-44px); } }
  .meter.warn .m-cap { --wave: var(--warning); }
  .meter.crit .m-cap { --wave: var(--danger); }
  .m-guide { position: absolute; left: 0; right: 0; top: 5.6px; border-top: 1px dashed color-mix(in srgb, var(--ink-body) 35%, transparent); pointer-events: none; }
  .m-chev { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.5; transition: transform .15s; }
  .meter-btn[aria-expanded="true"] .m-chev { transform: rotate(180deg); }
  .meter.warn, .meter.crit { color: var(--ink-body); }
  #meter-pop { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 9; display: flex; flex-direction: column; gap: 12px; padding: 12px; white-space: normal; color: var(--ink-body); background: var(--bg-raised); border: 1px solid var(--line-control); border-radius: var(--radius-sm); box-shadow: var(--elev-3); }
  #meter-pop[hidden] { display: none; }
  .mp-head { display: flex; align-items: flex-start; gap: 8px; }
  .mp-head .icon { margin-left: auto; }
  .mp-title { font-weight: 600; }
  .mp-sub { color: var(--ink-muted); font-size: var(--size-caption); }
  .mp-big { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .mp-big b { font-family: var(--font-mono); font-size: var(--size-page); font-weight: 500; }
  .mp-big span { color: var(--ink-muted); font-size: var(--size-caption); }
  .mp-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0; padding-top: 10px; border-top: 1px solid var(--line-subtle); }
  .mp-stats div { display: flex; flex-direction: column; min-width: 0; }
  .mp-stats dt { color: var(--ink-muted); font-size: var(--size-caption); }
  .mp-stats dd { margin: 0; font-family: var(--font-mono); font-size: var(--size-body); }
  .mp-foot { display: flex; align-items: center; gap: 12px; padding-top: 10px; border-top: 1px solid var(--line-subtle); }
  .mp-foot p { margin: 0; flex: 1; color: var(--ink-muted); font-size: var(--size-caption); }
  #more-menu { position: absolute; right: 8px; top: calc(100% + 2px); z-index: 6; min-width: 220px; padding: 4px; background: var(--bg-raised); color: var(--ink-body); border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); box-shadow: var(--elev-3); }
  #more-menu[hidden] { display: none; }
  #more-menu button { display: block; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 5px 8px; border-radius: var(--radius-xs); font-size: var(--size-body); }
  #more-menu button:hover, #more-menu button:focus-visible { background: var(--ion-tint); color: var(--ion-text); }
  #more-menu .stat { border-top: 1px solid var(--line-subtle); margin-top: 4px; padding: 6px 8px 2px; font-size: var(--size-caption); color: var(--ink-muted); font-variant-numeric: tabular-nums; }
  #more-menu .stat:empty { display: none; }
  #panel { display: none; position: absolute; inset: 36px 0 0 0; background: var(--bg-canvas); z-index: 5; overflow-y: auto; padding: 8px 12px; border-top: 1px solid var(--line-subtle); }
  #panel.open { display: block; animation: rise .14s ease-out; }
  @media (prefers-reduced-motion: reduce) { #panel.open { animation: none; } }
  #panel .row { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line-subtle); }
  #panel .row .text { flex: 1 1 100%; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  #panel .row .meta { color: var(--ink-muted); font-size: var(--size-caption); flex: 1 1 auto; display: flex; gap: 6px; align-items: center; }
  #panel .row { position: relative; }
  #panel .row .pill { padding: 0 6px; border-radius: 8px; font-size: var(--size-caption); line-height: 16px; background: none; border: 1px solid var(--line-subtle); color: var(--ink-muted); }
  #panel .row.current .text { font-weight: 600; }
  #panel .rowmenu { position: absolute; right: 0; top: 100%; z-index: 8; min-width: 150px; padding: 4px; background: var(--bg-raised); color: var(--ink-body); border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); box-shadow: var(--elev-3); }
  #panel .rowmenu button { display: block; width: 100%; text-align: left; background: none; color: inherit; border: 0; padding: 5px 8px; border-radius: var(--radius-xs); font-size: var(--size-body); }
  #panel .rowmenu button:hover, #panel .rowmenu button:focus-visible { background: var(--ion-tint); }
  #panel .rowmenu button.danger { color: var(--danger); }
  #panel .wk-note { color: var(--ink-muted); line-height: 1.5; margin: 4px 0 10px; overflow-wrap: anywhere; }
  #panel .wk-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 8px 0; }
  #panel .wk-empty p { margin: 0; color: var(--ink-muted); line-height: 1.5; }
  #panel .wk-label { font-size: var(--size-caption); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); margin: 12px 0 4px; }
  #panel .wk-card { border-bottom: 1px solid var(--line-subtle); padding: 6px 0 8px; }
  #panel .wk-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  #panel .wk-head .tt { font-weight: 600; flex: 1 1 140px; min-width: 0; overflow-wrap: anywhere; }
  #panel .wk-head .meta { color: var(--ink-muted); font-size: var(--size-caption); font-variant-numeric: tabular-nums; }
  #panel .wk-bar { height: 3px; border-radius: 2px; background: var(--line-subtle); margin: 6px 0 4px; overflow: hidden; }
  #panel .wk-bar span { display: block; height: 100%; background: var(--success); }
  #panel .wk-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 4px; }
  #panel .trow { position: relative; display: flex; align-items: flex-start; gap: 6px; padding: 3px 0; min-height: 26px; }
  #panel .trow .st { width: 14px; flex: none; text-align: center; line-height: 1.5; color: var(--ink-muted); }
  #panel .trow .st.done { color: var(--success); }
  #panel .trow .st.failed { color: var(--danger); }
  #panel .trow .st.running { color: var(--ion); }
  #panel .trow .tt { flex: 1 1 120px; min-width: 0; text-align: left; background: none; border: 0; color: inherit; padding: 0; cursor: pointer; overflow-wrap: anywhere; line-height: 1.5; font-size: var(--size-body); }
  #panel .trow .tt:hover { text-decoration: underline; }
  #panel .trow .req { color: var(--ink-muted); font-size: var(--size-caption); line-height: 1.7; flex: 0 1 auto; max-width: 45%; overflow-wrap: anywhere; }
  #panel .trow > button { flex: none; }
  #panel .trow > button.tt { flex: 1 1 120px; }
  #panel .trow .desc { display: block; color: var(--ink-muted); font-size: var(--size-caption); overflow-wrap: anywhere; }
  #panel .trow input[type="checkbox"] { margin: 4px 0 0; flex: none; }
  #panel .search { width: 100%; margin: 0 0 6px; background: var(--bg-raised); color: var(--ink-strong); border: 1px solid var(--line-control); border-radius: var(--radius-xs); padding: 4px 8px; font: inherit; }
  #panel .title { font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; }
  .run-footer { font-size: var(--size-caption); color: var(--ink-muted); padding: 0 0 8px; margin-top: -2px; display: flex; flex-wrap: wrap; align-items: center; gap: 0 4px; }
  .turn-actions .ik-btn--link, .run-footer .ik-btn--link { padding: 0 6px; margin-left: -6px; min-height: 24px; font-size: inherit; }
  .cmd-card { border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; background: var(--bg-sunken); }
  .cmd-card pre { margin: 0; padding: 6px 8px; overflow-x: auto; background: var(--bg-canvas); border-radius: var(--radius-xs); font-family: var(--font-mono); font-size: var(--size-caption); line-height: 1.5; white-space: pre; }
  .cmd-card pre code { background: none; padding: 0; font: inherit; }
  .cmd-card .cmd-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
  .cmd-card .cmd-risk { color: var(--danger); font-size: var(--size-caption); font-weight: 600; display: inline-flex; gap: 4px; }
  .cmd-card .cmd-msg { color: var(--ink-muted); font-size: var(--size-caption); }
  .warning.notice { border-left-color: var(--success); }
  .warning { color: var(--ink-body); font-size: var(--size-caption); line-height: 1.5; overflow-wrap: anywhere; padding: 6px 10px; border-left: 2px solid var(--warning); border-radius: 0 4px 4px 0; background: var(--bg-sunken); }
  body { position: relative; }
  #messages {
    flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 14px;
    /* Lets the empty state compact itself to the room it really has (below the toolbar, above the composer). */
    container: msgs / size;
  }
  /* Steps read as one group, like the mock's .steps: only 2px between consecutive step rows. */
  /* Consecutive tool rows and approval outcomes live in one group, so their spacing never depends on the message gap. */
  .steps { display: flex; flex-direction: column; gap: 2px; }
  .steps-head { font-size: var(--size-caption); color: var(--ink-muted); padding: 0 4px 2px; font-variant-numeric: tabular-nums; }
  .steps-head.auto { color: var(--danger); }
  .tool-body .why { margin: 0 0 4px; font-size: var(--size-caption); color: var(--ink-muted); }
  #input-area { position: relative; border-top: 1px solid var(--line-subtle); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .composer { border: 1px solid var(--line-control); border-radius: var(--radius-sm); background: var(--bg-raised); box-shadow: var(--elev-1); }
  .composer:focus-within { border-color: var(--focus-ring); outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  #input { display: block; width: 100%; resize: none; min-height: 32px; max-height: 200px; border: 0; outline: none; background: transparent; color: var(--ink-body); padding: 10px 12px 6px; font-family: var(--font-sans); font-size: var(--size-body); }
  #input::placeholder { color: var(--ink-muted); }
  /* In a very narrow sidebar the placeholder wraps; leave room for all of it instead of clipping it behind scroll arrows. */
  @media (max-width: 260px) { #input { min-height: 56px; } }
  #queue { display: flex; flex-direction: column; gap: 2px; padding: 0 2px 4px; }
  #queue:empty { display: none; }
  #queue .queued { display: flex; align-items: center; gap: 6px; font-size: var(--size-caption); color: var(--ink-muted); }
  #queue .queued .q-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #findbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--line-subtle); }
  #findbar[hidden] { display: none; }
  #find-input { flex: 1; min-width: 0; border: 1px solid var(--line-control); border-radius: var(--radius-xs); background: var(--bg-raised); color: var(--ink-body); font: inherit; font-size: var(--size-caption); padding: 3px 8px; }
  #find-input.nomatch { border-color: var(--danger); }
  #edit-banner { display: flex; align-items: center; gap: 6px; padding: 4px 8px 0; font-size: var(--size-caption); color: var(--ink-muted); }
  #edit-banner[hidden] { display: none; }
  #chipbar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 12px; }
  #bg-strip { margin: 0 6px 4px; border: 1px solid var(--line-subtle); border-radius: var(--radius-xs); font-size: var(--size-caption); }
  #bg-strip[hidden] { display: none; }
  #bg-strip .bghead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 8px; color: var(--ink-muted); }
  #bg-strip ul { list-style: none; margin: 0; padding: 0; }
  #bg-strip .bgrow { display: flex; align-items: center; gap: 8px; padding: 0 8px; min-height: 24px; }
  #bg-strip .bgrow .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #bg-strip .bgrow .dt { flex: none; color: var(--ink-muted); max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #bg-strip .bgrow .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--ion); }
  #bg-strip .bgrow.done .dot { background: var(--success); }
  #bg-strip .bgrow.failed .dot { background: var(--danger); }
  #bg-strip .bgrow.stopped .dot { background: var(--ink-muted); }
  #goal-chip { flex: 1 1 220px; min-width: 0; }
  #todo-chip { flex: 0 1 auto; }
  #todo-chip:has(#todo-list:not([hidden])) { flex-basis: 100%; }
  #goal-chip { padding: 2px 8px; font-size: var(--size-caption); color: var(--ink-muted); }
  #goal-chip[hidden], #todo-chip[hidden] { display: none; }
  #goal-chip { display: flex; align-items: center; gap: 8px; }
  #goal-chip .gtext { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The plan is content, not a control: a card with a hairline edge, a status icon, one summary line and a segment per step. */
  #todo-chip { border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); background: var(--bg-canvas); box-shadow: var(--elev-1); overflow: hidden; font-size: var(--size-body); color: var(--ink-body); }
  #todo-toggle { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 8px 12px 6px; background: none; border: 0; border-radius: 0; color: var(--ink-body); font: inherit; text-align: left; cursor: pointer; }
  #todo-toggle:hover { background: var(--ion-tint); }
  #todo-toggle:focus-visible { outline-offset: -2px; }
  #todo-toggle .sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; }
  #todo-toggle .chev { flex: none; color: var(--ink-muted); transition: transform .14s; }
  #todo-toggle[aria-expanded="true"] .chev { transform: rotate(180deg); }
  #todo-chip .st-ic { flex: none; display: none; }
  #todo-chip.s-doing .st-doing, #todo-chip.s-done .st-done, #todo-chip.s-idle .st-idle { display: block; }
  #todo-bar { display: flex; gap: 2px; padding: 0 12px 10px; }
  #todo-bar span { flex: 1; height: 3px; border-radius: 2px; background: var(--line-subtle); }
  #todo-bar span.done { background: var(--success); }
  #todo-bar span.doing { background: var(--ion); }
  #todo-list { margin: 0; padding: 2px 6px 8px; list-style: none; border-top: 1px solid var(--line-subtle); }
  #todo-list[hidden] { display: none; }
  #todo-list li { display: flex; align-items: flex-start; gap: 8px; padding: 4px 6px; min-height: 28px; border-radius: var(--radius-xs); overflow-wrap: anywhere; }
  #todo-list li .ic { flex: none; width: 16px; height: 20px; display: flex; align-items: center; justify-content: center; }
  #todo-list li.done { color: var(--ink-muted); }
  #todo-list li.done .tx { text-decoration: line-through; }
  #todo-list li.doing { background: var(--ion-tint); font-weight: 600; }
  .todo-spin { transform-origin: 50% 50%; animation: todo-spin 1.2s linear infinite; }
  @keyframes todo-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .todo-spin { animation: none; } }
  .question { border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); background: var(--bg-canvas); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .question .qk { font-size: var(--size-caption); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--warning); }
  .question .qt { overflow-wrap: anywhere; }
  .question .opts { display: flex; flex-wrap: wrap; gap: 6px; }
  .question .opts button, .question .custom button { font-size: var(--size-caption); padding: 3px 9px; }
  .question .custom { display: flex; gap: 6px; }
  .question .custom input { flex: 1; min-width: 0; border: 1px solid var(--line-control); border-radius: var(--radius-xs); background: var(--bg-raised); color: var(--ink-body); font: inherit; font-size: var(--size-caption); padding: 3px 8px; }
  .turn-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; margin: -4px 0 0; font-size: var(--size-caption); }
  .diagram { margin: 6px 0; padding: 8px; overflow: auto; border-radius: var(--radius-sm); background: var(--bg-sunken); }
  .diagram svg { max-width: 100%; height: auto; }
  details.diagram-src > summary { cursor: pointer; font-size: var(--size-caption); color: var(--ink-muted); }
  #attachments { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px 0; }
  #attachments:empty { display: none; }
  .chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 1px 2px 1px 6px; border-radius: var(--radius-xs); background: var(--bg-overlay); color: var(--ink-body); font-size: var(--size-caption); }
  .chip .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; line-height: 1; }
  .msg.user .files { margin-top: 4px; font-size: var(--size-caption); opacity: .8; }
  /* Mode and model are set once and rarely touched, so they head the composer on a sunken strip, out of the way of typing. */
  .cchips { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 8px; min-width: 0; background: var(--bg-sunken); border-bottom: 1px solid var(--line-subtle); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
  .cchips #mode { font-weight: 600; }
  .cfoot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 2px 4px 4px 8px; }
  /* The approval level is a select like the mode and model chips. It stays neutral while Ask first, reads as a mild step at Accept edits, and is the one red control in the composer at Autonomous. */
  .cfoot .auto { font-size: var(--size-caption); color: var(--ink-muted); background: transparent; border: 1px solid var(--line-control); border-radius: var(--radius-xs); min-height: 24px; padding: 2px 4px; cursor: pointer; field-sizing: content; }
  .cfoot .auto:hover { color: var(--ink-body); background: var(--bg-overlay); }
  .cfoot .auto option { background: var(--bg-raised); color: var(--ink-body); font-weight: normal; }
  .cfoot .auto.edits { color: var(--ink-body); border-color: var(--line-control); }
  .cfoot .auto.on { color: var(--danger); font-weight: 600; border-color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
  #auto-note { display: flex; align-items: flex-start; gap: 8px; margin: 0 6px 6px; padding: 6px 8px; font-size: var(--size-caption); line-height: 1.4; color: var(--ink-body); background: color-mix(in srgb, var(--danger) 12%, transparent); border-left: 3px solid var(--danger); border-radius: var(--radius-xs); }
  #auto-note svg { flex: none; margin-top: 1px; color: var(--danger); }
  #auto-note.edits { background: var(--bg-sunken); border-left-color: var(--line-control); }
  #auto-note.edits svg { color: var(--ink-muted); }
  #auto-note[hidden] { display: none; }
  #send, #cancel { flex: none; min-height: 24px; }
  #send[hidden], #cancel[hidden] { display: none; }
  /* A plain button is a reset. Look comes from a class: primary, secondary, link (base), icon, or the component's own rule. */
  button { background: none; color: inherit; border: 0; padding: 0; border-radius: var(--radius-xs); cursor: pointer; font-size: var(--size-caption); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .msg { padding: 0; line-height: 1.5; }
  .msg.user { color: var(--ink-body); }
  .msg.user .body { background: var(--bg-overlay); border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); padding: 7px 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg.assistant .body { overflow-wrap: anywhere; }
  .msg.assistant .body:not(.md) { white-space: pre-wrap; }
  .msg .label { display: none; }
  .msg.assistant .label.has-speed { display: block; order: 2; margin-top: 2px; font-size: var(--size-caption); color: var(--ion); font-variant-numeric: tabular-nums; }
  .msg.assistant .label.has-speed .who { display: none; }
  .md > * { margin: 0; }
  .md > * + * { margin-top: 8px; }
  .md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { font-size: var(--size-body); font-weight: 600; }
  .md h1, .md h2 { font-size: var(--size-title-sm); }
  .md ul, .md ol { padding-left: 20px; }
  .md li + li { margin-top: 2px; }
  .md a { color: var(--ion-text); }
  .md blockquote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line-subtle); color: var(--ink-muted); }
  .md hr { border: 0; border-top: 1px solid var(--line-subtle); }
  .md code { font-family: var(--font-mono); font-size: var(--size-caption); background: var(--bg-sunken); padding: 1px 4px; border-radius: var(--radius-xs); }
  .md .code { border: 1px solid var(--line-subtle); border-radius: var(--radius-xs); background: var(--bg-canvas); overflow: hidden; }
  .md .code-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 2px 8px; font-size: var(--size-caption); color: var(--ink-muted); border-bottom: 1px solid var(--line-subtle); }
  .md .code-head .copy { background: none; color: var(--ink-muted); border: 0; padding: 1px 8px; min-height: 24px; font-size: var(--size-caption); }
  .md .code-head .copy:hover { color: var(--ink-body); }
  .md pre { margin: 0; padding: 8px 10px; overflow-x: auto; font-family: var(--font-mono); font-size: var(--size-caption); line-height: 1.5; }
  .md pre code { background: none; padding: 0; }
  .md .table { overflow-x: auto; }
  .md table { border-collapse: collapse; font-size: var(--size-caption); display: block; max-width: 100%; overflow-x: auto; }
  .md th, .md td { border: 1px solid var(--line-subtle); padding: 3px 6px; text-align: left; }
  .md .task { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--ink-muted); border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  .md .task.done { background: var(--success); border-color: var(--success); }
  .tool-row { font-size: var(--size-body); color: var(--ink-muted); }
  .tool-row[open], .tool-row > summary:hover { color: var(--ink-body); }
  .tool-row .target { color: var(--ink-body); }
  .tool-row > summary { list-style: none; display: flex; align-items: center; gap: 6px; padding: 3px 4px; min-height: 24px; border-radius: var(--radius-xs); cursor: pointer; min-width: 0; }
  .tool-row > summary::-webkit-details-marker { display: none; }
  .tool-row > summary:hover { background: var(--bg-overlay); }
  .tool-row .chev { width: 0; height: 0; border-left: 4px solid var(--ink-muted); border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform .12s; flex: none; margin: 0 2px; }
  .tool-row[open] > summary .chev { transform: rotate(90deg); }
  .tool-row .st { width: 14px; text-align: center; flex: none; font-size: var(--size-caption); }
  .tool-row .st.ok { color: var(--success); }
  .tool-row .st.err { color: var(--danger); }
  .tool-row .st.spin { width: 10px; height: 10px; margin: 0 2px; border: 1.5px solid var(--ion); border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tool-row .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-row .target { font-family: var(--font-mono); font-size: var(--size-caption); }
  .tool-row .meta { margin-left: auto; padding-left: 8px; font-size: var(--size-caption); color: var(--ink-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tool-row .meta.err { color: var(--danger); }
  .tool-row .tool-body { padding: 4px 0 6px 24px; }
  .tool-row .result, .tool-row .args { margin: 0; padding: 4px 6px; background: var(--tool); border-radius: var(--radius-xs); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow-y: auto; font-family: var(--font-mono); font-size: var(--size-caption); }
  .tool-row .result.collapsed { max-height: 120px; }
  .tool-row .show-more { font-size: var(--size-caption); margin-top: 2px; cursor: pointer; color: var(--ion-text); background: none; border: none; padding: 0; }
  .tool-row .diff { border: 1px solid var(--line-subtle); border-radius: var(--radius-xs); overflow-x: auto; font-size: var(--size-caption); }
  .cursor { display: inline-block; width: 6px; height: 13px; background: var(--ion); vertical-align: text-bottom; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .diff-line { white-space: pre; font-family: var(--font-mono); padding: 0 8px; line-height: 1.5; }
  .diff-add { background: var(--success-tint); }
  .diff-del { background: var(--danger-tint); }
  .reasoning { border-left: 2px solid var(--line-subtle); padding: 0 0 0 10px; margin: 0; font-size: var(--size-caption); line-height: 1.5; color: var(--ink-muted); }
  .reasoning > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 24px; }
  .reasoning > summary::-webkit-details-marker { display: none; }
  .reasoning > summary::before { content: ''; flex: none; width: 0; height: 0; border-left: 4px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform .12s; }
  .reasoning[open] > summary::before { transform: rotate(90deg); }
  .reasoning > summary:hover { color: var(--ink-body); }
  .reasoning .rbody { white-space: pre-wrap; padding: 0 0 4px;
  }
  .approval { border: 1px solid var(--warning); border-left-width: 3px; border-radius: var(--radius-sm); background: var(--bg-canvas); box-shadow: var(--elev-1); animation: rise .14s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .approval { animation: none; } }
  .approval.destructive { border-color: var(--danger); }
  .approval .kind { display: flex; align-items: center; gap: 6px; padding: 9px 12px 0; font-size: var(--size-caption); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--warning); }
  .approval.destructive .kind { color: var(--danger); }
  .approval .kind .hint { margin-left: auto; color: var(--ink-muted); font-weight: 400; letter-spacing: 0; text-transform: none; }
  .approval .line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 12px 2px; min-width: 0; }
  .approval .q { flex: 1 1 100%; min-width: 0; overflow-wrap: anywhere; }
  .approval .file { font-family: var(--font-mono); font-size: var(--size-caption); }
  /* The command or path being approved is the focus of the card: a code block that wraps (three lines, then "Show full command"), never a coloured sentence. */
  .approval .target { display: inline-block; max-width: 100%; font-family: var(--font-mono); font-size: var(--size-caption); background: var(--bg-sunken); border-radius: var(--radius-xs); padding: 1px 6px; overflow-wrap: anywhere; vertical-align: top; }
  .approval .cmd { flex: 1 1 100%; min-width: 0; display: flex; gap: 8px; background: var(--bg-sunken); border-radius: var(--radius-xs); padding: 8px 10px; font-family: var(--font-mono); font-size: var(--size-caption); line-height: 1.5; }
  .approval .cmd .p { flex: none; color: var(--ink-muted); }
  .approval .cmd code { min-width: 0; font: inherit; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .approval .cmd.open code { display: block; -webkit-line-clamp: unset; max-height: 200px; overflow: auto; }
  .approval .meta { font-size: var(--size-caption); color: var(--ink-body); font-family: var(--font-mono); }
  .approval button { flex: none; font-size: var(--size-caption); min-height: 28px; padding: 3px 12px; white-space: nowrap; }
  .approval .ik-btn--link { padding: 0; min-height: 24px; }
  .approval .ik-btn--link:hover { text-decoration: underline; }
  .approval .fb { display: flex; flex-direction: column; gap: 6px; padding: 0 10px 10px; }
  .approval .fb[hidden] { display: none; }
  .approval .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .approval .chip { border: 1px solid var(--line-subtle); background: transparent; color: var(--ink-muted); border-radius: 10px; padding: 1px 8px; font-size: var(--size-caption); }
  .approval .chip:hover { color: var(--ink-body); }
  .approval .preview { margin: 6px 10px 10px; padding: 8px 10px; white-space: pre-wrap; font-family: var(--font-mono); font-size: var(--size-caption); max-height: 160px; overflow: auto; background: var(--bg-sunken); border-radius: var(--radius-xs); }
  .approval .note { width: 100%; resize: vertical; min-height: 44px; border: 1px solid var(--line-control); border-radius: var(--radius-xs); background: var(--bg-raised); color: var(--ink-body); font: 12px var(--font-sans); padding: 6px 8px; }
  .approval .note:focus { border-color: var(--focus-ring); }
  .approval .fb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
  .approval .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px 12px; }
  .approval .bar .sp { flex: 1; }
  .approval .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .approval .hold { position: relative; overflow: hidden; min-width: 116px; font-weight: 600; background: transparent; color: var(--danger); box-shadow: inset 0 0 0 1px var(--danger); user-select: none; touch-action: none; }
  .approval .hold::before { content: ""; position: absolute; inset: 0; width: 0; background: var(--danger); opacity: .25; }
  .approval .hold.holding::before { width: 100%; transition: width .9s linear; }
  .approval .hold span { position: relative; }
  .approval-log { display: flex; gap: 6px; font-size: var(--size-caption); color: var(--ink-muted); padding: 3px 4px 3px 18px; }
  .approval-log .st { width: 14px; flex: none; text-align: center; }
  .run { border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); background: var(--bg-canvas); overflow: hidden; }
  .run .rh { display: flex; align-items: center; gap: 6px; padding: 8px 10px 6px; min-width: 0; }
  .run .rh .task { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; flex: 1; }
  .run .rh .sum { font-size: var(--size-caption); color: var(--ink-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .run .bar { height: 3px; margin: 0 10px 6px; border-radius: 2px; background: var(--line-subtle); overflow: hidden; }
  .run .bar span { display: block; height: 100%; background: var(--ion); }
  .run .step { display: flex; flex-direction: column; gap: 4px; padding: 7px 10px; border-top: 1px solid var(--line-subtle); }
  .run .l1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .run .who { font-family: var(--font-mono); font-size: var(--size-caption); color: var(--ink-muted); border: 1px solid var(--line-subtle); border-radius: var(--radius-xs); padding: 0 4px; flex: none; }
  .run .stask { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run .meta { font-size: var(--size-caption); color: var(--ink-muted); white-space: nowrap; }
  .run .l2 { display: flex; align-items: center; gap: 8px; padding-left: 22px; flex-wrap: wrap; font-size: var(--size-caption); }
  .run .l2 .ik-btn--link { font-size: var(--size-caption); }
  .run .rerr { padding-left: 22px; overflow-wrap: anywhere; font-size: var(--size-caption); color: var(--danger); }
  .run .rf { display: flex; justify-content: flex-end; padding: 6px 10px; border-top: 1px solid var(--line-subtle); }
  .run .rf .ik-btn--link { font-size: var(--size-caption); }
  .approval-log.err { color: var(--danger); }
  .run .rh .ok, .run .l1 .ok { color: var(--success); }
  .run .rh .err, .run .l1 .err { color: var(--danger); }
  .status-bar {
    font-size: var(--size-caption); color: var(--ink-muted); padding: 6px 0 0; border-top: 1px solid var(--line-subtle); margin-top: 2px; font-variant-numeric: tabular-nums;
    display: flex; flex-wrap: wrap; gap: 2px 12px; justify-content: space-between;
  }
  .status-bar > span { min-width: 0; overflow-wrap: anywhere; }
  .feedback { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 0 2px; }
  .feedback button.fb { min-height: 24px; padding: 2px 10px; background: transparent; color: var(--ink-body); border: 1px solid var(--line-control); border-radius: 12px; font-size: var(--size-caption); cursor: pointer; }
  .feedback button.fb:hover { background: var(--bg-overlay); }
  .feedback button.fb[aria-pressed="true"] { background: var(--ion-tint); }
  .feedback input.fb-note { flex: 1 1 12em; min-width: 8em; min-height: 24px; background: var(--bg-raised); color: var(--ink-strong); border: 1px solid var(--line-control); border-radius: 4px; padding: 2px 6px; font: inherit; font-size: var(--size-caption); }
  .error-banner { background: color-mix(in srgb, var(--danger) 12%, transparent); border-left: 2px solid var(--danger); border-radius: 0 4px 4px 0; padding: 8px 10px; line-height: 1.5; overflow-wrap: anywhere; }
  .error-banner .ik-btn--link { padding: 0 0 0 6px; text-decoration: none; }
  .error-banner .ik-btn--link:hover { text-decoration: underline; }
  .md .code.collapsed pre { max-height: 18em; overflow: hidden; }
  .md .code .code-more { display: block; width: 100%; background: none; color: var(--ion-text); border: 0; border-top: 1px solid var(--line-subtle); padding: 4px 8px; font-size: var(--size-caption); text-align: left; cursor: pointer; }
  .empty-state { color: var(--ink-muted); padding: 28px 4px 12px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-state .mark { width: 64px; height: 64px; background: var(--ion); -webkit-mask: var(--mandala) center / contain no-repeat; mask: var(--mandala) center / contain no-repeat; }
  .empty-state h2 { margin: 0; font-size: var(--size-title-sm); font-weight: 600; color: var(--ink-body); }
  .empty-state p { margin: 0; line-height: 1.5; max-width: 34ch; }
  .approval-default-card { width: 100%; text-align: left; border: 1px solid var(--line-subtle); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--elev-1); }
  .approval-default-card[hidden] { display: none; }
  .approval-default-card h3 { margin: 0; font-size: var(--size-body); font-weight: 600; color: var(--ink-body); }
  .approval-default-card .adc-opt { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: start; min-height: 24px; padding: 3px 0; cursor: pointer; color: var(--ink-body); }
  .approval-default-card .adc-opt input { margin: 3px 0 0; }
  .approval-default-card .adc-name { font-weight: 600; }
  .approval-default-card .adc-desc { grid-column: 2; color: var(--ink-muted); font-size: var(--size-caption); line-height: 1.4; }
  .approval-default-card .adc-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .approval-default-card .adc-note { color: var(--ink-muted); font-size: var(--size-caption); }
  .empty-state .examples { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 6px; }
  .empty-state .ex { text-align: left; background: transparent; color: var(--ink-body); border: 1px solid var(--line-control); border-radius: var(--radius-sm); padding: 6px 10px; font-size: var(--size-caption); min-height: 28px; }
  .empty-state .ex:hover { background: var(--bg-overlay); border-color: var(--focus-ring); }
  .empty-state .hint { font-size: var(--size-caption); line-height: 1.4; margin-top: 6px; max-width: none; }
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
    background: var(--tool); border: 1px solid var(--line-subtle); padding: 1px 5px; border-radius: var(--radius-xs); font-family: var(--font-mono); font-size: var(--size-caption);
  }
  /* Voice input */
  #mic.recording {
    background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); border-color: var(--danger);
    animation: mic-pulse 1.2s ease-in-out infinite;
  }
  #mic:disabled { opacity: 0.4; cursor: not-allowed; }
  #mic .dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: currentColor; vertical-align: middle; margin-right: 4px;
  }
  @keyframes mic-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 45%, transparent); }
    50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--danger) 0%, transparent); }
  }
  #input.interim {
    color: var(--ink-muted); font-style: italic;
  }
  #voice-status {
    font-size: var(--size-caption); color: var(--ink-muted);
  }
  #voice-status:not(:empty) { padding: 4px 0; min-height: 14px; }
  /* Empty, it must not add the flex gap above it as dead space under the meter. */
  #voice-status:empty { margin-top: -6px; }
  #voice-status.error { color: var(--danger); }
  #mention-list {
    display: none; border: 1px solid var(--line-subtle); border-radius: var(--radius-xs); margin-bottom: 4px;
    background: var(--bg-raised); max-height: 140px; overflow: auto; font-size: var(--size-caption);
  }
  #mention-list.open { display: block; }
  #mention-list .mg { padding: 6px 8px 2px; font-size: var(--size-caption); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); }
  #mention-list .mi { padding: 3px 8px; cursor: pointer; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  #mention-list .mi > span:first-child { font-family: var(--font-mono); font-size: var(--size-caption); flex: none; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #mention-list .mi:hover, #mention-list .mi.sel { background: var(--bg-overlay); }
  #mention-list .mi .hint { color: var(--ink-muted); font-size: var(--size-caption); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Keyboard focus must always be visible. */
  button:focus-visible, select:focus-visible, textarea:focus-visible, input:focus-visible, .mi:focus-visible {
    outline: 2px solid var(--focus-ring); outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  }
  @media (forced-colors: active) {
    button, select, textarea, #mention-list, .approval, .error-banner, .warning, .cmd-card, .approval-default-card, .question, .composer, .steps, .cchips select, .cchips .model, .cfoot .auto, .empty-state .ex { border: 1px solid ButtonText; }
    .m-cap { border: 1px solid ButtonText; }
    .feedback button.fb[aria-pressed="true"] { background: Highlight; color: HighlightText; }
    .feedback input.fb-note { border: 1px solid ButtonText; }
    .wv path { forced-color-adjust: none; fill: Highlight; }
  }
`;

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
<style>${DESIGN_CSS}</style>
<style>${CHAT_CSS}</style>
</head>
<body class="ik-root" data-density="compact">
<script src="${voiceScriptUri}" onerror="window.__forgeVoiceLoadFailed=true"></script>
<script src="${forgeUiScriptUri}" onerror="window.__forgeUiLoadFailed=true"></script>
<div id="toolbar" role="toolbar" aria-label="Chat actions">
  <div class="tb-end">
  <button id="new-chat" class="icon" type="button" title="New chat" aria-label="New chat"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg></button>
  <button id="history-btn" class="icon" type="button" title="History" aria-label="History"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v2.2h2.2"/><path d="M8 5v3.2l2 1.3"/></svg></button>
  <button id="more-btn" class="icon" type="button" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r=".7"/><circle cx="8" cy="8" r=".7"/><circle cx="12.5" cy="8" r=".7"/></svg></button>
  </div>
  <div id="more-menu" role="menu" aria-label="More actions" hidden>
    <button id="checkpoints-btn" type="button" role="menuitem">Restore checkpoint…</button>
    <button id="condense-btn" type="button" role="menuitem" title="Summarize older turns to free up context">Condense conversation</button>
    <button id="specs-btn" type="button" role="menuitem" title="Turn a task into requirements, a design and a checklist">Specs…</button>
    <button id="steering-btn" type="button" role="menuitem" title="Guidance Forge reads at the start of every chat">Steering…</button>
    <button id="manager-window-btn" type="button" role="menuitem" title="Run several sessions at once, in a window of its own">Agent Manager in new window</button>
    <div class="stat" id="meter-stat"></div>
  </div>
</div>
<div id="findbar" role="search" hidden><input id="find-input" type="text" aria-label="Find in this chat" placeholder="Find in this chat" /><button id="find-prev" class="ik-btn ik-btn--link" type="button" aria-label="Previous match">Prev</button><button id="find-next" class="ik-btn ik-btn--link" type="button" aria-label="Next match">Next</button><button id="find-close" class="ik-btn ik-btn--link" type="button" aria-label="Close find">Close</button></div>
<div id="panel" role="dialog" aria-label="Panel"></div>
<div id="messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
  <div class="empty-state" id="empty">
    <div class="mark" aria-hidden="true"></div>
    <h2>What should Forge work on?</h2>
    <p>Forge asks before it edits files or runs commands.</p>
    <div class="approval-default-card" id="approval-default-card" role="group" aria-labelledby="adc-title" hidden>
      <h3 id="adc-title">How much should Forge do on its own?</h3>
      <label class="adc-opt"><input type="radio" name="adc" value="ask" checked><span class="adc-name">Ask first</span><span class="adc-desc">Approve each file edit and command. Safest while you get to know Forge.</span></label>
      <label class="adc-opt"><input type="radio" name="adc" value="edits"><span class="adc-name">Accept edits</span><span class="adc-desc">File edits just happen. Commands still ask.</span></label>
      <label class="adc-opt"><input type="radio" name="adc" value="auto"><span class="adc-name">Autonomous</span><span class="adc-desc">No approval cards. For trusted projects.</span></label>
      <div class="adc-foot"><span class="adc-note">You can change this any time in the composer.</span><button type="button" class="ik-btn ik-btn--primary" id="adc-use">Use this</button></div>
    </div>
    <div class="examples">
      <button type="button" class="ex">Explain how this project is organized</button>
      <button type="button" class="ex">Find why a test is failing and fix it</button>
      <button type="button" class="ex">Add tests for the file I have open</button>
    </div>
    <p class="hint">Enter sends. Shift+Enter adds a line. @ attaches files.</p>
  </div>
</div>
<div id="approval-announcer" class="ik-sr-only" aria-live="assertive"></div>
<div id="input-area" role="region" aria-label="Message input">
<div id="model-menu" role="dialog" aria-label="Choose a model" hidden>
  <input type="search" id="model-search" placeholder="Search models" aria-label="Search models" autocomplete="off" />
  <div id="model-list"></div>
  <div class="foot"><button type="button" id="model-refresh">Refresh</button><button type="button" id="model-settings">Settings…</button></div>
</div>
  <div id="mention-list" role="listbox" aria-label="Mention suggestions"></div>
  <div id="queue" role="list" aria-label="Queued messages"></div>
  <div id="bg-strip" role="region" aria-label="Background agents" hidden></div>
  <div id="edit-banner" hidden><span>Editing your last message</span><button id="edit-cancel" class="ik-btn ik-btn--link" type="button">Cancel</button></div>
  <div id="chipbar">
  <div id="goal-chip" hidden><span class="gtext" id="goal-text"></span><button type="button" class="ik-btn ik-btn--link" id="goal-toggle">Pause</button><button type="button" class="ik-btn ik-btn--link" id="goal-clear">Clear</button></div>
  <div id="todo-chip" class="s-idle" hidden><button type="button" id="todo-toggle" aria-expanded="false" aria-controls="todo-list"><svg class="st-ic st-idle" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--line-control)" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6"/></svg><svg class="st-ic st-doing todo-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ion)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="var(--line-subtle)"/><path d="M8 2a6 6 0 0 1 6 6"/></svg><svg class="st-ic st-done" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--success)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="m5.5 8.2 1.8 1.8 3.3-3.6"/></svg><span class="sum" id="todo-sum"></span><svg class="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div id="todo-bar" aria-hidden="true"></div><ul id="todo-list" hidden aria-label="Task checklist"></ul></div>
  </div>
  <div class="composer">
    <div class="cchips">
  <select id="mode" title="Mode" aria-label="Mode"></select>
  <button type="button" class="model" id="model-label" title="Model" aria-haspopup="dialog" aria-expanded="false">no model</button>
    </div>
    <div id="attachments" role="list" aria-label="Attached files"></div>
    <textarea id="input" rows="1" aria-label="Message to Forge" aria-autocomplete="list" aria-controls="mention-list" placeholder="Ask Forge… (@ to attach context)" title="@ attaches files, @problems or @git context" autofocus></textarea>
    <div class="cfoot">
      <select class="auto" id="approval" aria-label="Approvals" aria-describedby="auto-note" title="Forge asks before it changes files or runs commands">
        <option value="ask" title="Forge asks before it changes files or runs commands" selected>Ask first</option>
        <option value="edits" title="File edits run without asking. Commands still ask.">Accept edits</option>
        <option value="auto" title="Forge runs tools without asking you first">Autonomous</option>
      </select>
      <span class="spacer"></span>
      <button id="attach" class="icon" type="button" title="Attach context (@)" aria-label="Attach context"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M10.5 8v1a2 2 0 0 0 4 0V8a6.5 6.5 0 1 0-2.6 5.2"/></svg></button>
      <button id="attach-file" class="icon" type="button" title="Attach files (or paste / drop them)" aria-label="Attach files"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 7.5 8 13a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3L6.5 11.1a1.2 1.2 0 0 1-1.7-1.7L10 4.2"/></svg></button>
      <button id="enhance" class="icon" type="button" title="Enhance prompt" aria-label="Enhance prompt"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75 9.2 5.3 12.75 6.5 9.2 7.7 8 11.25 6.8 7.7 3.25 6.5 6.8 5.3zM12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg></button>
      <button id="mic" class="icon" type="button" title="Voice input (Ctrl+Shift+Space)" aria-label="Voice input"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25"/></svg></button>
      <button id="send" class="ik-btn ik-btn--primary" type="button" disabled title="Type a message to send" aria-label="Send message">Send</button>
      <button id="cancel" class="ik-btn ik-btn--secondary" type="button" disabled hidden aria-label="Stop the running task">Stop</button>
    </div>
  </div>
  <div class="meter empty" id="meter">
    <button type="button" class="meter-btn" id="meter-btn" aria-label="Chat cost and context usage" title="Cost of this chat and how full the context window is" aria-haspopup="dialog" aria-expanded="false" aria-controls="meter-pop"><span class="m-cap" aria-hidden="true"><svg viewBox="0 0 132 28" preserveAspectRatio="none"><g class="wv a"><path id="meter-wave-a" d=""/></g><g class="wv b"><path id="meter-wave-b" d=""/></g></svg><i class="m-guide"></i></span><span class="m-label">Context</span><span id="meter-text"></span><svg class="m-chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6l3-3 3 3"/></svg></button>
    <span id="meter-cost"></span>
    <span id="meter-live" class="ik-sr-only" role="status"></span>
    <div id="meter-pop" role="dialog" aria-label="Context and cost details" hidden>
      <div class="mp-head"><div><div class="mp-title">Context window</div><div class="mp-sub" id="mp-model"></div></div><button type="button" class="icon" id="mp-close" aria-label="Close details"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
      <div class="mp-big"><b id="mp-used"></b><span id="mp-of"></span></div>
      <dl class="mp-stats">
        <div><dt>Chat cost</dt><dd id="mp-cost"></dd></div>
        <div><dt>Input tokens</dt><dd id="mp-in"></dd></div>
        <div><dt>Output tokens</dt><dd id="mp-out"></dd></div>
        <div><dt>Run time</dt><dd id="mp-time"></dd></div>
        <div><dt>Step</dt><dd id="mp-step"></dd></div>
      </dl>
      <div class="mp-foot"><p>Cost is an estimate from known pricing.</p><button type="button" class="ik-btn ik-btn--secondary" id="mp-condense">Condense</button></div>
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
  // Approvals: Ask first, Accept edits (file writes run unasked) or Autonomous. Sent as level with each message.
  const approvalSelect = document.getElementById('approval');
  const autoNote = document.createElement('div');
  autoNote.id = 'auto-note';
  autoNote.hidden = true;
  approvalSelect.closest('.composer').appendChild(autoNote);
  const NOTE_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.5"/><path d="M8 12h.01"/></svg>';
  autoNote.innerHTML = NOTE_ICON + '<span></span>';
  const APPROVAL_NOTES = { edits: 'File edits run without asking. Commands still ask.', auto: 'Approvals are off: Forge runs tools without asking.' };
  function showApproval() {
    const level = approvalSelect.value;
    approvalSelect.classList.toggle('on', level === 'auto');
    approvalSelect.classList.toggle('edits', level === 'edits');
    autoNote.classList.toggle('edits', level === 'edits');
    autoNote.lastChild.textContent = APPROVAL_NOTES[level] || '';
    autoNote.hidden = !APPROVAL_NOTES[level];
    const chosen = approvalSelect.options[approvalSelect.selectedIndex];
    approvalSelect.title = chosen ? chosen.title : '';
  }
  approvalSelect.addEventListener('change', showApproval);
  // The level new chats start at, and whether the first-run card is still to be shown (both come from the host).
  let approvalDefault = 'ask';
  let offerApprovalCard = false;
  function setApprovalLevel(level) { approvalSelect.value = level; showApproval(); }
  function syncApprovalCard() {
    const card = document.getElementById('approval-default-card');
    if (card) card.hidden = !offerApprovalCard;
  }
  // Delegated, because the empty state is rebuilt from a saved copy when a new chat starts.
  document.addEventListener('click', (ev) => {
    const use = ev.target && ev.target.closest ? ev.target.closest('#adc-use') : null;
    if (!use) return;
    const picked = document.querySelector('#approval-default-card input[name=adc]:checked');
    const level = picked ? picked.value : 'ask';
    offerApprovalCard = false;
    approvalDefault = level;
    setApprovalLevel(level);
    syncApprovalCard();
    vscode.postMessage({ type: 'set_approval_default', level: level });
  });
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
  const meterBtn = document.getElementById('meter-btn');
  const meterPop = document.getElementById('meter-pop');
  const meterWaveA = document.getElementById('meter-wave-a');
  const meterWaveB = document.getElementById('meter-wave-b');
  const meterLive = document.getElementById('meter-live');
  const meterCostEl = document.getElementById('meter-cost');
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
  // Why the last run ended; 'aborted' (Stop) makes the turn actions offer Continue.
  let lastRunReason = null;
  /** True while the input holds an edit of the last message: Send replaces that turn. */
  let editingLast = false;
  const attachFileBtn = document.getElementById('attach-file');
  const attachmentsEl = document.getElementById('attachments');
  /** Chips for files waiting on the next message; the host owns the list and resends it on every change. */
  let pendingFiles = [];
  const announcer = document.getElementById('approval-announcer');

  // Background agents: the host sends the whole strip each time something changes (and every second while one runs).
  const bgStrip = document.getElementById('bg-strip');
  function renderBgStrip(view) {
    bgStrip.textContent = '';
    if (!view.items.length) { bgStrip.hidden = true; return; }
    bgStrip.hidden = false;
    const head = document.createElement('div'); head.className = 'bghead';
    const title = document.createElement('span'); title.textContent = 'Background agents'; head.appendChild(title);
    if (view.canStopAll) {
      const all = document.createElement('button'); all.type = 'button'; all.className = 'ik-btn ik-btn--secondary'; all.textContent = 'Stop all';
      all.addEventListener('click', () => vscode.postMessage({ type: 'bg_stop_all' }));
      head.appendChild(all);
    }
    bgStrip.appendChild(head);
    const list = document.createElement('ul');
    view.items.forEach((it) => {
      const li = document.createElement('li'); li.className = 'bgrow ' + it.state; li.dataset.id = it.id;
      const dot = document.createElement('span'); dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true'); li.appendChild(dot);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.label; nm.title = it.title; li.appendChild(nm);
      const dt = document.createElement('span'); dt.className = 'dt'; dt.textContent = it.detail; dt.title = it.detail; li.appendChild(dt);
      const act = document.createElement('button'); act.type = 'button'; act.className = 'ik-btn ik-btn--link';
      if (it.canStop) { act.textContent = 'Stop'; act.setAttribute('aria-label', 'Stop ' + it.label); act.addEventListener('click', () => vscode.postMessage({ type: 'bg_stop', id: it.id })); }
      else { act.textContent = 'Dismiss'; act.setAttribute('aria-label', 'Dismiss ' + it.label); act.addEventListener('click', () => vscode.postMessage({ type: 'bg_dismiss', id: it.id })); }
      li.appendChild(act);
      list.appendChild(li);
    });
    bgStrip.appendChild(list);
  }

  // Model picker: provider-grouped, searchable; the host answers list_models with model_menu.
  const modelMenu = document.getElementById('model-menu');
  const modelSearch = document.getElementById('model-search');
  const modelList = document.getElementById('model-list');
  let modelGroups = null;
  let modelCurrent = null;
  let favourites = [];
  let refocusFav = '';
  function favKey(provider, model) { return provider + '|' + model; }
  /** One picker row: the model button (with its window and price) and a star that adds it to Favourites. */
  function appendModelRow(g, m, showProvider) {
    const row = document.createElement('div'); row.className = 'mrow';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mo';
    const on = !!modelCurrent && modelCurrent.provider === g.provider && modelCurrent.model === m.id;
    const ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = on ? '✓' : ''; b.appendChild(ck);
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.label; b.appendChild(nm);
    if (showProvider) { const pv = document.createElement('span'); pv.className = 'id'; pv.textContent = g.label; b.appendChild(pv); }
    else if (m.label !== m.id) { const id = document.createElement('span'); id.className = 'id'; id.textContent = m.id; id.title = m.id; b.appendChild(id); }
    if (m.hint) { const ht = document.createElement('span'); ht.className = 'hint'; ht.textContent = m.hint; ht.title = m.hintTitle || ''; b.appendChild(ht); }
    b.addEventListener('click', () => { vscode.postMessage({ type: 'select_model', provider: g.provider, model: m.id }); closeModelMenu(); modelLabel.focus(); });
    row.appendChild(b);
    const key = favKey(g.provider, m.id);
    const fav = favourites.indexOf(key) >= 0;
    const star = document.createElement('button'); star.type = 'button'; star.className = 'star';
    star.setAttribute('aria-pressed', fav ? 'true' : 'false');
    star.setAttribute('aria-label', (fav ? 'Remove from favourites: ' : 'Add to favourites: ') + m.label);
    star.title = fav ? 'Remove from favourites' : 'Add to favourites';
    star.textContent = fav ? '★' : '☆';
    star.dataset.fav = key + (showProvider ? '|top' : '');
    star.addEventListener('click', (e) => { e.stopPropagation(); refocusFav = star.dataset.fav; vscode.postMessage({ type: 'toggle_favourite_model', provider: g.provider, model: m.id }); });
    row.appendChild(star);
    modelList.appendChild(row);
  }
  function closeModelMenu() { modelMenu.hidden = true; modelLabel.setAttribute('aria-expanded', 'false'); }
  function renderModelMenu() {
    modelList.textContent = '';
    if (!modelGroups) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Loading models…'; modelList.appendChild(d); return; }
    const q = modelSearch.value.trim().toLowerCase();
    const scrollTop = modelList.scrollTop;
    let shown = 0;
    const matches = (g, m) => !q || m.id.toLowerCase().indexOf(q) >= 0 || m.label.toLowerCase().indexOf(q) >= 0 || g.label.toLowerCase().indexOf(q) >= 0;
    const favRows = [];
    modelGroups.forEach((g) => g.models.forEach((m) => { if (favourites.indexOf(favKey(g.provider, m.id)) >= 0 && matches(g, m)) favRows.push({ g: g, m: m }); }));
    if (favRows.length) {
      const fh = document.createElement('div'); fh.className = 'mg'; fh.textContent = 'Favourites'; modelList.appendChild(fh);
      favRows.forEach((r) => { appendModelRow(r.g, r.m, true); shown++; });
    }
    modelGroups.forEach((g) => {
      const rows = g.models.filter((m) => matches(g, m));
      if (!rows.length) {
        // A provider with nothing to list (no key, endpoint down, no models named in the config) still says why.
        if (!q && !g.models.length && g.error) {
          const eh = document.createElement('div'); eh.className = 'mg'; eh.textContent = g.label; modelList.appendChild(eh);
          const en = document.createElement('div'); en.className = 'mn'; en.textContent = 'Could not list models: ' + g.error; modelList.appendChild(en);
        }
        return;
      }
      const h = document.createElement('div'); h.className = 'mg'; h.textContent = g.label; modelList.appendChild(h);
      if (g.source === 'builtin' && g.error && !q) { const n = document.createElement('div'); n.className = 'mn'; n.textContent = g.error; modelList.appendChild(n); }
      rows.forEach((m) => { appendModelRow(g, m, false); shown++; });
    });
    modelList.scrollTop = scrollTop;
    if (refocusFav) {
      const again = modelList.querySelector('button.star[data-fav="' + refocusFav.replace(/"/g, '') + '"]');
      refocusFav = '';
      if (again) again.focus();
    }
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
    const items = [modelSearch].concat(Array.prototype.slice.call(modelList.querySelectorAll('button.mo, button.star')));
    const at = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
    items[next].focus();
  });

  function closeMore() { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
  function closeRowMenus() { Array.prototype.forEach.call(panelEl.querySelectorAll('.rowmenu'), (m) => m.remove()); }
  /** Menus are transient: close them all together, e.g. before a panel opens. */
  function closeMenus() { closeMore(); closeModelMenu(); closeRowMenus(); closeMeterPop(false); }
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
        b.className = a.secondary ? 'ik-btn ik-btn--secondary' : 'ik-btn ik-btn--primary';
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
      box.appendChild(wkButton('Generate a spec', 'ik-btn ik-btn--primary', () => workAct('specs', { action: 'generate' })));
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
        acts.appendChild(wkButton('Discard', 'ik-btn ik-btn--secondary', () => workAct('specs', { action: 'discard', draftId: d.id })));
        acts.appendChild(wkButton('Approve', 'ik-btn ik-btn--primary', () => workAct('specs', { action: 'approve', draftId: d.id })));
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
        const syncBtn = wkButton('Sync with code', 'ik-btn ik-btn--secondary', () => workAct('specs', { action: 'sync', specId: s.id }));
        syncBtn.title = 'Update this spec to match the code: tick done tasks, fix paths, add missing work';
        syncRow.appendChild(syncBtn);
        card.appendChild(syncRow);
        if (s.needsConvert) {
          const row = wk('div', 'wk-actions');
          row.appendChild(wk('span', 'wk-note', 'No checkbox tasks yet.'));
          row.lastChild.style.margin = '0';
          row.appendChild(wkButton('Convert…', 'ik-btn ik-btn--secondary', () => workAct('specs', { action: 'convert', specId: s.id })));
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
            row.appendChild(wkButton(tk.status === 'failed' ? 'Retry' : 'Run', 'ik-btn ik-btn--secondary', () => workAct('specs', { action: 'run', specId: s.id, taskId: tk.id, title: tk.title, current: false })));
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
      box.appendChild(wkButton('Create a steering file', 'ik-btn ik-btn--primary', () => workAct('steering', { action: 'new' })));
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
  document.getElementById('manager-window-btn').addEventListener('click', () => { closeMore(); vscode.postMessage({ type: 'open_agent_manager_window' }); });

  function appendWarning(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'warning';
    div.setAttribute('role', 'status');
    div.textContent = text;
    messagesEl.appendChild(div);
    autoscroll();
    setTimeout(() => {
      div.remove();
      // The warning was the only thing in a fresh chat: bring the hint back instead of leaving a blank pane.
      if (messagesEl.children.length === 0 && EMPTY_HTML) {
        messagesEl.innerHTML = EMPTY_HTML;
        emptyEl = document.getElementById('empty');
        syncApprovalCard();
      }
    }, 8000);
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
  // afterPlan: the Plan agent already wrote a large plan, so "Plan first" is left out.
  function showSuggestSpec(afterPlan) {
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
    const choices = afterPlan ? [['Draft a spec', 'spec', false], ['Just do it', 'go', true]] : [['Draft a spec', 'spec', false], ['Plan first', 'plan', true], ['Just do it', 'go', true]];
    for (const [label, choice, secondary] of choices) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.className = secondary ? 'ik-btn ik-btn--secondary' : 'ik-btn ik-btn--primary';
      b.addEventListener('click', () => { card.remove(); vscode.postMessage({ type: 'suggest_choice', choice }); });
      line.appendChild(b);
    }
    const never = document.createElement('button'); never.type = 'button'; never.className = 'ik-btn ik-btn--link';
    never.textContent = "Don't ask again";
    never.addEventListener('click', () => { card.remove(); vscode.postMessage({ type: 'suggest_choice', choice: 'never' }); });
    line.appendChild(never);
    card.appendChild(kind); card.appendChild(line);
    messagesEl.appendChild(card);
    autoscroll();
  }

  // The Plan agent finished and the host saved the plan in the project. offer: ask whether to carry it out.
  function showPlanSaved(path, offer) {
    removeSuggestCard();
    const card = document.createElement('div');
    card.className = 'approval suggest';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Plan saved');
    const kind = document.createElement('div'); kind.className = 'kind'; kind.textContent = 'Plan saved';
    const line = document.createElement('div'); line.className = 'line';
    const q = document.createElement('span'); q.className = 'q';
    q.textContent = 'Saved in ' + path + '. You can edit it before you go on.';
    line.appendChild(q);
    if (offer) {
      const go = document.createElement('button'); go.type = 'button'; go.className = 'ik-btn ik-btn--primary'; go.textContent = 'Implement this plan';
      go.addEventListener('click', () => { card.remove(); vscode.postMessage({ type: 'plan_implement' }); });
      const no = document.createElement('button'); no.type = 'button'; no.className = 'ik-btn ik-btn--secondary'; no.textContent = 'Not now';
      no.addEventListener('click', () => card.remove());
      line.appendChild(go); line.appendChild(no);
    }
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
    btn.type = 'button'; btn.className = 'ik-btn ik-btn--link'; btn.textContent = 'Revert this run';
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
    div.style.color = 'var(--ink-muted)';
    div.style.fontSize = 'var(--size-caption)';
    div.style.overflowWrap = 'anywhere';
    div.textContent = text;
    messagesEl.appendChild(div);
    autoscroll();
  }

  // /cmd result: the request was shown as a user line; the card holds the whole command (it is never run).
  function removeCmdPending() { const p = messagesEl.querySelector('.cmd-card.pending'); if (p) p.remove(); }
  function appendCmdCard(it) {
    removeCmdPending();
    hideEmpty();
    const card = document.createElement('div');
    card.className = 'cmd-card';
    if (it.pending) {
      card.classList.add('pending');
      card.setAttribute('role', 'status');
      const wait = document.createElement('span');
      wait.className = 'cmd-msg';
      wait.textContent = 'Writing a command…';
      card.appendChild(wait);
    } else if (!it.command) {
      const bad = document.createElement('span');
      bad.className = 'cmd-msg';
      bad.textContent = 'Forge could not write a command for that; try rephrasing.';
      card.appendChild(bad);
    } else {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = it.command;
      pre.appendChild(code);
      card.appendChild(pre);
      const actions = document.createElement('div');
      actions.className = 'cmd-actions';
      const ins = document.createElement('button');
      ins.type = 'button';
      ins.className = 'ik-btn ik-btn--link';
      ins.textContent = 'Insert in terminal';
      ins.addEventListener('click', () => vscode.postMessage({ type: 'cmd_insert', command: it.command }));
      const cp = document.createElement('button');
      cp.type = 'button';
      cp.className = 'ik-btn ik-btn--link';
      cp.textContent = 'Copy';
      cp.addEventListener('click', () => vscode.postMessage({ type: 'cmd_copy', command: it.command }));
      actions.appendChild(ins);
      actions.appendChild(cp);
      if (it.risk) {
        // Two text nodes, so the page can translate the label and the reason on their own.
        const risk = document.createElement('span');
        risk.className = 'cmd-risk';
        risk.title = 'A hint from known patterns, not a guarantee.';
        const label = document.createElement('span');
        label.textContent = 'Risky:';
        const why = document.createElement('span');
        why.textContent = it.risk;
        risk.appendChild(label);
        risk.appendChild(why);
        actions.appendChild(risk);
      }
      card.appendChild(actions);
    }
    messagesEl.appendChild(card);
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
      syncApprovalCard();
    }
    // Turn n is the n-th user message; the thumbs go under the last reply of each turn.
    let turn = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.role === 'user') { turn++; appendUserMessage(it.text); }
      else if (it.role === 'cmd') { appendUserMessage(it.request); appendCmdCard(it); }
      else {
        finalizeAssistant(it.text);
        const next = items[i + 1];
        if (!next || next.role === 'user') addFeedbackBar(turn, null);
      }
    }
  }

  // Thumbs under a turn's reply (F3). Kept in the session file only; nothing leaves the machine.
  let feedbackByTurn = {};
  function postFeedback(turn, rating, note) {
    if (rating) feedbackByTurn[turn] = { rating: rating, note: note || '' };
    else delete feedbackByTurn[turn];
    vscode.postMessage({ type: 'message_feedback', turn: turn, rating: rating, note: note });
  }
  function addFeedbackBar(turn, after) {
    if (!turn || messagesEl.querySelector('.feedback[data-turn="' + turn + '"]')) return;
    const saved = feedbackByTurn[turn];
    const bar = document.createElement('div');
    bar.className = 'feedback';
    bar.dataset.turn = String(turn);
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Rate this reply');
    const up = document.createElement('button'); up.type = 'button'; up.className = 'fb'; up.textContent = 'Helpful';
    const down = document.createElement('button'); down.type = 'button'; down.className = 'fb'; down.textContent = 'Not helpful';
    const note = document.createElement('input'); note.type = 'text'; note.className = 'fb-note'; note.maxLength = 1000;
    note.setAttribute('aria-label', 'What went wrong? (optional)'); note.placeholder = 'What went wrong? (optional)';
    const send = document.createElement('button'); send.type = 'button'; send.className = 'ik-btn ik-btn--link'; send.textContent = 'Send note';
    function show() {
      const r = feedbackByTurn[turn] ? feedbackByTurn[turn].rating : '';
      up.setAttribute('aria-pressed', r === 'up' ? 'true' : 'false');
      down.setAttribute('aria-pressed', r === 'down' ? 'true' : 'false');
      note.hidden = send.hidden = r !== 'down';
      if (r === 'down' && feedbackByTurn[turn].note && !note.value) note.value = feedbackByTurn[turn].note;
    }
    function choose(rating) {
      const now = feedbackByTurn[turn] ? feedbackByTurn[turn].rating : '';
      postFeedback(turn, now === rating ? null : rating, '');
      if (now === rating) note.value = '';
      show();
      if (rating === 'down' && now !== 'down') note.focus();
    }
    up.addEventListener('click', () => choose('up'));
    down.addEventListener('click', () => choose('down'));
    function sendNote() { postFeedback(turn, 'down', note.value.trim()); }
    send.addEventListener('click', sendNote);
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendNote(); } });
    bar.appendChild(up); bar.appendChild(down); bar.appendChild(note); bar.appendChild(send);
    show();
    if (after) after.insertAdjacentElement('afterend', bar); else messagesEl.appendChild(bar);
    autoscroll();
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
  let meterRun = null;
  let lastMeterLevel = 'none';
  function renderMeter() {
    let pct = null;
    if (meterCtx && meterCtx.window > 0) pct = Math.min(100, Math.round((meterCtx.tokens / meterCtx.window) * 100));
    const cost = meterCost !== null ? '$' + meterCost.toFixed(meterCost < 0.1 ? 4 : 2) : '';
    const parts = [];
    if (cost) parts.push('This chat: ' + cost);
    if (pct !== null) parts.push('context ' + pct + '% full (' + meterCtx.tokens + ' / ' + meterCtx.window + ' tokens)');
    const detail = parts.join(' · ');
    meterText.textContent = pct !== null ? pct + '%' : '';
    meterCostEl.textContent = cost;
    if (UI) {
      meterWaveA.setAttribute('d', UI.wavePath(pct || 0, 0, 2.6));
      meterWaveB.setAttribute('d', UI.wavePath(pct || 0, 2.1, 2.1));
    }
    meterBtn.title = detail || 'Cost of this chat and how full the context window is';
    meterBtn.setAttribute('aria-label', detail ? detail + '. Show usage details' : 'Chat cost and context usage');
    meterStat.textContent = detail;
    const level = UI ? UI.meterLevel(pct) : 'none';
    meterEl.classList.toggle('empty', !detail);
    meterEl.classList.toggle('no-ctx', pct === null);
    meterEl.classList.toggle('warn', level === 'warn');
    meterEl.classList.toggle('crit', level === 'crit');
    // The wave is silent; only a change into a worse level is announced, once.
    if (level !== lastMeterLevel) {
      if (level === 'warn') meterLive.textContent = 'Context is ' + pct + '% full';
      else if (level === 'crit') meterLive.textContent = 'Context is almost full: ' + pct + '%';
      lastMeterLevel = level;
    }
    renderMeterPop(cost);
  }
  /** The details dialog shows only what the page really knows: the window, the chat cost and the last run's figures. */
  function renderMeterPop(cost) {
    const fmt = (v) => (UI ? UI.formatTokens(v) : String(v));
    const used = meterCtx ? meterCtx.tokens : 0;
    const win = meterCtx ? meterCtx.window : 0;
    document.getElementById('mp-model').textContent = (modelLabel.textContent || '') + (win ? ' · ' + fmt(win) + ' token window' : '');
    document.getElementById('mp-used').textContent = win ? fmt(used) : '–';
    document.getElementById('mp-of').textContent = win ? 'of ' + fmt(win) + ' tokens used · ' + fmt(Math.max(0, win - used)) + ' left' : '';
    document.getElementById('mp-cost').textContent = cost || '–';
    document.getElementById('mp-in').textContent = meterRun ? fmt(meterRun.input) : '–';
    document.getElementById('mp-out').textContent = meterRun ? fmt(meterRun.output) : '–';
    document.getElementById('mp-time').textContent = meterRun && meterRun.ms ? (meterRun.ms / 1000).toFixed(1) + 's' : '–';
    document.getElementById('mp-step').textContent = meterRun && meterRun.max ? meterRun.iter + ' of ' + meterRun.max : '–';
  }
  function closeMeterPop(refocus) {
    if (meterPop.hidden) return;
    meterPop.hidden = true;
    meterBtn.setAttribute('aria-expanded', 'false');
    if (refocus) meterBtn.focus();
  }
  meterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!meterPop.hidden) { closeMeterPop(true); return; }
    closeMenus();
    meterPop.hidden = false;
    meterBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('mp-close').focus();
  });
  document.getElementById('mp-close').addEventListener('click', () => closeMeterPop(true));
  meterPop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMeterPop(true); } });
  document.addEventListener('click', (e) => { if (!meterPop.hidden && !meterPop.contains(e.target) && !meterBtn.contains(e.target)) closeMeterPop(false); });
  document.getElementById('mp-condense').addEventListener('click', () => { closeMeterPop(false); closePanel(); vscode.postMessage({ type: 'condense' }); });
  condenseBtn.addEventListener('click', () => { closeMore(); closePanel(); vscode.postMessage({ type: 'condense' }); });

  // ---- slash menu: reuses the mention list; a slash as the first character opens it
  let slashEntries = [];
  let slashOpen = false;
  function showSlashMenu(query) {
    const items = UI ? UI.filterSlash(slashEntries, query) : [];
    mentionList.textContent = '';
    mentionRange = null;
    if (!items.length) { hideMentions(); return; }
    items.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'mi' + (i === 0 ? ' sel' : '');
      row.setAttribute('role', 'option');
      row.dataset.slash = e.name;
      const label = document.createElement('span'); label.textContent = '/' + e.name; row.appendChild(label);
      const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = e.description + (e.source === 'custom' ? ' (yours)' : e.source === 'skill' ? ' (skill)' : ''); row.appendChild(hint);
      row.addEventListener('mousedown', (ev) => { ev.preventDefault(); chooseSlash(e.name); });
      mentionList.appendChild(row);
    });
    mentionList.classList.add('open');
    slashOpen = true;
  }
  /** A command that takes arguments is completed in the box; any other runs now. */
  function chooseSlash(name) {
    const entry = slashEntries.find((e) => e.name === name);
    hideMentions();
    if (!entry) return;
    if (entry.takesArgs) {
      inputEl.value = '/' + name + ' ';
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      inputEl.focus();
      setSendEnabled();
      return;
    }
    inputEl.value = '/' + name;
    runSlashFromInput();
  }
  /** Run the input as a built-in slash command, even while a run is going. False when it is not one. */
  function runSlashFromInput() {
    const slash = UI ? UI.parseSlash(inputEl.value, slashEntries) : null;
    if (!slash || slash.entry.source !== 'builtin') return false;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setSendEnabled();
    hideMentions();
    vscode.postMessage({ type: 'slash_run', name: slash.name, args: slash.args });
    return true;
  }

  // ---- @ mention autocomplete
  let mentionTimer = null;
  let mentionRange = null;
  function isSpace(ch) { return ch === ' ' || ch === '\\n' || ch === '\\t'; }
  function hideMentions() { mentionList.classList.remove('open'); mentionList.textContent = ''; mentionRange = null; slashOpen = false; }
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

  // The shortcuts (Ctrl+Alt+M, Ctrl+Alt+A) change this chat's controls through their own change events, so nothing else
  // differs from a click. They never write the stored approval default, and Autonomous is never reached from here.
  function announceChange(prefix, label) {
    meterLive.textContent = '';
    const a = document.createElement('span'); a.textContent = prefix;
    const b = document.createElement('span'); b.textContent = label;
    meterLive.appendChild(a);
    meterLive.appendChild(document.createTextNode(' '));
    meterLive.appendChild(b);
  }
  function cycleModeFromShortcut() {
    if (modeSelect.disabled || modeSelect.options.length < 2) return false;
    modeSelect.selectedIndex = (modeSelect.selectedIndex + 1) % modeSelect.options.length;
    modeSelect.dispatchEvent(new Event('change'));
    announceChange('Mode:', modeSelect.options[modeSelect.selectedIndex].textContent);
    return true;
  }
  function toggleAcceptEditsFromShortcut() {
    if (approvalSelect.disabled) return;
    approvalSelect.value = approvalSelect.value === 'ask' ? 'edits' : 'ask';
    approvalSelect.dispatchEvent(new Event('change'));
    announceChange('Approvals:', approvalSelect.options[approvalSelect.selectedIndex].textContent);
  }
  // The host sends its commands to the chat that last said it had focus.
  window.addEventListener('focus', () => vscode.postMessage({ type: 'chat_focused' }));
  window.addEventListener('blur', () => vscode.postMessage({ type: 'chat_blurred' }));
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
  /** A disabled Send says why: nothing typed yet, or the agent is still working. */
  function updateSendTitle(running) { sendBtn.title = sendBtn.disabled ? (running ? 'Forge is still working' : 'Type a message to send') : ''; }
  function setSendEnabled() { sendBtn.disabled = !hasDraft() || taskRunning; updateSendTitle(taskRunning); }
  function setTaskRunning(running) {
    taskRunning = running;
    sendBtn.disabled = !hasDraft() || running;
    updateSendTitle(running);
    cancelBtn.disabled = !running;
    sendBtn.hidden = running;
    cancelBtn.hidden = !running;
    approvalSelect.disabled = running;
    modeSelect.disabled = running;
    meterEl.classList.toggle('stream', running);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function appendUserMessage(text, files) {
    hideEmpty();
    // RB-9: the usage footer is per turn. Release the previous turn's bar so appendStatus makes a new one below this message.
    const previousBar = document.getElementById('status-bar');
    if (previousBar) previousBar.removeAttribute('id');
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
    streamingEl.innerHTML = '<div class="label"><span class="who">forge</span></div><div class="body"><span class="cursor"></span></div>';
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

  /** The tokens-per-second badge on the label of the latest reply; a second one replaces the first. */
  function setReplySpeed(tps, title) {
    const labels = messagesEl.querySelectorAll('.msg.assistant .label');
    const label = labels[labels.length - 1];
    if (!label) return;
    const old = label.querySelector('.speed');
    if (old) old.remove();
    const sp = document.createElement('span'); sp.className = 'speed'; sp.title = title;
    const num = document.createElement('span'); num.textContent = String(tps);
    const unit = document.createElement('span'); unit.textContent = 'tok/s';
    sp.appendChild(num); sp.appendChild(document.createTextNode(' ')); sp.appendChild(unit);
    label.appendChild(sp);
    label.classList.add('has-speed');
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
      div.innerHTML = '<div class="label"><span class="who">forge</span></div><div class="body"></div>';
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

  /** A step is being asked again: what it streamed (text and live reasoning) is thrown away, not kept as an answer. */
  function discardPartialStep() {
    if (reasoningEl) {
      reasoningEl.remove();
      reasoningEl = null;
    }
    if (streamingEl) streamingEl.remove();
    streamingEl = null;
    streamText = '';
  }

  /** The run ended: drop an unused streaming bubble and any cursor left behind (error, Stop). */
  function cleanupStreaming() {
    // Stopped while the model was still thinking: no reasoning_done ever came, so fold the live block here.
    if (reasoningEl) {
      const rbody = reasoningEl.querySelector('.rbody');
      if (rbody && rbody.textContent.trim()) {
        reasoningEl.querySelector('summary').textContent = 'Thought';
        reasoningEl.open = false;
      } else {
        reasoningEl.remove();
      }
      reasoningEl = null;
    }
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

  /** Consecutive steps (tool calls, results, approval outcomes) share one group; anything else between them starts a new one. */
  function appendStep(el) {
    const last = messagesEl.lastElementChild;
    let group = last && last.classList.contains('steps') ? last : null;
    if (!group) { group = document.createElement('div'); group.className = 'steps'; messagesEl.appendChild(group); }
    group.appendChild(el);
    const n = group.querySelectorAll('.tool-row, .approval-log').length;
    // Count the calls that ran without asking, by reason (why-ran.ts); the header is built from parts so each translates.
    const counts = {};
    group.querySelectorAll('.tool-row').forEach((r) => { if (r.dataset.why) counts[r.dataset.why] = (counts[r.dataset.why] || 0) + 1; });
    const parts = UI ? UI.stepsHeadParts(n, counts) : (n >= 3 ? [String(n), 'steps'] : undefined);
    let head = group.querySelector('.steps-head');
    if (parts) {
      if (!head) { head = document.createElement('div'); head.className = 'steps-head'; group.insertBefore(head, group.firstChild); }
      head.textContent = '';
      parts.forEach((p, i) => {
        if (i > 0) head.appendChild(document.createTextNode(i === 2 ? ' · ' : i > 3 && i % 2 === 1 ? ', ' : ' '));
        const s = document.createElement('span'); s.textContent = p; head.appendChild(s);
      });
      head.classList.toggle('auto', !!counts.autonomous);
    }
  }

  /** The sentence saying why the row's call ran without asking (row.dataset.why), first in its body; rows are rebuilt by the result. */
  function addWhyNote(row) {
    const why = row.dataset.why;
    if (!why || !UI || !UI.WHY_ROW[why] || row.querySelector('.why')) return;
    let body = row.querySelector('.tool-body');
    if (!body) { body = document.createElement('div'); body.className = 'tool-body'; row.appendChild(body); }
    const note = document.createElement('p'); note.className = 'why'; note.textContent = UI.WHY_ROW[why];
    body.prepend(note);
  }

  function appendToolCall(id, name, args, why) {
    hideEmpty();
    toolArgs.set(id, { name, args });
    const row = document.createElement('details');
    row.className = 'tool-row run';
    row.id = 'tool-' + id;
    row.innerHTML = toolSummaryHtml('run', toolSummary(name, args)) +
      '<div class="tool-body"><pre class="args">' + escapeHtml(JSON.stringify(args, null, 2) || '') + '</pre></div>';
    if (why) row.dataset.why = why;
    addWhyNote(row);
    appendStep(row);
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
      appendStep(row);
    }
    const failed = !!isError || s.metaTone === 'err';
    row.className = 'tool-row ' + (failed ? 'err' : 'ok');
    let bodyHtml = '';
    if (s.diff) {
      bodyHtml = '<div class="diff">' + renderDiffHtml(s.diff.before, s.diff.after) + '</div>';
    } else if (result !== undefined) {
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const isLong = text.length > 2000;
      const preview = isLong ? text.slice(0, 2000) + '…' : text;
      bodyHtml = '<div class="result" data-full="' + encodeURIComponent(text) + '">' + escapeHtml(preview) + '</div>';
      if (isLong) bodyHtml += '<button class="show-more" data-expanded="false">Show more</button>';
    }
    row.innerHTML = toolSummaryHtml(failed ? 'err' : 'ok', s) + (bodyHtml ? '<div class="tool-body">' + bodyHtml + '</div>' : '');
    addWhyNote(row);
    row.open =UI.blockOpen ? UI.blockOpen(name, displayConfig, !!s.diff) : (!!s.diff || displayConfig.blockDefault === 'expanded');
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

  /** hidden, collapsed or expanded: display.blocks.reasoning, else showReasoning. */
  function reasoningModeNow() { return UI.reasoningMode ? UI.reasoningMode(displayConfig) : (displayConfig.showReasoning === false ? 'hidden' : 'collapsed'); }

  function appendReasoningDelta(text) {
    if (reasoningModeNow() === 'hidden') return;
    if (!reasoningEl) reasoningEl = newReasoning();
    const body = reasoningEl.querySelector('.rbody');
    body.textContent = (body.textContent + text).trimStart();
    autoscroll();
  }

  function finalizeReasoning(text) {
    if (reasoningModeNow() === 'hidden') return;
    if (!reasoningEl) reasoningEl = newReasoning();
    reasoningEl.querySelector('.rbody').textContent = text.trim();
    reasoningEl.querySelector('summary').textContent = 'Thought';
    reasoningEl.open = reasoningModeNow() === 'expanded';
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
        html += '<div class="l2"><span class="ik-muted">' + escapeHtml(s.branch || '') + '</span>' +
          s.actions.map((a) => '<button type="button" class="' + (a === 'merge' ? 'ik-btn ik-btn--primary' : 'ik-btn ik-btn--link') + '" data-action="' + a + '" data-index="' + s.index + '">' + (a === 'review' ? 'Review' : a === 'merge' ? 'Merge' : 'Discard') + '</button>').join('') + '</div>';
      }
      if (s.error) html += '<div class="rerr">' + escapeHtml(s.error) + '</div>';
    });
    if (v.error) html += '<div class="rerr">' + escapeHtml(v.error) + '</div>';
    if (v.canClear) html += '<div class="rf"><button type="button" class="ik-btn ik-btn--link" data-action="clear" data-index="-1">Clear finished</button></div>';
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
    div.className = 'approval-log ' + (outcome.kind === 'approved' || outcome.kind === 'partial' ? 'ok' : outcome.kind === 'denied' ? 'err' : 'ik-muted');
    // The leading ✓ / ✗ sits in the same column as the tool rows' status icons.
    const mark = text.charAt(0) === '✓' || text.charAt(0) === '✗' ? text.charAt(0) : '';
    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = mark;
    const msg = document.createElement('span');
    msg.textContent = mark ? text.slice(1).trim() : text;
    div.appendChild(st);
    div.appendChild(msg);
    appendStep(div);
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

  function appendApproval(id, name, args, destructive, previewable, allowable, preview, reviewable) {
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
    const kind = destructive ? 'Destructive' : (name === 'write_file' || name === 'edit_file' || name === 'apply_patch' ? 'File edit' : 'Request');
    const hint = destructive ? 'Hold to confirm' : 'needs you';
    const asCommand = !previewable && name === 'run_command' && !!copy.target;
    const warnIcon = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.5"/><path d="M8 12h.01"/></svg>';
    div.innerHTML =
      '<div class="kind">' + warnIcon + '<span>' + kind + '</span><span class="hint">' + hint + '</span></div>' +
      '<div class="line">' +
        '<span class="q" title="' + escapeHtml(copy.title) + '">' + escapeHtml(copy.question) + ' ' +
          (previewable
            ? '<button type="button" class="ik-btn ik-btn--link file" title="Open diff">' + escapeHtml(copy.target) + '</button>'
            : (asCommand ? '' : '<span class="target">' + escapeHtml(copy.target) + '</span>')) +
          (copy.meta ? ' <span class="meta">' + escapeHtml(copy.meta) + '</span>' : '') +
        '</span>' +
        (asCommand ? '<div class="cmd"><span class="p" aria-hidden="true">$</span><code>' + escapeHtml(copy.target) + '</code></div>' : '') +
      '</div>' +
      '<div class="bar">' +
        (asCommand ? '<button type="button" class="ik-btn ik-btn--link showcmd" aria-expanded="false">Show full command</button>' : '') +
        (previewable && reviewable !== false ? '<button type="button" class="ik-btn ik-btn--link hunks">Review changes</button>' : '') +
        (allowable ? '<button type="button" class="ik-btn ik-btn--link allow">Always allow this command</button>' : '') +
        '<span class="sp"></span>' +
        '<span class="acts">' +
          '<button type="button" class="ik-btn ik-btn--secondary deny-open" aria-expanded="false">Deny</button>' +
          (destructive
            ? '<button type="button" class="ik-btn ik-btn--primary hold" title="Press and hold to run"><span>Hold to run</span></button>'
            : '<button type="button" class="ik-btn ik-btn--primary approve">' + escapeHtml(copy.primary) + '</button>') +
        '</span>' +
      '</div>' +
      (preview ? '<pre class="preview">' + escapeHtml(preview) + '</pre>' : '') +
      '<div class="fb" hidden>' +
        '<div class="chips">' + chips.map((c) => '<button type="button" class="chip">' + escapeHtml(c) + '</button>').join('') + '</div>' +
        '<textarea class="note" rows="2" maxlength="2000" aria-label="What should Forge do instead?" placeholder="What should Forge do instead?"></textarea>' +
        '<div class="fb-actions"><button type="button" class="ik-btn ik-btn--secondary deny-note">Deny and tell Forge</button><button type="button" class="ik-btn ik-btn--link deny">Just deny</button></div>' +
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
    const primary = div.querySelector('.ik-btn--primary');
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
    const showBtn = div.querySelector('.showcmd');
    if (showBtn) showBtn.addEventListener('click', () => {
      const open = div.querySelector('.cmd').classList.toggle('open');
      showBtn.setAttribute('aria-expanded', String(open));
      showBtn.textContent = open ? 'Show less' : 'Show full command';
    });

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
      const next = messagesEl.querySelector('.approval .ik-btn--primary');
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

  function appendStatus(iteration, maxIter, inputTokens, outputTokens, durationMs, reason, turn) {
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
      (reason ? '<span>' + escapeHtml(UI ? UI.runReasonLabel(reason) : reason) + '</span>' : '');
    // The thumbs are a sibling of the bar, not inside it: the bar rewrites its own HTML on every update (RB-50).
    // Only the last status of a turn has a reason, and each turn gets its own thumbs (RB-9).
    if (reason && turn) addFeedbackBar(turn, bar);
    autoscroll();
  }

  // Todo checklist chip, goal chip and ask_user question card.
  let todoItems = [];
  function renderTodos() {
    const summary = UI ? UI.renderTodoSummary(todoItems) : '';
    const chip = document.getElementById('todo-chip');
    chip.hidden = !summary;
    document.getElementById('todo-sum').textContent = summary;
    const list = document.getElementById('todo-list');
    const bar = document.getElementById('todo-bar');
    list.textContent = '';
    bar.textContent = '';
    const svgNs = 'http://www.w3.org/2000/svg';
    // One status icon per row, built as DOM (the page script is a template literal: no backticks, RB-11).
    function rowIcon(status) {
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const ring = document.createElementNS(svgNs, 'circle');
      ring.setAttribute('cx', '8'); ring.setAttribute('cy', '8'); ring.setAttribute('r', '6');
      svg.appendChild(ring);
      if (status === 'completed') {
        svg.setAttribute('stroke', 'var(--success)'); svg.setAttribute('stroke-width', '1.75');
        const tick = document.createElementNS(svgNs, 'path');
        tick.setAttribute('d', 'm5.5 8.2 1.8 1.8 3.3-3.6');
        svg.appendChild(tick);
      } else if (status === 'in_progress') {
        svg.setAttribute('class', 'todo-spin'); svg.setAttribute('stroke', 'var(--ion)'); svg.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke', 'var(--line-subtle)');
        const arc = document.createElementNS(svgNs, 'path');
        arc.setAttribute('d', 'M8 2a6 6 0 0 1 6 6');
        svg.appendChild(arc);
      } else {
        svg.setAttribute('stroke', 'var(--line-control)'); svg.setAttribute('stroke-width', '1.5');
      }
      return svg;
    }
    let doneCount = 0;
    let doingCount = 0;
    todoItems.forEach((item) => {
      const state = item.status === 'completed' ? 'done' : item.status === 'in_progress' ? 'doing' : '';
      if (state === 'done') doneCount++;
      if (state === 'doing') doingCount++;
      const li = document.createElement('li');
      li.className = state;
      const ic = document.createElement('span');
      ic.className = 'ic';
      ic.appendChild(rowIcon(item.status));
      const tx = document.createElement('span');
      tx.className = 'tx';
      tx.textContent = item.content;
      li.appendChild(ic);
      li.appendChild(tx);
      list.appendChild(li);
      const seg = document.createElement('span');
      seg.className = state;
      bar.appendChild(seg);
    });
    chip.className = doingCount > 0 ? 's-doing' : (todoItems.length > 0 && doneCount === todoItems.length ? 's-done' : 's-idle');
    if (!summary) list.hidden = true;
  }
  document.getElementById('todo-toggle').addEventListener('click', () => {
    const list = document.getElementById('todo-list');
    list.hidden = !list.hidden;
    document.getElementById('todo-toggle').setAttribute('aria-expanded', String(!list.hidden));
  });
  let goalState = null;
  function renderGoal(goal) {
    goalState = goal || null;
    const chip = document.getElementById('goal-chip');
    chip.hidden = !goalState;
    if (!goalState) return;
    const label = { active: 'working', paused: 'paused', blocked: 'blocked', complete: 'done' }[goalState.status] || goalState.status;
    const text = document.getElementById('goal-text');
    text.textContent = 'Goal · ' + label + ' · ' + goalState.objective;
    text.title = goalState.report ? goalState.objective + '\\n' + goalState.report : goalState.objective;
    document.getElementById('goal-toggle').textContent = goalState.status === 'active' ? 'Pause' : goalState.status === 'complete' ? 'Restart' : 'Resume';
  }
  document.getElementById('goal-toggle').addEventListener('click', () => {
    if (goalState) vscode.postMessage({ type: 'goal_command', args: goalState.status === 'active' ? 'pause' : 'resume' });
  });
  document.getElementById('goal-clear').addEventListener('click', () => vscode.postMessage({ type: 'goal_command', args: 'clear' }));
  function appendQuestion(msg) {
    hideEmpty();
    const card = document.createElement('div');
    card.className = 'question'; card.id = 'q-' + msg.id; card.setAttribute('role', 'group'); card.setAttribute('aria-label', 'Question from Forge');
    const kind = document.createElement('div'); kind.className = 'qk'; kind.textContent = 'Forge asks';
    const text = document.createElement('div'); text.className = 'qt'; text.textContent = msg.question;
    card.appendChild(kind); card.appendChild(text);
    const answer = (value) => {
      vscode.postMessage({ type: 'question_answer', id: msg.id, answer: value });
      card.remove();
      const log = document.createElement('div'); log.className = 'approval-log';
      const st = document.createElement('span'); st.className = 'st'; st.textContent = '?';
      const body = document.createElement('span'); body.textContent = 'You answered: ' + (value || '(no answer)');
      log.appendChild(st); log.appendChild(body); appendStep(log);
    };
    if (msg.options && msg.options.length) {
      const opts = document.createElement('div'); opts.className = 'opts';
      msg.options.forEach((o) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ik-btn ik-btn--secondary'; b.textContent = o; b.addEventListener('click', () => answer(o)); opts.appendChild(b); });
      card.appendChild(opts);
    }
    if (msg.allowCustom) {
      const custom = document.createElement('div'); custom.className = 'custom';
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Type your own answer'; input.setAttribute('aria-label', 'Your answer');
      const send = document.createElement('button'); send.type = 'button'; send.className = 'ik-btn ik-btn--primary'; send.textContent = 'Answer';
      send.addEventListener('click', () => { if (input.value.trim()) answer(input.value.trim()); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) answer(input.value.trim()); });
      custom.appendChild(input); custom.appendChild(send); card.appendChild(custom);
    }
    messagesEl.appendChild(card);
    autoscroll(true);
  }

  function appendError(text, action) {
    const div = document.createElement('div');
    div.className = 'error-banner';
    div.setAttribute('role', 'alert');
    div.appendChild(document.createTextNode(text));
    if (action === 'openSettings') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ik-btn ik-btn--link';
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

  // Earlier prompts for the up and down arrows (newest last, from the host); any typing starts over from the draft.
  let promptItems = [];
  let histState = { index: -1, draft: '' };
  function resetHistory() { histState = { index: -1, draft: '' }; }
  function onHistoryKey(e) {
    if (!UI || !UI.historyStep || e.isComposing || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (mentionList.classList.contains('open')) return;
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    if (start !== end) return;
    const up = e.key === 'ArrowUp';
    // The caret moves inside a multi-line draft first: history takes the key only on the first line (up) or the last (down).
    const before = inputEl.value.slice(0, start);
    const after = inputEl.value.slice(end);
    if (up ? before.indexOf('\\n') !== -1 : after.indexOf('\\n') !== -1) return;
    const step = UI.historyStep(histState, up ? 'up' : 'down', promptItems, inputEl.value);
    if (!step) return;
    e.preventDefault();
    histState = { index: step.index, draft: step.draft };
    inputEl.value = step.value;
    inputEl.setSelectionRange(step.value.length, step.value.length);
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
    setSendEnabled();
  }
  inputEl.addEventListener('input', () => {
    resetHistory();
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
    setSendEnabled();
    const slashQuery = UI ? UI.slashMenuQuery(inputEl.value, inputEl.selectionStart) : undefined;
    if (slashQuery !== undefined) {
      if (!slashOpen) vscode.postMessage({ type: 'slash_list' });
      showSlashMenu(slashQuery);
      return;
    }
    if (slashOpen) hideMentions();
    scheduleMentionQuery();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (mentionList.classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionSelection(-1); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideMentions(); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = mentionList.querySelector('.mi.sel');
        if (sel && sel.dataset.slash) { e.preventDefault(); chooseSlash(sel.dataset.slash); return; }
        if (sel && sel.dataset.value) { e.preventDefault(); insertMention(sel.dataset.value); return; }
      }
    }
    onHistoryKey(e);
    if (e.key === 'Escape' && editingLast) {
      e.preventDefault();
      document.getElementById('edit-cancel').click();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (runSlashFromInput()) return;
      if (taskRunning) { enqueue(); return; }
      if (!sendBtn.disabled) sendBtn.click();
    }
  });
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!hasDraft() || taskRunning) return;
    if (runSlashFromInput()) return;
    removeSuggestCard();
    removeTurnActions();
    hideMentions();
    const fileNames = pendingFiles.map((f) => f.name);
    resetHistory();
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setSendEnabled();
    lastUserText = text;
    if (editingLast) {
      // The host redraws the conversation without the old turn, then shows this message.
      setEditing(false);
      vscode.postMessage({ type: 'retry_last', text, level: approvalSelect.value });
      return;
    }
    appendUserMessage(text, fileNames);
    vscode.postMessage({ type: 'user_input', text, level: approvalSelect.value });
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
      remove.className = 'ik-btn ik-btn--link';
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
    resetHistory();
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
    vscode.postMessage({ type: 'user_input', text, level: approvalSelect.value });
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
    retry.type = 'button'; retry.className = 'ik-btn ik-btn--link'; retry.textContent = 'Retry';
    retry.title = 'Run your last message again';
    retry.addEventListener('click', () => {
      if (taskRunning) return;
      removeTurnActions();
      vscode.postMessage({ type: 'retry_last', level: approvalSelect.value });
    });
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'ik-btn ik-btn--link'; edit.textContent = 'Edit';
    edit.title = 'Edit your last message and send it again';
    edit.addEventListener('click', () => {
      inputEl.value = lastUserText;
      inputEl.dispatchEvent(new Event('input'));
      setEditing(true);
      inputEl.focus();
    });
    // A run cut short (Stop, a step or time limit, an error after retries) can be picked up where it ended.
    const CONTINUABLE = ['aborted', 'max_iterations', 'max_duration', 'error'];
    if (CONTINUABLE.includes(lastRunReason)) {
      const cont = document.createElement('button');
      cont.type = 'button'; cont.className = 'ik-btn ik-btn--link'; cont.textContent = 'Continue';
      cont.title = lastRunReason === 'aborted' ? 'Tell the agent to carry on from where you stopped it' : 'Tell the agent to carry on from where the run ended';
      cont.addEventListener('click', () => {
        if (taskRunning) return;
        removeTurnActions();
        const text = 'Continue where you stopped.';
        lastUserText = text;
        appendUserMessage(text, []);
        vscode.postMessage({ type: 'user_input', text, level: approvalSelect.value, resume: true });
      });
      row.appendChild(cont);
    }
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
        favourites = msg.favourites || [];
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
      case 'reply_speed':
        setReplySpeed(msg.tps, msg.title);
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
        appendToolCall(msg.id, msg.name, msg.args, msg.why);
        break;
      case 'tool_result':
        appendToolResult(msg.id, msg.name, msg.result, msg.isError);
        break;
      case 'approval_request':
        appendApproval(msg.id, msg.name, msg.args, msg.destructive, msg.previewable, msg.allowable, msg.preview, msg.reviewable).then((d) => {
          if (d === '__host__') return;
          vscode.postMessage(d.note
            ? { type: 'approval_response', id: msg.id, approved: d.approved, note: d.note }
            : { type: 'approval_response', id: msg.id, approved: d.approved });
        });
        break;
      case 'slash_commands':
        slashEntries = Array.isArray(msg.entries) ? msg.entries : [];
        break;
      case 'open_model_menu':
        if (modelMenu.hidden) modelLabel.click();
        break;
      case 'cycle_mode':
        cycleModeFromShortcut();
        break;
      case 'toggle_accept_edits':
        toggleAcceptEditsFromShortcut();
        break;
      case 'open_mode_select':
        modeSelect.focus();
        if (typeof modeSelect.showPicker === 'function') { try { modeSelect.showPicker(); } catch (err) { /* needs a user gesture */ } }
        break;
      case 'todo_updated':
        todoItems = Array.isArray(msg.todos) ? msg.todos : [];
        renderTodos();
        break;
      case 'bg_agents':
        renderBgStrip(msg);
        break;
      case 'goal_state':
        renderGoal(msg.goal);
        break;
      case 'question_request':
        appendQuestion(msg);
        break;
      case 'question_closed': {
        const card = document.getElementById('q-' + msg.id);
        if (card) card.remove();
        break;
      }
      case 'prompt_history':
        promptItems = Array.isArray(msg.items) ? msg.items : [];
        resetHistory();
        break;
      case 'ui_flags':
        shiftTabVariant = msg.shiftTabVariant === true;
        break;
      case 'status':
        lastRunReason = msg.reason || null;
        appendStatus(msg.iteration, msg.maxIter, msg.inputTokens, msg.outputTokens, msg.durationMs, msg.reason, msg.turn);
        if (msg.contextWindow) meterCtx = { tokens: msg.contextTokens || 0, window: msg.contextWindow };
        meterRun = { input: msg.inputTokens || 0, output: msg.outputTokens || 0, ms: msg.durationMs || 0, iter: msg.iteration || 0, max: msg.maxIter || 0 };
        renderMeter();
        break;
      case 'cost':
        if (msg.known) { meterCost = msg.chatCostUsd; renderMeter(); }
        break;
      case 'meter_reset':
        meterCost = typeof msg.costUsd === 'number' ? msg.costUsd : null;
        meterCtx = null;
        meterRun = null;
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
      case 'approval_default':
        approvalDefault = msg.level;
        offerApprovalCard = !!msg.offerCard;
        syncApprovalCard();
        // A chat that already has messages keeps its own level; an empty one starts at the stored default.
        if (document.getElementById('empty') && !taskRunning) setApprovalLevel(msg.level);
        break;
      case 'transcript':
        closePanel();
        // New chat / resume: the host already denied the old run's approvals, so drop their rows first.
        cancelPendingApprovals();
        feedbackByTurn = msg.feedback || {}; // the ratings saved with this chat, by turn number
        // Messages queued behind the old chat's run belong to that chat: they must not start in this one.
        queued.length = 0;
        renderQueue();
        renderTranscript(msg.items);
        if (!msg.items.length) setApprovalLevel(approvalDefault);
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
            { label: 'Rename…', onClick: () => vscode.postMessage({ type: 'renameSession', id: s.id }) },
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
      case 'step_retry':
        discardPartialStep();
        appendNotice(msg.message);
        break;
      case 'enhanced':
        applyEnhanced(msg.text);
        break;
      case 'notice':
        appendNotice(msg.message);
        break;
      case 'cmd_pending':
        appendCmdCard({ pending: true });
        break;
      case 'cmd_result':
        appendCmdCard(msg);
        break;
      case 'compose_cmd':
        // Forge: Generate Terminal Command. A draft already in the box becomes the request.
        var draft = inputEl.value.replace(/^\\s+/, '');
        inputEl.value = draft.startsWith('/cmd ') ? draft : '/cmd ' + draft;
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
        break;
      case 'plan_saved':
        showPlanSaved(msg.path, msg.offer !== false);
        break;
      case 'suggest_spec':
        showSuggestSpec(msg.afterPlan);
        break;
      case 'run_changes':
        showRunChanges(msg.count);
        break;
      case 'run_reverted':
        showRunReverted(msg.count);
        break;
    }
  });

  // Shift+Tab in the chat box cycles the reasoning effort, only when the setting asks for it (the host sends the flag).
  let shiftTabVariant = false;
  inputEl.addEventListener('keydown', (e) => {
    if (shiftTabVariant && e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      vscode.postMessage({ type: 'slash_run', name: 'variant', args: '' });
    }
  });

  // Ctrl+F (Cmd+F on Mac) opens a find bar for the conversation; webview views have no find widget of their own.
  const findBar = document.getElementById('findbar');
  const findInput = document.getElementById('find-input');
  function runFind(backwards) {
    const q = findInput.value;
    if (!q) { findInput.classList.remove('nomatch'); return; }
    // window.find also matches the text typed into this very box, so ask the conversation first. It cannot select
    // text inside a closed <details> (a Thought block, tool output): open the blocks that hold the text, then find.
    const lower = q.toLowerCase();
    const present = messagesEl.textContent.toLowerCase().includes(lower);
    let found = false;
    if (present) {
      messagesEl.querySelectorAll('details:not([open])').forEach((d) => {
        if (d.textContent.toLowerCase().includes(lower)) d.open = true;
      });
      for (let i = 0; i < 20 && window.find(q, false, backwards, true, false, false, false); i++) {
        const sel = window.getSelection();
        const node = sel.anchorNode;
        const el = node && (node.nodeType === 1 ? node : node.parentElement);
        // An empty selection means the engine matched text it could not show; the box itself is not a hit.
        if (el && !findBar.contains(el) && String(sel).toLowerCase() === lower) {
          found = true;
          el.scrollIntoView({ block: 'center' });
          break;
        }
      }
    }
    findInput.classList.toggle('nomatch', !found);
  }
  function closeFind() {
    findBar.hidden = true;
    findInput.classList.remove('nomatch');
    window.getSelection().removeAllRanges();
    inputEl.focus();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      findBar.hidden = false;
      findInput.focus();
      findInput.select();
    }
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runFind(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  });
  findInput.addEventListener('input', () => findInput.classList.remove('nomatch'));
  document.getElementById('find-next').addEventListener('click', () => runFind(false));
  document.getElementById('find-prev').addEventListener('click', () => runFind(true));
  document.getElementById('find-close').addEventListener('click', closeFind);

  // Ctrl+. (Cmd+. on Mac) moves to the next mode (agent) and wraps; not while a run is going.
  document.addEventListener('keydown', (e) => {
    if (e.key === '.' && !e.shiftKey && !e.altKey && (e.ctrlKey || e.metaKey) && !modeSelect.disabled && modeSelect.options.length > 1) {
      e.preventDefault();
      modeSelect.selectedIndex = (modeSelect.selectedIndex + 1) % modeSelect.options.length;
      vscode.postMessage({ type: 'set_mode', id: modeSelect.value });
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

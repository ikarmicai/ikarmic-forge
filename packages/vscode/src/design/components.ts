/**
 * iKarmic UI components for every Forge page. Each class here is documented in docs/design-system.md and the
 * test compares the two lists, so a component cannot exist in one and not the other.
 *
 * Rules the test enforces on this file: no literal colour (only var(--token) and color-mix of tokens), no text
 * under 12px, every bordered component listed in the forced-colors block, every var(--x) defined in tokens.ts.
 * Page layout is the page's business; a page builds from these classes and does not restyle them.
 */
export const COMPONENTS_CSS = `
body.ik-root { margin: 0; font: var(--text-body); color: var(--ink-body); background: var(--bg-canvas); }
.ik-root, .ik-root * { box-sizing: border-box; }
.ik-root :focus-visible { outline: var(--border-strong) solid var(--focus-ring); outline-offset: 2px; }
.ik-root [hidden] { display: none !important; }
.ik-muted { color: var(--ink-muted); }
.ik-mono { font: var(--text-data); font-variant-numeric: tabular-nums; }
.ik-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ik-icon { width: 14px; height: 14px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

/* Button: one main action per view. Disabled buttons say why in a title. */
.ik-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs); min-height: var(--control); padding: 0 var(--pad-control); border: var(--border-hairline) solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--ink-strong); font: var(--text-label); white-space: nowrap; text-decoration: none; cursor: pointer; }
.ik-btn--primary { background: var(--ion); color: var(--on-ion); font-weight: 600; }
.ik-btn--primary:hover { background: var(--ion-hover); }
.ik-btn--primary:active { background: var(--ion-pressed); }
.ik-btn--secondary { border-color: var(--line-control); }
.ik-btn--secondary:hover, .ik-btn--ghost:hover { background: var(--bg-overlay); }
.ik-btn--danger { color: var(--danger); border-color: var(--danger); }
.ik-btn--danger:hover { background: var(--danger-tint); }
.ik-btn--link { min-height: var(--control); padding: 0; color: var(--ion-text); }
.ik-btn--link:hover { text-decoration: underline; }
.ik-btn--lg { min-height: var(--control-lg); }
.ik-btn--icon { width: var(--control); padding: 0; }
.ik-btn:disabled, .ik-btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }

/* Status: an icon and a word in a role colour. Never colour alone. */
.ik-status { display: inline-flex; align-items: center; gap: var(--space-2xs); font: var(--text-caption); font-weight: 600; white-space: nowrap; }
.ik-status .ik-icon { width: 12px; height: 12px; stroke-width: 2; }
.ik-status--run { color: var(--ion-text); }
.ik-status--ok { color: var(--success); }
.ik-status--bad { color: var(--danger); }
.ik-status--warn { color: var(--warning); }
.ik-status--off { color: var(--ink-muted); }

/* Badge: a small, non-interactive label on a tint. */
.ik-badge { display: inline-flex; align-items: center; gap: var(--space-2xs); min-height: 20px; padding: 0 var(--space-xs); border-radius: var(--radius-xs); background: var(--bg-overlay); color: var(--ink-body); font: var(--text-caption); font-weight: 500; white-space: nowrap; }
.ik-badge--ion { background: var(--ion-tint); color: var(--ion-text); }
.ik-badge--pulse { background: var(--pulse-tint); color: var(--pulse); }
.ik-badge--success { background: var(--success-tint); color: var(--success); }
.ik-badge--warning { background: var(--warning-tint); color: var(--warning); }
.ik-badge--danger { background: var(--danger-tint); color: var(--danger); }
.ik-badge--outline { background: transparent; border: var(--border-hairline) solid var(--line-subtle); color: var(--ink-muted); }

/* Fields */
.ik-field { display: flex; flex-direction: column; gap: var(--space-2xs); }
.ik-label { font: var(--text-label); color: var(--ink-strong); }
.ik-help { font: var(--text-caption); color: var(--ink-muted); }
.ik-input, .ik-textarea, .ik-select { width: 100%; min-height: var(--control); padding: 0 var(--pad-control); background: var(--bg-raised); color: var(--ink-strong); border: var(--border-hairline) solid var(--line-control); border-radius: var(--radius-sm); font: var(--text-body); }
.ik-textarea { min-height: 72px; padding-top: var(--space-xs); padding-bottom: var(--space-xs); resize: vertical; }
.ik-input--mono { font: var(--text-data); }
.ik-input::placeholder, .ik-textarea::placeholder { color: var(--ink-muted); }
.ik-input:hover, .ik-textarea:hover, .ik-select:hover { border-color: var(--ink-muted); }
.ik-root .ik-input:focus-visible, .ik-root .ik-textarea:focus-visible, .ik-root .ik-select:focus-visible { outline: none; border-color: var(--ion); box-shadow: 0 0 0 1px var(--ion), 0 0 0 4px var(--ion-tint); }
.ik-input[aria-invalid="true"], .ik-textarea[aria-invalid="true"] { border-color: var(--danger); }
.ik-input:disabled, .ik-textarea:disabled, .ik-select:disabled { color: var(--ink-disabled); background: var(--bg-overlay); cursor: not-allowed; }
.ik-combo { position: relative; min-width: 0; }
.ik-combo .ik-input { padding-right: calc(var(--control) + var(--space-xs)); }
.ik-combo__toggle { position: absolute; top: 0; right: 0; width: var(--control); height: var(--control); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink-muted); cursor: pointer; }
.ik-combo__toggle:hover { background: var(--bg-overlay); color: var(--ink-strong); }
.ik-combo__list { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + var(--space-2xs)); max-height: 280px; overflow-y: auto; padding: var(--space-2xs); background: var(--bg-overlay); border: var(--border-hairline) solid var(--line-control); border-radius: var(--radius-md); box-shadow: var(--elev-2); }
.ik-combo__list--up { top: auto; bottom: calc(100% + var(--space-2xs)); }
.ik-combo__group { padding: var(--space-xs) var(--space-xs) var(--space-2xs); color: var(--ink-muted); font: var(--text-caption); letter-spacing: 0.06em; text-transform: uppercase; }
.ik-combo__option { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-xs); min-height: var(--control); padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-sm); color: var(--ink-body); cursor: pointer; }
.ik-combo__option:hover, .ik-combo__option--active, .ik-combo__option[aria-selected="true"] { background: var(--ion-tint); color: var(--ion-text); }
.ik-combo__id { font: var(--text-data); color: var(--ink-muted); overflow-wrap: anywhere; text-align: right; }
.ik-combo__custom { border-top: var(--border-hairline) solid var(--line-subtle); margin-top: var(--space-2xs); }
.ik-check { display: inline-flex; align-items: center; gap: var(--space-xs); min-height: var(--control); cursor: pointer; }
.ik-check input { accent-color: var(--ion); margin: 0; }

/* Segmented choice: one radio per segment, native semantics. */
.ik-seg { display: inline-flex; border: var(--border-hairline) solid var(--line-control); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); }
.ik-seg label { position: relative; display: block; }
.ik-seg input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.ik-seg span { display: grid; place-items: center; min-width: var(--control); min-height: var(--control); padding: 0 var(--pad-control); font: var(--text-label); font-variant-numeric: tabular-nums; color: var(--ink-body); }
.ik-seg label + label span { border-left: var(--border-hairline) solid var(--line-control); }
.ik-seg input:checked + span { background: var(--ion-tint); color: var(--ion-text); font-weight: 600; box-shadow: inset 0 calc(-1 * var(--border-strong)) 0 var(--ion); }
.ik-seg input:disabled, .ik-seg input:disabled + span { cursor: not-allowed; }
.ik-seg input:disabled + span { color: var(--ink-disabled); }
.ik-seg input:focus-visible + span { outline: var(--border-strong) solid var(--focus-ring); outline-offset: calc(-1 * var(--border-strong)); }

/* Chip: a toggle that reads as a setting. The danger tone is for anything that turns approvals off. */
.ik-chip { display: inline-flex; align-items: center; gap: var(--space-xs); min-height: var(--control); padding: 0 var(--pad-control); border: var(--border-hairline) solid var(--line-control); border-radius: var(--radius-sm); background: var(--bg-raised); color: var(--ink-strong); font: var(--text-label); cursor: pointer; }
.ik-chip input { accent-color: var(--ion); margin: 0; }
.ik-chip:has(input:checked) { background: var(--ion-tint); border-color: var(--ion); color: var(--ion-text); }
.ik-chip--danger:has(input:checked) { background: var(--danger-tint); border-color: var(--danger); color: var(--danger); }
.ik-chip--danger input { accent-color: var(--danger); }

/* Surfaces */
.ik-card { background: var(--bg-surface); border: var(--border-hairline) solid var(--line-subtle); border-radius: var(--radius-md); box-shadow: var(--elev-1); }
.ik-card--selected { border-color: var(--ion); box-shadow: 0 0 0 var(--border-hairline) var(--ion); }
.ik-card__head { padding: var(--pad-card); }
.ik-card__body { padding: 0 var(--pad-card) var(--pad-card); }
.ik-card__foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--pad-card); border-top: var(--border-hairline) solid var(--line-subtle); background: var(--bg-sunken); border-radius: 0 0 var(--radius-md) var(--radius-md); }
.ik-inset { background: var(--bg-raised); border: var(--border-hairline) solid var(--line-subtle); border-radius: var(--radius-sm); padding: var(--space-xs) var(--space-sm); }
.ik-inset--selected { border-color: var(--ion); box-shadow: 0 0 0 var(--border-hairline) var(--ion); }
.ik-code { margin: 0; padding: var(--space-xs) var(--space-sm); background: var(--code-bg); color: var(--code-ink); border-radius: var(--radius-xs); font: var(--text-code); overflow-wrap: anywhere; white-space: pre-wrap; }

/* Note: a sentence the person must not miss. Icon, then words; the tint and edge repeat the role. */
.ik-note { display: flex; align-items: flex-start; gap: var(--space-xs); padding: var(--space-xs) var(--space-sm); border: var(--border-hairline) solid color-mix(in srgb, var(--pulse) 45%, transparent); border-radius: var(--radius-sm); background: var(--pulse-tint); color: var(--ink-body); font: var(--text-caption); line-height: 1.5; }
.ik-note .ik-icon { margin-top: 2px; }
.ik-note--warning { border-color: color-mix(in srgb, var(--warning) 45%, transparent); background: var(--warning-tint); }
.ik-note--danger { border-color: color-mix(in srgb, var(--danger) 45%, transparent); background: var(--danger-tint); }
.ik-note--success { border-color: color-mix(in srgb, var(--success) 45%, transparent); background: var(--success-tint); }

/* Progress: indeterminate while a version works. */
.ik-bar { height: 3px; border-radius: var(--radius-pill); background: var(--ion-tint); overflow: hidden; }
.ik-bar > span { display: block; width: 40%; height: 100%; border-radius: inherit; background: var(--ion); animation: ik-slide 1.4s ease-in-out infinite; }
@keyframes ik-slide { from { margin-left: -40%; } to { margin-left: 100%; } }

/* Overlays: menu, drawer, dialog, scrim. Only these float. */
.ik-menu { padding: var(--space-2xs); background: var(--bg-raised); border: var(--border-hairline) solid var(--line-subtle); border-radius: var(--radius-md); box-shadow: var(--elev-3); }
.ik-menu__item { display: flex; align-items: center; gap: var(--space-xs); width: 100%; min-height: var(--control); padding: 0 var(--pad-control); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink-body); font: var(--text-body); text-align: left; cursor: pointer; }
.ik-menu__item:hover, .ik-menu__item[aria-selected="true"] { background: var(--bg-overlay); color: var(--ink-strong); }
.ik-scrim { position: absolute; inset: 0; background: var(--scrim); }
.ik-drawer { position: absolute; top: 0; right: 0; bottom: 0; display: flex; flex-direction: column; width: min(440px, 100%); background: var(--bg-raised); border-left: var(--border-hairline) solid var(--line-subtle); box-shadow: var(--elev-3); }
.ik-dialog { background: var(--bg-raised); border: var(--border-hairline) solid var(--line-subtle); border-radius: var(--radius-lg); box-shadow: var(--elev-3); padding: var(--space-md); }

/* Navigation item: one entry of a list of sections or pages. The current one is marked by a bar and a tint. */
.ik-navitem { display: flex; align-items: center; gap: var(--space-xs); width: 100%; min-height: var(--control); padding: 0 var(--pad-control); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink-body); font: var(--text-body); text-align: left; cursor: pointer; }
.ik-navitem:hover { background: var(--bg-overlay); color: var(--ink-strong); }
.ik-navitem[aria-current="true"] { background: var(--ion-tint); color: var(--ion-text); font-weight: 600; box-shadow: inset var(--border-strong) 0 0 var(--ion); }

/* Tabs */
.ik-tabs { display: flex; gap: var(--space-xs); border-bottom: var(--border-hairline) solid var(--line-subtle); }
.ik-tabs [role="tab"] { min-height: var(--control); padding: 0 var(--pad-control); border: 0; border-bottom: var(--border-strong) solid transparent; background: transparent; color: var(--ink-muted); font: var(--text-label); cursor: pointer; }
.ik-tabs [role="tab"]:hover { color: var(--ink-strong); }
.ik-tabs [role="tab"][aria-selected="true"] { color: var(--ink-strong); border-bottom-color: var(--ion); }

@media (prefers-reduced-motion: reduce) { .ik-bar > span { animation: none; } }

@media (forced-colors: active) {
  .ik-btn, .ik-badge, .ik-input, .ik-textarea, .ik-select, .ik-seg, .ik-chip, .ik-card, .ik-inset, .ik-note, .ik-menu, .ik-combo__list, .ik-drawer, .ik-dialog, .ik-code { border: var(--border-hairline) solid ButtonText; }
  .ik-seg input:checked + span, .ik-chip:has(input:checked), .ik-inset--selected, .ik-card--selected, .ik-navitem[aria-current="true"], .ik-tabs [role="tab"][aria-selected="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; }
  .ik-root :focus-visible { outline-color: Highlight; }
}
`;

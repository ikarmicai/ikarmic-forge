/**
 * CSS shared by the chat page and the Settings page (RB-8). Tokens, role colours and the few
 * primitives both pages need live here once, so a fix cannot land in one page and miss the other.
 *
 * Colour comes from the host theme (--vscode-*). On top of that, colour is a role:
 *   --ion   the one accent: working, active, brand mark. Not a host colour, so it follows the theme class.
 *   --warn  needs you (approval, unsaved, notice). Text-safe in every theme.
 *   --err   danger: failures, destructive commands, Autonomous. Text-safe in every theme.
 *   --ok    done, connected.
 */
export const BASE_CSS = `
  :root {
    --fs-xs: 12px; --fs-s: 12px; --fs-m: 13px; --fs-l: 15px; --fs-xl: 20px; --r-s: 4px; --r-m: 6px;
    --fg: var(--vscode-foreground);
    --muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border);
    /* charts.* stay at 3:1 or better on the default light and dark editor backgrounds; testing.iconPassed is 2:1 on white. */
    --ok: var(--vscode-charts-green, #388a34);
    /* errorForeground is the text-safe red in every theme; the chart red is only 3.5:1 on the dark editor. */
    --err: var(--vscode-errorForeground, #f48771);
    /* list.warningForeground is the text-safe amber in every theme (the editor warning colour is too pale on white). */
    --warn: var(--vscode-list-warningForeground, var(--vscode-editorWarning-foreground, #cca700));
    --ion: #2ee6d6;
    /* Fill means content, edge means control. --edge is a control boundary, --hair a decorative divider. */
    --edge: var(--vscode-input-border, var(--vscode-panel-border));
    --hair: var(--vscode-panel-border);
    --chip-edge: var(--vscode-panel-border);
    --bubble: var(--vscode-input-background, var(--vscode-editor-background));
    --sunken: var(--vscode-textCodeBlock-background);
    --sel: var(--vscode-list-inactiveSelectionBackground);
    --canvas: transparent;
    /* Dark themes get depth from surface steps; light themes need shadows. */
    --elev-1: none;
    --elev-3: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .36));
  }
  /* Light: the host's own greys (input border 1.57:1, errorForeground 3.35:1 in Light Modern) are too faint for a control edge or error text on white. Values from the iKarmic light tokens. */
  body.vscode-light {
    --ion: #0a7d75;
    --err: #c42638;
    --ok: #13743f;
    --edge: #7b8794;
    --chip-edge: #7b8794;
    --hair: #e1e6eb;
    --canvas: #f5f7f9;
    --sunken: #eef1f4;
    --bubble: #eef1f4;
    --sel: #e0f5f3;
    --elev-1: 0 1px 2px color-mix(in srgb, #0b1015 6%, transparent), 0 1px 3px color-mix(in srgb, #0b1015 8%, transparent);
    --elev-3: 0 16px 40px color-mix(in srgb, #0b1015 14%, transparent), 0 4px 8px color-mix(in srgb, #0b1015 6%, transparent);
  }
  /* Dark: the host input border is 1.49:1 on the editor. #7b8794 is 4.5:1 on the editor and 3.6:1 on an input fill. */
  body.vscode-dark { --edge: #7b8794; --chip-edge: #7b8794; --ok: #3fdd8a; }
  body.vscode-high-contrast, body.vscode-high-contrast-light { --ion: var(--vscode-focusBorder, #2ee6d6); }
  * { box-sizing: border-box; }
  .muted { color: var(--muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  /* A button marked "link" is a text link, wherever it sits. Without this it turned into a filled primary button (RB-7). */
  button.link { background: none; color: var(--vscode-textLink-foreground); border: 0; padding: 0; cursor: pointer; display: inline-flex; align-items: center; min-height: 24px; }
  button.link:hover { background: none; text-decoration: underline; }
  /* One focus ring for both pages. */
  :focus-visible { outline: 2px solid var(--vscode-focusBorder, var(--vscode-textLink-foreground)); outline-offset: 1px; }
`;

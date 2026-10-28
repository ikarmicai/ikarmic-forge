/**
 * iKarmic UI tokens for every Forge page: the one place a colour, size, radius or type style is written down.
 * Components (components.ts) and pages read them only as var(--name); a literal colour or size anywhere else is a
 * defect and design-system.test.ts fails for it. The values are the iKarmic design system's own (marketing site and
 * product share one palette); the type face is the host's, so no font files ship.
 *
 * Theme: dark is the default. VS Code's light class (body.vscode-light) switches to the light set. High-contrast
 * themes keep the host's colours (they are the person's accessibility choice), mapped onto the same token names.
 */

/** Colour tokens. Every name exists in both sets: a test compares the two. */
export const DARK = {
  'bg-canvas': '#0a0d10',
  'bg-surface': '#10151a',
  'bg-raised': '#161c23',
  'bg-overlay': '#1c242d',
  'bg-sunken': '#07090b',
  'line-subtle': '#222b35',
  'line-control': '#5f6d7d',
  'ink-strong': '#eef2f6',
  'ink-body': '#c3ccd6',
  'ink-muted': '#8d98a5',
  'ink-disabled': '#55606c',
  ion: '#2ee6d6',
  'ion-hover': '#5cf0e3',
  'ion-pressed': '#1fc4b6',
  'on-ion': '#031a19',
  'ion-text': '#4ff0e2',
  'ion-tint': '#0c2a2a',
  'focus-ring': 'var(--ion)',
  pulse: '#5aa8ff',
  'pulse-tint': '#0d2038',
  success: '#3fdd8a',
  'success-tint': '#0c2a1b',
  warning: '#ffb43d',
  'warning-tint': '#2e2209',
  danger: '#ff7a84',
  'danger-tint': '#33141a',
  'code-bg': '#07090b',
  'code-ink': '#d3dde8',
  scrim: 'rgba(7, 9, 11, 0.72)',
  'elev-1': 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0, 0, 0, 0.5)',
  'elev-2': 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)',
  'elev-3': 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 24px 48px rgba(0, 0, 0, 0.6)',
} as const;

export const LIGHT: Record<keyof typeof DARK, string> = {
  'bg-canvas': '#f5f7f9',
  'bg-surface': '#ffffff',
  'bg-raised': '#ffffff',
  'bg-overlay': '#eef2f5',
  'bg-sunken': '#eef1f4',
  'line-subtle': '#e1e6eb',
  'line-control': '#7b8794',
  'ink-strong': '#0b1015',
  'ink-body': '#2f3a46',
  'ink-muted': '#566270',
  'ink-disabled': '#9aa4ae',
  ion: '#0a7d75',
  'ion-hover': '#086a63',
  'ion-pressed': '#065752',
  'on-ion': '#ffffff',
  'ion-text': '#086f68',
  'ion-tint': '#e0f5f3',
  'focus-ring': 'var(--ion)',
  pulse: '#1f5fd1',
  'pulse-tint': '#e5eefc',
  success: '#13743f',
  'success-tint': '#e3f4ea',
  warning: '#8a5300',
  'warning-tint': '#fdf0d9',
  danger: '#c42638',
  'danger-tint': '#fde6e8',
  'code-bg': '#0f1419',
  'code-ink': '#d3dde8',
  scrim: 'rgba(11, 16, 21, 0.4)',
  'elev-1': '0 1px 2px rgba(11, 16, 21, 0.06), 0 1px 3px rgba(11, 16, 21, 0.08)',
  'elev-2': '0 4px 12px rgba(11, 16, 21, 0.08), 0 2px 4px rgba(11, 16, 21, 0.06)',
  'elev-3': '0 16px 40px rgba(11, 16, 21, 0.14), 0 4px 8px rgba(11, 16, 21, 0.06)',
};

export type ColourToken = keyof typeof DARK;

/** Tokens that do not depend on the theme. Sizes in px, at or above 12 for text. */
export const SHARED = {
  'space-2xs': '4px',
  'space-xs': '8px',
  'space-sm': '12px',
  'space-md': '16px',
  'space-lg': '24px',
  'space-xl': '32px',
  'space-2xl': '48px',
  'radius-xs': '4px',
  'radius-sm': '6px',
  'radius-md': '12px',
  'radius-lg': '16px',
  'radius-pill': '999px',
  'border-hairline': '1px',
  'border-strong': '2px',
  'font-sans': 'var(--vscode-font-family, system-ui, -apple-system, "Segoe UI", sans-serif)',
  'font-mono': 'var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace)',
  'size-caption': '12px',
  'size-body': '13px',
  'size-title-sm': '15px',
  'size-page': '20px',
  'text-caption': '400 12px/16px var(--font-sans)',
  'text-body': '400 13px/20px var(--font-sans)',
  'text-label': '500 13px/20px var(--font-sans)',
  'text-title-sm': '600 15px/22px var(--font-sans)',
  'text-title': '600 18px/26px var(--font-sans)',
  'text-page': '600 20px/28px var(--font-sans)',
  'text-data': '500 12px/18px var(--font-mono)',
  'text-code': '400 12px/18px var(--font-mono)',
  'text-overline': '600 12px/16px var(--font-mono)',
} as const;

/**
 * Density: a page says which one it is on its body (data-density). The chat sidebar is compact so a conversation
 * fits; full-width pages (Agent Manager, Settings, drawers) are roomy. One token set, two scales.
 *   --control     height of a standard control and of anything a finger or pointer must hit
 *   --control-lg  the one main action of a view
 */
export const DENSITY = {
  compact: { control: '24px', 'control-lg': '32px', 'pad-control': '10px', 'pad-card': '10px', 'gap-stack': '8px', 'gap-section': '12px' },
  roomy: { control: '32px', 'control-lg': '40px', 'pad-control': '12px', 'pad-card': '16px', 'gap-stack': '12px', 'gap-section': '24px' },
} as const;

function decls(values: Readonly<Record<string, string>>): string {
  return Object.entries(values)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
}

/** High-contrast themes: the host's colours on our names, so nothing here overrides what the person chose. */
const HIGH_CONTRAST: Record<ColourToken, string> = {
  'bg-canvas': 'var(--vscode-editor-background)',
  'bg-surface': 'var(--vscode-editor-background)',
  'bg-raised': 'var(--vscode-editor-background)',
  'bg-overlay': 'var(--vscode-editor-background)',
  'bg-sunken': 'var(--vscode-editor-background)',
  'line-subtle': 'var(--vscode-contrastBorder, var(--vscode-foreground))',
  'line-control': 'var(--vscode-contrastBorder, var(--vscode-foreground))',
  'ink-strong': 'var(--vscode-foreground)',
  'ink-body': 'var(--vscode-foreground)',
  'ink-muted': 'var(--vscode-foreground)',
  'ink-disabled': 'var(--vscode-disabledForeground, var(--vscode-foreground))',
  ion: 'var(--vscode-focusBorder, var(--vscode-foreground))',
  'ion-hover': 'var(--vscode-focusBorder, var(--vscode-foreground))',
  'ion-pressed': 'var(--vscode-focusBorder, var(--vscode-foreground))',
  'on-ion': 'var(--vscode-editor-background)',
  'ion-text': 'var(--vscode-textLink-foreground, var(--vscode-foreground))',
  'ion-tint': 'transparent',
  'focus-ring': 'var(--vscode-focusBorder, var(--vscode-foreground))',
  pulse: 'var(--vscode-textLink-foreground, var(--vscode-foreground))',
  'pulse-tint': 'transparent',
  success: 'var(--vscode-foreground)',
  'success-tint': 'transparent',
  warning: 'var(--vscode-foreground)',
  'warning-tint': 'transparent',
  danger: 'var(--vscode-errorForeground, var(--vscode-foreground))',
  'danger-tint': 'transparent',
  'code-bg': 'var(--vscode-editor-background)',
  'code-ink': 'var(--vscode-foreground)',
  scrim: 'transparent',
  'elev-1': 'none',
  'elev-2': 'none',
  'elev-3': 'none',
};

/** The token declarations for every theme, density and the shared set. */
export const TOKENS_CSS = `
:root, body.vscode-dark { ${decls(DARK)} }
body.vscode-light { ${decls(LIGHT)} }
body.vscode-high-contrast, body.vscode-high-contrast-light { ${decls(HIGH_CONTRAST)} }
:root { ${decls(SHARED)} ${decls(DENSITY.roomy)} }
body[data-density="compact"] { ${decls(DENSITY.compact)} }
body[data-density="roomy"] { ${decls(DENSITY.roomy)} }
`;

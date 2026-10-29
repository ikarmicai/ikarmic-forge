# iKarmic UI: the design system for Forge

One look for every page Forge draws: the chat, Settings, the Agent Manager and anything added later. It is the iKarmic palette on the editor's own type face, with two densities. The code is `packages/vscode/src/design/` (`tokens.ts`, `components.ts`); this file is its spec, and `packages/vscode/tests/design-system.test.ts` fails when the two disagree or a rule below is broken.

**Where it applies.** Web pages in VS Code (chat, Settings, Agent Manager). Native editor UI (status bar items, tree views, quick picks, dialogs) is drawn by VS Code and takes the editor's theme: follow the words rules (DS-14), nothing else here applies. The terminal app has its own palette notes in its source.

## Rules

Each rule is a promise a reviewer can check. The mechanical ones are checked by the test.

- **DS-1 Tokens only.** A page and a component read colour, size, radius, space, shadow and type only through `var(--name)`. No literal `#hex`, `rgb()`, `hsl()` or pixel size for those anywhere outside `tokens.ts`. *Checked.*
- **DS-2 Components, not restyles.** A page builds from the `ik-` classes below and does not restyle them. Layout (grid, flex, width) is the page's; look is the system's. A need the system does not meet becomes a new component here, with a section in this file, before it is used. *Checked: every class is documented and every documented class exists.*
- **DS-3 Never colour alone.** A state is an icon and a word (`ik-status`, `ik-badge`, `ik-note`). The colour repeats the role; it never carries it. Colours that must be told apart also differ in lightness.
- **DS-4 One main action.** A view has one `ik-btn--primary`, at most (a task card counts as a view). Alternatives are `ik-btn--secondary`, repeated or minor actions `ik-btn--link` or `ik-btn--ghost`. A destructive action is `ik-btn--danger` or a danger link and is never next to the primary without a gap of its own.
- **DS-5 Size floors.** No text under 12px (`text-caption` is 12px). A control is at least `--control` high, 24px even in compact density. *Checked for text; controls by tokens.*
- **DS-6 Density is declared.** A page sets `data-density` on its body: `compact` for the narrow chat sidebar, `roomy` for full-width pages and drawers. Components read `--control`, `--control-lg`, `--pad-control`, `--pad-card` and the gaps; a page never hard-codes a size to fake a density.
- **DS-7 Radius by role.** `radius-xs` badges and code, `radius-sm` controls, `radius-md` cards and menus, `radius-lg` dialogs, `radius-pill` progress. No other radius.
- **DS-8 Only overlays float.** Cards sit at `elev-1`; menus, drawers and dialogs at `elev-3`. Nothing else has a shadow. In dark mode depth is surface steps (`bg-canvas`, `bg-surface`, `bg-raised`, `bg-overlay`), in light mode shadow.
- **DS-9 Edges.** `line-control` is the edge of a control (3:1 or better on every surface it sits on); `line-subtle` is a divider or the edge of content and is decorative. Fill means content, edge means control.
- **DS-10 Focus.** A 2px `focus-ring` outline with a 2px offset on every interactive element, never removed; fields swap the outline for an `ion` border with a halo.
- **DS-11 Contrast.** Body and muted text are 4.5:1 or better on every surface in both themes; control edges 3:1; labels on fills use the `on-` token. High-contrast themes keep the editor's colours (tokens map onto them) and forced colours keep borders and mark the selected item with `Highlight`. *Checked.*
- **DS-12 Motion.** Only `ik-bar` moves, and not under reduced motion.
- **DS-13 Icons.** 14px (12px inside a status or badge), 1.5px stroke, round caps, `currentColor`, drawn inline as SVG. No emoji, no text glyphs (check marks, arrows) used as icons.
- **DS-14 Words.** Sentence case. A button is a verb and an object, four words at most ("Merge into main"). A number carries its unit. No snake_case, camelCase or kebab-case in anything a person reads (see `CLAUDE.md`: words, not identifiers).

## Themes

Dark is the default; `body.vscode-light` switches to the light set; `body.vscode-high-contrast` and `body.vscode-high-contrast-light` keep the host's colours. Both sets define the same names.

| token | role |
| --- | --- |
| `bg-canvas` | the page |
| `bg-surface` | a card or panel on the page |
| `bg-raised` | inputs, menus, drawers and anything lifted off a surface |
| `bg-overlay` | hover fill |
| `bg-sunken` | a well: a card footer, a code or stat area |
| `line-subtle` | divider and content edge, decorative |
| `line-control` | edge of a control |
| `ink-strong` | headings, values, labels |
| `ink-body` | body text |
| `ink-muted` | help, captions, metadata |
| `ink-disabled` | disabled text, never information |
| `ion` | the brand and the one accent: primary button, selection, working |
| `ion-hover` | primary hover |
| `ion-pressed` | primary pressed |
| `on-ion` | text on an `ion` fill |
| `ion-text` | links and accent text on a surface |
| `ion-tint` | selected or working ground |
| `focus-ring` | the focus outline |
| `pulse` | information |
| `pulse-tint` | information ground |
| `success` | done |
| `success-tint` | done ground |
| `warning` | needs you |
| `warning-tint` | needs-you ground |
| `danger` | failed, destructive, approvals off |
| `danger-tint` | danger ground |
| `code-bg` | code ground, dark in both themes |
| `code-ink` | code text |
| `scrim` | the dimming behind a drawer or dialog |
| `elev-1` | card shadow |
| `elev-2` | raised hover |
| `elev-3` | overlay shadow |

## Shared tokens

Space: `space-2xs` 4, `space-xs` 8, `space-sm` 12, `space-md` 16, `space-lg` 24, `space-xl` 32, `space-2xl` 48. Radius: `radius-xs` 4, `radius-sm` 6, `radius-md` 12, `radius-lg` 16, `radius-pill`. Border: `border-hairline` 1, `border-strong` 2. Type sizes: `size-caption` 12, `size-body` 13, `size-title-sm` 15, `size-page` 20. Type, on the editor's own faces (`font-sans`, `font-mono`): `text-caption` 12, `text-body` 13, `text-label` 13 medium, `text-title-sm` 15, `text-title` 18, `text-page` 20, `text-data` 12 mono for numbers, `text-code` 12 mono, `text-overline` 12 mono capitals.

## Density

| | `compact` | `roomy` |
| --- | --- | --- |
| `--control` (every control) | 24 | 32 |
| `--control-lg` (the main action) | 32 | 40 |
| `--pad-control` | 10 | 12 |
| `--pad-card` | 10 | 16 |
| `--gap-stack` | 8 | 12 |
| `--gap-section` | 12 | 24 |

## Components

Build with the classes; the page chooses the element (`button`, `a`, `label`) that is honest for what it does.

- **Page.** `ik-root` on the body, with `data-density`. `ik-muted`, `ik-mono`, `ik-sr-only` (text for screen readers only) and `ik-icon` are the small helpers. `hidden` always hides, whatever display a class sets.
- **Button.** `ik-btn` plus one of `ik-btn--primary`, `ik-btn--secondary`, `ik-btn--ghost`, `ik-btn--danger`, `ik-btn--link`. Add `ik-btn--lg` for the one main action in a roomy view, `ik-btn--icon` for a square icon button (it needs an `aria-label`). A disabled button says why in its title.
- **Status.** `ik-status` with `ik-status--run`, `ik-status--ok`, `ik-status--bad`, `ik-status--warn` or `ik-status--off`: an icon and a word.
- **Badge.** `ik-badge` with an optional tone: `ik-badge--ion`, `ik-badge--pulse`, `ik-badge--success`, `ik-badge--warning`, `ik-badge--danger` or `ik-badge--outline`. Not clickable.
- **Fields.** `ik-field` holds `ik-label`, a control (`ik-input`, `ik-textarea`, `ik-select`) and `ik-help`. `ik-input--mono` sets an input in the editor's monospace face (ids, paths, commands). An invalid control sets `aria-invalid`. `ik-check` wraps a native checkbox or radio and its text.
- **Combo box.** `ik-combo` wraps an `ik-input` and a `ik-combo__toggle` button that shows the list; `ik-combo__list` is the listbox below it, holding `ik-combo__group` headings and `ik-combo__option` rows, each with its readable label and, right-aligned, the stored value in `ik-combo__id`. `ik-combo__list--up` opens the list above the field when there is no room below, `ik-combo__option--active` marks the row the arrow keys are on, and `ik-combo__custom` marks the last row, "Use what I typed". Use it where a list of suggestions helps but any typed value must stay valid (model ids, aliases, regions). It follows the ARIA combobox pattern: arrow keys move, Enter picks, Escape closes. A closed list of values with no free text is an `ik-select`.
- **Segmented choice.** `ik-seg` holds one `label` per segment with a radio and a `span`. Use it for two to five short choices (versions 1 to 4; Ask, Allow, Block). A segment that cannot be chosen is `disabled`.
- **Chip.** `ik-chip` wraps a checkbox as a setting that is on or off; `ik-chip--danger` is for anything that turns approvals off.
- **Card.** `ik-card` with `ik-card__head`, `ik-card__body`, `ik-card__foot`; `ik-card--selected` marks the chosen one. `ik-inset` (and `ik-inset--selected`) is a box inside a card, such as one version of a task. `ik-code` is a block of code or a command.
- **Note.** `ik-note` is information, `ik-note--warning` needs you, `ik-note--danger` is a failure or a risk, `ik-note--success` is something that worked. An icon first, then a sentence.
- **Progress.** `ik-bar` holds one `span`; it is indeterminate and carries `role="progressbar"` with a label.
- **Overlays.** `ik-menu` with `ik-menu__item`, `ik-drawer` (right edge, 440px) and `ik-dialog` sit over `ik-scrim`. A drawer or dialog traps focus, closes on Escape and returns focus to what opened it.
- **Navigation.** `ik-navitem` is one entry of a list of sections or pages; the current one carries `aria-current="true"`.
- **Tabs.** `ik-tabs` with `role="tab"` buttons, following the ARIA tab pattern (arrow keys, `aria-selected`, roving tab index).

## Adding to the system

1. Add the tokens, if any, to `tokens.ts`; add the component to `components.ts` using tokens only and a forced-colors entry if it has a border.
2. Describe it here under Components, using its class names in backticks.
3. Run `design-system.test.ts`. It fails until code and this file agree.

## Moving a page onto it

A page moves in one change: its CSS drops the old token names and ad-hoc classes, uses `DESIGN_CSS` and `ik-` components, sets `data-density`, and is added to `MIGRATED_PAGES` in `design-system.test.ts`, after which the page-level rules (no literal colour or size, no text under 12px, only documented classes) apply to it.

| page | density | state |
| --- | --- | --- |
| Agent Manager | roomy | moved |
| Settings | roomy | moved |
| Chat | compact | moved |

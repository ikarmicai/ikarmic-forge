import { COMPONENTS_CSS } from './components.js';
import { TOKENS_CSS } from './tokens.js';

export { COMPONENTS_CSS } from './components.js';
export { DARK, DENSITY, LIGHT, SHARED, TOKENS_CSS } from './tokens.js';
export type { ColourToken } from './tokens.js';

/** Everything a page needs from the design system, in the order it must appear: tokens, then components. */
export const DESIGN_CSS = `${TOKENS_CSS}${COMPONENTS_CSS}`;

/** A page says which density it is on its body: <body class="ik-root" data-density="compact">. */
export type Density = 'compact' | 'roomy';

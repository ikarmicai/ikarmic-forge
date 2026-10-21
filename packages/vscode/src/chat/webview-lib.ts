/**
 * Entry point for the chat webview's pure helpers, bundled by esbuild as an
 * IIFE that sets `window.ForgeUI`. The inline script in html.ts calls these
 * and falls back to plain text when the bundle failed to load.
 */
export { renderMarkdown } from './markdown.js';
export { shouldApplyEnhanced } from './enhance-apply.js';
export { approvalCopy, approvalLogText, isProgressResult, summarizeTool } from './tool-summary.js';

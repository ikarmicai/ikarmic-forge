// Bundles the extension into a single dist/extension.js using esbuild.
// Run `node esbuild.config.mjs --watch` for incremental dev builds.
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: [
    // Native bindings (none for now, but keep the door open)
    '@parcel/watcher',
    'fsevents',
    // chokidar (a @ikarmic/forge-core dependency used only by its
    // CLI-only watchFilesystem() — the extension uses VS Code's own
    // native FileSystemWatcher instead) and its one dependency.
    // Bundling core's dist means esbuild would otherwise try to
    // pull these in even though this extension never calls into them.
    'chokidar',
    'readdirp',
    // VS Code's own modules are provided by the host
    'vscode',
  ],
  resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
  logLevel: 'info',
  // core's parser.ts guards `import.meta` with `typeof require` (see getRequire), so the warning is noise.
  logOverride: { 'empty-import-meta': 'silent' },
  metafile: false,
};

/**
 * The chat webview needs `voice-input.ts` as a browser-loadable script —
 * it's a pure module (no DOM imports) so we can bundle it as an IIFE that
 * exposes `window.VoiceInput` to the inline chat script. This is a
 * separate esbuild build so it can target the browser independently of
 * the extension host bundle above.
 */
const voiceConfig = {
  entryPoints: ['src/chat/voice-input.ts', 'src/chat/voice-types.ts'],
  bundle: true,
  outdir: 'dist/webview',
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  sourcemap: true,
  logLevel: 'info',
};

/** Pure chat-webview helpers (markdown, tool summaries), exposed to the inline chat script as `window.ForgeUI`. */
const webviewLibConfig = {
  entryPoints: { 'forge-ui': 'src/chat/webview-lib.ts' },
  bundle: true,
  outdir: 'dist/webview',
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  globalName: 'ForgeUI',
  sourcemap: true,
  logLevel: 'info',
};

/** Pure Settings-page helpers (draft, save messages, search), exposed as `window.ForgeSettings`. */
const settingsLibConfig = {
  ...webviewLibConfig,
  entryPoints: { 'settings-ui': 'src/settings/settings-lib.ts' },
  globalName: 'ForgeSettings',
};

/**
 * Mermaid's own browser build (it sets `window.mermaid`), copied as is. The chat loads it
 * only when a reply contains a ```mermaid block, so most chats never pay for its 3.5 MB.
 */
function copyMermaid() {
  mkdirSync('dist/webview', { recursive: true });
  copyFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'dist/webview/mermaid.js');
}

if (watch) {
  copyMermaid();
  const ctx = await context(config);
  const voiceCtx = await context(voiceConfig);
  const webviewLibCtx = await context(webviewLibConfig);
  const settingsLibCtx = await context(settingsLibConfig);
  await Promise.all([ctx.watch(), voiceCtx.watch(), webviewLibCtx.watch(), settingsLibCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    build(config),
    build(voiceConfig),
    build(webviewLibConfig),
    build(settingsLibConfig),
  ]);
  copyMermaid();
  console.log('Build complete: dist/extension.js + dist/webview/{voice-input,forge-ui,settings-ui,mermaid}.js');
}

import { defineConfig } from 'vitest/config';

// `test/e2e` and its compiled `out/` are mocha suites that need a real VS Code
// host (`pnpm test:e2e`); `test/ui` is Playwright (`pnpm test:ui`). vitest must not collect them.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'test/e2e/**', 'test/ui/**', 'out/**', '.vscode-test/**'],
  },
});

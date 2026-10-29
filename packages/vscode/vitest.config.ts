import { defineConfig } from 'vitest/config';

// `test/e2e` and its compiled `out/` are mocha suites that need a real VS Code
// host (`pnpm test:e2e`); `test/ui` is Playwright (`pnpm test:ui`). vitest must not collect them.
export default defineConfig({
  test: {
    // The CI Windows runner needs over 5 s for a test that builds a git repository and pushes (manager-push); core's config says the same.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    exclude: ['**/node_modules/**', '**/dist/**', 'test/e2e/**', 'test/ui/**', 'out/**', '.vscode-test/**'],
  },
});

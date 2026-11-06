import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Settings, Git and quality (2026-11-06): "Include editor problems in checks" is on by default. It runs the file's
// language server in a trusted workspace, and says "Not checked" when none is installed rather than "Checks passed".
// The manifest default and the code's fallback must agree.
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;
const config = readFileSync(path.join(root, 'src', 'config.ts'), 'utf8');

describe('quality checks on by default', () => {
  // Kept off: the bundled tree-sitter grammar reports valid TypeScript (import('x').Type) and JSX text with "&" as
  // syntax errors, 6 of 557 known-good files on 2026-11-06, and the model would "fix" valid code (RB-164).
  it('does not check files after writing until the grammar stops flagging valid code', () => {
    expect(props['forge.autoLint.enabled'].default).toBe(false);
    expect(config).toContain("enabled: cfg.get<boolean>('autoLint.enabled') ?? false,");
  });

  it('includes editor problems in checks', () => {
    expect(props['forge.verify.lsp'].default).toBe(true);
    expect(config).toContain("verifyLsp: cfg.get<boolean>('verify.lsp') ?? true,");
  });

  // A language server can run the project's own code (typescript-language-server prefers the workspace's TypeScript),
  // so, like the project's own checks, it runs only in a trusted workspace (RB-41, RB-112).
  it('runs the language-server check only in a trusted workspace', () => {
    const view = readFileSync(path.join(root, 'src', 'chat', 'chat-view.ts'), 'utf8');
    expect(view).toContain('buildRunExtras({ ...cfg, verifyCommands: plan.commands, verifyLsp: cfg.verifyLsp && trustedForChecks }');
  });

  it('leaves commits and the project\'s own commands to the person', () => {
    expect(props['forge.autoCommit.enabled'].default).toBe(false);
    expect(props['forge.autoCommit.runHooks'].default).toBe(false);
    expect(props['forge.verify.auto'].default).toBe('ask');
  });
});

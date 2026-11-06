import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The browser tools are on by default: without them, a model that wants to look at the page it built starts
// chrome.exe from the shell by its full path, and Autonomous asks to confirm every one of those commands
// (found in the live "Build a CRM" run, 2026-11-06). The setting's default and the code's fallback must agree.
const root = path.resolve(__dirname, '..');

describe('forge.browser.enabled default', () => {
  it('is true in the extension manifest', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.contributes.configuration.properties['forge.browser.enabled'].default).toBe(true);
  });

  it('is true where the settings are read, when VS Code gives no value', () => {
    const src = readFileSync(path.join(root, 'src', 'config.ts'), 'utf8');
    expect(src).toContain("enabled: cfg.get<boolean>('browser.enabled') ?? true,");
  });
});

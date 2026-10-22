import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_TOOLS } from '@ikarmic/forge-core';
import { ConfigWizard } from '../src/commands/config.js';

// The permissions step's "Done" branch calls the real saveToolSandboxConfig
// (it's not injected via props like loadForgeConfigFile/saveForgeConfigFile
// are), which would otherwise write to the developer's real
// ~/.forge/settings.json — and collide with core's loadHooksConfig test
// that asserts that file doesn't exist. Stub just that one export.
vi.mock('@ikarmic/forge-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ikarmic/forge-core')>();
  return { ...actual, saveToolSandboxConfig: vi.fn().mockResolvedValue(undefined) };
});

/**
 * Wait until `done()` is true. A fixed sleep between keystrokes made this file flaky on slow Windows runners: a key could
 * arrive before the next step had rendered. Waiting for the screen to change does not depend on how slow the machine is.
 */
async function until(done: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Send one key and wait for the wizard to redraw. Ink subscribes to input in an effect, so a key sent right after a step
 * first draws can be dropped; a dropped key changes nothing on screen, so it is sent again after a second. A key that was
 * handled always redraws (the cursor moves or the next step shows), so it is never sent twice.
 */
async function press(lastFrame: () => string | undefined, stdin: { write(data: string): void }, key: string): Promise<void> {
  const before = lastFrame();
  for (let attempt = 0; attempt < 5; attempt++) {
    stdin.write(key);
    const until1s = Date.now() + 1000;
    while (lastFrame() === before && Date.now() < until1s) await new Promise((resolve) => setTimeout(resolve, 10));
    if (lastFrame() !== before) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return;
    }
  }
  throw new Error(`the screen did not change after ${JSON.stringify(key)}`);
}

vi.setConfig({ testTimeout: 30_000 });

describe('ConfigWizard', () => {
  it('renders the provider selection step first', () => {
    const { lastFrame } = render(
      <ConfigWizard
        loadForgeConfigFile={vi.fn().mockResolvedValue({ config: {}, warnings: [] })}
        saveForgeConfigFile={vi.fn()}
        credentialStore={{ get: vi.fn(), set: vi.fn(), delete: vi.fn() }}
        onExit={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('Provider');
  });

  it('advances from model selection to the reasoning-effort step, then the API key step', async () => {
    const { lastFrame, stdin } = render(
      <ConfigWizard
        loadForgeConfigFile={vi.fn().mockResolvedValue({ config: {}, warnings: [] })}
        saveForgeConfigFile={vi.fn().mockResolvedValue(undefined)}
        credentialStore={{ get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn() }}
        onExit={vi.fn()}
      />
    );
    await until(() => (lastFrame() ?? '').includes('Provider'), 'the provider step');
    await press(lastFrame, stdin, '\r'); // select first provider
    await press(lastFrame, stdin, '\r'); // select first model
    expect(lastFrame()).toContain('Reasoning effort');
    await press(lastFrame, stdin, '\r'); // select first reasoning-effort option ("(provider default)")
    expect(lastFrame()).toContain('API key');
  });

  it('agents step advances to a permissions step before export/import', async () => {
    const { lastFrame, stdin } = render(
      <ConfigWizard
        loadForgeConfigFile={vi.fn().mockResolvedValue({ config: {}, warnings: [] })}
        saveForgeConfigFile={vi.fn().mockResolvedValue(undefined)}
        credentialStore={{ get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn() }}
        onExit={vi.fn()}
      />
    );
    await until(() => (lastFrame() ?? '').includes('Provider'), 'the provider step');
    await press(lastFrame, stdin, '\r'); // provider
    await press(lastFrame, stdin, '\r'); // model
    await press(lastFrame, stdin, '\r'); // reasoning effort
    await press(lastFrame, stdin, '\r'); // skip API key (empty submit)
    await press(lastFrame, stdin, '\r'); // agents: "Save and continue" (first item)
    expect(lastFrame()).toContain('Permissions');
  });

  it('permissions step advances to a display step before export/import', async () => {
    const { lastFrame, stdin } = render(
      <ConfigWizard
        loadForgeConfigFile={vi.fn().mockResolvedValue({ config: {}, warnings: [] })}
        saveForgeConfigFile={vi.fn().mockResolvedValue(undefined)}
        credentialStore={{ get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), delete: vi.fn() }}
        onExit={vi.fn()}
      />
    );
    await until(() => (lastFrame() ?? '').includes('Provider'), 'the provider step');
    await press(lastFrame, stdin, '\r'); // provider
    await press(lastFrame, stdin, '\r'); // model
    await press(lastFrame, stdin, '\r'); // reasoning effort
    await press(lastFrame, stdin, '\r'); // skip API key
    await press(lastFrame, stdin, '\r'); // agents: save and continue
    // Land on permissions; move down past every built-in tool to "Done" and select it without denying anything.
    for (let i = 0; i < BUILTIN_TOOLS.length; i++) {
      await press(lastFrame, stdin, '\u001B[B');
    }
    await press(lastFrame, stdin, '\r');
    expect(lastFrame()).toContain('Display');
  });
});

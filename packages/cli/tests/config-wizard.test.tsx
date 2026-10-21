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

/** Lets pending microtasks from an async onSelect handler flush before the next input. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

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
    await tick();
    stdin.write('\r'); // select first provider
    await tick();
    stdin.write('\r'); // select first model
    await tick();
    expect(lastFrame()).toContain('Reasoning effort');
    stdin.write('\r'); // select first reasoning-effort option ("(provider default)")
    await tick();
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
    await tick();
    stdin.write('\r'); // provider
    await tick();
    stdin.write('\r'); // model
    await tick();
    stdin.write('\r'); // reasoning effort
    await tick();
    stdin.write('\r'); // skip API key (empty submit)
    await tick();
    stdin.write('\r'); // agents: "Save and continue" (first item)
    await tick();
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
    await tick();
    stdin.write('\r'); // provider
    await tick();
    stdin.write('\r'); // model
    await tick();
    stdin.write('\r'); // reasoning effort
    await tick();
    stdin.write('\r'); // skip API key
    await tick();
    stdin.write('\r'); // agents: save and continue
    await tick();
    // Land on permissions; move down past every built-in tool to "Done" and select it without denying anything.
    for (let i = 0; i < BUILTIN_TOOLS.length; i++) {
      stdin.write('\u001B[B');
      await tick();
    }
    stdin.write('\r');
    await tick();
    expect(lastFrame()).toContain('Display');
  });
});

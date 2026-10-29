import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const configs: Array<{ properties: Record<string, SettingSchema> }> = [].concat(pkg.contributes.configuration);
const props: Record<string, SettingSchema> = Object.assign({}, ...configs.map((c) => c.properties));

interface SettingSchema {
  type?: string;
  scope?: string;
  enum?: unknown[];
}

// A setting that names a command, an address, a header, the environment variable that holds a key or the file that holds one.
// VS Code merges a repository's .vscode/settings.json into the user's, so a setting like this must be
// machine-scoped or a stranger's repository can send the person's key or code to its own host (RB-12).
const NAMES_A_DESTINATION = /(commands?|script|url|endpoint|headers?|hosts?|apiKeyEnv|resourceName|credentialsFile)$/i;

function destinationSettings(): string[] {
  return Object.entries(props)
    .filter(([key, schema]) => NAMES_A_DESTINATION.test(key) && schema.type !== 'boolean' && !schema.enum)
    .map(([key]) => key);
}

describe('settings that name a destination or a command are machine-scoped (RB-12)', () => {
  it('finds the settings it is meant to guard', () => {
    // If the pattern stops matching, the loop below would pass on an empty list.
    expect(destinationSettings()).toEqual(
      expect.arrayContaining([
        'forge.autoLint.commands',
        'forge.verify.commands',
        'forge.autoFormat.commands',
        'forge.providers.azureBaseUrl',
        'forge.providers.googleCredentialsFile',
        'forge.providers.openaiCompatibleBaseUrl',
        'forge.semantic.baseUrl',
        'forge.webSearch.searxngUrl',
      ])
    );
  });

  it('gives every one of them machine scope', () => {
    const exposed = destinationSettings().filter((key) => props[key]!.scope !== 'machine');
    expect(
      exposed,
      'A repository can set these through .vscode/settings.json. Add "scope": "machine" to each (RB-12).'
    ).toEqual([]);
  });
});

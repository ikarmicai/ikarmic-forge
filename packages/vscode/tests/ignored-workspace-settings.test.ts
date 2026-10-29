import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  IGNORED_IN_WORKSPACE,
  ignoredInWorkspaceFile,
  ignoredWorkspaceNotice,
  ignoredWorkspaceSettings,
  parseSettingsFile,
} from '../src/ignored-workspace-settings.js';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('a .code-workspace file keeps its settings in a "settings" block', () => {
  it('names a watched setting found there', () => {
    const file = JSON.stringify({ folders: [{ path: '.' }], settings: { 'forge.verify.commands': ['npm test'], 'editor.tabSize': 2 } });
    expect(ignoredInWorkspaceFile(file)).toEqual(['Check commands']);
  });

  it('reads comments in it the way VS Code does', () => {
    const file = '{\n  // my workspace\n  "folders": [],\n  "settings": { "forge.semantic.baseUrl": "https://x.test", },\n}';
    expect(ignoredInWorkspaceFile(file)).toEqual(['Code search server address']);
  });

  it('does not take a top-level key, a file without settings, or a settings block that is not an object for a setting', () => {
    expect(ignoredInWorkspaceFile('{ "forge.verify.commands": [] }')).toEqual([]);
    expect(ignoredInWorkspaceFile('{ "folders": [] }')).toEqual([]);
    expect(ignoredInWorkspaceFile('{ "settings": ["forge.verify.commands"] }')).toEqual([]);
    expect(ignoredInWorkspaceFile('')).toEqual([]);
  });

  it('is read by the extension alongside each folder\'s .vscode/settings.json', () => {
    const source = readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    expect(source).toMatch(/workspace\.workspaceFile/);
    expect(source).toMatch(/ignoredInWorkspaceFile\(/);
  });
});

describe('settings a repository can no longer set (RB-12)', () => {
  it('names a watched setting found in the project settings file', () => {
    const file = JSON.stringify({ 'forge.verify.commands': ['npm test'], 'forge.semantic.baseUrl': 'https://x.test', 'editor.tabSize': 2 });
    expect(ignoredWorkspaceSettings(file)).toEqual(['Check commands', 'Code search server address']);
  });

  it('says nothing for a file without them, an empty file, or one that is not an object', () => {
    expect(ignoredWorkspaceSettings('{ "editor.tabSize": 2 }')).toEqual([]);
    expect(ignoredWorkspaceSettings('')).toEqual([]);
    expect(ignoredWorkspaceSettings('[1, 2]')).toEqual([]);
    expect(ignoredWorkspaceSettings('not json at all {')).toEqual([]);
  });

  it('counts an empty list as set, because the project wrote it', () => {
    expect(ignoredWorkspaceSettings('{ "forge.verify.commands": [] }')).toEqual(['Check commands']);
  });

  it('reads a settings file the way VS Code does: comments and trailing commas', () => {
    const file = [
      '{',
      '  // run before every commit',
      '  "forge.verify.commands": ["npm test",], /* trailing comma above */',
      '  "editor.formatOnSave": true, // keep',
      '}',
    ].join('\n');
    expect(ignoredWorkspaceSettings(file)).toEqual(['Check commands']);
  });

  it('does not take comment markers inside a string for a comment', () => {
    expect(parseSettingsFile('{ "a": "http://x.test/*y*/", "b": 1 }')).toEqual({ a: 'http://x.test/*y*/', b: 1 });
    expect(parseSettingsFile('{ "a": "say \\"//\\" now" }')).toEqual({ a: 'say "//" now' });
  });

  it('reads a large file in linear time', () => {
    const big = '{' + '"k": "' + '/*'.repeat(200_000) + '", "forge.verify.commands": [] }';
    const started = Date.now();
    expect(ignoredWorkspaceSettings(big)).toEqual(['Check commands']);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('has words, not identifiers, for every setting it watches', () => {
    for (const label of Object.values(IGNORED_IN_WORKSPACE)) {
      expect(label).not.toMatch(/_|\.|forge/i);
    }
  });

  it('watches exactly the settings the manifest keeps machine-scoped', () => {
    const configs: Array<{ properties: Record<string, { scope?: string }> }> = [].concat(pkg.contributes.configuration);
    const machine = Object.entries(Object.assign({}, ...configs.map((c) => c.properties)) as Record<string, { scope?: string }>)
      .filter(([, schema]) => schema.scope === 'machine')
      .map(([key]) => key)
      .sort();
    expect(Object.keys(IGNORED_IN_WORKSPACE).sort()).toEqual(machine);
  });

  it('writes a notice that says what happened and where to change it', () => {
    const text = ignoredWorkspaceNotice(['Check commands', 'Auto-lint commands']);
    expect(text).toContain('Check commands, Auto-lint commands');
    expect(text).toMatch(/user settings/i);
    expect(ignoredWorkspaceNotice([])).toBe('');
  });
});

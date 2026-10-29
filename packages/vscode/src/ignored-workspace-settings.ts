/**
 * Settings that name a command or a server address are machine-scoped (RB-12), so VS Code ignores a
 * value a repository keeps in `.vscode/settings.json`. A person who set one there on purpose would
 * otherwise see it stop working with no word why. This finds those values so the extension can say so.
 *
 * It reads the file itself: for a machine-scoped key, `getConfiguration().inspect()` returns only the
 * default, because VS Code drops the key while it loads the workspace (checked in a real VS Code).
 * Pure on purpose, so the rule is tested without VS Code.
 */

/** The machine-scoped settings, each with the words a person reads (no setting keys on screen). */
export const IGNORED_IN_WORKSPACE: Readonly<Record<string, string>> = {
  'forge.providers.azureResourceName': 'Azure resource name',
  'forge.providers.googleCredentialsFile': 'Google credentials file',
  'forge.providers.azureBaseUrl': 'Azure server address',
  'forge.providers.openaiCompatibleBaseUrl': 'OpenAI-compatible server address',
  'forge.providers.lmstudioBaseUrl': 'LM Studio server address',
  'forge.providers.ollamaBaseUrl': 'Ollama server address',
  'forge.autoFormat.commands': 'Auto-format commands',
  'forge.agentManager.setupScript': 'Worktree setup script',
  'forge.agentManager.copyFiles': 'Files copied into a new worktree',
  'forge.caCertificates': 'Extra certificate files',
  'forge.commandSandbox.allowedHosts': 'Hosts the command sandbox allows',
  'forge.autoLint.commands': 'Auto-lint commands',
  'forge.verify.commands': 'Check commands',
  'forge.semantic.baseUrl': 'Code search server address',
  'forge.semantic.apiKeyEnv': 'Code search key variable',
  'forge.webSearch.searxngUrl': 'Web search server address',
};

/**
 * Parses a settings file as VS Code does: comments and trailing commas allowed. One linear scan, no
 * backtracking pattern, so a hostile file cannot stall the extension host. Anything unreadable gives `{}`.
 */
export function parseSettingsFile(text: string): Record<string, unknown> {
  const withoutComments = dropOutsideStrings(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, (src, i) => {
    if (src[i] === '/' && src[i + 1] === '/') {
      let end = i;
      while (end < src.length && src[end] !== '\n') end++;
      return end;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      return end < 0 ? src.length : end + 2;
    }
    return undefined;
  });
  // A comma before a closing bracket is dropped; this runs after the comments are gone so `true, // note` counts.
  const clean = dropOutsideStrings(withoutComments, (src, i) => {
    if (src[i] !== ',') return undefined;
    let j = i + 1;
    while (j < src.length && /\s/.test(src[j]!)) j++;
    return src[j] === '}' || src[j] === ']' ? i + 1 : undefined;
  });
  try {
    const value: unknown = JSON.parse(clean);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * One linear scan that copies `src` but skips the span `skipAt` returns the end of, never looking inside a
 * string. `skipAt(src, i)` gives the index just past what to drop, or undefined to keep the character.
 */
function dropOutsideStrings(src: string, skipAt: (src: string, i: number) => number | undefined): string {
  const parts: string[] = [];
  let copyFrom = 0;
  let i = 0;
  while (i < src.length) {
    if (src[i] === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    const end = skipAt(src, i);
    if (end === undefined) {
      i++;
      continue;
    }
    parts.push(src.slice(copyFrom, i));
    copyFrom = end;
    i = end;
  }
  parts.push(src.slice(copyFrom));
  return parts.join('');
}

function watchedIn(set: Record<string, unknown>): string[] {
  return Object.entries(IGNORED_IN_WORKSPACE)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(set, key))
    .map(([, label]) => label);
}

/** Labels of the watched settings that a project's settings file sets. */
export function ignoredWorkspaceSettings(settingsFileText: string): string[] {
  return watchedIn(parseSettingsFile(settingsFileText));
}

/** The same for a `.code-workspace` file, which keeps its settings in a "settings" block. */
export function ignoredInWorkspaceFile(workspaceFileText: string): string[] {
  const block = parseSettingsFile(workspaceFileText).settings;
  return block !== null && typeof block === 'object' && !Array.isArray(block) ? watchedIn(block as Record<string, unknown>) : [];
}

/** The sentence shown once per workspace; empty when there is nothing to say. */
export function ignoredWorkspaceNotice(labels: string[]): string {
  if (labels.length === 0) return '';
  return (
    `Forge ignores these settings when they come from this project: ${labels.join(', ')}. ` +
    'A project could otherwise point them at its own server or run its own commands. Set them in your user settings instead.'
  );
}

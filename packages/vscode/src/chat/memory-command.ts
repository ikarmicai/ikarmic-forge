import { composeSectionUpdate, parseMemory, projectMemoryPath, readMemoryFile, removeSection, writeMemoryFile } from '@ikarmic/forge-core';

export interface MemoryCommandDeps {
  cwd: string;
  open(): Promise<void>;
  say(text: string): void;
}

const USAGE = 'Usage: /memory (open the file), /memory add <note>, /memory list, /memory forget <heading>';
const HEADING_WORDS = 8;

/** `/memory [add <text> | list | forget <heading>]` against the project memory file. vscode-free, so it is unit-tested. */
export async function runMemoryCommand(args: string, deps: MemoryCommandDeps): Promise<void> {
  const trimmed = args.trim();
  if (!trimmed) return deps.open();
  const space = trimmed.search(/\s/);
  const sub = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const rest = space === -1 ? '' : trimmed.slice(space).trim();
  const file = projectMemoryPath(deps.cwd);
  switch (sub) {
    case 'add': {
      if (!rest) return deps.say('Write the note after the command: /memory add <note>');
      const heading = `Note: ${rest.split(/\s+/).slice(0, HEADING_WORDS).join(' ')}`;
      await writeMemoryFile(file, composeSectionUpdate(await readMemoryFile(file), heading, rest));
      return deps.say(`Saved to project memory under "${heading}".`);
    }
    case 'list': {
      const sections = parseMemory(await readMemoryFile(file), file, Date.now());
      if (sections.length === 0) return deps.say('No project memory yet. Add one with /memory add <note>.');
      return deps.say(sections.map((s) => `- ${s.heading}`).join('\n'));
    }
    case 'forget': {
      if (!rest) return deps.say('Name the section: /memory forget <heading>');
      const { content, removed } = removeSection(await readMemoryFile(file), rest);
      if (!removed) return deps.say(`No memory section called "${rest}". /memory list shows them.`);
      await writeMemoryFile(file, content);
      return deps.say(`Forgot "${rest}".`);
    }
    default:
      return deps.say(USAGE);
  }
}

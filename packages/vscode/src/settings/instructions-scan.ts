import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PROJECT_INSTRUCTION_FILES } from '@ikarmic/forge-core';

/**
 * What Forge does with the instruction files in the workspace root, for the Settings page. Pure Node (no `vscode`),
 * so it can be tested against a folder made for the test.
 */

/** Forge reads at most this many characters of each file. A test checks this against core, so the two cannot drift. */
export const INSTRUCTION_READ_LIMIT = 16_000;

/** A file this large is called cut off without being read: counting its characters would only cost time. */
const TOO_LARGE_TO_COUNT = 200_000;

export interface InstructionFileView {
  name: string;
  /** `used`: has text. `empty`: only blank space. `missing`: not there. */
  state: 'used' | 'empty' | 'missing';
  chars: number;
  /** Longer than Forge reads: the rest is ignored. */
  cut: boolean;
}

export async function scanInstructionFiles(root: string): Promise<InstructionFileView[]> {
  const out: InstructionFileView[] = [];
  for (const name of PROJECT_INSTRUCTION_FILES) {
    const file = path.join(root, name);
    const info = await stat(file).catch(() => undefined);
    if (!info?.isFile()) {
      out.push({ name, state: 'missing', chars: 0, cut: false });
      continue;
    }
    if (info.size > TOO_LARGE_TO_COUNT) {
      out.push({ name, state: 'used', chars: info.size, cut: true });
      continue;
    }
    const text = (await readFile(file, 'utf8').catch(() => '')).trim();
    out.push({ name, state: text ? 'used' : 'empty', chars: text.length, cut: text.length > INSTRUCTION_READ_LIMIT });
  }
  return out;
}

/** Whether `name` is one of the files Forge reads. The page sends a name; nothing else is ever opened or written. */
export function isInstructionName(name: unknown): name is (typeof PROJECT_INSTRUCTION_FILES)[number] {
  return typeof name === 'string' && (PROJECT_INSTRUCTION_FILES as readonly string[]).includes(name);
}

export const INSTRUCTION_STARTER = [
  '# Project instructions',
  '',
  'Forge reads this file at the start of every chat. Replace the lines below with what it should know about this project.',
  '',
  '## Build and test',
  '',
  '- How to build:',
  '- How to run the tests:',
  '',
  '## Code style',
  '',
  '- ',
  '',
  '## Do not',
  '',
  '- ',
  '',
].join('\n');

/** Creates one of the files Forge reads, with a short starter. A file that is already there is never touched. */
export async function createInstructionFile(root: string, name: string): Promise<'created' | 'exists'> {
  if (!(PROJECT_INSTRUCTION_FILES as readonly string[]).includes(name)) throw new Error(`${name} is not a file Forge reads.`);
  try {
    // "wx" fails when the name exists in any form, a link included, so nothing is written through one.
    await writeFile(path.join(root, name), INSTRUCTION_STARTER, { encoding: 'utf8', flag: 'wx' });
    return 'created';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
    throw err;
  }
}

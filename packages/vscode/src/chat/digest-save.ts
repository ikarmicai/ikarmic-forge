import {
  DEFAULT_MAX_BYTES,
  capMemory,
  composeSectionUpdate,
  projectMemoryPath,
  readMemoryFile,
  shouldDigest,
  writeMemoryFile,
} from '@ikarmic/forge-core';

export interface DigestInput {
  cwd: string;
  items: ReadonlyArray<{ role: 'user' | 'assistant'; text: string }>;
  now: Date;
  /** Asks the model for the digest text (core's `generateSessionDigest` with the cheap model). */
  generate: (items: DigestInput['items']) => Promise<string | undefined>;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Append a dated "Session digest" section to the project memory when a chat ends. Older sections are dropped
 * (lowest ranked first, by core's `capMemory`) to keep the file within its limit; the new one never is. vscode-free.
 */
export async function saveSessionDigest(input: DigestInput): Promise<{ saved: false } | { saved: true; heading: string }> {
  if (!shouldDigest(input.items)) return { saved: false };
  const digest = await input.generate(input.items);
  if (!digest) return { saved: false };
  const d = input.now;
  const heading = `Session digest ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const file = projectMemoryPath(input.cwd);
  const composed = composeSectionUpdate(await readMemoryFile(file), heading, digest);
  await writeMemoryFile(file, capMemory(composed, DEFAULT_MAX_BYTES, heading).content);
  return { saved: true, heading };
}

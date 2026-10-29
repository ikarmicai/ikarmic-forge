import { redact } from '@ikarmic/forge-core';

const MAX_CHARS = 600;

/**
 * The line Output > Forge gets when a chat run fails (RB-84). The chat shows the error, but a chat that could not be
 * continued was found only by reading the session file: the log is where a person or a bug report looks first.
 * Secrets are removed because a provider can echo part of a key back, and the log is kept on disk.
 */
export function runErrorLogLine(message: string): string {
  const oneLine = redact(message).text.replace(/\s+/g, ' ').trim();
  return `Chat run failed: ${oneLine.slice(0, MAX_CHARS)}`;
}

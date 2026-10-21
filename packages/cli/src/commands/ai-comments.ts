/**
 * `forge watch --ai-comments`: when a saved file carries an `AI!` or `AI?`
 * comment, run the agent on the collected comments. `AI!` applies the change;
 * `AI?` answers without editing (plan mode).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { aiCommentTask, findAiComments, triggerOf, type AiCommentFile } from '@ikarmic/forge-core';

export type AiCommentRunner = (task: string, mode: 'change' | 'question') => Promise<string>;

export interface AiCommentHandlerOptions {
  cwd: string;
  run: AiCommentRunner;
  log?: (line: string) => void;
}

/** Returns a per-file handler; saves made by the agent itself never re-trigger it. */
export function createAiCommentHandler(opts: AiCommentHandlerOptions): (relPath: string) => Promise<void> {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  let busy = false;
  return async (relPath: string): Promise<void> => {
    if (busy) return;
    let source: string;
    try {
      source = await readFile(path.join(opts.cwd, relPath), 'utf8');
    } catch {
      return;
    }
    const comments = findAiComments(source);
    const trigger = triggerOf(comments);
    if (!trigger) return;
    const files: AiCommentFile[] = [{ file: relPath, comments }];
    busy = true;
    try {
      log(`[ai] ${relPath}: ${comments.length} AI comment${comments.length === 1 ? '' : 's'} -> ${trigger === 'change' ? 'applying' : 'answering'}`);
      const out = await opts.run(aiCommentTask(files, trigger), trigger);
      if (out.trim()) log(out.trim());
    } catch (err) {
      log(`[ai] ${relPath}: failed - ${(err as Error).message}`);
    } finally {
      busy = false;
    }
  };
}

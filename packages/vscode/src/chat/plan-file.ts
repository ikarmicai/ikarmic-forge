/**
 * Plans the Plan agent writes are kept in the project, `.forge/plans/<date>-<slug>.md`, so they outlive the chat and can be
 * opened, edited and committed. The host saves them (the model has no tool for it), and only a finished plan-mode reply.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_SLUG = 48;
const MAX_WORDS = 6;

/** A short file-name part from the request: lowercase letters, digits and dashes, never a path. */
export function planSlug(request: string): string {
  const words = request
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  const slug = words.join('-').slice(0, MAX_SLUG).replace(/-+$/g, '');
  return slug || 'plan';
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The file's text: the request as a heading, when it was made, then the plan as the Plan agent wrote it. */
export function planDocument(request: string, plan: string, date: Date): string {
  const title = (request.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Plan';
  return `# Plan: ${title}\n\nSaved ${day(date)} by Forge. Edit it freely; ask Forge to implement it when it reads right.\n\n${plan.trim()}\n`;
}

/** Write the plan under `<root>/.forge/plans`, never over an earlier one; returns the file written. */
export async function savePlan(root: string, request: string, plan: string, date: Date = new Date()): Promise<string> {
  const dir = path.join(root, '.forge', 'plans');
  await mkdir(dir, { recursive: true });
  const base = `${day(date)}-${planSlug(request)}`;
  const doc = planDocument(request, plan, date);
  for (let n = 1; n < 100; n++) {
    const file = path.join(dir, `${base}${n === 1 ? '' : `-${n}`}.md`);
    try {
      await writeFile(file, doc, { encoding: 'utf8', flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('Too many plans with the same name.');
}

/**
 * What the "plan first?" card does when the MODEL suggested it (the request had already started a run). "Plan first"
 * plans the request; "just do it" runs it again with suggestions off, so the model cannot ask a second time.
 */
export function followUpAfterSuggestion(choice: 'plan' | 'go' | 'never', request: string): { text: string; modeId?: string; planDeclined: true } {
  if (choice === 'plan') return { text: `${PLAN_PREFIX}${request}`, modeId: 'plan', planDeclined: true };
  return { text: `${GO_PREFIX}${request}`, planDeclined: true };
}

const PLAN_PREFIX = 'Plan this request; do not change anything yet.\n\n';
const GO_PREFIX = 'Go ahead without a plan, as asked.\n\n';

/** The person's own request, without the line `followUpAfterSuggestion` put in front of it. */
export function requestOfFollowUp(text: string): string {
  for (const p of [PLAN_PREFIX, GO_PREFIX]) if (text.startsWith(p)) return text.slice(p.length);
  return text;
}

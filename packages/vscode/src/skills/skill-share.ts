/**
 * Settings → Skills: make a skill, bring one in from a folder or a zip, and share it as a pull request to the Forge skills
 * repository. The page only names what to do. The host reads the files itself, checks them again, adds the licence, asks
 * for a GitHub token only when sharing is confirmed (RB-76), and opens only addresses of that repository. Like the rest of
 * the Settings protocol this has no VS Code import, so it is tested without the editor. Every message is a sentence a
 * person can read (RB-55).
 */
import {
  licenceFiles,
  scaffoldSkill,
  SKILLS_REPO,
  skillHeader,
  validateSkillFiles,
  type LicenceKind,
  type PublishInput,
  type PublishResult,
  type SkillFile,
} from '@ikarmic/forge-core';

/** What the host provides to make, bring in and share skills. */
export interface SkillShareDeps {
  /** What is in the person's own skills folder. */
  managed?(): Promise<Array<{ name: string; path: string; source?: string }>>;
  /** Write a checked skill to the person's folder. Throws a sentence a person can read. Returns where an old copy that could not be removed was left. */
  save?(name: string, files: SkillFile[], overwrite: boolean): Promise<{ leftover?: string } | void>;
  /** Let the person choose a folder or a zip and read it. Undefined when they close the chooser; throws a sentence. */
  pickSource?(kind: 'folder' | 'zip'): Promise<{ files: SkillFile[]; folder: string | null } | undefined>;
  /** The files of a skill in the person's own folder. Throws a sentence for a skill installed from someone else's link. */
  readOwn?(name: string): Promise<SkillFile[]>;
  /** A GitHub token, asking the person to sign in when there is none; undefined when they decline; throws a sentence when sign-in fails. */
  githubToken?(): Promise<string | undefined>;
  publish?(input: PublishInput, token: string, signal: AbortSignal): Promise<PublishResult>;
  openUrl?(url: string): Promise<void>;
  /** A name for the licence, from the person's git settings. */
  defaultHolder?(): Promise<string>;
}

export interface SkillShareCard {
  type: 'skillShareCard';
  name: string;
  title: string;
  body: string;
  /** Where the pull request goes: `owner/repo`. */
  repo: string;
  files: number;
  /** The skill has no licence file, so the person chooses MIT or Apache-2.0. */
  needsLicence: boolean;
  /** A name to suggest for the licence. */
  holder: string;
  /** What stops the skill from being shared yet, in words; empty when nothing does. */
  problems: string[];
}

export type SkillShareReply =
  | { type: 'notice'; message: string }
  | { type: 'none' }
  | { type: 'listed'; note: string; /** The create form did its job and may be cleared. */ created?: boolean }
  | SkillShareCard
  | { type: 'skillShared'; url: string; draft: boolean };

const notice = (message: string): SkillShareReply => ({ type: 'notice', message });
const sentence = (err: unknown): string => (err instanceof Error && err.message ? err.message : 'Something went wrong.');
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const PROBE = { kind: 'MIT', holder: 'x', year: 2026 } as const;
const PR_URL = new RegExp(`^https://github\\.com/${SKILLS_REPO}/pull/\\d+$`);

/** A share that is running, by skill name, so Cancel on the card can stop it (and nothing else). */
const running = new Map<string, AbortController>();

/** What to add to a note when an old copy could not be removed. */
const leftoverNote = (saved: { leftover?: string } | void): string =>
  saved && saved.leftover ? ` The old copy could not be removed (a file in it may be open); delete ${saved.leftover} when it is free.` : '';

export async function createSkill(msg: { name?: unknown; description?: unknown; instructions?: unknown; overwrite?: unknown }, deps: SkillShareDeps): Promise<SkillShareReply> {
  const name = text(msg.name);
  const description = text(msg.description);
  const instructions = text(msg.instructions);
  if (!deps.save) return { type: 'none' };
  if (name === undefined || description === undefined || instructions === undefined) return notice('Fill in the name, the description and the instructions.');
  if (instructions.trim() === '') return notice('Write the instructions: what the agent should do when it uses this skill.');
  let saved: { leftover?: string } | void;
  try {
    const files = scaffoldSkill({ name, description, instructions });
    saved = await deps.save(name, files, msg.overwrite === true);
  } catch (err) {
    return notice(sentence(err));
  }
  return { type: 'listed', note: `Created ${name}.${leftoverNote(saved)}`, created: true };
}

export async function uploadSkill(msg: { kind?: unknown; overwrite?: unknown }, deps: SkillShareDeps): Promise<SkillShareReply> {
  if (!deps.pickSource || !deps.save) return { type: 'none' };
  if (msg.kind !== 'folder' && msg.kind !== 'zip') return notice('Choose a folder or a zip file.');
  let picked: Awaited<ReturnType<NonNullable<SkillShareDeps['pickSource']>>>;
  try {
    picked = await deps.pickSource(msg.kind);
  } catch (err) {
    return notice(sentence(err));
  }
  if (!picked) return { type: 'none' };
  const name = skillHeader(picked.files)?.name ?? picked.folder;
  if (!name) return notice('SKILL.md needs a name at the top. Add it, or put the skill in a folder with the name you want.');
  let saved: { leftover?: string } | void;
  try {
    saved = await deps.save(name, picked.files, msg.overwrite === true);
  } catch (err) {
    return notice(sentence(err));
  }
  return { type: 'listed', note: `Added ${name}.${leftoverNote(saved)}` };
}

/** A skill the person owns: its files, read by the host, or a notice. */
async function ownFiles(name: unknown, deps: SkillShareDeps): Promise<{ name: string; files: SkillFile[] } | SkillShareReply> {
  if (!deps.managed || !deps.readOwn) return { type: 'none' };
  const mine = typeof name === 'string' ? (await deps.managed()).find((m) => m.name === name) : undefined;
  if (typeof name !== 'string' || !mine) {
    return notice(`"${typeof name === 'string' ? name : 'That skill'}" is not in your skills folder, so Forge does not share it.`);
  }
  // The page shows Share only on the person's own skills; the host decides (review bug 2).
  if (mine.source) return notice(`${name} was installed from ${mine.source}, so it is someone else's skill and Forge does not share it under your name.`);
  try {
    return { name, files: await deps.readOwn(name) };
  } catch (err) {
    return notice(sentence(err));
  }
}

const isReply = (v: unknown): v is SkillShareReply => typeof (v as { type?: unknown }).type === 'string';

export async function shareStart(msg: { name?: unknown }, deps: SkillShareDeps): Promise<SkillShareReply> {
  const own = await ownFiles(msg.name, deps);
  if (isReply(own)) return own;
  const { name, files } = own;
  const licence = licenceFiles(files, PROBE);
  return {
    type: 'skillShareCard',
    name,
    title: `Add the ${name} skill`,
    body: skillHeader(files)?.description ?? '',
    repo: SKILLS_REPO,
    files: files.length,
    needsLicence: licence.add.length > 0,
    holder: (await deps.defaultHolder?.().catch(() => '')) ?? '',
    problems: [...validateSkillFiles(name, files).problems, ...licence.problems],
  };
}

export async function shareSkill(
  msg: { name?: unknown; title?: unknown; body?: unknown; draft?: unknown; licence?: unknown; holder?: unknown },
  deps: SkillShareDeps
): Promise<SkillShareReply> {
  if (!deps.publish || !deps.githubToken) return { type: 'none' };
  const own = await ownFiles(msg.name, deps);
  if (isReply(own)) return own;
  const { name, files } = own;

  // The files and the licence are the host's: the page only chose which licence and whose name.
  const kind: LicenceKind | undefined = msg.licence === 'MIT' || msg.licence === 'Apache-2.0' ? msg.licence : undefined;
  const choice = kind ? { kind, holder: text(msg.holder) ?? '', year: new Date().getFullYear() } : undefined;
  const hasLicence = licenceFiles(files, PROBE).add.length === 0;
  const licence = hasLicence ? licenceFiles(files, undefined) : licenceFiles(files, choice);
  const all = [...files, ...licence.add];
  const found = validateSkillFiles(name, all).problems;
  const problems = [...found, ...licence.problems.filter((p) => !found.includes(p))];
  if (problems.length > 0) return notice(problems.join(' '));

  const title = text(msg.title);
  const body = text(msg.body);
  if (title === undefined || body === undefined) return notice('Give the pull request a title and a description.');
  if (running.has(name)) return notice(`${name} is already being shared. Wait for it to finish.`);
  // Taken before the sign-in, so a second click while the sign-in is open is refused too.
  const ctl = new AbortController();
  running.set(name, ctl);
  try {
    // The sign-in is asked for only now, after everything else has passed.
    let token: string | undefined;
    try {
      token = await deps.githubToken();
    } catch (err) {
      return notice(`Forge could not sign in to GitHub: ${sentence(err)} You can set GITHUB_TOKEN instead and start VS Code again.`);
    }
    if (!token) return notice('Sign in to GitHub to share a skill. Forge needs your permission to open the pull request for you.');
    if (ctl.signal.aborted) return notice('Sharing the skill was stopped. Nothing was sent.');
    const got = await deps.publish({ name, files: all, title, body, draft: msg.draft !== false }, token, ctl.signal);
    return { type: 'skillShared', url: got.url, draft: got.draft };
  } catch (err) {
    return notice(sentence(err));
  } finally {
    running.delete(name);
  }
}

/** Cancel on the card while sharing: stop the share of that skill. What already reached GitHub is kept and said. */
export function cancelShare(msg: { name?: unknown }): SkillShareReply {
  const ctl = typeof msg.name === 'string' ? running.get(msg.name) : undefined;
  ctl?.abort();
  return { type: 'none' };
}

export async function openShared(msg: { url?: unknown }, deps: SkillShareDeps): Promise<SkillShareReply> {
  if (!deps.openUrl) return { type: 'none' };
  if (typeof msg.url !== 'string' || !PR_URL.test(msg.url)) return notice('That address is not a pull request of the Forge skills repository.');
  await deps.openUrl(msg.url);
  return { type: 'none' };
}

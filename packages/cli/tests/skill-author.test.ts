import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSkillCommand } from '../src/commands/skill.js';
import { parseOptions } from '../src/options.js';
import type { ParsedSkillCommand } from '../src/options.js';

/**
 * `forge skill new|add|publish`: make a skill, bring one in from a folder or a zip, and share it as a pull request. The
 * person's home is a temporary folder (RB-4); the token is never printed; nothing is sent without --yes when nobody is
 * there to confirm (S32, RB-76).
 */
const argv = (...a: string[]) => ['node', 'forge', ...a];
const skillMd = (name: string, body = 'Do the thing.') => `---\nname: ${name}\ndescription: ${name} does a thing.\n---\n${body}\n`;
const TOKEN = 'ghp_CLITESTTOKEN0123456789abcdefghijklmn';

describe('forge skill options', () => {
  it('reads new', () => {
    expect(parseOptions(argv('skill', 'new', 'pdf-notes', '--description', 'Summarises a PDF.', '--instructions-file', 'body.md')).skillCommand).toEqual({
      create: { name: 'pdf-notes', description: 'Summarises a PDF.', instructionsFile: 'body.md', overwrite: false },
    });
  });

  it('reads add', () => {
    expect(parseOptions(argv('skill', 'add', './my-skill', '--overwrite')).skillCommand).toEqual({ add: { path: './my-skill', overwrite: true } });
  });

  it('reads publish with its flags', () => {
    expect(parseOptions(argv('skill', 'publish', 'pdf-notes')).skillCommand).toEqual({
      publish: { target: 'pdf-notes', licence: null, holder: null, title: null, ready: false, yes: false },
    });
    expect(parseOptions(argv('skill', 'publish', 'pdf-notes', '--licence', 'MIT', '--holder', 'Ada', '--title', 'Add it', '--ready', '--yes')).skillCommand).toEqual({
      publish: { target: 'pdf-notes', licence: 'MIT', holder: 'Ada', title: 'Add it', ready: true, yes: true },
    });
  });
});

describe('forge skill new, add and publish', () => {
  let home: string;
  let out: string[];
  let err: string[];
  let fetchCalls: Array<{ method: string; path: string; body: any }>;
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'forge-cli-author-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '');
    vi.stubEnv('FORGE_GITHUB_API_URL', '');
    out = [];
    err = [];
    fetchCalls = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => (err.push(String(s)), true));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
  });

  const skills = (...rest: string[]) => path.join(home, '.forge', 'skills', ...rest);
  const put = (rel: string, text: string | Buffer) => {
    const full = path.join(home, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
  };
  const run = (cmd: ParsedSkillCommand) => handleSkillCommand(cmd, home);
  const create = (over: Partial<NonNullable<ParsedSkillCommand['create']>> = {}): ParsedSkillCommand => ({ create: { name: 'pdf-notes', description: 'Summarises a PDF.', instructionsFile: null, overwrite: false, ...over } });
  const add = (p: string, overwrite = false): ParsedSkillCommand => ({ add: { path: p, overwrite } });
  const publish = (over: Partial<NonNullable<ParsedSkillCommand['publish']>> = {}): ParsedSkillCommand => ({
    publish: { target: 'pdf-notes', licence: null, holder: null, title: null, ready: false, yes: false, ...over },
  });

  describe('new', () => {
    it('writes ~/.forge/skills/<name>/SKILL.md from the description and an instructions file', async () => {
      const body = put('body.md', 'Read the file.\nThen write notes.\n');
      expect(await run(create({ instructionsFile: body }))).toBe(0);
      const text = readFileSync(skills('pdf-notes', 'SKILL.md'), 'utf8');
      expect(text).toBe('---\nname: pdf-notes\ndescription: Summarises a PDF.\n---\nRead the file.\nThen write notes.\n');
      expect(out.join('')).toContain('pdf-notes');
    });

    it('needs instructions, and says where they come from', async () => {
      expect(await run(create())).toBe(2);
      expect(err.join('')).toMatch(/--instructions-file/);
      expect(existsSync(skills())).toBe(false);
    });

    it('S1: refuses a bad name with a sentence, and writes nothing', async () => {
      const body = put('body.md', 'x');
      expect(await run(create({ name: '../evil', instructionsFile: body }))).toBe(2);
      expect(err.join('')).toMatch(/lower case/i);
      expect(existsSync(skills())).toBe(false);
    });

    it('S28: does not replace an existing skill unless asked', async () => {
      const body = put('body.md', 'new');
      await run(create({ instructionsFile: body }));
      expect(await run(create({ instructionsFile: body }))).toBe(2);
      expect(err.join('')).toMatch(/already/i);
      expect(await run(create({ instructionsFile: body, overwrite: true }))).toBe(0);
    });

    it('says so when the instructions file cannot be read', async () => {
      expect(await run(create({ instructionsFile: path.join(home, 'nope.md') }))).toBe(2);
      expect(err.join('')).toMatch(/cannot be read|cannot be found|not found/i);
    });
  });

  describe('add', () => {
    it('brings in a folder, named by its SKILL.md', async () => {
      put('pick/SKILL.md', skillMd('pdf-notes'));
      put('pick/scripts/run.sh', 'echo hi\n');
      expect(await run(add(path.join(home, 'pick')))).toBe(0);
      expect(readFileSync(skills('pdf-notes', 'scripts', 'run.sh'), 'utf8')).toBe('echo hi\n');
      expect(out.join('')).toContain('pdf-notes');
    });

    it('S8: refuses a folder with a link in it, and copies nothing', async () => {
      put('pick/SKILL.md', skillMd('pdf-notes'));
      put('secret/id.txt', 'private');
      symlinkSync(path.join(home, 'secret'), path.join(home, 'pick', 'linked'), 'junction');
      expect(await run(add(path.join(home, 'pick')))).toBe(2);
      expect(err.join('')).toMatch(/link/i);
      expect(existsSync(skills())).toBe(false);
    });

    it('S11, S13: lists every problem of a folder that cannot be a skill', async () => {
      put('pick/SKILL.md', skillMd('pdf-notes'));
      put('pick/.env', 'A=1');
      put('pick/scripts/x.sh', `export T=${TOKEN}\n`);
      expect(await run(add(path.join(home, 'pick')))).toBe(2);
      const text = err.join('');
      expect(text).toContain('.env');
      expect(text).toContain('scripts/x.sh');
      expect(text).not.toContain(TOKEN);
      expect(existsSync(skills())).toBe(false);
    });

    it('brings in a zip, with or without a wrapping folder', async () => {
      const zip = storedZip({ 'pdf-notes/SKILL.md': skillMd('pdf-notes'), 'pdf-notes/references/g.md': '# g\n' });
      const file = put('pdf-notes.zip', zip);
      expect(await run(add(file))).toBe(0);
      expect(existsSync(skills('pdf-notes', 'references', 'g.md'))).toBe(true);
    });

    it('S7: says so for a file that is not a zip', async () => {
      const file = put('broken.zip', 'not a zip at all');
      expect(await run(add(file))).toBe(2);
      expect(err.join('')).toMatch(/not a zip/i);
    });

    it('says so for a path that is not there', async () => {
      expect(await run(add(path.join(home, 'missing')))).toBe(2);
      expect(err.join('')).toMatch(/cannot be found/i);
    });

    it('S28: does not replace an existing skill unless asked', async () => {
      put('pick/SKILL.md', skillMd('pdf-notes'));
      await run(add(path.join(home, 'pick')));
      expect(await run(add(path.join(home, 'pick')))).toBe(2);
      expect(await run(add(path.join(home, 'pick'), true))).toBe(0);
      expect(readdirSync(skills())).toEqual(['pdf-notes']);
    });
  });

  describe('publish', () => {
    const makeSkill = () => {
      put('.forge/skills/pdf-notes/SKILL.md', skillMd('pdf-notes'));
    };

    /** A GitHub that answers what publishing asks. */
    const stubGitHub = () => {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input));
          const method = init?.method ?? 'GET';
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          fetchCalls.push({ method, path: url.pathname, body });
          const p = url.pathname;
          if (p === '/user') return json({ login: 'ada' });
          if (p === '/repos/ikarmicai/forge-skills' && method === 'GET') return json({ default_branch: 'main', permissions: { push: false } });
          if (p.endsWith('/forks')) return json({ full_name: 'ada/forge-skills' }, 202);
          if (p === '/repos/ada/forge-skills') return json({ full_name: 'ada/forge-skills' });
          if (p.endsWith('/git/ref/heads/main')) return json({ object: { sha: 'base1' } });
          if (p.endsWith('/git/commits/base1')) return json({ tree: { sha: 'tree1' } });
          if (p.endsWith('/contents/skills-catalog.json')) return json({ content: Buffer.from(JSON.stringify({ version: 1, skills: [] })).toString('base64') });
          if (p.includes('/contents/skills/')) return json({ message: 'Not Found' }, 404);
          if (p.endsWith('/git/blobs')) return json({ sha: 'b' }, 201);
          if (p.endsWith('/git/trees')) return json({ sha: 't2' }, 201);
          if (p.endsWith('/git/commits')) return json({ sha: 'c2' }, 201);
          if (p.endsWith('/git/refs')) return json({}, 201);
          if (p.endsWith('/pulls') && method === 'GET') return json([]);
          if (p.endsWith('/pulls')) return json({ number: 9, html_url: 'https://github.com/ikarmicai/forge-skills/pull/9', draft: true }, 201);
          return json({ message: 'no route' }, 404);
        })
      );
    };

    it('S16: needs a token, says which variables, and sends nothing', async () => {
      makeSkill();
      stubGitHub();
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(2);
      expect(err.join('')).toMatch(/GITHUB_TOKEN/);
      expect(fetchCalls).toEqual([]);
    });

    // Review bug 2: a skill installed from someone else's link could be shared under the person's name.
    it("refuses a skill Forge installed from a link: it is someone else's, and nothing is sent", async () => {
      makeSkill();
      put('.forge/skills/pdf-notes/.forge-source.json', JSON.stringify({ version: 1, source: 'anthropics/skills', skill: 'pdf-notes', hash: 'x' }));
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(2);
      expect(err.join('')).toContain('was installed from anthropics/skills');
      expect(fetchCalls).toEqual([]);
    });

    it('refuses a damaged install record too', async () => {
      makeSkill();
      put('.forge/skills/pdf-notes/.forge-source.json', 'not json');
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(2);
      expect(err.join('')).toContain('was installed from a link');
    });

    // Review bug 26: the prompt showed only a count of files.
    it('lists every file it will send, and marks the licence Forge writes', async () => {
      makeSkill();
      put('.forge/skills/pdf-notes/scripts/run.sh', 'echo\n');
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(0);
      const said = out.join('');
      expect(said).toContain('skills/pdf-notes/SKILL.md');
      expect(said).toContain('skills/pdf-notes/scripts/run.sh');
      expect(said).toContain('skills/pdf-notes/LICENSE  (written by Forge)');
      // Review bug 4: the pull request does not touch the catalog.
      const tree = fetchCalls.find((c) => c.path.endsWith('/git/trees'))!;
      expect(tree.body.tree.map((t: { path: string }) => t.path)).not.toContain('skills-catalog.json');
    });

    it('S14: needs a licence when the skill has none, and says the flags', async () => {
      makeSkill();
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ yes: true }))).toBe(2);
      expect(err.join('')).toMatch(/--licence/);
      expect(fetchCalls).toEqual([]);
    });

    it('S32: without --yes and without a terminal, sends nothing and says how to confirm', async () => {
      makeSkill();
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      const tty = [Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'), Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')] as const;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      try {
        expect(await run(publish({ licence: 'MIT', holder: 'Ada' }))).toBe(2);
      } finally {
        for (const [i, s] of [process.stdin, process.stdout].entries()) {
          if (tty[i]) Object.defineProperty(s, 'isTTY', tty[i]!);
          else delete (s as { isTTY?: boolean }).isTTY;
        }
      }
      expect(err.join('')).toMatch(/--yes/);
      expect(fetchCalls).toEqual([]);
    });

    it('with --yes it opens the pull request, prints its address, and the token is nowhere in the output', async () => {
      makeSkill();
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(0);
      expect(out.join('')).toContain('https://github.com/ikarmicai/forge-skills/pull/9');
      expect(`${out.join('')}${err.join('')}`).not.toContain(TOKEN);
      const pr = fetchCalls.find((c) => c.path.endsWith('/pulls') && c.method === 'POST')!;
      expect(pr.body.draft).toBe(true);
      expect(pr.body.title).toBe('Add the pdf-notes skill');
    });

    it('the licence the person chose goes into the pull request, and nothing is written to the skill on disk', async () => {
      makeSkill();
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }));
      const tree = fetchCalls.find((c) => c.path.endsWith('/git/trees'))!;
      expect(tree.body.tree.map((t: any) => t.path)).toContain('skills/pdf-notes/LICENSE');
      expect(readdirSync(skills('pdf-notes'))).toEqual(['SKILL.md']);
    });

    it('--ready opens a pull request that is not a draft', async () => {
      makeSkill();
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      await run(publish({ licence: 'MIT', holder: 'Ada', yes: true, ready: true }));
      expect(fetchCalls.find((c) => c.path.endsWith('/pulls') && c.method === 'POST')!.body.draft).toBe(false);
    });

    it('S13: a key in the skill stops it before anything is sent', async () => {
      makeSkill();
      put('.forge/skills/pdf-notes/scripts/x.sh', `export T=${TOKEN}\n`);
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(2);
      expect(err.join('')).toContain('scripts/x.sh');
      expect(err.join('')).not.toContain(TOKEN);
      expect(fetchCalls).toEqual([]);
    });

    it('says so when there is no such skill', async () => {
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ target: 'nope', licence: 'MIT', holder: 'Ada', yes: true }))).toBe(2);
      expect(err.join('')).toMatch(/no skill/i);
    });

    it('a failure on GitHub is exit 1 with what was left behind', async () => {
      makeSkill();
      stubGitHub();
      const real = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith('/git/trees') ? new Response(JSON.stringify({ message: 'boom' }), { status: 500 }) : real(input, init))));
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ licence: 'MIT', holder: 'Ada', yes: true }))).toBe(1);
      expect(err.join('')).toMatch(/ada\/forge-skills/);
      expect(err.join('')).not.toContain(TOKEN);
    });

    it('publishes a folder given by path, named by its SKILL.md', async () => {
      put('elsewhere/pick/SKILL.md', skillMd('pdf-notes'));
      stubGitHub();
      vi.stubEnv('GITHUB_TOKEN', TOKEN);
      expect(await run(publish({ target: path.join(home, 'elsewhere', 'pick'), licence: 'MIT', holder: 'Ada', yes: true }))).toBe(0);
    });
  });
});

/** A zip with stored (not compressed) entries, enough for the reader. */
function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(raw.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([head, nameBuf, raw]);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(raw.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    locals.push(local);
    offset += local.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

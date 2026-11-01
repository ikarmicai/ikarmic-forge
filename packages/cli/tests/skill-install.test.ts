import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSkillCommand } from '../src/commands/skill.js';
import type { ParsedSkillCommand } from '../src/options.js';

/**
 * RB-115: `forge skill install <link>` wrote an empty stub and never fetched the skill. It now copies the skill folder, lets
 * the person list and choose when a link holds several, and `update` and `remove` look after what it installed.
 */
const skill = (name: string, body = 'Use the script.') => `---\nname: ${name}\ndescription: ${name} does a thing.\n---\n${body}\n`;

describe('forge skill install, update and remove', () => {
  let home: string;
  let out: string[];
  let err: string[];
  let files: Record<string, string>;
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'forge-cli-skill-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    out = [];
    err = [];
    files = { 'pdf/SKILL.md': skill('pdf'), 'pdf/run.py': 'print(1)', 'docx/SKILL.md': skill('docx'), 'README.md': 'x' };
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => (err.push(String(s)), true));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://api.github.com/repos/o/r') return new Response(JSON.stringify({ default_branch: 'main' }));
        if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: Object.keys(files).map((p) => ({ path: p, type: 'blob', mode: '100644', size: files[p]!.length })) }));
        const raw = /raw\.githubusercontent\.com\/o\/r\/main\/(.+)$/.exec(url);
        if (raw && files[decodeURI(raw[1]!)] !== undefined) return new Response(files[decodeURI(raw[1]!)]);
        return new Response('', { status: 404 });
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
  });

  const skills = (...rest: string[]) => path.join(home, '.forge', 'skills', ...rest);
  const install = (url: string, over: Partial<NonNullable<ParsedSkillCommand['install']>> = {}): ParsedSkillCommand => ({ install: { url, overwrite: false, only: [], all: false, list: false, ...over } });

  it('downloads a skill folder into ~/.forge/skills/<name>/ when the link holds one skill', async () => {
    files = { 'pdf/SKILL.md': skill('pdf'), 'pdf/run.py': 'print(1)' };
    expect(await handleSkillCommand(install('o/r'), home)).toBe(0);
    expect(readFileSync(skills('pdf', 'SKILL.md'), 'utf8')).toBe(skill('pdf'));
    expect(existsSync(skills('pdf', 'run.py'))).toBe(true);
    expect(out.join('')).toContain('installed pdf');
  });

  it('lists what a link holds with --list, and installs nothing', async () => {
    expect(await handleSkillCommand(install('o/r', { list: true }), home)).toBe(0);
    expect(out.join('')).toMatch(/1\. docx[\s\S]*2\. pdf/);
    expect(existsSync(skills())).toBe(false);
  });

  it('does not install several skills unasked when nobody is there to choose, and says how to choose', async () => {
    expect(await handleSkillCommand(install('o/r'), home)).toBe(2);
    expect(err.join('')).toMatch(/--skill/);
    expect(err.join('')).toMatch(/--all/);
    expect(existsSync(skills())).toBe(false);
  });

  it('installs the skills named with --skill, or every one with --all', async () => {
    expect(await handleSkillCommand(install('o/r', { only: ['pdf'] }), home)).toBe(0);
    expect(existsSync(skills('pdf'))).toBe(true);
    expect(existsSync(skills('docx'))).toBe(false);
    expect(await handleSkillCommand(install('o/r', { all: true }), home)).toBe(0);
    expect(existsSync(skills('docx'))).toBe(true);
    expect(out.join('')).toContain('skipped pdf: already installed');
  });

  it('fails in words, and writes nothing, when the repository is not found', async () => {
    expect(await handleSkillCommand(install('nobody/nothing'), home)).toBe(2);
    expect(err.join('')).toMatch(/could not find nobody\/nothing/i);
    expect(existsSync(skills())).toBe(false);
  });

  it('updates what changed, leaves a copy you edited, and replaces it with --force', async () => {
    await handleSkillCommand(install('o/r', { all: true }), home);
    out.length = 0;
    files['pdf/SKILL.md'] = skill('pdf', 'NEW BODY');
    writeFileSync(skills('docx', 'SKILL.md'), 'MY EDITS');
    files['docx/SKILL.md'] = skill('docx', 'NEW DOCX');
    expect(await handleSkillCommand({ update: { names: [], force: false } }, home)).toBe(0);
    expect(out.join('')).toContain('updated pdf');
    expect(out.join('')).toMatch(/docx was changed on this computer/);
    expect(readFileSync(skills('docx', 'SKILL.md'), 'utf8')).toBe('MY EDITS');
    out.length = 0;
    expect(await handleSkillCommand({ update: { names: ['docx'], force: true } }, home)).toBe(0);
    expect(out.join('')).toContain('updated docx');
    expect(readFileSync(skills('docx', 'SKILL.md'), 'utf8')).toContain('NEW DOCX');
    out.length = 0;
    await handleSkillCommand({ update: { names: [], force: false } }, home);
    expect(out.join('')).toContain('pdf is up to date');
  });

  it('says so when nothing was installed by Forge', async () => {
    expect(await handleSkillCommand({ update: { names: [], force: false } }, home)).toBe(0);
    expect(out.join('')).toMatch(/no skills installed by Forge/);
  });

  it('asks for --yes before it deletes, then removes the skill', async () => {
    await handleSkillCommand(install('o/r', { only: ['pdf'] }), home);
    expect(await handleSkillCommand({ remove: { name: 'pdf', yes: false } }, home)).toBe(2);
    expect(err.join('')).toMatch(/--yes/);
    expect(existsSync(skills('pdf'))).toBe(true);
    expect(await handleSkillCommand({ remove: { name: 'pdf', yes: true } }, home)).toBe(0);
    expect(existsSync(skills('pdf'))).toBe(false);
    expect(await handleSkillCommand({ remove: { name: 'pdf', yes: true } }, home)).toBe(2);
    expect(err.join('')).toMatch(/no skill named "pdf"/);
  });

  it('shows where an installed skill came from in the list', async () => {
    await handleSkillCommand(install('o/r', { only: ['pdf'] }), home);
    out.length = 0;
    await handleSkillCommand({ list: true }, home);
    expect(out.join('')).toContain('(installed from o/r)');
  });
});

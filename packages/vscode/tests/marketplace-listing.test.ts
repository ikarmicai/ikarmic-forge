import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The Marketplace renders packages/vscode/README.md as the extension's Overview
// and copies `description`, `categories` and `keywords` into the page's <title>,
// meta description, meta keywords and category breadcrumb. None of that HTML is
// ours to edit afterwards, and nothing re-rendered the Overview when the product
// changed: it kept a dead GitHub URL, a 1.0.0 .vsix filename, and a settings table
// covering 10 of 85 settings. These tests are the mechanical guard.
//
// Publishing rule: a change to the manifest or to a command title must come with a
// change to the README in the same commit, or these fail.

const root = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const nls = JSON.parse(readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
const readme = readFileSync(path.join(root, 'README.md'), 'utf8');

// Command titles are `%command.forge.openChat.title%` in the manifest; the text a
// reader sees, and the text the Overview has to match, comes from package.nls.json.
const commandTitle = (t: string) => (t.startsWith('%') && t.endsWith('%') ? nls[t.slice(1, -1)] : t);

describe('marketplace description', () => {
  // Google truncates the meta description near 155-160 characters. Anything longer
  // is cut mid-sentence, and this one was cut mid provider-list ("OpenRouter,").
  // The Marketplace's own documented ceiling for `description` is 200.
  it('fits in a search result snippet', () => {
    expect(pkg.description.length).toBeLessThanOrEqual(160);
  });

  it('leads with what the extension is, for a reader who sees nothing else', () => {
    expect(pkg.description).toMatch(/AI coding agent/i);
    expect(pkg.description.indexOf('AI coding agent')).toBeLessThan(40);
  });

  it('does not promise to be entirely open source when the engine is not', () => {
    // packages/core is Proprietary (NOTICE). The extension itself is AGPL, so
    // "open-source" is allowed, but it must not sit in the position of a
    // whole-product claim that the NOTICE contradicts.
    const notOpenSource = /\bfully open[- ]source\b|\b100% open[- ]source\b|\bentirely open[- ]source\b/i;
    expect(notOpenSource.test(pkg.description)).toBe(false);
    expect(notOpenSource.test(readme)).toBe(false);
  });
});

describe('marketplace categories', () => {
  // The first category is the one the breadcrumb and the category filter use.
  // Listing Programming Languages put this page in searches for C#/Python/Rust
  // extensions, which it cannot win, and hid the one it should rank in.
  it('is filed under AI first', () => {
    expect(pkg.categories[0]).toBe('AI');
  });

  it('does not claim a programming-language category', () => {
    expect(pkg.categories).not.toContain('Programming Languages');
  });
});

describe('marketplace keywords', () => {
  it('are lowercase, kebab-case and free of duplicates', () => {
    for (const k of pkg.keywords) {
      expect(k, k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(pkg.keywords).size).toBe(pkg.keywords.length);
  });

  it('covers the terms people actually search for', () => {
    for (const k of ['ai', 'ai-agent', 'coding-assistant', 'autocomplete', 'mcp', 'open-source']) {
      expect(pkg.keywords, k).toContain(k);
    }
  });

  it('leaves room to add terms: a full tag set is not editable afterwards', () => {
    expect(pkg.keywords.length).toBeLessThanOrEqual(24);
  });
});

describe('marketplace resource links', () => {
  it('has a homepage, so the resource block points somewhere of our choosing', () => {
    expect(typeof pkg.homepage).toBe('string');
    expect(pkg.homepage).toMatch(/^https:\/\//);
    expect(pkg.bugs).toMatch(/^https:\/\/.*\/issues/);
  });

  // The Marketplace resolves a relative Markdown link against the publisher's
  // repo, so `../../NOTICE` became github.com/ikarmicai/ikarmic-forge/blob/HEAD/../../NOTICE,
  // which 404s. Every link in this README has to be absolute.
  it('uses only absolute links, because relative ones break on the Marketplace', () => {
    const links = [...readme.matchAll(/]\(([^)\s]+)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l, l).toMatch(/^(https?:\/\/|mailto:|#)/);
    }
  });

  // README line 3 linked to github.com/ikarmic/forge, which has never existed; the
  // repo is ikarmicai/ikarmic-forge. The Marketplace only knows the manifest URL.
  it('points at the repository the manifest declares', () => {
    const repo = pkg.repository.url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
    expect(repo).not.toBeNull();
    const slug = repo![1];
    const wrongSlug = [...readme.matchAll(/github\.com[/:]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?(?=[)\s#]|$)/g)]
      .map((m) => m[1])
      .filter((s) => s !== slug);
    expect(wrongSlug, `README links to a repo other than ${slug}`).toEqual([]);
  });
});

describe('marketplace overview stays in step with the product', () => {
  it('documents every command the manifest contributes', () => {
    const missing = pkg.contributes.commands
      .map((c: { title: string }) => commandTitle(c.title))
      .filter((t: string) => !readme.includes(t));
    expect(missing, 'commands added to the manifest but not the Overview').toEqual([]);
  });

  // The Overview told people to install ikarmic-forge-1.0.0.vsix at version 5.1.0.
  it('does not name a .vsix from a version other than the one it ships', () => {
    const stale = [...readme.matchAll(/ikarmic-forge-(\d+\.\d+\.\d+)\.vsix/g)]
      .map((m) => m[1])
      .filter((v) => v !== pkg.version);
    expect(stale, `Overview names a stale .vsix (current ${pkg.version})`).toEqual([]);
  });

  // It listed a hand-picked settings table that was 10 rows against 85 settings.
  // Anything that enumerates forge.* settings has to be honest about being partial.
  it('does not present a partial settings table as the whole list', () => {
    const table = readme.match(/forge\.[a-zA-Z.]+/g) ?? [];
    const listed = new Set(table);
    const total = (JSON.stringify(pkg.contributes.configuration ?? {}) .match(/"forge\.[a-zA-Z.]+"/g) ?? []).length;
    expect(listed.size).toBeLessThan(total);
    expect(readme).toMatch(/full list|link/i);
  });
});
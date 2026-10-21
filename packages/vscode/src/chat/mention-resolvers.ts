import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import * as vscode from 'vscode';

import { fetchUrlTool, findSymbolTool, redact } from '@ikarmic/forge-core';

import { resolveInsideWorkspace } from './edit-preview.js';
import { docsCandidates, type MentionResolvers } from './mentions.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', '.git']);
const MAX_DIAGNOSTICS = 100;
const MAX_FOLDER_ENTRIES = 200;
const GIT_TIMEOUT_MS = 15_000;

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    );
  });
}

async function listFolder(abs: string, rel: string, depth: number, out: string[]): Promise<void> {
  if (out.length >= MAX_FOLDER_ENTRIES) return;
  const entries = await readdir(abs, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= MAX_FOLDER_ENTRIES) return;
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const childRel = rel === '.' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      out.push(`${childRel}/`);
      if (depth > 1) await listFolder(path.join(abs, e.name), childRel, depth - 1, out);
    } else out.push(childRel);
  }
}

/** A page as `title`, URL and its text excerpt (HTML stripped by fetch_url), or null on a failed fetch. */
async function fetchPage(url: string, root: string): Promise<string | null> {
  try {
    const r = await fetchUrlTool.execute({ url }, { cwd: root, auto: true });
    if (r.status < 200 || r.status >= 300 || !r.excerpt.trim()) return null;
    return redact(`${r.title ? `${r.title}\n` : ''}${r.url}\n\n${r.excerpt}${r.truncated ? '\n... (page truncated)' : ''}`).text;
  } catch {
    return null;
  }
}

export function createMentionResolvers(root: string, recentTerminal: () => string, docs: Record<string, string> = {}): MentionResolvers {
  const inside = (p: string): string | null => resolveInsideWorkspace(root, p);

  return {
    async file(p) {
      const abs = inside(p);
      if (!abs) return null;
      try {
        if (IMAGE_EXT.has(path.extname(abs).toLowerCase())) {
          await stat(abs);
          return `[image file ${p}: call the read_image tool with this path to look at it]`;
        }
        const buf = await readFile(abs);
        if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
          return `[PDF file ${p}: call the read_file tool with this path to read it]`;
        }
        if (buf.subarray(0, 8192).includes(0)) return null; // binary
        return redact(buf.toString('utf8')).text;
      } catch {
        return null;
      }
    },

    async isDirectory(p) {
      const abs = inside(p);
      if (!abs) return false;
      return stat(abs).then((s) => s.isDirectory(), () => false);
    },

    async folder(p) {
      const abs = inside(p);
      if (!abs) return null;
      try {
        const out: string[] = [];
        await listFolder(abs, p.replace(/\\/g, '/').replace(/\/+$/, '') || '.', 2, out);
        return out.join('\n');
      } catch {
        return null;
      }
    },

    async symbol(name) {
      const { matches } = await findSymbolTool.execute({ name }, { cwd: root, auto: true });
      if (matches.length === 0) return null;
      const lines: string[] = matches.slice(0, 5).map((m) => `${m.path}:${m.line} ${m.kind} ${m.name}`);
      const best = matches[0]!;
      try {
        const src = (await readFile(path.join(root, best.path), 'utf8')).split(/\r?\n/);
        lines.push('', src.slice(best.line - 1, best.line + 39).join('\n'));
      } catch {
        // listing alone is still useful
      }
      return redact(lines.join('\n')).text;
    },

    async problems() {
      const rows: Array<{ sev: number; text: string }> = [];
      for (const [uri, diags] of vscode.languages.getDiagnostics()) {
        if (uri.scheme !== 'file') continue;
        const rel = path.relative(root, uri.fsPath).replace(/\\/g, '/');
        if (rel.startsWith('..')) continue;
        for (const d of diags) {
          if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
          const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
          rows.push({ sev: d.severity, text: `${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} ${sev} ${d.message.split('\n')[0]}` });
        }
      }
      rows.sort((a, b) => a.sev - b.sev);
      const shown = rows.slice(0, MAX_DIAGNOSTICS).map((r) => r.text);
      if (rows.length > MAX_DIAGNOSTICS) shown.push(`... ${rows.length - MAX_DIAGNOSTICS} more`);
      return shown.join('\n');
    },

    async terminal() {
      return recentTerminal();
    },

    async git(kind) {
      const out = await git(root, kind === 'staged' ? ['diff', '--staged'] : ['diff', 'HEAD']);
      return redact(out).text;
    },

    async url(url) {
      return fetchPage(url, root);
    },

    async docs(name) {
      const url = docs[name];
      if (!url) return null;
      for (const candidate of docsCandidates(url)) {
        const page = await fetchPage(candidate, root);
        if (page) return page;
      }
      return null;
    },
  };
}

/** Workspace files matching an `@` query, for autocomplete. */
export async function findMentionFiles(query: string): Promise<string[]> {
  const exclude = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/coverage/**}';
  const glob = query ? `**/*${query.replace(/[{}[\]*?]/g, '')}*` : '**/*';
  const uris = await vscode.workspace.findFiles(glob, exclude, query ? 30 : 12);
  return uris.map((u) => vscode.workspace.asRelativePath(u, false).replace(/\\/g, '/'));
}

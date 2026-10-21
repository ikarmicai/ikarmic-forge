/**
 * Per-hunk review: split a proposed edit into hunks the user can accept or
 * reject one by one, then rebuild the file from only the accepted ones.
 * Pure and vscode-free.
 *
 * Text is diffed as `text.split('\n')`, so a trailing newline is just a final
 * empty line and round-trips exactly.
 */

export type HunkLine = { t: ' ' | '+' | '-'; s: string };

export interface Hunk {
  /** Stable within one computeHunks() result. */
  id: number;
  /** 1-based line in the old text where the hunk starts (0-count hunks point at the line before). */
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

type Op = { t: ' ' | '+' | '-'; s: string };

/**
 * Past this many edits the diff stops looking for the smallest script: the file was rewritten, so the
 * middle is shown as one block removed and one added. Keeps a whole-file rewrite from costing O(N²).
 */
const MAX_EDITS = 1500;

/** Myers O(ND) line diff of the lines between the shared head and tail; null when it needs over MAX_EDITS. */
function myers(a: string[], b: string[]): Op[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  // trace[d] holds v as it was before round d, only for k in -(d+1)..(d+1): O(D²) in total, not O(D·N).
  const trace: Int32Array[] = [];

  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    if (d > MAX_EDITS) return null;
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }

  // Backtrack.
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const tv = trace[d]!;
    const at = (k: number) => tv[k + d + 1]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && at(k - 1) < at(k + 1))) prevK = k + 1;
    else prevK = k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ t: ' ', s: a[x - 1]! });
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push({ t: '+', s: b[y - 1]! });
      y--;
    } else {
      ops.push({ t: '-', s: a[x - 1]! });
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push({ t: ' ', s: a[x - 1]! });
    x--;
    y--;
  }
  return ops.reverse();
}

/** Line diff: the edit script from `a` to `b`. */
function diffOps(a: string[], b: string[]): Op[] {
  // Edits are usually small and local: skip the shared head and tail before the real diff.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const middle: Op[] =
    midA.length === 0 || midB.length === 0
      ? [...midA.map((s) => ({ t: '-' as const, s })), ...midB.map((s) => ({ t: '+' as const, s }))]
      : (myers(midA, midB) ?? [...midA.map((s) => ({ t: '-' as const, s })), ...midB.map((s) => ({ t: '+' as const, s }))]);
  return [
    ...a.slice(0, head).map((s) => ({ t: ' ' as const, s })),
    ...removalsFirst(middle),
    ...a.slice(a.length - tail).map((s) => ({ t: ' ' as const, s })),
  ];
}

/** Within each run of changes list the removed lines before the added ones, as a diff is read. */
function removalsFirst(ops: Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.t === ' ') {
      out.push(ops[i++]!);
      continue;
    }
    const run: Op[] = [];
    while (i < ops.length && ops[i]!.t !== ' ') run.push(ops[i++]!);
    out.push(...run.filter((o) => o.t === '-'), ...run.filter((o) => o.t === '+'));
  }
  return out;
}

export function computeHunks(oldText: string, newText: string, context = 3): Hunk[] {
  const ops = diffOps(oldText.split('\n'), newText.split('\n'));
  const hunks: Hunk[] = [];

  // Indices of changed ops.
  const changed: number[] = [];
  ops.forEach((op, i) => {
    if (op.t !== ' ') changed.push(i);
  });
  if (changed.length === 0) return hunks;

  // Group changes separated by <= 2*context unchanged lines.
  let start = changed[0]!;
  let end = changed[0]!;
  const groups: Array<[number, number]> = [];
  for (const idx of changed.slice(1)) {
    if (idx - end - 1 <= context * 2) end = idx;
    else {
      groups.push([start, end]);
      start = idx;
      end = idx;
    }
  }
  groups.push([start, end]);

  // Prefix counts so we can compute old/new line numbers at any op index.
  const oldBefore: number[] = [0];
  const newBefore: number[] = [0];
  for (const op of ops) {
    oldBefore.push(oldBefore.at(-1)! + (op.t === '+' ? 0 : 1));
    newBefore.push(newBefore.at(-1)! + (op.t === '-' ? 0 : 1));
  }

  groups.forEach(([gs, ge], id) => {
    const from = Math.max(0, gs - context);
    const to = Math.min(ops.length - 1, ge + context);
    const lines = ops.slice(from, to + 1);
    const oldCount = lines.filter((l) => l.t !== '+').length;
    const newCount = lines.filter((l) => l.t !== '-').length;
    hunks.push({
      id,
      oldStart: oldBefore[from]! + 1,
      oldCount,
      newStart: newBefore[from]! + 1,
      newCount,
      lines,
    });
  });
  return hunks;
}

/** Rebuild the text taking the new side of accepted hunks and the old side of the rest. */
export function applyHunks(oldText: string, hunks: readonly Hunk[], accepted: ReadonlySet<number>): string {
  const old = oldText.split('\n');
  const out: string[] = [];
  let cursor = 0; // index into `old`
  for (const h of hunks) {
    const startIdx = h.oldStart - 1;
    while (cursor < startIdx) out.push(old[cursor++]!);
    const take = accepted.has(h.id);
    for (const l of h.lines) {
      if (l.t === ' ') out.push(l.s);
      else if (l.t === '+' && take) out.push(l.s);
      else if (l.t === '-' && !take) out.push(l.s);
    }
    cursor = startIdx + h.oldCount;
  }
  while (cursor < old.length) out.push(old[cursor++]!);
  return out.join('\n');
}

/** `@@ -3,4 +3,6 @@ first changed line` for a QuickPick label. */
export function hunkLabel(h: Hunk): string {
  const first = h.lines.find((l) => l.t !== ' ');
  const preview = first ? `${first.t} ${first.s.trim()}`.slice(0, 60) : '';
  return `@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@ ${preview}`;
}

/** A readable, capped +/- excerpt of a hunk for a QuickPick detail line. */
export function hunkExcerpt(h: Hunk, maxLines = 6): string {
  const changed = h.lines.filter((l) => l.t !== ' ');
  const shown = changed.slice(0, maxLines).map((l) => `${l.t}${l.s}`.slice(0, 80));
  if (changed.length > maxLines) shown.push(`... ${changed.length - maxLines} more changed lines`);
  return shown.join('  ⏎  ');
}

/** Human summary of rejected hunks for the model: "hunks 2 (lines 10-14) and 4 (lines 30-31)". */
export function describeRejected(hunks: readonly Hunk[], accepted: ReadonlySet<number>): string {
  const rejected = hunks.filter((h) => !accepted.has(h.id));
  return rejected
    .map((h) => `hunk ${h.id + 1} (old lines ${h.oldStart}-${h.oldStart + Math.max(h.oldCount - 1, 0)})`)
    .join(', ');
}

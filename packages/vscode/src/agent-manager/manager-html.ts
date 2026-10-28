/**
 * Agent Manager page: start one prompt as up to four versions (each in its own git worktree by default), watch them,
 * pick the one you want, then merge it, open a pull request or discard the rest. The host sends a view (tasks with their
 * versions, a count, the finished list); the page only renders it.
 *
 * Built on the iKarmic UI design system (docs/design-system.md): tokens and ik- components come from DESIGN_CSS, this file
 * adds layout only, in tokens. The page is roomy and was the first to move (design-system.test.ts, MIGRATED_PAGES).
 * The script is inside a template literal: no backticks, no dollar-brace, no backslash in it (RB-11).
 */
import { DESIGN_CSS } from '../design/index.js';

/** Layout for this page, in tokens. A colour or a size under 12px here fails the design-system test. */
export const AGENT_MANAGER_CSS = `
  .mgr-wrap { max-width: 1120px; margin: 0 auto; padding: var(--space-md) var(--space-md) var(--space-xl); display: flex; flex-direction: column; gap: var(--gap-section); }
  .mgr-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs) var(--space-md); }
  .mgr-head h1 { margin: 0; margin-right: auto; font: var(--text-page); color: var(--ink-strong); }
  .mgr-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs) var(--space-sm); }
  .mgr-lead { flex-basis: 100%; margin: 0; color: var(--ink-muted); }
  .mgr-summary { display: flex; flex-wrap: wrap; gap: var(--space-xs) var(--space-sm); margin: 0; padding: 0; list-style: none; }
  .mgr-layout { display: flex; flex-direction: column; gap: var(--gap-section); }
  .mgr-board { display: flex; flex-direction: column; gap: var(--gap-stack); min-width: 0; }
  .mgr-form { display: grid; gap: var(--gap-stack); padding: var(--pad-card); }
  .mgr-opts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs) var(--space-md); }
  .mgr-opts fieldset { display: flex; align-items: center; gap: var(--space-xs); margin: 0; padding: 0; border: 0; min-width: 0; }
  .mgr-opts legend { float: left; padding: 0; margin-right: var(--space-xs); font: var(--text-label); color: var(--ink-strong); }
  .mgr-start { margin-left: auto; }
  .mgr-sec { display: flex; align-items: baseline; gap: var(--space-sm); }
  .mgr-sec h2 { margin: 0; font: var(--text-title-sm); color: var(--ink-strong); }
  .mgr-tasks { display: flex; flex-direction: column; gap: var(--gap-stack); margin: 0; padding: 0; list-style: none; }
  .mgr-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2xs) var(--space-md); }
  .mgr-task-title { flex: 1 1 320px; min-width: 0; margin: 0; font: var(--text-title-sm); color: var(--ink-strong); overflow-wrap: anywhere; }
  .mgr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2xs) var(--space-sm); font: var(--text-caption); color: var(--ink-muted); }
  .mgr-auto { font: var(--text-caption); font-weight: 600; color: var(--danger); }
  .mgr-vers { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--space-xs); margin: 0; padding: 0; list-style: none; }
  .mgr-ver { display: flex; flex-direction: column; gap: var(--space-2xs); min-width: 0; }
  .mgr-ver-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-xs); }
  .mgr-ver-name { font: var(--text-label); color: var(--ink-strong); }
  .mgr-stat { display: flex; flex-wrap: wrap; gap: 0 var(--space-sm); font: var(--text-data); font-variant-numeric: tabular-nums; color: var(--ink-strong); }
  .mgr-add { color: var(--success); }
  .mgr-del { color: var(--danger); }
  .mgr-line { display: flex; align-items: center; gap: var(--space-2xs); min-width: 0; font: var(--text-caption); color: var(--ink-muted); }
  .mgr-branch { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--text-code); color: var(--ink-body); }
  .mgr-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--space-sm); margin-top: auto; }
  .mgr-sum { flex: 1 1 200px; min-width: 0; margin: 0; color: var(--ink-muted); }
  .mgr-sum strong { color: var(--ink-strong); font-weight: 600; }
  .mgr-danger { color: var(--danger); }
  .mgr-done summary { display: flex; align-items: baseline; gap: var(--space-sm); padding: var(--space-xs) var(--pad-card); cursor: pointer; font: var(--text-title-sm); color: var(--ink-strong); }
  .mgr-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2xs) var(--space-sm); padding: var(--space-xs) var(--pad-card); border-top: var(--border-hairline) solid var(--line-subtle); }
  .mgr-row-name { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; color: var(--ink-strong); }
  .mgr-health { padding: 0; }
  .mgr-health-head { display: flex; align-items: baseline; gap: var(--space-sm); padding: var(--space-xs) var(--pad-card); }
  .mgr-health-head h2 { margin: 0 auto 0 0; font: var(--text-title-sm); color: var(--ink-strong); }
  .mgr-find { display: flex; flex-direction: column; gap: var(--space-2xs); padding: var(--space-xs) var(--pad-card); border-top: var(--border-hairline) solid var(--line-subtle); }
  .mgr-find-path { font: var(--text-code); color: var(--ink-muted); overflow-wrap: anywhere; }
  .mgr-layer { position: fixed; inset: 0; z-index: 10; }
  .mgr-drawer-head { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--pad-card); border-bottom: var(--border-hairline) solid var(--line-subtle); }
  .mgr-drawer-head h2 { flex: 1; margin: 0; font: var(--text-title-sm); color: var(--ink-strong); }
  .mgr-drawer-body { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--pad-card); }
  .mgr-drawer-foot { display: flex; justify-content: flex-end; gap: var(--space-xs); padding: var(--space-xs) var(--pad-card); border-top: var(--border-hairline) solid var(--line-subtle); }
  .mgr-files { margin: 0; padding: 0; list-style: none; max-height: 180px; overflow: auto; }
  .mgr-files li { padding: var(--space-2xs) var(--space-sm); border-top: var(--border-hairline) solid var(--line-subtle); font: var(--text-code); overflow-wrap: anywhere; }
  [hidden] { display: none !important; }
  @media (min-width: 1400px) {
    .mgr-wrap { max-width: 1760px; }
    .mgr-layout { display: grid; grid-template-columns: 380px minmax(0, 1fr); align-items: start; }
    .mgr-rail { position: sticky; top: var(--space-md); }
    .mgr-rail .mgr-start { margin-left: 0; width: 100%; }
    .mgr-tasks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  }
  @media (max-width: 560px) {
    .mgr-wrap { padding: var(--space-sm) var(--space-sm) var(--space-lg); }
    .mgr-more { display: none; }
    .mgr-start { margin-left: 0; width: 100%; }
    .ik-card__foot .ik-btn { flex: 1 1 auto; }
  }
`;

export function agentManagerHtml(opts: { cspSource?: string } = {}): string {
  const scriptSrc = opts.cspSource ? `'unsafe-inline' ${opts.cspSource}` : `'unsafe-inline'`;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc};">
<style>${DESIGN_CSS}</style>
<style>${AGENT_MANAGER_CSS}</style>
</head>
<body class="ik-root" data-density="roomy">
<div class="mgr-wrap">
<header class="mgr-head">
  <h1>Agent Manager</h1>
  <div class="mgr-tools">
    <ul id="summary" class="mgr-summary" aria-label="Versions at a glance" hidden></ul>
    <span id="health-status"></span>
    <button type="button" id="check" class="ik-btn ik-btn--link" title="Look for worktrees git no longer knows, leftover folders, locks and branches that are gone">Check worktrees</button>
    <button type="button" id="new-window" class="ik-btn ik-btn--secondary" title="Move the Agent Manager to a window of its own, for example on another screen">Open in new window</button>
  </div>
  <p class="mgr-lead">Run one prompt as several sessions at once. Each session gets its own git worktree, so you can compare the results and merge the one you want.</p>
</header>
<p id="error" class="ik-note ik-note--danger" role="alert" hidden></p>
<section id="health" class="ik-card mgr-health" aria-label="Worktree health" hidden></section>
<div class="mgr-layout">
<div class="mgr-rail">
<form id="form" class="ik-card mgr-form">
  <label class="ik-label" for="prompt">What should the sessions do?</label>
  <textarea id="prompt" class="ik-textarea" rows="3" placeholder="e.g. Add a dark mode toggle to the settings page"></textarea>
  <div class="mgr-opts">
    <fieldset>
      <legend>Versions</legend>
      <div class="ik-seg">
        <label><input type="radio" name="count" id="count-1" value="1" checked><span>1</span></label>
        <label><input type="radio" name="count" id="count-2" value="2"><span>2</span></label>
        <label><input type="radio" name="count" id="count-3" value="3"><span>3</span></label>
        <label><input type="radio" name="count" id="count-4" value="4"><span>4</span></label>
      </div>
    </fieldset>
    <label class="ik-chip" for="worktree"><input type="checkbox" id="worktree" checked>Own worktree</label>
    <label class="ik-chip ik-chip--danger" for="auto" title="Autonomous: Forge runs tools without asking"><input type="checkbox" id="auto">Autonomous</label>
    <button type="submit" id="start" class="ik-btn ik-btn--primary ik-btn--lg mgr-start">Start</button>
  </div>
  <p id="auto-note" class="ik-note ik-note--danger" hidden>Autonomous turns approvals off: Forge runs tools without asking.</p>
</form>
</div>
<div class="mgr-board">
  <div class="mgr-sec"><h2>Tasks</h2><span id="count-note" class="ik-help"></span></div>
  <p id="empty" class="ik-muted">No sessions yet. Each session opens in a chat tab of its own, where you approve its steps and follow its work.</p>
  <ul id="list" class="mgr-tasks" aria-live="polite"></ul>
  <details id="finished" class="ik-card mgr-done" hidden><summary><span>Finished</span><span id="finished-count" class="ik-help"></span></summary><div id="finished-list"></div></details>
</div>
</div>
</div>
<div id="pr-card" class="mgr-layer" hidden></div>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    run: 'M3 12h4l3-8 4 16 3-8h4',
    check: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8.5 12.5l2.5 2.5 4.5-5',
    x: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9 9l6 6m0-6l-6 6',
    stop: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
    merge: 'M3.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M15.5 17a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6 8.5V21M6 12a9 9 0 0 0 9.5 5',
    branch: 'M3.5 5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M3.5 19a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M15.5 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6 7.5v9M18 11.5c0 4-6 3-12 5',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
    warn: 'M12 4L3 20h18zM12 10v4M12 17v.01',
    clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
    info: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 11v5M12 8v.01',
    out: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    close: 'M6 6l12 12M18 6L6 18'
  };
  const STATUS = {
    starting: { tone: 'run', icon: 'run', word: 'Starting' },
    running: { tone: 'run', icon: 'run', word: 'Running' },
    done: { tone: 'ok', icon: 'check', word: 'Done' },
    stopped: { tone: 'warn', icon: 'stop', word: 'Stopped' },
    failed: { tone: 'bad', icon: 'x', word: 'Failed' },
    merged: { tone: 'ok', icon: 'merge', word: 'Merged' },
    discarded: { tone: 'off', icon: 'x', word: 'Discarded' }
  };
  const LABELS = { open: 'Open', terminal: 'Terminal', pr: 'Create pull request', 'open-pr': 'Pull request', stop: 'Stop', merge: 'Merge', discard: 'Discard', remove: 'Remove' };
  const TITLES = {
    open: 'Show this session in its chat tab',
    terminal: 'Open a terminal in this session worktree',
    pr: 'Push this session branch to GitHub and open a pull request (you confirm the details first)',
    'open-pr': 'Open the pull request on GitHub',
    stop: 'Stop this session',
    merge: 'Merge this session into your current branch and remove its worktree',
    discard: 'Delete this session worktree and branch',
    remove: 'Remove this entry from the list'
  };
  const FIXES = { prune: 'Forget listing', 'delete-folder': 'Delete folder' };
  const MINUS = String.fromCharCode(8722);

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function icon(name) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ik-icon');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', ICONS[name]);
    s.appendChild(p);
    return s;
  }
  function button(cls, label, title, onClick, iconName) {
    const b = el('button', 'ik-btn ' + cls);
    b.type = 'button';
    if (iconName) b.appendChild(icon(iconName));
    if (label) b.appendChild(document.createTextNode(label));
    if (title) b.title = title;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function status(name) {
    const st = STATUS[name] || { tone: 'off', icon: 'info', word: name };
    const s = el('span', 'ik-status ik-status--' + st.tone);
    s.setAttribute('data-role', 'status');
    s.appendChild(icon(st.icon));
    s.appendChild(document.createTextNode(st.word));
    return s;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  const form = $('form');
  const promptEl = $('prompt');
  const errorEl = $('error');
  const listEl = $('list');
  const selection = {};
  let lastSig = '';
  let elapsedNodes = {};
  let finishedOpen = true;

  function showError(text) {
    errorEl.textContent = '';
    errorEl.appendChild(icon('warn'));
    errorEl.appendChild(document.createTextNode(text));
    errorEl.hidden = false;
  }

  function chosenCount() { return Number(document.querySelector('input[name=count]:checked').value); }
  function syncStart() {
    const n = chosenCount();
    $('start').textContent = n === 1 ? 'Start' : 'Start ' + n + ' versions';
  }
  function syncAuto() { $('auto-note').hidden = !$('auto').checked; }
  document.querySelectorAll('input[name=count]').forEach(function (r) { r.addEventListener('change', syncStart); });
  $('auto').addEventListener('change', syncAuto);

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const text = promptEl.value.trim();
    if (!text) {
      showError('Type what the sessions should do first.');
      promptEl.focus();
      return;
    }
    errorEl.hidden = true;
    vscode.postMessage({ type: 'start', prompt: text, count: chosenCount(), useWorktree: $('worktree').checked, auto: $('auto').checked });
    promptEl.value = '';
  });
  $('new-window').addEventListener('click', function () { vscode.postMessage({ type: 'open_window' }); });
  $('check').addEventListener('click', function () { vscode.postMessage({ type: 'health' }); });

  function act(id, action) { vscode.postMessage({ type: 'action', id: id, action: action }); }

  function pickable(task) { return task.versions.filter(function (v) { return v.canPick; }); }
  function selectedOf(task) {
    const p = pickable(task);
    const found = p.filter(function (v) { return v.id === selection[task.id]; })[0];
    if (found) return found;
    return p.length === 1 ? p[0] : null;
  }

  function versionText(v) {
    if (v.status === 'running') return 'Working for ' + v.elapsed;
    if (v.status === 'starting') return 'Starting';
    if (v.status === 'done') return 'Finished in ' + v.elapsed;
    if (v.status === 'failed') return 'Failed after ' + v.elapsed;
    if (v.status === 'stopped') return 'Stopped after ' + v.elapsed;
    return v.elapsed;
  }

  function versionCard(task, v, selectedId) {
    const multi = task.versions.length > 1;
    // Nothing to choose between with one version, so nothing is outlined as chosen.
    const li = el('li', 'ik-inset mgr-ver' + (multi && v.id === selectedId ? ' ik-inset--selected' : ''));
    li.setAttribute('data-version', v.id);
    li.setAttribute('data-status', v.status);
    const top = el('div', 'mgr-ver-top');
    top.appendChild(el('span', 'mgr-ver-name', multi ? 'Version ' + v.version : 'Result'));
    top.appendChild(status(v.status));
    li.appendChild(top);
    const live = v.status === 'running' || v.status === 'starting';
    if (live) {
      const bar = el('div', 'ik-bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', (multi ? 'Version ' + v.version : 'This session') + ' is working');
      bar.appendChild(el('span'));
      li.appendChild(bar);
    }
    if (v.error) {
      const note = el('div', 'ik-note ik-note--danger');
      note.setAttribute('data-role', 'detail');
      note.appendChild(icon('warn'));
      note.appendChild(el('span', '', v.error));
      li.appendChild(note);
    } else {
      const stat = el('div', 'mgr-stat');
      stat.setAttribute('data-role', 'detail');
      stat.appendChild(el('span', '', plural(v.files, 'file', 'files') + (live ? ' so far' : '')));
      if (v.added !== undefined) {
        const add = el('span', 'mgr-add', '+' + v.added);
        add.appendChild(el('span', 'ik-sr-only', ' lines added'));
        stat.appendChild(add);
      }
      if (v.removed !== undefined) {
        const del = el('span', 'mgr-del', MINUS + v.removed);
        del.appendChild(el('span', 'ik-sr-only', ' lines removed'));
        stat.appendChild(del);
      }
      li.appendChild(stat);
    }
    const when = el('div', 'mgr-line');
    when.appendChild(icon('clock'));
    const whenText = el('span', '', versionText(v));
    when.appendChild(whenText);
    elapsedNodes[v.id] = { node: whenText };
    li.appendChild(when);
    if (v.branch) {
      const b = el('div', 'mgr-line mgr-more');
      b.appendChild(icon('branch'));
      b.appendChild(el('span', 'mgr-branch', v.branch));
      li.appendChild(b);
      const counts = [];
      if (v.ahead > 0) counts.push(plural(v.ahead, 'commit', 'commits') + ' ahead');
      if (v.behind > 0) counts.push(v.behind + ' behind');
      if (counts.length) li.appendChild(el('div', 'mgr-line mgr-more', counts.join(' · ')));
    }
    if (v.pr) {
      const note = el('div', 'ik-note');
      note.appendChild(icon('info'));
      note.appendChild(el('span', '', v.pr));
      li.appendChild(note);
    }
    if (multi) {
      const pick = el('label', 'ik-check');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'pick-' + task.id;
      radio.value = v.id;
      radio.setAttribute('data-pick', v.id);
      radio.disabled = !v.canPick;
      radio.checked = v.id === selectedId;
      radio.addEventListener('change', function () {
        selection[task.id] = v.id;
        const old = radio.closest('[data-task]');
        const fresh = buildTask(task);
        old.parentNode.replaceChild(fresh, old);
        const again = fresh.querySelector('[data-pick="' + v.id + '"]');
        if (again) again.focus();
      });
      pick.appendChild(radio);
      pick.appendChild(document.createTextNode(v.canPick ? 'Use this version' : live ? 'Available when done' : 'Not available'));
      li.appendChild(pick);
    }
    const acts = el('div', 'mgr-acts');
    v.actions.forEach(function (a) {
      // Merge, pull request and discard-the-rest belong to the task footer; a version nobody can pick keeps its own Discard.
      const own = a === 'open' || a === 'terminal' || a === 'stop' || a === 'remove' || (a === 'discard' && !v.canPick && v.status !== 'merged');
      if (!own) return;
      acts.appendChild(button('ik-btn--link' + (a === 'discard' ? ' mgr-danger' : ''), LABELS[a] || a, TITLES[a] || '', function () { act(v.id, a); }));
    });
    li.appendChild(acts);
    return li;
  }

  function taskFooter(task, selected) {
    if (task.state === 'quiet') return null;
    const multi = task.versions.length > 1;
    const foot = el('div', 'ik-card__foot');
    const sum = el('p', 'mgr-sum');
    foot.appendChild(sum);
    if (task.state === 'working') {
      sum.textContent = multi ? 'Pick a version when they are done.' : 'Working. You can open its chat tab to follow along.';
      const running = task.versions.filter(function (v) { return v.status === 'running' || v.status === 'starting'; });
      if (running.length > 1) foot.appendChild(button('ik-btn--secondary', 'Stop all', 'Stop every version that is still working', function () { running.forEach(function (v) { act(v.id, 'stop'); }); }));
      return foot;
    }
    if (selected) {
      sum.appendChild(el('strong', '', multi ? 'Version ' + selected.version : 'Result'));
      let text = (multi ? ' selected' : '') + ' · ' + plural(selected.files, 'file', 'files');
      if (selected.added !== undefined && selected.removed !== undefined) text += ', +' + selected.added + ' ' + MINUS + selected.removed;
      sum.appendChild(document.createTextNode(text));
    } else {
      sum.textContent = 'Pick a version to merge or open as a pull request.';
    }
    // Once a version is merged it is the one kept, so the rest can still be cleared in one step (RB-98).
    const merged = task.versions.filter(function (v) { return v.status === 'merged'; })[0];
    const keep = merged || selected;
    const others = task.versions.filter(function (v) { return keep && v.id !== keep.id && (v.status === 'done' || v.status === 'failed' || v.status === 'stopped') && v.actions.indexOf('discard') >= 0; });
    if (multi && keep && others.length > 0) {
      foot.appendChild(button('ik-btn--link mgr-danger', 'Discard the others', 'Delete the worktrees and branches of the other versions', function () { vscode.postMessage({ type: 'discard_others', taskId: task.id, keepId: keep.id }); }));
    } else if (!multi && selected && selected.actions.indexOf('discard') >= 0) {
      foot.appendChild(button('ik-btn--link mgr-danger', 'Discard', TITLES.discard, function () { act(selected.id, 'discard'); }));
    }
    const why = 'Pick a version first.';
    if (selected && selected.actions.indexOf('open-pr') >= 0) {
      foot.appendChild(button('ik-btn--secondary', LABELS['open-pr'], TITLES['open-pr'], function () { act(selected.id, 'open-pr'); }, 'out'));
    } else {
      const pr = button('ik-btn--secondary', LABELS.pr, selected ? TITLES.pr : why, function () { if (selected) act(selected.id, 'pr'); });
      if (!selected || selected.actions.indexOf('pr') < 0) pr.disabled = true;
      foot.appendChild(pr);
    }
    const merge = button('ik-btn--primary', LABELS.merge, selected ? TITLES.merge : why, function () { if (selected) act(selected.id, 'merge'); }, 'merge');
    if (!selected || selected.actions.indexOf('merge') < 0) merge.disabled = true;
    foot.appendChild(merge);
    return foot;
  }

  function buildTask(task) {
    const selected = selectedOf(task);
    const li = el('li', 'ik-card');
    li.setAttribute('data-task', task.id);
    li.setAttribute('data-state', task.state);
    const top = el('div', 'ik-card__head');
    const head = el('div', 'mgr-task-head');
    head.appendChild(el('h3', 'mgr-task-title', task.title));
    const meta = el('div', 'mgr-meta');
    meta.appendChild(icon('clock'));
    meta.appendChild(el('span', '', task.started + ' · ' + plural(task.versions.length, 'version', 'versions')));
    if (task.auto) meta.appendChild(el('span', 'mgr-auto', 'Autonomous'));
    head.appendChild(meta);
    top.appendChild(head);
    li.appendChild(top);
    const vers = el('ul', 'mgr-vers');
    task.versions.forEach(function (v) { vers.appendChild(versionCard(task, v, selected ? selected.id : '')); });
    const body = el('div', 'ik-card__body');
    body.appendChild(vers);
    li.appendChild(body);
    const foot = taskFooter(task, selected);
    if (foot) li.appendChild(foot);
    return li;
  }

  function summaryItem(tone, iconName, text) {
    const li = el('li', 'ik-status ik-status--' + tone);
    li.appendChild(icon(iconName));
    li.appendChild(document.createTextNode(text));
    return li;
  }

  function build(v) {
    elapsedNodes = {};
    const sum = $('summary');
    sum.textContent = '';
    if (v.summary.running > 0) sum.appendChild(summaryItem('run', 'run', v.summary.running + ' running'));
    if (v.summary.done > 0) sum.appendChild(summaryItem('ok', 'check', v.summary.done + ' done'));
    if (v.summary.failed > 0) sum.appendChild(summaryItem('bad', 'x', v.summary.failed + ' failed'));
    sum.hidden = sum.children.length === 0;
    listEl.textContent = '';
    v.tasks.forEach(function (task) { listEl.appendChild(buildTask(task)); });
    $('empty').hidden = v.tasks.length > 0 || v.finished.length > 0;
    $('count-note').textContent = v.tasks.length > 0 ? plural(v.tasks.length, 'open task', 'open tasks') + ' · tasks that need you come first' : '';
    const fin = $('finished');
    const finList = $('finished-list');
    finList.textContent = '';
    fin.hidden = v.finished.length === 0;
    $('finished-count').textContent = String(v.finished.length);
    v.finished.forEach(function (r) {
      const row = el('div', 'mgr-row');
      row.setAttribute('data-version', r.id);
      row.setAttribute('data-status', r.status);
      row.appendChild(el('span', 'mgr-row-name', r.label));
      row.appendChild(status(r.status));
      const detail = el('span', 'ik-help', plural(r.files, 'file', 'files') + ' · ' + r.elapsed);
      detail.setAttribute('data-role', 'detail');
      row.appendChild(detail);
      row.appendChild(button('ik-btn--link', LABELS.remove, TITLES.remove, function () { act(r.id, 'remove'); }));
      finList.appendChild(row);
    });
    fin.open = finishedOpen;
  }
  $('finished').addEventListener('toggle', function () { finishedOpen = $('finished').open; });

  function render(v) {
    // Most seconds only a clock changes: update it in place instead of rebuilding the page (and the focus with it).
    const sig = JSON.stringify(v, function (k, val) { return k === 'elapsed' || k === 'started' ? undefined : val; });
    if (sig === lastSig) {
      const all = v.tasks.reduce(function (rows, t) { return rows.concat(t.versions); }, []);
      all.forEach(function (r) { if (elapsedNodes[r.id]) elapsedNodes[r.id].node.textContent = versionText(r); });
      return;
    }
    lastSig = sig;
    build(v);
  }

  function renderHealth(findings) {
    const panel = $('health');
    const badgeHost = $('health-status');
    panel.textContent = '';
    badgeHost.textContent = '';
    const badge = el('span', 'ik-badge ' + (findings.length ? 'ik-badge--warning' : 'ik-badge--success'));
    badge.appendChild(icon(findings.length ? 'warn' : 'shield'));
    badge.appendChild(document.createTextNode(findings.length ? plural(findings.length, 'problem', 'problems') : 'Worktrees healthy'));
    badgeHost.appendChild(badge);
    if (!findings.length) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const head = el('div', 'mgr-health-head');
    head.appendChild(el('h2', '', 'Worktree health'));
    head.appendChild(button('ik-btn--link', 'Close', '', function () { panel.hidden = true; }));
    panel.appendChild(head);
    findings.forEach(function (f) {
      const row = el('div', 'mgr-find');
      row.appendChild(el('div', 'ik-label', f.problem));
      row.appendChild(el('div', 'mgr-find-path', f.path));
      if (f.advice) row.appendChild(el('div', 'ik-help', f.advice));
      if (f.fix) {
        const wrap = el('div');
        wrap.appendChild(button(f.fix === 'delete-folder' ? 'ik-btn--danger' : 'ik-btn--secondary', FIXES[f.fix] || f.fix, '', function () { vscode.postMessage({ type: 'health_fix', fix: f.fix, path: f.path }); }));
        row.appendChild(wrap);
      }
      panel.appendChild(row);
    });
  }

  // The drawer shown before anything is pushed: what will be sent, where, and the text to edit.
  const prLayer = $('pr-card');
  let prOpener = null;
  function field(id, label, control) {
    const wrap = el('div', 'ik-field');
    const l = el('label', 'ik-label', label);
    l.setAttribute('for', id);
    control.id = id;
    wrap.appendChild(l);
    wrap.appendChild(control);
    return wrap;
  }
  function closePr() {
    prLayer.hidden = true;
    prLayer.textContent = '';
    if (prOpener && prOpener.focus) prOpener.focus();
    prOpener = null;
  }
  function renderPrCard(d) {
    prOpener = document.activeElement;
    prLayer.textContent = '';
    prLayer.hidden = false;
    const scrim = el('div', 'ik-scrim');
    scrim.addEventListener('click', closePr);
    const drawer = el('form', 'ik-drawer');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'pr-title');
    const head = el('div', 'mgr-drawer-head');
    const h = el('h2', '', 'Create pull request');
    h.id = 'pr-title';
    head.appendChild(h);
    const x = button('ik-btn--ghost ik-btn--icon', '', 'Close', closePr, 'close');
    x.setAttribute('aria-label', 'Close');
    head.appendChild(x);
    const body = el('div', 'mgr-drawer-body');
    const says = el('p', 'ik-note');
    says.appendChild(icon('info'));
    says.appendChild(el('span', '', 'This pushes the branch ' + d.head + ' to origin on GitHub and opens a pull request in ' + d.remote + '. Nothing is sent until you press the button.'));
    body.appendChild(says);
    const title = el('input', 'ik-input'); title.type = 'text'; title.value = d.title; title.maxLength = 256;
    const base = el('input', 'ik-input'); base.type = 'text'; base.value = d.base;
    const text = el('textarea', 'ik-textarea'); text.value = d.body; text.rows = 8;
    body.appendChild(field('pr-t', 'Title', title));
    body.appendChild(field('pr-b', 'Merge into branch', base));
    body.appendChild(field('pr-d', 'Description', text));
    if (d.files && d.files.length) {
      const box = el('details', 'ik-inset');
      box.appendChild(el('summary', 'ik-label', 'Files in this pull request (' + d.files.length + ')'));
      const ul = el('ul', 'mgr-files');
      d.files.forEach(function (f) { ul.appendChild(el('li', '', f)); });
      box.appendChild(ul);
      body.appendChild(box);
    }
    const draftLabel = el('label', 'ik-check');
    const draftBox = document.createElement('input');
    draftBox.type = 'checkbox';
    draftBox.checked = true;
    draftLabel.appendChild(draftBox);
    draftLabel.appendChild(document.createTextNode('Open as a draft'));
    body.appendChild(draftLabel);
    const foot = el('div', 'mgr-drawer-foot');
    foot.appendChild(button('ik-btn--secondary', 'Cancel', '', closePr));
    const go = button('ik-btn--primary', 'Push and open pull request');
    go.type = 'submit';
    foot.appendChild(go);
    drawer.appendChild(head);
    drawer.appendChild(body);
    drawer.appendChild(foot);
    drawer.addEventListener('submit', function (ev) {
      ev.preventDefault();
      vscode.postMessage({ type: 'pr_create', id: d.id, form: { title: title.value, body: text.value, base: base.value, draft: draftBox.checked } });
      closePr();
    });
    drawer.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closePr(); return; }
      if (ev.key !== 'Tab') return;
      const stops = drawer.querySelectorAll('button, input, textarea, summary');
      if (!stops.length) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    prLayer.appendChild(scrim);
    prLayer.appendChild(drawer);
    title.focus();
  }

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.type === 'pr_draft') renderPrCard(msg);
    if (msg.type === 'health') renderHealth(msg.findings);
    if (msg.type === 'sessions') render(msg.view);
    if (msg.type === 'error') showError(msg.message);
  });
  syncStart();
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
